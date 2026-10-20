from pathlib import Path

import pytest

from app.schemas import InspectionStatus
from app.services.discovery import (
    DiscoveryError,
    DiscoveryLimits,
    discover_files,
)


def test_discovery_includes_supported_source_and_records_exclusions(
    tmp_path: Path,
) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "App.tsx").write_text("export const ok = true;", encoding="utf-8")
    (tmp_path / ".env.local").write_text("PRIVATE=value", encoding="utf-8")
    (tmp_path / "credentials.json").write_text('{"token":"private"}', encoding="utf-8")
    (tmp_path / "private.pem").write_text("private key", encoding="utf-8")
    (tmp_path / "package-lock.json").write_text('{"lockfileVersion":3}', encoding="utf-8")
    (tmp_path / "image.png").write_bytes(b"\x89PNG\x00")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "bad.ts").write_text("secret source", encoding="utf-8")
    (tmp_path / "dist").mkdir()
    (tmp_path / "dist" / "generated.ts").write_text("generated", encoding="utf-8")

    result = discover_files(tmp_path)
    reasons = {item.path: item.reason for item in result.inspections}

    assert [source.relative_path for source in result.sources] == ["src/App.tsx"]
    assert reasons[".env.local"] == "sensitive_environment_file"
    assert reasons["credentials.json"] == "sensitive_file"
    assert reasons["private.pem"] == "private_key_or_credential_file"
    assert reasons["package-lock.json"] == "lockfile"
    assert reasons["image.png"] == "unsupported_file_type"
    assert reasons["node_modules"] == "generated_or_dependency_directory"
    assert reasons["dist"] == "generated_or_dependency_directory"
    assert all(
        item.status is InspectionStatus.SKIPPED
        for item in result.inspections
        if item.path != "src/App.tsx"
    )


@pytest.mark.parametrize(
    ("limits", "files", "message"),
    [
        (DiscoveryLimits(max_file_bytes=4), {"App.ts": "12345"}, "file limit"),
        (DiscoveryLimits(max_total_bytes=4), {"App.ts": "12345"}, "total limit"),
        (
            DiscoveryLimits(max_files=1),
            {"App.ts": "one", "Other.ts": "two"},
            "file limit",
        ),
        (
            DiscoveryLimits(max_scan_seconds=0),
            {"App.ts": "source"},
            "time limit",
        ),
    ],
)
def test_discovery_enforces_configured_limits(
    tmp_path: Path,
    limits: DiscoveryLimits,
    files: dict[str, str],
    message: str,
) -> None:
    for name, content in files.items():
        (tmp_path / name).write_text(content, encoding="utf-8")

    with pytest.raises(DiscoveryError, match=message):
        discover_files(tmp_path, limits)


def test_discovery_rejects_missing_root(tmp_path: Path) -> None:
    with pytest.raises(DiscoveryError, match="unavailable"):
        discover_files(tmp_path / "missing")


def test_limits_can_be_configured_from_environment(monkeypatch) -> None:
    monkeypatch.setenv("ANALYZER_MAX_FILES", "5")
    monkeypatch.setenv("ANALYZER_MAX_FILE_BYTES", "2048")
    monkeypatch.setenv("ANALYZER_MAX_TOTAL_BYTES", "4096")
    monkeypatch.setenv("ANALYZER_MAX_SCAN_SECONDS", "15")
    monkeypatch.setenv("ANALYZER_MAX_ANALYZER_SECONDS", "3")
    monkeypatch.setenv("ANALYZER_MAX_ENTRIES", "20")
    monkeypatch.setenv("ANALYZER_MAX_FINDINGS", "7")

    limits = DiscoveryLimits.from_environment()

    assert limits.max_files == 5
    assert limits.max_file_bytes == 2048
    assert limits.max_total_bytes == 4096
    assert limits.max_scan_seconds == 15
    assert limits.max_analyzer_seconds == 3
    assert limits.max_entries == 20
    assert limits.max_findings == 7


def test_invalid_limit_configuration_fails_explicitly(monkeypatch) -> None:
    monkeypatch.setenv("ANALYZER_MAX_FILE_BYTES", "0")

    with pytest.raises(ValueError, match="outside supported bounds"):
        DiscoveryLimits.from_environment()


def test_discovery_skips_symlink_escape(tmp_path: Path) -> None:
    outside = tmp_path.parent / f"{tmp_path.name}-outside.ts"
    outside.write_text("export const escaped = true;", encoding="utf-8")
    link = tmp_path / "escape.ts"
    try:
        link.symlink_to(outside)
    except (OSError, NotImplementedError):
        outside.unlink(missing_ok=True)
        pytest.skip("Symlink creation is not permitted in this environment.")

    try:
        result = discover_files(tmp_path)
    finally:
        outside.unlink(missing_ok=True)

    assert not result.sources
    assert result.inspections[0].reason == "symlink_or_non_regular_file"
