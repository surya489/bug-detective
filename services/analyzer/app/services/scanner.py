"""Run a safe, deterministic analysis for an allowlisted fixture."""

from __future__ import annotations

import hashlib
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from uuid import UUID, uuid4, uuid5

from app.analyzers.ai_analyzer import AIAnalyzerAdapter
from app.analyzers.base import AnalyzerAdapter, Diagnostic
from app.analyzers.typescript import TypeScriptAdapter
from app.schemas import (
    AnalysisResponse,
    AnalyzerRun,
    AnalyzerStatus,
    FileInspection,
    InspectionStatus,
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
    IGNORED_DIRECTORIES,
    _skip_reason,
    discover_files,
    SourceFile,
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
    analyzer_name = diagnostic.analyzer_name or "typescript"
    fingerprint = hashlib.sha256(
        f"{analyzer_name}\0{diagnostic.rule_id}\0{normalized_path}\0"
        f"{diagnostic.line}\0{diagnostic.column}\0{diagnostic.message}".encode("utf-8")
    ).hexdigest()

    if diagnostic.title is not None:
        return Finding.model_validate(
            {
                "id": uuid5(FINDING_NAMESPACE, fingerprint),
                "scanId": scan_id,
                "title": diagnostic.title,
                "description": diagnostic.description or "Issue detected by AI analysis.",
                "explanation": diagnostic.explanation,
                "category": diagnostic.category or FindingCategory.BUG,
                "severity": diagnostic.severity or FindingSeverity.MEDIUM,
                "filePath": normalized_path,
                "startLine": diagnostic.line,
                "endLine": diagnostic.line,
                "evidence": diagnostic.message,
                "fingerprint": fingerprint,
                "analyzer": analyzer_name,
                "ruleId": diagnostic.rule_id,
                "confidence": diagnostic.confidence,
                "status": ReviewStatus.NEEDS_REVIEW,
                "verification": VerificationStatus.NOT_RUN,
            }
        )

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

    return _analyze_discovery(
        discovery.sources,
        discovery.inspections,
        scan_id=scan_id,
        limits=selected_limits,
        started_at=started_at,
        started_clock=started_clock,
        adapter=adapter,
    )


def _analyze_discovery(
    sources: tuple[SourceFile, ...],
    inspections: tuple[FileInspection, ...],
    *,
    scan_id: UUID,
    limits: DiscoveryLimits,
    started_at: datetime,
    started_clock: float,
    adapter: AnalyzerAdapter | None,
    repository_full_name: str | None = None,
    commit_sha: str | None = None,
) -> AnalysisResponse:
    findings: list[Finding] = []
    analyzer_runs: list[AnalyzerRun] = []
    source_paths = tuple(
        source.relative_path
        for source in sources
        if Path(source.relative_path).suffix.lower()
        in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"}
    )
    adapters: tuple[AnalyzerAdapter, ...] = (
        (adapter,) if adapter is not None else (TypeScriptAdapter(), AIAnalyzerAdapter())
    )
    if not source_paths:
        for adp in adapters:
            analyzer_runs.append(
                AnalyzerRun(
                    name=adp.name,
                    status=AnalyzerStatus.SKIPPED,
                    message="No supported JavaScript or TypeScript source files were discovered.",
                )
            )
    else:
        try:
            with tempfile.TemporaryDirectory(prefix="bug-detective-") as staging:
                staging_root = Path(staging)
                for source in sources:
                    target = staging_root / source.relative_path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(source.content)
                for adp in adapters:
                    remaining = limits.max_scan_seconds - (time.monotonic() - started_clock)
                    if remaining <= 0:
                        analyzer_runs.append(
                            AnalyzerRun(
                                name=adp.name,
                                status=AnalyzerStatus.TIMED_OUT,
                                message="The fixture scan exceeded its overall time limit.",
                            )
                        )
                        continue
                    analyzer_run, diagnostics = _run_adapter(
                        adp,
                        staging,
                        source_paths,
                        min(limits.max_analyzer_seconds, remaining),
                    )
                    analyzer_runs.append(analyzer_run)
                    if analyzer_run.status in {
                        AnalyzerStatus.COMPLETED,
                        AnalyzerStatus.PARTIAL,
                    }:
                        for item in diagnostics:
                            if len(findings) < limits.max_findings:
                                findings.append(normalize_finding(item, scan_id))
                            else:
                                analyzer_run.status = AnalyzerStatus.PARTIAL
                                analyzer_run.message = (
                                    f"Results were limited to {limits.max_findings} findings; "
                                    "this scan may be incomplete."
                                )
                                break
        except (OSError, RuntimeError):
            for adp in adapters:
                if not any(run.name == adp.name for run in analyzer_runs):
                    analyzer_runs.append(
                        AnalyzerRun(
                            name=adp.name,
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
        fixtureId=f"github:{repository_full_name}" if repository_full_name else "local",
        status=scan_status,
        findings=findings,
        files=list(inspections),
        analyzers=analyzer_runs,
        errors=errors,
        startedAt=started_at,
        finishedAt=finished_at,
        repositoryFullName=repository_full_name,
        commitSha=commit_sha,
    )


def analyze_sources(
    repository_full_name: str,
    commit_sha: str,
    files: list[tuple[str, str]],
    *,
    limits: DiscoveryLimits | None = None,
    adapter: AnalyzerAdapter | None = None,
) -> AnalysisResponse:
    started_at = datetime.now(UTC)
    started_clock = time.monotonic()
    scan_id = uuid4()
    selected_limits = limits or DiscoveryLimits.from_environment()
    source_files: list[SourceFile] = []
    inspections: list[FileInspection] = []
    seen_paths: set[str] = set()
    total_bytes = 0

    try:
        for relative_path, text in files:
            pure_path = PurePosixPath(relative_path)
            if (
                "\\" in relative_path
                or pure_path.is_absolute()
                or not pure_path.parts
                or pure_path.as_posix() != relative_path
                or any(part in {"", ".", ".."} for part in pure_path.parts)
                or any(":" in part for part in pure_path.parts)
                or any(ord(char) < 32 or ord(char) == 127 for char in relative_path)
            ):
                raise ValueError("A source path is not a safe relative path.")
            canonical_path = pure_path.as_posix()
            if canonical_path in seen_paths:
                raise ValueError("The source request contains duplicate file paths.")
            seen_paths.add(canonical_path)
            path = Path(*pure_path.parts)
            reason = _skip_reason(path)
            if reason is None and any(
                part.lower() in IGNORED_DIRECTORIES for part in pure_path.parts[:-1]
            ):
                reason = "generated_or_dependency_directory"
            if reason is not None:
                inspections.append(
                    FileInspection(
                        path=canonical_path,
                        status=InspectionStatus.SKIPPED,
                        reason=reason,
                    )
                )
                continue

            try:
                content = text.encode("utf-8", errors="strict")
            except UnicodeEncodeError as exc:
                raise ValueError("A source file is not valid UTF-8 text.") from exc
            if b"\0" in content:
                inspections.append(
                    FileInspection(
                        path=canonical_path,
                        status=InspectionStatus.SKIPPED,
                        reason="binary_file",
                        sizeBytes=len(content),
                    )
                )
                continue
            if len(content) > selected_limits.max_file_bytes:
                raise ValueError("A source file exceeds the configured file limit.")
            if len(source_files) >= selected_limits.max_files:
                raise ValueError("The source request exceeds the configured file limit.")
            total_bytes += len(content)
            if total_bytes > selected_limits.max_total_bytes:
                raise ValueError("The source request exceeds the configured total size limit.")
            source_files.append(SourceFile(canonical_path, content))
            inspections.append(
                FileInspection(
                    path=canonical_path,
                    status=InspectionStatus.INCLUDED,
                    reason="supported_source_or_configuration",
                    sizeBytes=len(content),
                )
            )
    except ValueError as exc:
        finished_at = datetime.now(UTC)
        return AnalysisResponse(
            id=scan_id,
            fixtureId=f"github:{repository_full_name}",
            status=ScanStatus.FAILED,
            findings=[],
            files=inspections,
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
            repositoryFullName=repository_full_name,
            commitSha=commit_sha,
        )

    return _analyze_discovery(
        tuple(source_files),
        tuple(inspections),
        scan_id=scan_id,
        limits=selected_limits,
        started_at=started_at,
        started_clock=started_clock,
        adapter=adapter,
        repository_full_name=repository_full_name,
        commit_sha=commit_sha,
    )
