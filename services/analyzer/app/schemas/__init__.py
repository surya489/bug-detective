"""Validated API contracts shared by analyzer routes."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated
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
    FAILED = "failed"
    CANCELLED = "cancelled"


NonEmptyText = Annotated[str, Field(min_length=1)]


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
