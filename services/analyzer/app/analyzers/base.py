"""Common analyzer adapter result types."""

from dataclasses import dataclass
from typing import Protocol

from app.schemas import AnalyzerStatus, FindingCategory, FindingSeverity


@dataclass(frozen=True)
class Diagnostic:
    path: str
    line: int
    column: int
    rule_id: str
    message: str
    title: str | None = None
    category: FindingCategory | None = None
    severity: FindingSeverity | None = None
    description: str | None = None
    explanation: str | None = None
    confidence: float | None = None
    suggested_fix: str | None = None
    analyzer_name: str | None = None


@dataclass(frozen=True)
class AdapterResult:
    status: AnalyzerStatus
    version: str | None
    message: str
    diagnostics: tuple[Diagnostic, ...] = ()
    duration_ms: int = 0


class AnalyzerAdapter(Protocol):
    name: str

    def analyze(self, root: str, file_paths: tuple[str, ...], timeout: float) -> AdapterResult: ...
