"""Converts manual triage decisions (confirmed bugs, false positives, fixed code) into training samples."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from dataset import SYSTEM_INSTRUCTION, TrainingExample, export_dataset_jsonl, load_dataset_jsonl


def convert_triage_decision(record: dict) -> TrainingExample | None:
    """Convert a developer triage record into an instruction training sample.

    record schema:
    {
        "status": "CONFIRMED" | "FALSE_POSITIVE" | "FIXED",
        "filePath": "src/App.tsx",
        "codeSnippet": "...",
        "finding": {
            "ruleId": "...",
            "title": "...",
            "severity": "...",
            "category": "...",
            "line": 4,
            "explanation": "..."
        },
        "developerNotes": "...",
        "fixedCode": "..."
    }
    """
    status = record.get("status")
    code = record.get("codeSnippet", "")
    finding = record.get("finding", {})

    if not code or not finding:
        return None

    if status in ("CONFIRMED", "FIXED"):
        output_payload = {
            "findings": [
                {
                    "ruleId": finding.get("ruleId", "CUSTOM-BUG"),
                    "title": finding.get("title", "Confirmed Defect"),
                    "severity": finding.get("severity", "medium"),
                    "category": finding.get("category", "bug"),
                    "line": finding.get("line", 1),
                    "explanation": (
                        record.get("developerNotes")
                        or finding.get("explanation")
                        or "Confirmed bug based on developer review."
                    ),
                    "suggestedFix": record.get("fixedCode"),
                }
            ]
        }
    elif status == "FALSE_POSITIVE":
        # Negative example: AI should learn NOT to flag this benign pattern
        output_payload = {
            "findings": [],
            "note": f"Code verified benign. Rule {finding.get('ruleId')} false-positive suppressed.",
        }
    else:
        return None

    return TrainingExample(
        instruction=SYSTEM_INSTRUCTION,
        input=code,
        output=json.dumps(output_payload, indent=2),
        category=finding.get("category", "general"),
    )


def process_feedback_file(input_path: Path, output_path: Path) -> int:
    if not input_path.is_file():
        print(f"Error: Feedback file not found: {input_path}")
        return 0

    with input_path.open("r", encoding="utf-8") as f:
        records = json.load(f)

    if not isinstance(records, list):
        records = [records]

    existing = load_dataset_jsonl(output_path)
    new_examples: list[TrainingExample] = []

    for item in records:
        example = convert_triage_decision(item)
        if example:
            new_examples.append(example)

    combined = list(existing) + new_examples
    export_dataset_jsonl(combined, output_path)
    return len(new_examples)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Export developer review feedback into AI training dataset."
    )
    parser.add_argument(
        "--input",
        type=str,
        required=True,
        help="Path to JSON file containing user triage records.",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(Path(__file__).parent / "sample_data.jsonl"),
        help="Path to output JSONL dataset file.",
    )
    args = parser.parse_args()
    count = process_feedback_file(Path(args.input), Path(args.output))
    print(f"Appended {count} new training samples to {args.output}")
