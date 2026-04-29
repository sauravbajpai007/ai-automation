#!/usr/bin/env python3
"""Generate code review report via OpenAI."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "ai_report.txt"
_AI = ROOT / "ai"
if str(_AI) not in sys.path:
    sys.path.insert(0, str(_AI))

REVIEW_FILES = ["index.js", "package.json", "eslint.config.cjs"]


def collect_sources() -> str:
    parts = []
    for name in REVIEW_FILES:
        p = ROOT / name
        if p.is_file():
            text = p.read_text(encoding="utf-8", errors="replace")
            if len(text) > 12000:
                text = text[:12000] + "\n... [truncated]"
            parts.append(f"=== {name} ===\n{text}")
    return "\n\n".join(parts) if parts else "(no files found)"


def main() -> int:
    from openai_client import complete_text, get_client

    client = get_client()
    body = collect_sources()

    if client is None:
        OUT.write_text(
            "OPENAI_API_KEY not set or SDK missing — skipping AI code review.\n\n"
            "=== Source snapshot ===\n"
            + body,
            encoding="utf-8",
        )
        print(f"Wrote fallback {OUT}")
        return 0

    report = complete_text(
        client,
        "You are a senior engineer doing a concise code review. "
        "List risks, bugs, and improvements. Be specific.",
        "Review this Node.js backend snapshot:\n\n" + body,
    )
    OUT.write_text(report or "(empty model response)", encoding="utf-8")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
