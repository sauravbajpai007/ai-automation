#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# ai_decision.sh — Run the Node app briefly, capture logs + npm test, ask Ollama
# for a single verdict: SAFE or UNSAFE. Exit 0 on SAFE, 1 on UNSAFE or ambiguity.
# -----------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODER_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${CODER_ROOT}/logs"
TEST_OUT="${CODER_ROOT}/test-output"
RUN_LOG="${LOG_DIR}/app_run_capture.log"
TEST_LOG="${TEST_OUT}/npm-test.log"
HEALTH_LOG="${LOG_DIR}/health_check.txt"
OLLAMA_RAW="${LOG_DIR}/ollama_decision_raw.txt"
ANALYSIS_JSON="${LOG_DIR}/last_analysis.json"

mkdir -p "${LOG_DIR}" "${TEST_OUT}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "ERROR: ollama not found in PATH." >&2
  exit 2
fi

# Ephemeral port to reduce collisions with Jenkins/other locals
export PORT="${PORT:-3150}"
export LOG_FILE="${LOG_DIR}/backend_server.log"
export NODE_ENV="${NODE_ENV:-test}"

cd "${CODER_ROOT}"

# Start Express in background; capture stdout/stderr
echo "==> Starting Node (${CODER_ROOT}/index.js) on PORT=${PORT}..."
set +e
node index.js >>"${RUN_LOG}" 2>&1 &
APP_PID=$!
set -e

cleanup() {
  if kill -0 "${APP_PID}" 2>/dev/null; then
    kill "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Wait until TCP listens or timeout
for _ in $(seq 1 40); do
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS "http://127.0.0.1:${PORT}/health" >>"${HEALTH_LOG}" 2>&1; then
      echo "" >>"${HEALTH_LOG}"
      break
    fi
  elif command -v nc >/dev/null 2>&1; then
    if nc -z 127.0.0.1 "${PORT}" 2>/dev/null; then
      echo "nc: port open" >>"${HEALTH_LOG}"
      break
    fi
  fi
  sleep 0.25
done

# npm test (does not require server — separate concern)
echo "==> Running npm test..."
set +e
npm test >"${TEST_LOG}" 2>&1
TEST_RC=$?
set -e
echo "npm test exit code: ${TEST_RC}" >>"${TEST_LOG}"

cleanup
trap - EXIT

# Assemble context for the model (truncate to keep prompt bounded)
APP_SNIP="$(head -c 12000 "${RUN_LOG}" 2>/dev/null || echo "(no run log)")"
LOG_SNIP="$(head -c 8000 "${LOG_FILE}" 2>/dev/null || echo "(no backend log file)")"
TEST_SNIP="$(head -c 12000 "${TEST_LOG}" 2>/dev/null || echo "(no test log)")"

# Build prompt in a file (avoids ARG_MAX / quoting issues with large logs)
PROMPT_FILE="${LOG_DIR}/._decision_prompt.txt"
{
  cat <<'HDR'
You are a release gate. Based ONLY on the following CI artifacts, answer with exactly one word on the last line: SAFE or UNSAFE.
Rules:
- If tests failed (non-zero) or logs show crashes/errors/timeouts, prefer UNSAFE.
- If everything looks healthy, answer SAFE.
- Your final line must be exactly SAFE or UNSAFE (uppercase), nothing else on that line.

--- health / startup log (excerpt) ---
HDR
  printf '%s\n' "${APP_SNIP}"
  printf '%s\n' "--- structured backend log file (excerpt) ---"
  printf '%s\n' "${LOG_SNIP}"
  printf '%s\n' "--- npm test output (excerpt) ---"
  printf '%s\n' "${TEST_SNIP}"
} >"${PROMPT_FILE}"

echo "==> Asking Ollama (llama3) for SAFE/UNSAFE..."
set +e
# shellcheck disable=SC2002
OLLAMA_OUT="$(ollama run llama3 "$(cat "${PROMPT_FILE}")" 2>&1)"
OLLAMA_RC=$?
set -e
rm -f "${PROMPT_FILE}"

echo "${OLLAMA_OUT}" | tee "${OLLAMA_RAW}" >/dev/null

if [[ "${OLLAMA_RC}" -ne 0 ]]; then
  echo "ERROR: ollama failed with exit ${OLLAMA_RC}" >&2
  exit 1
fi

# Parse SAFE / UNSAFE via temp file (model output can be large; avoids env limits)
PARSE_TMP="${LOG_DIR}/._verdict_parse.txt"
printf '%s' "${OLLAMA_OUT}" >"${PARSE_TMP}"
VERDICT="$(F="${PARSE_TMP}" node -e "
const fs = require('fs');
const t = fs.readFileSync(process.env.F, 'utf8').replace(/\*/g, '').trim();
if (/\\bUNSAFE\\b/i.test(t)) { console.log('UNSAFE'); process.exit(0); }
if (/\\bSAFE\\b/i.test(t)) { console.log('SAFE'); process.exit(0); }
console.log('UNKNOWN');
")" || VERDICT="UNKNOWN"
rm -f "${PARSE_TMP}"

# CI fallback: tests green + model vague → SAFE (opt out with STRICT_AI_DECISION=1)
if [[ "${VERDICT}" == "UNKNOWN" ]] && [[ "${STRICT_AI_DECISION:-0}" != "1" ]]; then
  if [[ "${TEST_RC}" -eq 0 ]]; then
    echo "::notice::Ollama output had no clear SAFE/UNSAFE; npm test passed — defaulting to SAFE (set STRICT_AI_DECISION=1 to fail instead)."
    VERDICT="SAFE"
  fi
fi

# Persist summary JSON for /ai-debug + dashboard (verdict + excerpt)
EXCERPT_FILE="${LOG_DIR}/._ollama_excerpt_tmp"
printf '%s' "${OLLAMA_OUT}" >"${EXCERPT_FILE}"
export VERDICT
export TEST_RC
export ANALYSIS_JSON
export EXCERPT_FILE
node -e "
const fs = require('fs');
const excerpt = fs.readFileSync(process.env.EXCERPT_FILE, 'utf8').slice(0, 8000);
const j = {
  ok: true,
  verdict: process.env.VERDICT,
  root_cause: process.env.VERDICT === 'UNSAFE' ? 'AI gate returned UNSAFE' : 'AI gate returned SAFE',
  suggested_fix: 'Review npm test output and logs under logs/ and test-output/',
  severity: process.env.VERDICT === 'UNSAFE' ? 'high' : 'low',
  structured: { npmTestExit: Number(process.env.TEST_RC) },
  source: 'ollama_llama3',
  ollama_excerpt: excerpt,
};
fs.writeFileSync(process.env.ANALYSIS_JSON, JSON.stringify(j, null, 2));
"
rm -f "${EXCERPT_FILE}"

echo "==> Verdict: ${VERDICT}"

if [[ "${VERDICT}" == "SAFE" ]]; then
  exit 0
fi

echo "DECISION: UNSAFE or indeterminate — failing job (exit 1)." >&2
exit 1
