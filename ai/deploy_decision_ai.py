#!/usr/bin/env python3
"""Produce deploy_decision.json from prior AI reports."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "deploy_decision.json"
_AI = ROOT / "ai"
if str(_AI) not in sys.path:
    sys.path.insert(0, str(_AI))


def read_text_safe(path: Path, limit: int = 8000) -> str:
    if not path.is_file():
        return ""
    t = path.read_text(encoding="utf-8", errors="replace")
    return t if len(t) <= limit else t[:limit] + "\n... [truncated]"


def main() -> int:
    from openai_client import complete_text, get_client

    review = read_text_safe(ROOT / "ai_report.txt")
    sec = read_text_safe(ROOT / "security_report.txt")
    bugs = read_text_safe(ROOT / "bug_report.txt")

    client = get_client()
    if client is None:
        decision = {
            "deploy": True,
            "confidence": 0.5,
            "reason": "OPENAI_API_KEY not set; defaulting to deploy with manual verification.",
            "blockers": [],
        }
        OUT.write_text(json.dumps(decision, indent=2), encoding="utf-8")
        print(f"Wrote fallback {OUT}")
        return 0

    raw = complete_text(
        client,
        "You output only valid JSON, no markdown. Keys: deploy (boolean), "
        "confidence (0-1), reason (string), blockers (array of strings).",
        "Based on these reports, should we deploy?\n\n"
        f"CODE REVIEW:\n{review}\n\nSECURITY:\n{sec}\n\nBUGS:\n{bugs}",
    )

    try:
        # Model might wrap JSON in fences; strip common patterns
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            if text.endswith("```"):
                text = text.rsplit("```", 1)[0].strip()
        decision = json.loads(text)
    except json.JSONDecodeError:
        decision = {
            "deploy": True,
            "confidence": 0.4,
            "reason": "Could not parse model JSON; review reports manually.",
            "blockers": ["unparsed_model_output"],
            "raw_model_output": raw[:2000],
        }

    OUT.write_text(json.dumps(decision, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
