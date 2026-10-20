"""Run a safe, deterministic analysis for an allowlisted fixture."""

from __future__ import annotations

import hashlib
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4, uuid5

from app.analyzers.base import AnalyzerAdapter, Diagnostic
from app.analyzers.typescript import TypeScriptAdapter
from app.schemas import (
    AnalysisResponse,
    AnalyzerRun,
    AnalyzerStatus,
    Finding,
    FindingCategory,
    FindingSeverity,
    ReviewStatus,
    ScanStatus,
    VerificationStatus,
)
from app.services.discovery import (
    DiscoveryError,
    DiscoveryLimits,
    discover_files,
)

FINDING_NAMESPACE = UUID("27bd203d-390d-4abe-b049-f00403dfd922")
FIXTURES_ROOT = Path(__file__).resolve().parents[4] / "fixtures"
FIXTURE_IDS = ("buggy-react-app", "clean-react-app")


def fixture_path(fixture_id: str) -> Path:
    if fixture_id not in FIXTURE_IDS:
        raise ValueError("The requested fixture is not available.")
    root = FIXTURES_ROOT.resolve(strict=True)
    selected = root / fixture_id
    try:
        resolved = selected.resolve(strict=True)
        resolved.relative_to(root)
    except (OSError, RuntimeError, ValueError) as exc:
        raise DiscoveryError("The selected fixture is unavailable.") from exc
    if selected.is_symlink() or not resolved.is_dir():
        raise DiscoveryError("The selected fixture is not a permitted directory.")
    return resolved


def normalize_finding(diagnostic: Diagnostic, scan_id: UUID) -> Finding:
    normalized_path = Path(diagnostic.path).as_posix()
    fingerprint = hashlib.sha256(
        f"typescript\0{diagnostic.rule_id}\0{normalized_path}\0"
        f"{diagnostic.line}\0{diagnostic.column}\0{diagnostic.message}".encode("utf-8")
    ).hexdigest()
    unused_symbol = diagnostic.rule_id in {"TS6133", "TS6138"}
    return Finding.model_validate(
        {
            "id": uuid5(FINDING_NAMESPACE, fingerprint),
            "scanId": scan_id,
            "title": (
                "Unused declaration"
                if unused_symbol
                else f"TypeScript diagnostic {diagnostic.rule_id}"
            ),
            "description": (
                "The TypeScript compiler reported a static diagnostic. "
                "Review the source and project context before treating it as a defect."
            ),
            "category": (
                FindingCategory.MAINTAINABILITY
                if unused_symbol
                else FindingCategory.BUG
            ),
            "severity": FindingSeverity.LOW if unused_symbol else FindingSeverity.MEDIUM,
            "filePath": normalized_path,
            "startLine": diagnostic.line,
            "endLine": diagnostic.line,
            "evidence": diagnostic.message,
            "fingerprint": fingerprint,
            "analyzer": "typescript",
            "ruleId": diagnostic.rule_id,
            "confidence": None,
            "status": ReviewStatus.NEEDS_REVIEW,
            "verification": VerificationStatus.NOT_RUN,
        }
    )


def _run_adapter(
    adapter: AnalyzerAdapter,
    root: str,
    paths: tuple[str, ...],
    timeout: float,
) -> tuple[AnalyzerRun, tuple[Diagnostic, ...]]:
    result = adapter.analyze(root, paths, timeout)
    return (
        AnalyzerRun(
            name=adapter.name,
            version=result.version,
            status=result.status,
            message=result.message,
            filesAnalyzed=len(paths),
            findingsCount=len(result.diagnostics),
            durationMs=result.duration_ms,
        ),
        result.diagnostics,
    )


def analyze_fixture(
    fixture_id: str,
    *,
    limits: DiscoveryLimits | None = None,
    adapter: AnalyzerAdapter | None = None,
) -> AnalysisResponse:
    started_at = datetime.now(UTC)
    started_clock = time.monotonic()
    scan_id = uuid4()
    try:
        selected_limits = limits or DiscoveryLimits.from_environment()
        root = fixture_path(fixture_id)
        discovery = discover_files(root, selected_limits)
    except (DiscoveryError, ValueError) as exc:
        failed_files = exc.inspections if isinstance(exc, DiscoveryError) else ()
        finished_at = datetime.now(UTC)
        return AnalysisResponse(
            id=scan_id,
            fixtureId=fixture_id,
            status=ScanStatus.FAILED,
            findings=[],
            files=list(failed_files),
            analyzers=[
                AnalyzerRun(
                    name="discovery",
                    status=AnalyzerStatus.FAILED,
                    message=str(exc),
                )
            ],
            errors=[str(exc)],
            startedAt=started_at,
            finishedAt=finished_at,
        )

    findings: list[Finding] = []
    analyzer_runs: list[AnalyzerRun] = []
    source_paths = tuple(
        source.relative_path
        for source in discovery.sources
        if Path(source.relative_path).suffix.lower()
        in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"}
    )
    selected_adapter = adapter or TypeScriptAdapter()
    if not source_paths:
        analyzer_runs.append(
            AnalyzerRun(
                name=selected_adapter.name,
                status=AnalyzerStatus.SKIPPED,
                message="No supported JavaScript or TypeScript source files were discovered.",
            )
        )
    else:
        try:
            with tempfile.TemporaryDirectory(prefix="bug-detective-") as staging:
                staging_root = Path(staging)
                for source in discovery.sources:
                    target = staging_root / source.relative_path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(source.content)
                remaining = selected_limits.max_scan_seconds - (
                    time.monotonic() - started_clock
                )
                if remaining <= 0:
                    analyzer_run = AnalyzerRun(
                        name=selected_adapter.name,
                        status=AnalyzerStatus.TIMED_OUT,
                        message="The fixture scan exceeded its overall time limit.",
                    )
                    diagnostics = ()
                else:
                    analyzer_run, diagnostics = _run_adapter(
                        selected_adapter,
                        staging,
                        source_paths,
                        min(selected_limits.max_analyzer_seconds, remaining),
                    )
                analyzer_runs.append(analyzer_run)
                if analyzer_run.status in {
                    AnalyzerStatus.COMPLETED,
                    AnalyzerStatus.PARTIAL,
                }:
                    findings = [
                        normalize_finding(item, scan_id) for item in diagnostics
                    ]
                    if len(findings) > selected_limits.max_findings:
                        findings = findings[: selected_limits.max_findings]
                        analyzer_run.status = AnalyzerStatus.PARTIAL
                        analyzer_run.message = (
                            f"Results were limited to {selected_limits.max_findings} findings; "
                            "this scan may be incomplete."
                        )
        except (OSError, RuntimeError):
            analyzer_runs.append(
                AnalyzerRun(
                    name=selected_adapter.name,
                    status=AnalyzerStatus.FAILED,
                    message="The analyzer could not safely stage or process the fixture.",
                )
            )

    errors = [
        run.message
        for run in analyzer_runs
        if run.status not in {AnalyzerStatus.COMPLETED}
    ]
    if any(run.status is AnalyzerStatus.FAILED for run in analyzer_runs):
        scan_status = ScanStatus.FAILED
    elif any(run.status is not AnalyzerStatus.COMPLETED for run in analyzer_runs):
        scan_status = ScanStatus.PARTIAL
    else:
        scan_status = ScanStatus.COMPLETED

    finished_at = datetime.now(UTC)
    return AnalysisResponse(
        id=scan_id,
        fixtureId=fixture_id,
        status=scan_status,
        findings=findings,
        files=list(discovery.inspections),
        analyzers=analyzer_runs,
        errors=errors,
        startedAt=started_at,
        finishedAt=finished_at,
    )
