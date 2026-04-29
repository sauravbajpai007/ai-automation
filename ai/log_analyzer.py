#!/usr/bin/env python3
"""
Analyze backend_server.log for CPU spikes, errors, timeouts; optionally call OpenAI.
Writes structured result to ai/last_analysis.json (used by /ai-debug).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "ai" / "last_analysis.json"
_AI = ROOT / "ai"
if str(_AI) not in sys.path:
    sys.path.insert(0, str(_AI))

CPU_PATTERNS = re.compile(
    r"(cpu|CPU|100%|overload|high cpu|loadavg|load average)",
    re.IGNORECASE,
)
ERR_PATTERNS = re.compile(
    r"(error|exception|crash|fatal|uncaught|ECONNRESET|EADDRINUSE|SIGTERM|ENOMEM)",
    re.IGNORECASE,
)
TIMEOUT_PATTERNS = re.compile(
    r"(timeout|ETIMEDOUT|ECONNABORTED|slow_request|timed out)",
    re.IGNORECASE,
)


def analyze_lines(text: str) -> dict:
    lines = text.splitlines()
    cpu_hits = []
    err_hits = []
    timeout_hits = []

    for i, line in enumerate(lines, 1):
        if CPU_PATTERNS.search(line):
            cpu_hits.append({"line": i, "sample": line[:500]})
        if ERR_PATTERNS.search(line):
            err_hits.append({"line": i, "sample": line[:500]})
        if TIMEOUT_PATTERNS.search(line):
            timeout_hits.append({"line": i, "sample": line[:500]})

    severity = "low"
    if err_hits or timeout_hits:
        severity = "high" if err_hits else "medium"
    if cpu_hits and severity == "low":
        severity = "medium"

    return {
        "summary": {
            "total_lines": len(lines),
            "cpu_spike_signals": len(cpu_hits),
            "error_signals": len(err_hits),
            "timeout_signals": len(timeout_hits),
        },
        "evidence": {
            "cpu": cpu_hits[:20],
            "errors": err_hits[:20],
            "timeouts": timeout_hits[:20],
        },
        "severity_hint": severity,
    }


def openai_insights(client, structured: dict, sample_log: str) -> dict:
    from openai_client import complete_text

    prompt = (
        "Structured findings from log parsing (JSON):\n"
        + json.dumps(structured, indent=2)[:6000]
        + "\n\nLog excerpt (may be truncated):\n"
        + sample_log[:8000]
        + "\n\nRespond with valid JSON only, keys: "
        'root_cause (string), suggested_fix (string), severity (one of low, medium, high).'
    )
    raw = complete_text(
        client,
        "You diagnose backend incidents from logs. Output JSON only, no markdown.",
        prompt,
    )
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0].strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {
            "root_cause": "Could not parse model output",
            "suggested_fix": raw[:2000] if raw else "Review logs manually",
            "severity": structured.get("severity_hint", "medium"),
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze backend logs with optional OpenAI.")
    parser.add_argument(
        "log_path",
        nargs="?",
        default=str(ROOT / "backend_server.log"),
        help="Path to backend_server.log",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=str(DEFAULT_OUT),
        help="Output JSON path (default: ai/last_analysis.json)",
    )
    args = parser.parse_args()

    log_path = Path(args.log_path)
    out_path = Path(args.output)

    if not log_path.is_file():
        result = {
            "ok": False,
            "error": f"Log file not found: {log_path}",
            "root_cause": "No log file available",
            "suggested_fix": "Ensure the server writes logs or capture docker logs to this path",
            "severity": "low",
        }
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps(result, indent=2))
        return 1

    text = log_path.read_text(encoding="utf-8", errors="replace")
    structured = analyze_lines(text)

    from openai_client import get_client

    client = get_client()
    if client is None:
        result = {
            "ok": True,
            "openai": False,
            "structured": structured,
            "root_cause": "Heuristic only — OPENAI_API_KEY not set.",
            "suggested_fix": "Set OPENAI_API_KEY for AI root-cause analysis.",
            "severity": structured.get("severity_hint", "low"),
        }
    else:
        insights = openai_insights(client, structured, text)
        result = {
            "ok": True,
            "openai": True,
            "structured": structured,
            "root_cause": insights.get("root_cause", ""),
            "suggested_fix": insights.get("suggested_fix", ""),
            "severity": insights.get("severity", structured.get("severity_hint", "medium")),
        }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")

    printable = json.dumps(result, indent=2)
    if os.environ.get("GITHUB_ACTIONS"):
        print("::group::AI log analysis")
        print(printable)
        print("::endgroup::")
    else:
        print(printable)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
