"""Unit tests for the AI Model Analyzer and Provider."""

from app.ai.base import AIFinding
from app.ai.provider import LocalHeuristicAIProvider, get_ai_provider
from app.analyzers.ai_analyzer import AIAnalyzerAdapter
from app.schemas import AnalyzerStatus, FindingCategory, FindingSeverity


def test_ai_provider_detects_hardcoded_secret():
    provider = LocalHeuristicAIProvider()
    code = 'const apiKey = "sk-1234567890abcdef123456";\n'
    findings = provider.analyze_source("src/auth.ts", code)

    assert len(findings) == 1
    item = findings[0]
    assert item.rule_id == "AI-SEC-001"
    assert item.category == FindingCategory.SECURITY
    assert item.severity == FindingSeverity.CRITICAL
    assert item.start_line == 1
    assert "sk-1234567890abcdef123456" in item.suggested_fix or "process.env" in item.suggested_fix


def test_ai_provider_detects_dangerously_set_inner_html():
    provider = LocalHeuristicAIProvider()
    code = '<div dangerouslySetInnerHTML={{ __html: userBio }} />\n'
    findings = provider.analyze_source("src/Profile.tsx", code)

    assert len(findings) == 1
    assert findings[0].rule_id == "AI-SEC-002"
    assert findings[0].severity == FindingSeverity.HIGH


def test_ai_provider_detects_empty_catch_block():
    provider = LocalHeuristicAIProvider()
    code = (
        "try {\n"
        "  doSomething();\n"
        "} catch (err) {}\n"
    )
    findings = provider.analyze_source("src/service.ts", code)

    assert any(f.rule_id == "AI-BUG-001" for f in findings)


def test_ai_provider_detects_state_mutation():
    provider = LocalHeuristicAIProvider()
    code = "state.push(item);\n"
    findings = provider.analyze_source("src/store.ts", code)

    assert len(findings) == 1
    assert findings[0].rule_id == "AI-BUG-002"
    assert findings[0].category == FindingCategory.BUG


def test_ai_provider_detects_multiline_empty_catch():
    provider = LocalHeuristicAIProvider()
    code = (
        "try {\n"
        "  fetchData();\n"
        "} catch (e) {\n"
        "}\n"
    )
    findings = provider.analyze_source("src/data.ts", code)
    assert any(f.rule_id == "AI-BUG-001" for f in findings)


def test_ai_analyzer_adapter_execution(tmp_path):
    src_file = tmp_path / "index.ts"
    src_file.write_text(
        'const token = "secret_key_1234567890_test";\n'
        'eval("console.log(token)");\n',
        encoding="utf-8",
    )

    adapter = AIAnalyzerAdapter()
    result = adapter.analyze(str(tmp_path), ("index.ts",), timeout=10.0)

    assert result.status == AnalyzerStatus.COMPLETED
    assert len(result.diagnostics) >= 2
    rule_ids = {d.rule_id for d in result.diagnostics}
    assert "AI-SEC-001" in rule_ids
    assert "AI-SEC-003" in rule_ids


def test_ai_explain_and_verify():
    provider = get_ai_provider()
    explanation = provider.explain_finding(
        title="Hardcoded API Secret",
        evidence='const key = "12345";',
        file_path="src/config.ts",
        start_line=5,
        code_context='const key = "12345";',
    )
    assert "src/config.ts" in explanation

    verification = provider.verify_finding(
        title="Hardcoded secret detected",
        evidence='const key = "12345";',
        file_path="src/config.ts",
        start_line=5,
        code_context='const key = "12345";',
    )
    assert verification.verified is True
    assert verification.confidence >= 0.8
