"""Run the pinned workspace TypeScript compiler without target project scripts."""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from app.analyzers.base import AdapterResult, Diagnostic
from app.schemas import AnalyzerStatus

OUTPUT_LIMIT_BYTES = 1 * 1024 * 1024
DIAGNOSTIC = re.compile(r"^(.*)\((\d+),(\d+)\): error (TS\d+): (.+)$")
REPO_ROOT = Path(__file__).resolve().parents[4]
TSC_PATH = REPO_ROOT / "node_modules" / "typescript" / "bin" / "tsc"


@dataclass(frozen=True)
class ProcessResult:
    exit_code: int | None
    stdout: bytes
    stderr: bytes
    timed_out: bool
    output_limited: bool


def _safe_environment() -> dict[str, str]:
    allowed = ("PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP")
    return {key: os.environ[key] for key in allowed if key in os.environ}


def _run_bounded(
    arguments: list[str],
    working_directory: str,
    timeout: float,
) -> ProcessResult:
    process = subprocess.Popen(
        arguments,
        cwd=working_directory,
        env=_safe_environment(),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        shell=False,
        close_fds=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    stdout = bytearray()
    stderr = bytearray()
    output_size = 0
    output_lock = threading.Lock()
    exceeded = threading.Event()

    def drain(stream, destination: bytearray) -> None:
        nonlocal output_size
        while True:
            chunk = stream.read(4096)
            if not chunk:
                break
            with output_lock:
                available = OUTPUT_LIMIT_BYTES - output_size
                if available > 0:
                    accepted = chunk[:available]
                    destination.extend(accepted)
                    output_size += len(accepted)
                if len(chunk) > available:
                    exceeded.set()
            if exceeded.is_set():
                try:
                    process.terminate()
                except OSError:
                    pass
                break

    readers = [
        threading.Thread(target=drain, args=(process.stdout, stdout), daemon=True),
        threading.Thread(target=drain, args=(process.stderr, stderr), daemon=True),
    ]
    for reader in readers:
        reader.start()
    timed_out = False
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        process.terminate()
        try:
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            process.kill()
    for reader in readers:
        reader.join(timeout=2)
    if process.poll() is None:
        process.kill()
        process.wait()
    for stream in (process.stdout, process.stderr):
        if stream is not None:
            stream.close()
    return ProcessResult(
        process.returncode,
        bytes(stdout),
        bytes(stderr),
        timed_out,
        exceeded.is_set(),
    )


class TypeScriptAdapter:
    name = "typescript"

    def __init__(self, compiler_path: Path = TSC_PATH) -> None:
        self.compiler_path = compiler_path

    def analyze(
        self,
        root: str,
        file_paths: tuple[str, ...],
        timeout: float,
    ) -> AdapterResult:
        started = time.monotonic()
        node = shutil.which("node")
        if node is None or not self.compiler_path.is_file():
            return AdapterResult(
                status=AnalyzerStatus.UNAVAILABLE,
                version=None,
                message="TypeScript could not be found. Install the repository's npm dependencies.",
            )
        source_paths = tuple(
            path
            for path in file_paths
            if Path(path).suffix.lower() in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"}
        )
        if not source_paths:
            return AdapterResult(
                status=AnalyzerStatus.SKIPPED,
                version=None,
                message="No supported JavaScript or TypeScript source files were discovered.",
            )

        version_result = _run_bounded(
            [node, str(self.compiler_path), "--version"],
            root,
            min(timeout, 5),
        )
        version = version_result.stdout.decode("utf-8", errors="replace").strip()
        if (
            version_result.timed_out
            or version_result.output_limited
            or version_result.exit_code != 0
        ):
            return AdapterResult(
                status=AnalyzerStatus.FAILED,
                version=None,
                message="TypeScript version could not be determined.",
            )

        remaining_timeout = timeout - (time.monotonic() - started)
        if remaining_timeout <= 0:
            return AdapterResult(
                status=AnalyzerStatus.TIMED_OUT,
                version=version,
                message="TypeScript exceeded its execution time limit.",
                duration_ms=int((time.monotonic() - started) * 1000),
            )

        arguments = [
            node,
            str(self.compiler_path),
            "--pretty",
            "false",
            "--noEmit",
            "--strict",
            "--noUnusedLocals",
            "--noUnusedParameters",
            "--target",
            "ES2020",
            "--module",
            "ESNext",
            "--moduleResolution",
            "bundler",
            "--jsx",
            "preserve",
            "--skipLibCheck",
            "--noResolve",
            "--allowJs",
            "--checkJs",
            *source_paths,
        ]
        result = _run_bounded(
            arguments,
            root,
            remaining_timeout,
        )
        duration_ms = int((time.monotonic() - started) * 1000)
        if result.timed_out:
            return AdapterResult(
                status=AnalyzerStatus.TIMED_OUT,
                version=version,
                message="TypeScript exceeded its execution time limit.",
                duration_ms=duration_ms,
            )
        if result.output_limited:
            return AdapterResult(
                status=AnalyzerStatus.OUTPUT_LIMIT,
                version=version,
                message="TypeScript exceeded its output limit.",
                duration_ms=duration_ms,
            )

        diagnostics: list[Diagnostic] = []
        output = result.stdout + b"\n" + result.stderr
        for line in output.decode("utf-8", errors="replace").splitlines():
            match = DIAGNOSTIC.match(line)
            if match is None:
                continue
            raw_path, raw_line, raw_column, rule_id, message = match.groups()
            candidate_path = Path(raw_path)
            if candidate_path.is_absolute():
                try:
                    candidate_path = candidate_path.relative_to(Path(root))
                except ValueError:
                    continue
            normalized_path = candidate_path.as_posix()
            if normalized_path not in source_paths:
                continue
            diagnostics.append(
                Diagnostic(
                    path=normalized_path,
                    line=int(raw_line),
                    column=int(raw_column),
                    rule_id=rule_id,
                    message=message[:500],
                )
            )

        if result.exit_code not in (0, 1, 2) or (
            result.exit_code != 0 and not diagnostics
        ):
            return AdapterResult(
                status=AnalyzerStatus.FAILED,
                version=version,
                message="TypeScript could not complete analysis. Check the analyzer installation and source compatibility.",
                duration_ms=duration_ms,
            )

        unresolved_modules = {"TS2307", "TS2792", "TS7026", "TS2686"}
        partial = any(item.rule_id in unresolved_modules for item in diagnostics)
        usable_diagnostics = [
            item for item in diagnostics if item.rule_id not in unresolved_modules
        ]
        unique_diagnostics = {
            hashlib.sha256(
                f"{item.path}\0{item.line}\0{item.column}\0{item.rule_id}\0{item.message}".encode()
            ).hexdigest(): item
            for item in usable_diagnostics
        }
        return AdapterResult(
            status=AnalyzerStatus.PARTIAL if partial else AnalyzerStatus.COMPLETED,
            version=version,
            message=(
                "TypeScript analysis was partial because imports could not be resolved; "
                "repository dependencies are not installed."
                if partial
                else "TypeScript analysis completed."
                if not unique_diagnostics
                else "TypeScript reported diagnostics for manual review."
            ),
            diagnostics=tuple(unique_diagnostics[key] for key in sorted(unique_diagnostics)),
            duration_ms=duration_ms,
        )
