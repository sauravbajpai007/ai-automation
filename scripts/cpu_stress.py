#!/usr/bin/env python3
"""
Optional CPU stress utility for reproducing high-load scenarios locally.
Run: python3 scripts/cpu_stress.py [seconds]

Uses worker processes to saturate CPU without external deps.
"""

from __future__ import annotations

import multiprocessing as mp
import sys
import time


def _burn(_n: int) -> None:
    end = time.monotonic() + float(_n)
    while time.monotonic() < end:
        _ = sum(i * i for i in range(5000))


def main() -> int:
    seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 5.0
    workers = max(1, mp.cpu_count())
    print(f"CPU stress: {workers} workers for ~{seconds}s", flush=True)
    procs = [mp.Process(target=_burn, args=(seconds,)) for _ in range(workers)]
    for p in procs:
        p.start()
    for p in procs:
        p.join()
    print("done", flush=True)
    return 0


if __name__ == "__main__":
    mp.freeze_support()
    raise SystemExit(main())
