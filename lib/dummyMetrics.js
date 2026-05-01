"use strict";

/**
 * Lightweight counters for dummy instrumentation — useful for AI/test prompts.
 */

const state = {
  requestsTotal: 0,
  routeHits: Object.create(null),
  lastResetAt: new Date().toISOString(),
};

function increment(routeKey) {
  state.requestsTotal += 1;
  const k = String(routeKey || "unknown").slice(0, 64);
  state.routeHits[k] = (state.routeHits[k] || 0) + 1;
}

function snapshot() {
  return {
    ...state,
    routeHits: { ...state.routeHits },
  };
}

function reset() {
  state.requestsTotal = 0;
  state.routeHits = Object.create(null);
  state.lastResetAt = new Date().toISOString();
}

module.exports = {
  increment,
  snapshot,
  reset,
};
