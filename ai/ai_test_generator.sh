#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# ai_test_generator.sh — Ask Ollama (llama3) for additional Node test ideas
# Output is advisory text for engineers (not auto-executed as code).
# -----------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${CODER_ROOT}/test-output"
OUT_FILE="${OUT_DIR}/ai_generated_test_suggestions.txt"

mkdir -p "${OUT_DIR}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "ERROR: ollama not found in PATH." >&2
  exit 2
fi

INDEX="${CODER_ROOT}/index.js"
PKG="${CODER_ROOT}/package.json"
EXISTING_TESTS=""
if [[ -d "${CODER_ROOT}/test" ]]; then
  EXISTING_TESTS="$(find "${CODER_ROOT}/test" -type f -name '*.js' -maxdepth 3 2>/dev/null | head -5 | while read -r p; do echo "=== $p ==="; head -c 8000 "$p" 2>/dev/null || true; echo; done)"
fi

SNAP=""
[[ -f "${INDEX}" ]] && SNAP+="===== index.js (excerpt) ====="$'\n'"$(head -c 12000 "${INDEX}")"$'\n\n'
[[ -f "${PKG}" ]] && SNAP+="===== package.json ====="$'\n'"$(cat "${PKG}")"$'\n\n'
SNAP+="===== existing tests (excerpt) ====="$'\n'"${EXISTING_TESTS:-"(none found)"}"$'\n'

P_FILE="${OUT_DIR}/._testgen_prompt.txt"
{
  cat <<'HDR'
You are a test engineer. Given this Node.js Express app, propose concrete test cases
(steps + assertions) compatible with `node --test`. Output markdown bullet list only.
Do not invent packages that are not in package.json.

HDR
  printf '%s' "${SNAP}"
} >"${P_FILE}"

echo "==> Running Ollama (llama3) test generation..."
set +e
# shellcheck disable=SC2002
GEN="$(ollama run llama3 "$(cat "${P_FILE}")" 2>&1)"
RC=$?
set -e

rm -f "${P_FILE}"

if [[ "${RC}" -ne 0 ]]; then
  echo "ERROR: ollama run failed (${RC})" >&2
  echo "${GEN}" >&2
  exit "${RC}"
fi

{
  echo "=== AI test suggestions ($(date -u +"%Y-%m-%dT%H:%M:%SZ")) ==="
  echo "${GEN}"
} >"${OUT_FILE}"

echo "==> Wrote ${OUT_FILE}"
head -30 "${OUT_FILE}"
exit 0
