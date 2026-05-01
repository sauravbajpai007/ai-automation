"use strict";

/**
 * Extra routes only so Ollama / CI have more real code to read in prompts.
 * Safe for dev; tighten auth if you ever expose /demo on the public internet.
 */

function registerReviewDemo(app) {
  app.get("/demo/ping", (_req, res) => {
    res.json({ ok: true, service: "review-demo", ts: new Date().toISOString() });
  });

  app.get("/demo/echo", (req, res) => {
    const msg = req.query.msg;
    if (msg == null || String(msg).trim() === "") {
      return res.status(400).json({ error: "missing_msg", hint: "use ?msg=text" });
    }
    res.json({ echo: String(msg).slice(0, 2000) });
  });

  /** Intentional edge cases for tests & AI review (divide-by-zero, NaN). */
  app.get("/demo/divide", (req, res) => {
    const a = Number(req.query.a);
    const b = Number(req.query.b);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return res.status(400).json({ error: "invalid_numbers" });
    }
    if (b === 0) {
      return res.status(400).json({ error: "division_by_zero" });
    }
    res.json({ result: a / b });
  });
}

module.exports = { registerReviewDemo };
