"""AI Model Analyzer Adapter for intelligent bug and security issue detection."""

from __future__ import annotations

import time
from pathlib import Path

from app.ai.base import AIProvider
from app.ai.provider import get_ai_provider
from app.analyzers.base import AdapterResult, AnalyzerAdapter, Diagnostic
from app.schemas import AnalyzerStatus


class AIAnalyzerAdapter(AnalyzerAdapter):
    """Adapter that executes the configured AI provider across source files."""

    name = "ai-model"
    version = "1.0.0"

    def __init__(self, provider: AIProvider | None = None) -> None:
        self._provider = provider or get_ai_provider()

    def analyze(
        self,
        root: str,
        file_paths: tuple[str, ...],
        timeout: float,
    ) -> AdapterResult:
        start_clock = time.monotonic()
        root_path = Path(root)
        diagnostics: list[Diagnostic] = []

        for rel_path in file_paths:
            # Check for timeout
            elapsed = time.monotonic() - start_clock
            if elapsed > timeout:
                return AdapterResult(
                    status=AnalyzerStatus.TIMED_OUT,
                    version=self.version,
                    message="AI analysis timed out before inspecting all files.",
                    diagnostics=tuple(diagnostics),
                    duration_ms=int(elapsed * 1000),
                )

            full_path = root_path / rel_path
            try:
                if not full_path.is_file():
                    continue
                content = full_path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue

            findings = self._provider.analyze_source(rel_path, content)
            for item in findings:
                diagnostics.append(
                    Diagnostic(
                        path=item.file_path,
                        line=item.start_line,
                        column=item.start_column,
                        rule_id=item.rule_id,
                        message=item.evidence,
                        title=item.title,
                        category=item.category,
                        severity=item.severity,
                        description=item.description,
                        explanation=item.explanation,
                        confidence=item.confidence,
                        suggested_fix=item.suggested_fix,
                        analyzer_name=self.name,
                    )
                )

        elapsed_ms = int((time.monotonic() - start_clock) * 1000)
        message = (
            f"AI model scanned {len(file_paths)} files and detected {len(diagnostics)} issues."
            if diagnostics
            else f"AI model inspected {len(file_paths)} files; no defects detected."
        )

        return AdapterResult(
            status=AnalyzerStatus.COMPLETED,
            version=self.version,
            message=message,
            diagnostics=tuple(diagnostics),
            duration_ms=elapsed_ms,
        )
