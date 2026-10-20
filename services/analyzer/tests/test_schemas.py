from datetime import UTC, datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.schemas import Finding, FindingCategory, FindingSeverity, ScanStatus, ScanSummary


VALID_FINDING = {
    "id": "95a64ff4-567b-4c1e-bae5-87d3bc56320d",
    "scan_id": "307abb44-3cbd-4fd9-bf73-032cce64c5c2",
    "title": "Unsafe query construction",
    "category": "security",
    "severity": "high",
    "file_path": "src/repository.ts",
    "start_line": 12,
    "end_line": 14,
    "evidence": "query + userInput",
}


def test_finding_accepts_valid_contract() -> None:
    finding = Finding.model_validate(VALID_FINDING)

    assert finding.category is FindingCategory.SECURITY
    assert finding.severity is FindingSeverity.HIGH
    assert finding.start_line == 12


def test_finding_accepts_and_serializes_camel_case_api_fields() -> None:
    api_finding = {
        key: VALID_FINDING[key]
        for key in ("id", "title", "category", "severity", "evidence")
    }
    api_finding.update(
        scanId=VALID_FINDING["scan_id"],
        filePath=VALID_FINDING["file_path"],
        startLine=VALID_FINDING["start_line"],
        endLine=VALID_FINDING["end_line"],
    )

    finding = Finding.model_validate(api_finding)

    serialized = finding.model_dump(mode="json", by_alias=True)

    assert serialized["scanId"] == VALID_FINDING["scan_id"]
    assert serialized["startLine"] == 12


@pytest.mark.parametrize("severity", ["urgent", "", "HIGH"])
def test_finding_rejects_invalid_severity(severity: str) -> None:
    with pytest.raises(ValidationError):
        Finding.model_validate({**VALID_FINDING, "severity": severity})


@pytest.mark.parametrize("category", ["style", "", "SECURITY"])
def test_finding_rejects_invalid_category(category: str) -> None:
    with pytest.raises(ValidationError):
        Finding.model_validate({**VALID_FINDING, "category": category})


def test_finding_rejects_reversed_line_range() -> None:
    with pytest.raises(ValidationError, match="end_line"):
        Finding.model_validate({**VALID_FINDING, "start_line": 15, "end_line": 14})


def test_scan_summary_accepts_valid_status() -> None:
    summary = ScanSummary.model_validate(
        {
            "id": UUID("307abb44-3cbd-4fd9-bf73-032cce64c5c2"),
            "repository_full_name": "octo/example",
            "commit_sha": "a" * 40,
            "status": "completed",
            "created_at": datetime.now(UTC),
        }
    )

    assert summary.status is ScanStatus.COMPLETED
    assert summary.model_dump(by_alias=True)["repositoryFullName"] == "octo/example"


@pytest.mark.parametrize("status", ["pending", "complete", "", "RUNNING"])
def test_scan_summary_rejects_invalid_status(status: str) -> None:
    with pytest.raises(ValidationError):
        ScanSummary.model_validate(
            {
                "id": "307abb44-3cbd-4fd9-bf73-032cce64c5c2",
                "repository_full_name": "octo/example",
                "commit_sha": "a" * 40,
                "status": status,
                "created_at": datetime.now(UTC),
            }
        )
