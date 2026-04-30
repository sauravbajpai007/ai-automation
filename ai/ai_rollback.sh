#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# ai_rollback.sh — Emergency rollback: reset repo to previous commit (HEAD~1)
# Intended for self-hosted CI when AI gate marks UNSAFE. DESTRUCTIVE locally.
# Does NOT push — enable GIT_PUSH_ROLLBACK=1 to force-push (dangerous; opt-in).
# -----------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Git repository root may be parent(s) of coder app (monorepo)
if ! GIT_ROOT="$(git -C "${CODER_ROOT}" rev-parse --show-toplevel 2>/dev/null)"; then
  echo "ERROR: Not a git repository from ${CODER_ROOT}" >&2
  exit 2
fi

cd "${GIT_ROOT}"

echo "==> Rollback: repository root = ${GIT_ROOT}"
echo "==> Current HEAD: $(git rev-parse --short HEAD) $(git log -1 --oneline)"

if ! git rev-parse HEAD~1 >/dev/null 2>&1; then
  echo "ERROR: No parent commit (HEAD~1). Cannot rollback." >&2
  exit 2
fi

# Hard reset to previous commit (matches requirement: revert to HEAD~1)
echo "==> git reset --hard HEAD~1"
git reset --hard HEAD~1

echo "==> New HEAD: $(git rev-parse --short HEAD) $(git log -1 --oneline)"
echo "Rollback complete. Working tree matches previous commit."

if [[ "${GIT_PUSH_ROLLBACK:-0}" == "1" ]]; then
  # Optional: rewrite remote (use only if you understand the blast radius)
  BR="$(git rev-parse --abbrev-ref HEAD)"
  echo "==> GIT_PUSH_ROLLBACK=1 — force-pushing ${BR} (opt-in)..."
  git push origin "${BR}" --force
else
  echo "Note: Remote unchanged. To update origin (DANGEROUS), run:"
  echo "  GIT_PUSH_ROLLBACK=1 ${0}"
fi

exit 0
