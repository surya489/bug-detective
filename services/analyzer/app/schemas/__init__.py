"""Validated API contracts shared by analyzer routes."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


class FindingSeverity(StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class FindingCategory(StrEnum):
    BUG = "bug"
    SECURITY = "security"
    PERFORMANCE = "performance"
    MAINTAINABILITY = "maintainability"


class ScanStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ReviewStatus(StrEnum):
    NEEDS_REVIEW = "needs_review"


class VerificationStatus(StrEnum):
    NOT_RUN = "not_run"


class InspectionStatus(StrEnum):
    INCLUDED = "included"
    SKIPPED = "skipped"


class AnalyzerStatus(StrEnum):
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"
    TIMED_OUT = "timed_out"
    OUTPUT_LIMIT = "output_limit"
    UNAVAILABLE = "unavailable"
    SKIPPED = "skipped"


NonEmptyText = Annotated[str, Field(min_length=1)]
FixtureId = Literal["buggy-react-app", "clean-react-app"]


class Finding(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="forbid",
        populate_by_name=True,
    )

    id: UUID
    scan_id: UUID
    title: Annotated[str, Field(min_length=1, max_length=300)]
    category: FindingCategory
    severity: FindingSeverity
    file_path: NonEmptyText
    start_line: Annotated[int, Field(ge=1)]
    end_line: Annotated[int, Field(ge=1)]
    evidence: NonEmptyText
    explanation: str | None = None
    description: str | None = None
    fingerprint: Annotated[str, Field(min_length=64, max_length=64)] | None = None
    analyzer: str | None = None
    rule_id: str | None = None
    confidence: Annotated[float, Field(ge=0, le=1)] | None = None
    in_commit_diff: bool | None = None
    suggested_fix: str | None = None
    status: ReviewStatus = ReviewStatus.NEEDS_REVIEW
    verification: VerificationStatus = VerificationStatus.NOT_RUN

    @model_validator(mode="after")
    def line_range_is_ordered(self) -> "Finding":
        if self.end_line < self.start_line:
            raise ValueError("end_line must be greater than or equal to start_line")
        return self


class ScanSummary(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="forbid",
        populate_by_name=True,
    )

    id: UUID
    repository_full_name: NonEmptyText
    commit_sha: Annotated[str, Field(min_length=1, max_length=64)]
    status: ScanStatus
    created_at: datetime


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="forbid",
    )

    fixture_id: FixtureId


class SourceFileInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: Annotated[str, Field(min_length=1, max_length=1024)]
    content: str


class AnalyzeSourcesRequest(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="forbid",
    )

    repository_full_name: Annotated[
        str,
        Field(pattern=r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$"),
    ]
    commit_sha: Annotated[str, Field(pattern=r"^[0-9a-fA-F]{40}$")]
    files: Annotated[list[SourceFileInput], Field(max_length=10_000)]


class FixtureDescriptor(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel)

    id: FixtureId
    name: NonEmptyText
    description: NonEmptyText


class FixtureListResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel)

    fixtures: list[FixtureDescriptor]


class FileInspection(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    path: NonEmptyText
    status: InspectionStatus
    reason: NonEmptyText
    size_bytes: Annotated[int, Field(ge=0)] = 0


class AnalyzerRun(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: NonEmptyText
    version: str | None = None
    status: AnalyzerStatus
    message: NonEmptyText
    files_analyzed: Annotated[int, Field(ge=0)] = 0
    findings_count: Annotated[int, Field(ge=0)] = 0
    duration_ms: Annotated[int, Field(ge=0)] = 0


class AnalysisResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: UUID
    fixture_id: NonEmptyText
    status: ScanStatus
    findings: list[Finding]
    files: list[FileInspection]
    analyzers: list[AnalyzerRun]
    errors: list[str]
    started_at: datetime
    finished_at: datetime
    repository_full_name: str | None = None
    commit_sha: Annotated[str, Field(pattern=r"^[0-9a-fA-F]{40}$")] | None = None


class ExplainFindingRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, extra="forbid")

    title: NonEmptyText
    evidence: str = ""
    file_path: NonEmptyText
    start_line: Annotated[int, Field(ge=1)] = 1
    code_context: str = ""


class ExplainFindingResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    explanation: str
    suggested_fix: str | None = None


class VerifyFindingRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, extra="forbid")

    title: NonEmptyText
    evidence: str = ""
    file_path: NonEmptyText
    start_line: Annotated[int, Field(ge=1)] = 1
    code_context: str = ""


class VerifyFindingResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    verified: bool
    confidence: float
    explanation: str
    recommended_action: str
