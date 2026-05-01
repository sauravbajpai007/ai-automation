# shellcheck shell=bash
# Source from other scripts:  source "${SCRIPT_DIR}/ensure_ollama.sh"
# Then: ensure_ollama_running || exit 1

ensure_ollama_running() {
  local logf="${TMPDIR:-/tmp}/ollama-serve.log"

  if command -v curl >/dev/null 2>&1; then
    if curl -fsS --max-time 2 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
      return 0
    fi
  fi
  if ollama list >/dev/null 2>&1; then
    return 0
  fi

  echo "==> Ollama server not running — starting in background (ollama serve)…"
  nohup ollama serve >>"${logf}" 2>&1 &

  local i
  for i in $(seq 1 60); do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS --max-time 2 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
        echo "==> Ollama is ready."
        return 0
      fi
    elif ollama list >/dev/null 2>&1; then
      echo "==> Ollama is ready."
      return 0
    fi
    sleep 1
  done

  echo "ERROR: Ollama did not start in time. On Linux you may need to run once: ollama serve" >&2
  echo "See: ${logf}" >&2
  tail -40 "${logf}" 2>/dev/null || true
  return 1
}
