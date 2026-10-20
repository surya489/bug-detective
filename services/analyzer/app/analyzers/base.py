"""Common analyzer adapter result types."""

from dataclasses import dataclass
from typing import Protocol

from app.schemas import AnalyzerStatus


@dataclass(frozen=True)
class Diagnostic:
    path: str
    line: int
    column: int
    rule_id: str
    message: str


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
