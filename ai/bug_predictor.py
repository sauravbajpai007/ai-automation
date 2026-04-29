#!/usr/bin/env python3
"""Predict likely bug areas from structure and common Express pitfalls."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "bug_report.txt"
_AI = ROOT / "ai"
if str(_AI) not in sys.path:
    sys.path.insert(0, str(_AI))


def static_signals() -> str:
    idx = ROOT / "index.js"
    signals = []
    if idx.is_file():
        t = idx.read_text(encoding="utf-8", errors="replace")
        if "express.json" in t:
            signals.append("JSON body parser present — validate payload sizes and types.")
        if "0.0.0.0" in t:
            signals.append("Binding 0.0.0.0 — ensure firewall/reverse proxy in production.")
        if "last_analysis.json" in t:
            signals.append("Reads analysis file from disk — race conditions if writer overlaps.")
    return "\n".join(signals) if signals else "No specific static signals."


def main() -> int:
    from openai_client import complete_text, get_client

    static_part = static_signals()
    client = get_client()
    if client is None:
        OUT.write_text(
            "OPENAI_API_KEY not set — static signals only.\n\n" + static_part,
            encoding="utf-8",
        )
        print(f"Wrote {OUT}")
        return 0

    ai_part = complete_text(
        client,
        "You are a reliability engineer. List likely failure modes and tests to add.",
        "Static signals:\n"
        + static_part
        + "\n\nPredict bugs or outages under load (CPU 100%, many connections) for Express.",
    )
    OUT.write_text(
        "=== Static signals ===\n"
        + static_part
        + "\n\n=== AI bug prediction ===\n"
        + (ai_part or ""),
        encoding="utf-8",
    )
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
