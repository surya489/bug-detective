"""Shared AI provider interface and data models."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from app.schemas import FindingCategory, FindingSeverity


@dataclass(frozen=True)
class AIFinding:
    """Represents an issue detected by the AI analysis engine."""

    file_path: str
    start_line: int
    end_line: int
    title: str
    category: FindingCategory
    severity: FindingSeverity
    rule_id: str
    evidence: str
    description: str
    explanation: str
    start_column: int = 1
    end_column: int = 1
    confidence: float = 0.90
    suggested_fix: str | None = None
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class VerificationResult:
    """Result of AI verifying a finding as genuine defect or false positive."""

    verified: bool
    confidence: float
    explanation: str
    recommended_action: str


@runtime_checkable
class AIProvider(Protocol):
    """Protocol for AI analysis providers (local heuristics, LLM, or fine-tuned model)."""

    name: str

    def analyze_source(self, file_path: str, content: str) -> list[AIFinding]:
        """Analyze source code text and return structured AI findings."""
        ...

    def explain_finding(
        self,
        title: str,
        evidence: str,
        file_path: str,
        start_line: int,
        code_context: str,
    ) -> str:
        """Generate a detailed explanation for an existing compiler or static finding."""
        ...

    def verify_finding(
        self,
        title: str,
        evidence: str,
        file_path: str,
        start_line: int,
        code_context: str,
    ) -> VerificationResult:
        """Verify whether an issue is a genuine bug or a false positive."""
        ...
