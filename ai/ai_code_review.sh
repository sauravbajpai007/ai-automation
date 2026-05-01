#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# ai_code_review.sh — FREE AI code review using local Ollama (llama3)
# Reviews Node.js entrypoint and manifest; writes a human-readable report.
# -----------------------------------------------------------------------------

set -euo pipefail

# Resolve ai-automation/coder (parent of this script's directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${CODER_ROOT}/logs"
OUT_FILE="${LOG_DIR}/ai_code_review.txt"

mkdir -p "${LOG_DIR}"

# Ensure Ollama CLI exists (fail fast with a clear message)
if ! command -v ollama >/dev/null 2>&1; then
  echo "ERROR: ollama not found in PATH. Install from https://ollama.com" >&2
  exit 2
fi

# shellcheck source=ensure_ollama.sh
source "${SCRIPT_DIR}/ensure_ollama.sh"
ensure_ollama_running || exit 2

# Bounded snapshot of backend files (avoid huge prompts)
bundle=""
for f in \
  index.js \
  package.json \
  lib/reviewDemo.js \
  lib/dummySamples.js \
  lib/dummyWorkspace.js \
  lib/dummyMetrics.js \
  lib/dummyIntegration.js; do
  path="${CODER_ROOT}/${f}"
  if [[ -f "${path}" ]]; then
    content="$(head -c 24000 "${path}" 2>/dev/null || true)"
    if [[ "$(wc -c <"${path}")" -gt 24000 ]]; then
      content="${content}"$'\n'"... [truncated for AI context]"
    fi
    bundle+="===== ${f} ====="$'\n'"${content}"$'\n\n'
  fi
done

if [[ -z "${bundle}" ]]; then
  echo "ERROR: No reviewable files found under ${CODER_ROOT} (need index.js)" >&2
  exit 2
fi

# Prompt file (handles large bundles without ARG_MAX issues)
P_FILE="${LOG_DIR}/._review_prompt.txt"
{
  cat <<'HDR'
You are a senior Node.js reviewer. Review this codebase snapshot for bugs, security issues, and reliability.
Output: short sections Risks / Suggestions / Summary (max ~400 words).

HDR
  printf '%s' "${bundle}"
} >"${P_FILE}"

echo "==> Running Ollama (llama3) code review..."
set +e
# shellcheck disable=SC2002
REVIEW_OUT="$(ollama run llama3 "$(cat "${P_FILE}")" 2>&1)"
OLLAMA_RC=$?
set -e

rm -f "${P_FILE}"

if [[ "${OLLAMA_RC}" -ne 0 ]]; then
  echo "ERROR: ollama run failed (exit ${OLLAMA_RC})" >&2
  echo "${REVIEW_OUT}" >&2
  exit "${OLLAMA_RC}"
fi

{
  echo "=== AI Code Review ($(date -u +"%Y-%m-%dT%H:%M:%SZ")) ==="
  echo "${REVIEW_OUT}"
} >"${OUT_FILE}"

echo "==> Wrote ${OUT_FILE}"
printf '%s\n' "${REVIEW_OUT}" | head -40
echo "... (full output in ${OUT_FILE})"

exit 0
