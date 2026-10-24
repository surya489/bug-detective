"""Dataset preparation and formatting for training/fine-tuning the Bug Detective AI model."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class TrainingExample:
    """Standardized training sample for instruction fine-tuning."""

    instruction: str
    input: str
    output: str
    category: str


SYSTEM_INSTRUCTION = (
    "You are Bug Detective, an expert static analysis and code review AI. "
    "Analyze the following code for defects, security vulnerabilities, or code smells. "
    "Provide findings as structured JSON with title, severity, category, ruleId, explanation, and suggestedFix."
)

SEED_EXAMPLES: tuple[TrainingExample, ...] = (
    TrainingExample(
        instruction=SYSTEM_INSTRUCTION,
        input=(
            "import { useState } from 'react';\n\n"
            "export function UserProfile({ initialUser }) {\n"
            "  const [user, setUser] = useState(initialUser);\n"
            "  const apiKey = 'sk-prod-live-9923847291823719';\n\n"
            "  return <div>{user.name}</div>;\n"
            "}"
        ),
        output=json.dumps(
            {
                "findings": [
                    {
                        "ruleId": "AI-SEC-001",
                        "title": "Hardcoded credential or API secret detected",
                        "severity": "critical",
                        "category": "security",
                        "line": 5,
                        "explanation": "Hardcoded production API key found in component source. Secrets must be loaded via environment variables.",
                        "suggestedFix": "- const apiKey = 'sk-prod-live-9923847291823719';\n+ const apiKey = process.env.NEXT_PUBLIC_API_KEY;",
                    }
                ]
            },
            indent=2,
        ),
        category="security",
    ),
    TrainingExample(
        instruction=SYSTEM_INSTRUCTION,
        input=(
            "export function CommentBody({ rawHtml }) {\n"
            "  return (\n"
            "    <div className='prose' dangerouslySetInnerHTML={{ __html: rawHtml }} />\n"
            "  );\n"
            "}"
        ),
        output=json.dumps(
            {
                "findings": [
                    {
                        "ruleId": "AI-SEC-002",
                        "title": "Unsanitized HTML injection risk (dangerouslySetInnerHTML)",
                        "severity": "high",
                        "category": "security",
                        "line": 3,
                        "explanation": "dangerouslySetInnerHTML bypasses React's XSS protections. Sanitize untrusted markup with DOMPurify.",
                        "suggestedFix": "+ import DOMPurify from 'dompurify';\n- <div className='prose' dangerouslySetInnerHTML={{ __html: rawHtml }} />\n+ <div className='prose' dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(rawHtml) }} />",
                    }
                ]
            },
            indent=2,
        ),
        category="security",
    ),
    TrainingExample(
        instruction=SYSTEM_INSTRUCTION,
        input=(
            "import { useEffect, useState } from 'react';\n\n"
            "export function WindowTracker() {\n"
            "  const [width, setWidth] = useState(window.innerWidth);\n\n"
            "  useEffect(() => {\n"
            "    const handleResize = () => setWidth(window.innerWidth);\n"
            "    window.addEventListener('resize', handleResize);\n"
            "  }, []);\n\n"
            "  return <span>Width: {width}px</span>;\n"
            "}"
        ),
        output=json.dumps(
            {
                "findings": [
                    {
                        "ruleId": "AI-PERF-001",
                        "title": "Uncleaned event listener in effect hook (Memory leak risk)",
                        "severity": "high",
                        "category": "performance",
                        "line": 7,
                        "explanation": "Window resize event listener is registered inside useEffect without a cleanup return function, causing memory leaks.",
                        "suggestedFix": "+ return () => window.removeEventListener('resize', handleResize);",
                    }
                ]
            },
            indent=2,
        ),
        category="performance",
    ),
    TrainingExample(
        instruction=SYSTEM_INSTRUCTION,
        input=(
            "export function TodoList({ items, setItems }) {\n"
            "  function addItem(title) {\n"
            "    items.push({ id: Date.now(), title });\n"
            "    setItems(items);\n"
            "  }\n"
            "  return <ul>{items.map(i => <li key={i.id}>{i.title}</li>)}</ul>;\n"
            "}"
        ),
        output=json.dumps(
            {
                "findings": [
                    {
                        "ruleId": "AI-BUG-002",
                        "title": "Direct mutation of state or array",
                        "severity": "high",
                        "category": "bug",
                        "line": 3,
                        "explanation": "Directly mutating React state using items.push prevents React from detecting state reference changes and triggers missed renders.",
                        "suggestedFix": "- items.push({ id: Date.now(), title });\n- setItems(items);\n+ setItems(prev => [...prev, { id: Date.now(), title }]);",
                    }
                ]
            },
            indent=2,
        ),
        category="bug",
    ),
    TrainingExample(
        instruction=SYSTEM_INSTRUCTION,
        input=(
            "export async function fetchAccountData(userId) {\n"
            "  try {\n"
            "    const res = await fetch(`/api/users/${userId}`);\n"
            "    return await res.json();\n"
            "  } catch (error) {}\n"
            "}"
        ),
        output=json.dumps(
            {
                "findings": [
                    {
                        "ruleId": "AI-BUG-001",
                        "title": "Swallowed error in empty catch block",
                        "severity": "medium",
                        "category": "bug",
                        "line": 5,
                        "explanation": "Exceptions are silently caught and swallowed without logging, causing calling code to receive undefined without failure indication.",
                        "suggestedFix": "+ console.error('fetchAccountData failed for user:', userId, error);\n+ throw error;",
                    }
                ]
            },
            indent=2,
        ),
        category="bug",
    ),
)


def export_dataset_jsonl(
    examples: list[TrainingExample] | tuple[TrainingExample, ...],
    output_path: Path | str,
) -> int:
    """Export training examples into JSON Lines format for Hugging Face/SFT training."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        for ex in examples:
            file.write(json.dumps(asdict(ex)) + "\n")
    return len(examples)


def load_dataset_jsonl(input_path: Path | str) -> list[TrainingExample]:
    """Load training examples from a JSON Lines file."""
    path = Path(input_path)
    if not path.is_file():
        return []
    examples: list[TrainingExample] = []
    with path.open("r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line:
                continue
            data = json.loads(line)
            examples.append(
                TrainingExample(
                    instruction=data["instruction"],
                    input=data["input"],
                    output=data["output"],
                    category=data.get("category", "general"),
                )
            )
    return examples


if __name__ == "__main__":
    default_dest = Path(__file__).parent / "sample_data.jsonl"
    count = export_dataset_jsonl(SEED_EXAMPLES, default_dest)
    print(f"Generated {count} training samples at {default_dest}")
