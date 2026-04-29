#!/usr/bin/env python3
"""Summarize pipeline AI outputs for operators."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "pipeline_summary.txt"
_AI = ROOT / "ai"
if str(_AI) not in sys.path:
    sys.path.insert(0, str(_AI))


def read_short(p: Path, n: int = 4000) -> str:
    if not p.is_file():
        return "(missing)"
    t = p.read_text(encoding="utf-8", errors="replace")
    return t if len(t) <= n else t[:n] + "\n... [truncated]"


def main() -> int:
    from openai_client import complete_text, get_client

    bundle = {
        "code_review": read_short(ROOT / "ai_report.txt"),
        "security": read_short(ROOT / "security_report.txt"),
        "bugs": read_short(ROOT / "bug_report.txt"),
    }
    dd = ROOT / "deploy_decision.json"
    if dd.is_file():
        try:
            bundle["deploy_decision"] = json.loads(dd.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            bundle["deploy_decision"] = "(invalid json)"

    client = get_client()
    if client is None:
        OUT.write_text(
            "OPENAI_API_KEY not set — raw bundle only.\n\n" + json.dumps(bundle, indent=2),
            encoding="utf-8",
        )
        print(f"Wrote {OUT}")
        return 0

    summary = complete_text(
        client,
        "You summarize CI/CD AI stages for a human. Use short bullet points.",
        "Summarize deploy readiness and key actions:\n\n" + json.dumps(bundle, indent=2)[:12000],
    )
    OUT.write_text(summary or "(empty)", encoding="utf-8")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
