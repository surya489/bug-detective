"""Interactive demo script to test the Bug Detective AI analyzer on sample code."""

from __future__ import annotations

import tempfile
from pathlib import Path

from app.analyzers.ai_analyzer import AIAnalyzerAdapter


SAMPLE_BUGGY_CODE = """// Sample buggy component to test AI detection
import React, { useState, useEffect } from 'react';

export function Dashboard() {
  const [items, setItems] = useState([]);
  
  // 1. Security: Hardcoded secret
  const apiKey = "sk-live-9876543210abcdef123456";

  useEffect(() => {
    // 2. Performance: Memory leak (no cleanup)
    window.addEventListener("resize", () => {
      console.log("Window resized");
    });
  });

  const addItem = (newItem) => {
    // 3. Bug: Direct state mutation
    items.push(newItem);
    setItems(items);
  };

  const loadData = async () => {
    try {
      const res = await fetch("/api/data");
      return await res.json();
    } catch (err) {
      // 4. Bug: Swallowed error
    }
  };

  return (
    <div>
      {/* 5. Security: Unsanitized HTML injection */}
      <div dangerouslySetInnerHTML={{ __html: "<p>Unsafe markup</p>" }} />
    </div>
  );
}
"""


def main():
    print("=" * 65)
    print(" BUG DETECTIVE AI ANALYZER - TEST RUNNER")
    print("=" * 65)

    with tempfile.TemporaryDirectory() as tmp_dir:
        test_file = Path(tmp_dir) / "Dashboard.tsx"
        test_file.write_text(SAMPLE_BUGGY_CODE, encoding="utf-8")

        adapter = AIAnalyzerAdapter()
        print(f"\nScanning: {test_file.name} ...\n")
        result = adapter.analyze(tmp_dir, ("Dashboard.tsx",), timeout=5.0)

        print(f"Status   : {result.status.upper()}")
        print(f"Duration : {result.duration_ms} ms")
        print(f"Findings : {len(result.diagnostics)} issues detected\n")
        print("-" * 65)

        for idx, d in enumerate(result.diagnostics, start=1):
            sev_badge = f"[{d.severity.upper()}]" if d.severity else "[INFO]"
            cat_badge = f"({d.category})" if d.category else ""
            print(f"\nIssue #{idx}: {sev_badge} {cat_badge} {d.title}")
            print(f"  * Location : {d.path}:{d.line}")
            print(f"  * Rule ID  : {d.rule_id}")
            print(f"  * Evidence : {d.message}")
            if d.explanation:
                print(f"  * AI Note  : {d.explanation}")
            if d.suggested_fix:
                print("  * AI Patch :")
                for fix_line in d.suggested_fix.splitlines():
                    print(f"      {fix_line}")

    print("\n" + "=" * 65)
    print(" [OK] Test run complete! All AI detection rules executed.")
    print("=" * 65)


if __name__ == "__main__":
    main()
