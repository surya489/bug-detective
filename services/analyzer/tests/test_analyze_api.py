import asyncio
import json
from uuid import UUID

import httpx
import pytest

from app.analyzers.typescript import ProcessResult, TypeScriptAdapter
from app.main import app
from app.schemas import AnalyzerStatus, ScanStatus
from app.services.discovery import DiscoveryLimits
from app.services.scanner import analyze_fixture, normalize_finding


def _request(method: str, path: str, **kwargs) -> httpx.Response:
    async def send() -> httpx.Response:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def test_fixtures_endpoint_only_lists_allowlisted_local_fixtures() -> None:
    response = _request("GET", "/fixtures")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["fixtures"]] == [
        "buggy-react-app",
        "clean-react-app",
    ]
    assert "path" not in response.text


def test_buggy_fixture_returns_deterministic_type_diagnostics() -> None:
    response = _request("POST", "/analyze", json={"fixtureId": "buggy-react-app"})

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "completed"
    assert result["analyzers"][0]["status"] == "completed"
    assert {item["ruleId"] for item in result["findings"]} == {"TS2322", "TS6133"}
    assert all(item["filePath"] == "src/App.tsx" for item in result["findings"])
    assert all(item["verification"] == "not_run" for item in result["findings"])
    assert all(item["status"] == "needs_review" for item in result["findings"])
    assert not any(item["path"].startswith(".env") for item in result["files"])


def test_clean_fixture_completes_without_findings() -> None:
    response = _request("POST", "/analyze", json={"fixtureId": "clean-react-app"})

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "completed"
    assert result["findings"] == []


@pytest.mark.parametrize(
    "body",
    [
        {"fixtureId": "C:/Users"},
        {"fixtureId": "buggy-react-app", "root": "C:/"},
        {"fixture_id": "buggy-react-app"},
    ],
)
def test_analysis_rejects_invalid_or_arbitrary_paths(body: dict[str, str]) -> None:
    response = _request("POST", "/analyze", json=body)

    assert response.status_code == 422
    assert "C:/" not in response.text


def test_analysis_enforces_request_body_limit() -> None:
    response = _request(
        "POST",
        "/analyze",
        content=json.dumps({"fixtureId": "buggy-react-app", "padding": "x" * 5000}),
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 413
    assert "4 KiB" in response.text


def test_finding_ids_and_fingerprints_are_stable() -> None:
    from app.analyzers.base import Diagnostic

    diagnostic = Diagnostic("src/App.tsx", 4, 7, "TS2322", "type mismatch")
    first = normalize_finding(diagnostic, UUID("00000000-0000-0000-0000-000000000001"))
    second = normalize_finding(diagnostic, UUID("00000000-0000-0000-0000-000000000002"))

    assert first.id == second.id
    assert first.fingerprint == second.fingerprint


def test_findings_limit_marks_results_partial() -> None:
    from app.analyzers.base import AdapterResult, Diagnostic

    class ManyFindingAdapter:
        name = "fixture-test"

        def analyze(self, root: str, file_paths: tuple[str, ...], timeout: float):
            return AdapterResult(
                status=AnalyzerStatus.COMPLETED,
                version="test",
                message="done",
                diagnostics=(
                    Diagnostic("src/App.tsx", 1, 1, "TS2322", "first"),
                    Diagnostic("src/App.tsx", 2, 1, "TS2322", "second"),
                ),
            )

    result = analyze_fixture(
        "clean-react-app",
        limits=DiscoveryLimits(max_findings=1),
        adapter=ManyFindingAdapter(),
    )

    assert result.status is ScanStatus.PARTIAL
    assert len(result.findings) == 1
    assert result.analyzers[0].status is AnalyzerStatus.PARTIAL


def test_discovery_limit_failure_is_not_a_successful_scan() -> None:
    result = analyze_fixture(
        "clean-react-app",
        limits=DiscoveryLimits(max_file_bytes=1),
    )

    assert result.status is ScanStatus.FAILED
    assert result.findings == []
    assert "file limit" in result.errors[0]
    assert any(file.reason == "file_size_limit" for file in result.files)


def test_analyzer_failure_is_not_reported_as_complete() -> None:
    from app.analyzers.base import AdapterResult

    class FailedAdapter:
        name = "fixture-test"

        def analyze(self, root: str, file_paths: tuple[str, ...], timeout: float):
            return AdapterResult(
                status=AnalyzerStatus.FAILED,
                version=None,
                message="Analyzer failed safely.",
            )

    result = analyze_fixture("clean-react-app", adapter=FailedAdapter())

    assert result.status is ScanStatus.FAILED
    assert result.analyzers[0].status is AnalyzerStatus.FAILED
    assert result.findings == []


def test_unavailable_analyzer_does_not_return_success(monkeypatch) -> None:
    from app.analyzers import typescript

    monkeypatch.setattr(typescript.shutil, "which", lambda _: None)
    result = analyze_fixture("clean-react-app", adapter=TypeScriptAdapter())

    assert result.status is ScanStatus.PARTIAL
    assert result.analyzers[0].status is AnalyzerStatus.UNAVAILABLE
    assert result.findings == []


def test_internal_analyzer_error_returns_safe_failure(monkeypatch) -> None:
    from app import main

    def fail_analysis(_: str):
        raise RuntimeError("sensitive source must not appear")

    monkeypatch.setattr(main, "analyze_fixture", fail_analysis)
    response = _request("POST", "/analyze", json={"fixtureId": "clean-react-app"})

    assert response.status_code == 500
    assert "sensitive source" not in response.text
    assert response.json()["detail"] == "Analysis could not be completed safely."


@pytest.mark.parametrize(
    "expected",
    [
        AnalyzerStatus.TIMED_OUT,
        AnalyzerStatus.OUTPUT_LIMIT,
    ],
)
def test_analyzer_timeout_and_output_limit_are_reported(
    monkeypatch,
    expected: AnalyzerStatus,
) -> None:
    from app.analyzers import typescript

    calls = iter(
        [
            ProcessResult(0, b"Version 5.9.3", b"", False, False),
            (
                ProcessResult(None, b"", b"", True, False)
                if expected is AnalyzerStatus.TIMED_OUT
                else ProcessResult(-1, b"", b"", False, True)
            ),
        ]
    )
    monkeypatch.setattr(typescript.shutil, "which", lambda _: "node")
    monkeypatch.setattr(typescript, "_run_bounded", lambda *_, **__: next(calls))
    result = TypeScriptAdapter().analyze(
        str(typescript.REPO_ROOT),
        ("src/App.tsx",),
        2,
    )

    assert result.status is expected


def test_malformed_compiler_output_is_a_failure(monkeypatch) -> None:
    from app.analyzers import typescript

    calls = iter(
        [
            ProcessResult(0, b"Version 5.9.3", b"", False, False),
            ProcessResult(2, b"unexpected compiler output", b"", False, False),
        ]
    )
    monkeypatch.setattr(typescript.shutil, "which", lambda _: "node")
    monkeypatch.setattr(typescript, "_run_bounded", lambda *_, **__: next(calls))

    result = TypeScriptAdapter().analyze(
        str(typescript.REPO_ROOT),
        ("src/App.tsx",),
        2,
    )

    assert result.status is AnalyzerStatus.FAILED
    assert not result.diagnostics


def test_unresolved_project_imports_mark_analysis_partial(monkeypatch) -> None:
    from app.analyzers import typescript

    calls = iter(
        [
            ProcessResult(0, b"Version 5.9.3", b"", False, False),
            ProcessResult(
                2,
                b"src/App.tsx(1,1): error TS2792: Cannot find module 'react'.",
                b"",
                False,
                False,
            ),
        ]
    )
    monkeypatch.setattr(typescript.shutil, "which", lambda _: "node")
    monkeypatch.setattr(typescript, "_run_bounded", lambda *_, **__: next(calls))

    result = TypeScriptAdapter().analyze(
        str(typescript.REPO_ROOT),
        ("src/App.tsx",),
        2,
    )

    assert result.status is AnalyzerStatus.PARTIAL
    assert result.diagnostics == ()


def test_identical_compiler_diagnostics_are_deduplicated(monkeypatch) -> None:
    from app.analyzers import typescript

    output = (
        b"src/App.tsx(1,1): error TS2322: Type mismatch.\n"
        b"src/App.tsx(1,1): error TS2322: Type mismatch.\n"
    )
    calls = iter(
        [
            ProcessResult(0, b"Version 5.9.3", b"", False, False),
            ProcessResult(2, output, b"", False, False),
        ]
    )
    monkeypatch.setattr(typescript.shutil, "which", lambda _: "node")
    monkeypatch.setattr(typescript, "_run_bounded", lambda *_, **__: next(calls))

    result = TypeScriptAdapter().analyze(
        str(typescript.REPO_ROOT),
        ("src/App.tsx",),
        2,
    )

    assert result.status is AnalyzerStatus.COMPLETED
    assert len(result.diagnostics) == 1
