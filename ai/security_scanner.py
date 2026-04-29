#!/usr/bin/env python3
"""Heuristic + AI security notes for the backend."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "security_report.txt"
_AI = ROOT / "ai"
if str(_AI) not in sys.path:
    sys.path.insert(0, str(_AI))

PATTERNS = [
    (r"eval\s*\(", "Possible eval usage"),
    (r"child_process", "Subprocess usage — verify inputs"),
    (r"password\s*=", "Possible hardcoded secret"),
    (r"apiKey\s*[:=]", "Possible API key in source"),
]


def scan_file(path: Path) -> list[str]:
    findings = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return findings
    for rx, msg in PATTERNS:
        if re.search(rx, text):
            findings.append(f"{path.name}: {msg}")
    return findings


def main() -> int:
    from openai_client import complete_text, get_client

    files = [ROOT / "index.js", ROOT / "package.json"]
    lines: list[str] = []
    for f in files:
        lines.extend(scan_file(f))

    heuristic = "\n".join(lines) if lines else "No obvious heuristic flags in scanned files."

    client = get_client()
    if client is None:
        OUT.write_text(
            "OPENAI_API_KEY not set — heuristic scan only.\n\n" + heuristic,
            encoding="utf-8",
        )
        print(f"Wrote {OUT}")
        return 0

    ai_part = complete_text(
        client,
        "You are an application security reviewer. Be concise.",
        "Heuristic findings:\n"
        + heuristic
        + "\n\nSummarize risks and concrete mitigations for this small Express app.",
    )
    OUT.write_text(
        "=== Heuristic ===\n"
        + heuristic
        + "\n\n=== AI assessment ===\n"
        + (ai_part or ""),
        encoding="utf-8",
    )
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
