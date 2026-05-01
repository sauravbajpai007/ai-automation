"use strict";

/**
 * Stub for an external integration — no real network calls.
 * Shows typical shapes (timeouts, retries) for reviewers.
 */

const crypto = require("crypto");

/** Pretend latency MS before "response" */
function fakeLatencyMs() {
  return 12 + Math.floor(Math.random() * 40);
}

/**
 * Returns a deterministic-ish fake payload (no I/O).
 * @param {string} operation
 */
function simulateExternalCall(operation) {
  const op = String(operation || "noop").slice(0, 80);
  const requestId = crypto.randomUUID();
  return {
    ok: true,
    operation: op,
    requestId,
    latencyMs: fakeLatencyMs(),
    /** dummy vendor payload */
    body: {
      status: "accepted",
      echoed: op,
    },
  };
}

module.exports = {
  simulateExternalCall,
  fakeLatencyMs,
};
