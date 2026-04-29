"""Shared OpenAI client and safe completion helper."""

from __future__ import annotations

import os
from typing import Any

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None  # type: ignore


def get_client():
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key or OpenAI is None:
        return None
    return OpenAI(api_key=key)


def complete_text(
    client: Any,
    system: str,
    user: str,
    model: str = "gpt-4o-mini",
) -> str:
    if client is None:
        return ""
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
        )
    except Exception as exc:  # noqa: BLE001 — surface model/API errors to callers
        return f"[openai error: {exc}]"
    choice = resp.choices[0]
    return (choice.message.content or "").strip()
