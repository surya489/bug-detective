import asyncio
import json
from pathlib import Path

import httpx
import pytest

from app.main import app
from app.schemas import AnalyzerStatus, ScanStatus
from app.services.scanner import analyze_sources

VALID_KEY = "test-only-analyzer-key"
VALID_SHA = "a" * 40


def _request(method: str, path: str, **kwargs) -> httpx.Response:
    async def send() -> httpx.Response:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def test_source_endpoint_requires_server_configured_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANALYZER_API_KEY", raising=False)
    response = _request("POST", "/analyze/sources", json={})

    assert response.status_code == 503
    assert "key" not in response.text.lower()


def test_source_endpoint_rejects_invalid_key_without_echoing_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ANALYZER_API_KEY", VALID_KEY)
    secret = "untrusted-client-token"
    response = _request(
        "POST",
        "/analyze/sources",
        headers={"x-analyzer-api-key": secret},
        json={},
    )

    assert response.status_code == 401
    assert secret not in response.text


def test_source_endpoint_runs_existing_typescript_analyzer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ANALYZER_API_KEY", VALID_KEY)
    response = _request(
        "POST",
        "/analyze/sources",
        headers={"x-analyzer-api-key": VALID_KEY},
        json={
            "repositoryFullName": "example/project",
            "commitSha": VALID_SHA,
            "files": [
                {
                    "path": "src/App.ts",
                    "content": 'const count: number = "not a number";\n',
                },
                {
                    "path": ".env.production",
                    "content": "SHOULD_NOT_BE_INCLUDED",
                },
                {
                    "path": ".env.local/Keys.ts",
                    "content": "SHOULD_NOT_BE_INCLUDED",
                },
                {
                    "path": "src/App.min.ts",
                    "content": "SHOULD_NOT_BE_INCLUDED",
                },
            ],
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert result["repositoryFullName"] == "example/project"
    assert result["commitSha"] == VALID_SHA
    assert result["status"] == "completed"
    assert {finding["ruleId"] for finding in result["findings"]} == {"TS2322"}
    assert {
        item["reason"] for item in result["files"] if item["status"] == "skipped"
    } == {
        "sensitive_environment_file",
        "generated_or_minified_file",
    }
    assert "SHOULD_NOT_BE_INCLUDED" not in response.text


@pytest.mark.parametrize("bad_path", ["../outside.ts", "C:/outside.ts", "src\\App.ts"])
def test_source_analyzer_rejects_noncanonical_paths(bad_path: str) -> None:
    result = analyze_sources(
        "example/project",
        VALID_SHA,
        [(bad_path, "const value = 1;")],
    )

    assert result.status == "failed"
    assert result.findings == []
    assert "safe relative path" in result.errors[0]


def test_source_endpoint_rejects_short_or_malformed_commit_sha(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ANALYZER_API_KEY", VALID_KEY)
    response = _request(
        "POST",
        "/analyze/sources",
        headers={"x-analyzer-api-key": VALID_KEY},
        content=json.dumps(
            {
                "repositoryFullName": "example/project",
                "commitSha": "abc123",
                "files": [],
            }
        ),
    )

    assert response.status_code == 422
    assert "abc123" not in response.text


def test_source_analysis_reuses_normalization_and_cleans_temporary_workspace() -> None:
    from app.analyzers.base import AdapterResult, Diagnostic
    from app.services import scanner

    staged_roots: list[Path] = []

    class RecordingAdapter:
        name = "recording-test"

        def analyze(self, root: str, file_paths: tuple[str, ...], timeout: float):
            root_path = Path(root)
            staged_roots.append(root_path)
            assert file_paths == ("src/App.ts",)
            assert (root_path / "src" / "App.ts").read_text(encoding="utf-8") == (
                'const value: number = "wrong";\n'
            )
            return AdapterResult(
                status=AnalyzerStatus.COMPLETED,
                version="test",
                message="completed",
                diagnostics=(
                    Diagnostic("src/App.ts", 1, 7, "TS2322", "type mismatch"),
                ),
            )

    result = scanner.analyze_sources(
        "example/project",
        VALID_SHA,
        [("src/App.ts", 'const value: number = "wrong";\n')],
        adapter=RecordingAdapter(),
    )

    assert result.status == ScanStatus.COMPLETED
    assert result.repository_full_name == "example/project"
    assert result.commit_sha == VALID_SHA
    assert result.findings[0].rule_id == "TS2322"
    assert result.findings[0].file_path == "src/App.ts"
    assert len(staged_roots) == 1
    assert not staged_roots[0].exists()
