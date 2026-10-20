"""Bounded, fixture-rooted source discovery."""

from __future__ import annotations

import os
import stat
import time
from dataclasses import dataclass
from pathlib import Path

from app.schemas import FileInspection, InspectionStatus

SUPPORTED_EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
    ".json",
}
IGNORED_DIRECTORIES = {
    ".git",
    ".next",
    ".turbo",
    "build",
    "coverage",
    "dist",
    "generated",
    ".aws",
    ".gnupg",
    "node_modules",
    "out",
    ".ssh",
    "vendor",
    ".venv",
    "venv",
    "__pycache__",
}
SENSITIVE_NAMES = {
    ".npmrc",
    ".pypirc",
    "credentials",
    "credentials.json",
    "id_rsa",
    "id_ed25519",
    "secrets",
    "secrets.json",
}
SENSITIVE_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".keystore"}
LOCKFILE_NAMES = {
    "bun.lock",
    "bun.lockb",
    "npm-shrinkwrap.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
}
SAFE_JSON_CONFIG_NAMES = {
    ".prettierrc.json",
    "jsconfig.json",
    "package.json",
    "tsconfig.json",
}


@dataclass(frozen=True)
class DiscoveryLimits:
    max_files: int = 10_000
    max_file_bytes: int = 1 * 1024 * 1024
    max_total_bytes: int = 50 * 1024 * 1024
    max_scan_seconds: float = 300
    max_analyzer_seconds: float = 30
    max_entries: int = 50_000
    max_findings: int = 1_000

    @classmethod
    def from_environment(cls) -> "DiscoveryLimits":
        defaults = cls()
        try:
            configured = cls(
                max_files=int(os.getenv("ANALYZER_MAX_FILES", defaults.max_files)),
                max_file_bytes=int(
                    os.getenv("ANALYZER_MAX_FILE_BYTES", defaults.max_file_bytes)
                ),
                max_total_bytes=int(
                    os.getenv("ANALYZER_MAX_TOTAL_BYTES", defaults.max_total_bytes)
                ),
                max_scan_seconds=float(
                    os.getenv(
                        "ANALYZER_MAX_SCAN_SECONDS",
                        defaults.max_scan_seconds,
                    )
                ),
                max_analyzer_seconds=float(
                    os.getenv(
                        "ANALYZER_MAX_ANALYZER_SECONDS",
                        defaults.max_analyzer_seconds,
                    )
                ),
                max_entries=int(
                    os.getenv("ANALYZER_MAX_ENTRIES", defaults.max_entries)
                ),
                max_findings=int(
                    os.getenv("ANALYZER_MAX_FINDINGS", defaults.max_findings)
                ),
            )
        except ValueError as exc:
            raise ValueError("Analyzer limit configuration must use valid numbers.") from exc
        if (
            configured.max_files < 1
            or configured.max_file_bytes < 1
            or configured.max_total_bytes < 1
            or configured.max_scan_seconds <= 0
            or configured.max_analyzer_seconds <= 0
            or configured.max_entries < 1
            or configured.max_findings < 1
            or configured.max_file_bytes > configured.max_total_bytes
        ):
            raise ValueError("Analyzer limit configuration is outside supported bounds.")
        return configured


@dataclass(frozen=True)
class SourceFile:
    relative_path: str
    content: bytes


@dataclass(frozen=True)
class DiscoveryResult:
    sources: tuple[SourceFile, ...]
    inspections: tuple[FileInspection, ...]


class DiscoveryError(Exception):
    """A safe, user-presentable failure while inspecting a fixture."""

    def __init__(
        self,
        message: str,
        inspections: tuple[FileInspection, ...] = (),
    ) -> None:
        super().__init__(message)
        self.inspections = inspections


def _is_reparse_point(info: os.stat_result) -> bool:
    reparse_attribute = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    attributes = getattr(info, "st_file_attributes", 0)
    return stat.S_ISLNK(info.st_mode) or bool(attributes & reparse_attribute)


def _skip_reason(path: Path) -> str | None:
    name = path.name.lower()
    if name.startswith(".env"):
        return "sensitive_environment_file"
    if name in LOCKFILE_NAMES or path.suffix.lower() == ".lock":
        return "lockfile"
    if name in SENSITIVE_NAMES or any(
        marker in name
        for marker in ("credential", "password", "private_key", "secret", "token")
    ):
        return "sensitive_file"
    if path.suffix.lower() in SENSITIVE_SUFFIXES:
        return "private_key_or_credential_file"
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        return "unsupported_file_type"
    if path.suffix.lower() == ".json" and name not in SAFE_JSON_CONFIG_NAMES:
        return "unsupported_file_type"
    return None


def discover_files(
    root: Path,
    limits: DiscoveryLimits = DiscoveryLimits(),
) -> DiscoveryResult:
    started = time.monotonic()
    try:
        canonical_root = root.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise DiscoveryError("The selected fixture is unavailable.") from exc
    try:
        root_info = root.lstat()
    except OSError as exc:
        raise DiscoveryError("The selected fixture cannot be read.") from exc
    if not canonical_root.is_dir() or _is_reparse_point(root_info):
        raise DiscoveryError("The selected fixture is not a permitted directory.")

    included: list[SourceFile] = []
    inspections: list[FileInspection] = []
    total_bytes = 0
    entry_count = 0

    def fail_walk(_: OSError) -> None:
        raise DiscoveryError("A fixture directory could not be read.")

    for current, directory_names, file_names in os.walk(
        canonical_root,
        topdown=True,
        followlinks=False,
        onerror=fail_walk,
    ):
        current_path = Path(current)
        retained_directories: list[str] = []
        for name in sorted(directory_names):
            directory = current_path / name
            relative = directory.relative_to(canonical_root).as_posix()
            entry_count += 1
            if entry_count > limits.max_entries:
                raise DiscoveryError(
                    "The fixture contains too many filesystem entries.",
                    tuple(inspections)
                    + (
                        FileInspection(
                            path=relative,
                            status=InspectionStatus.SKIPPED,
                            reason="filesystem_entry_limit",
                        ),
                    ),
                )
            if name.lower() in IGNORED_DIRECTORIES:
                inspections.append(
                    FileInspection(
                        path=relative,
                        status=InspectionStatus.SKIPPED,
                        reason="generated_or_dependency_directory",
                    )
                )
                continue
            try:
                directory_info = directory.lstat()
            except OSError as exc:
                raise DiscoveryError("A fixture directory could not be read.") from exc
            if _is_reparse_point(directory_info):
                inspections.append(
                    FileInspection(
                        path=relative,
                        status=InspectionStatus.SKIPPED,
                        reason="symlink_or_reparse_point",
                    )
                )
            else:
                retained_directories.append(name)
        directory_names[:] = retained_directories

        for name in sorted(file_names):
            path = current_path / name
            relative = path.relative_to(canonical_root).as_posix()
            if time.monotonic() - started > limits.max_scan_seconds:
                raise DiscoveryError(
                    "The fixture scan exceeded its time limit.",
                    tuple(inspections)
                    + (
                        FileInspection(
                            path=relative,
                            status=InspectionStatus.SKIPPED,
                            reason="scan_time_limit",
                        ),
                    ),
                )
            entry_count += 1
            if entry_count > limits.max_entries:
                raise DiscoveryError(
                    "The fixture contains too many filesystem entries.",
                    tuple(inspections)
                    + (
                        FileInspection(
                            path=relative,
                            status=InspectionStatus.SKIPPED,
                            reason="filesystem_entry_limit",
                        ),
                    ),
                )

            reason = _skip_reason(path)
            if reason is not None:
                inspections.append(
                    FileInspection(
                        path=relative,
                        status=InspectionStatus.SKIPPED,
                        reason=reason,
                    )
                )
                continue

            try:
                before = path.lstat()
                if _is_reparse_point(before) or not stat.S_ISREG(before.st_mode):
                    inspections.append(
                        FileInspection(
                            path=relative,
                            status=InspectionStatus.SKIPPED,
                            reason="symlink_or_non_regular_file",
                        )
                    )
                    continue
                canonical_path = path.resolve(strict=True)
                canonical_path.relative_to(canonical_root)
            except (OSError, RuntimeError, ValueError):
                inspections.append(
                    FileInspection(
                        path=relative,
                        status=InspectionStatus.SKIPPED,
                        reason="unreadable_or_outside_fixture",
                    )
                )
                continue

            if before.st_size > limits.max_file_bytes:
                raise DiscoveryError(
                    f"A source file exceeds the {limits.max_file_bytes}-byte file limit.",
                    tuple(inspections)
                    + (
                        FileInspection(
                            path=relative,
                            status=InspectionStatus.SKIPPED,
                            reason="file_size_limit",
                            size_bytes=before.st_size,
                        ),
                    ),
                )
            if len(included) >= limits.max_files:
                raise DiscoveryError(
                    f"The fixture exceeds the {limits.max_files}-file limit.",
                    tuple(inspections)
                    + (
                        FileInspection(
                            path=relative,
                            status=InspectionStatus.SKIPPED,
                            reason="file_count_limit",
                            size_bytes=before.st_size,
                        ),
                    ),
                )
            if total_bytes + before.st_size > limits.max_total_bytes:
                raise DiscoveryError(
                    f"The fixture exceeds the {limits.max_total_bytes}-byte total limit.",
                    tuple(inspections)
                    + (
                        FileInspection(
                            path=relative,
                            status=InspectionStatus.SKIPPED,
                            reason="total_size_limit",
                            size_bytes=before.st_size,
                        ),
                    ),
                )

            flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
            try:
                descriptor = os.open(path, flags)
                with os.fdopen(descriptor, "rb") as file_handle:
                    after = os.fstat(file_handle.fileno())
                    current_canonical_path = path.resolve(strict=True)
                    current_canonical_path.relative_to(canonical_root)
                    if (
                        not stat.S_ISREG(after.st_mode)
                        or after.st_size != before.st_size
                        or current_canonical_path != canonical_path
                    ):
                        raise DiscoveryError("A fixture file changed while it was being scanned.")
                    content = file_handle.read(limits.max_file_bytes + 1)
                if len(content) > limits.max_file_bytes:
                    raise DiscoveryError(
                        f"A source file exceeds the {limits.max_file_bytes}-byte file limit.",
                        tuple(inspections)
                        + (
                            FileInspection(
                                path=relative,
                                status=InspectionStatus.SKIPPED,
                                reason="file_size_limit",
                                size_bytes=len(content),
                            ),
                        ),
                    )
                if b"\0" in content:
                    inspections.append(
                        FileInspection(
                            path=relative,
                            status=InspectionStatus.SKIPPED,
                            reason="binary_file",
                            size_bytes=len(content),
                        )
                    )
                    continue
                content.decode("utf-8")
            except DiscoveryError:
                raise
            except (OSError, UnicodeDecodeError, ValueError):
                inspections.append(
                    FileInspection(
                        path=relative,
                        status=InspectionStatus.SKIPPED,
                        reason="unreadable_or_non_text_file",
                    )
                )
                continue

            total_bytes += len(content)
            included.append(SourceFile(relative_path=relative, content=content))
            inspections.append(
                FileInspection(
                    path=relative,
                    status=InspectionStatus.INCLUDED,
                    reason="supported_source_or_configuration",
                    size_bytes=len(content),
                )
            )

    if time.monotonic() - started > limits.max_scan_seconds:
        raise DiscoveryError("The fixture scan exceeded its time limit.")

    return DiscoveryResult(tuple(included), tuple(inspections))
