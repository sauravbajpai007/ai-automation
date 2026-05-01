"use strict";

/**
 * Registers /dummy-samples/* routes using dummyWorkspace, dummyMetrics, dummyIntegration.
 * Keeps demo traffic separate from production-ish endpoints.
 */

const workspace = require("./dummyWorkspace");
const metrics = require("./dummyMetrics");
const integration = require("./dummyIntegration");

function registerDummySamples(app) {
  app.use("/dummy-samples", (req, res, next) => {
    metrics.increment(req.path);
    next();
  });

  app.get("/dummy-samples/workspaces", (_req, res) => {
    res.json({ ok: true, items: workspace.listWorkspaces() });
  });

  app.post("/dummy-samples/workspaces", (req, res) => {
    const name = req.body && req.body.name != null ? req.body.name : "";
    if (String(name).trim() === "") {
      return res.status(400).json({ error: "name_required" });
    }
    const row = workspace.createWorkspace(name);
    res.status(201).json({ ok: true, workspace: row });
  });

  app.get("/dummy-samples/workspaces/:id", (req, res) => {
    const row = workspace.getWorkspace(req.params.id);
    if (!row) {
      return res.status(404).json({ error: "not_found" });
    }
    res.json({ ok: true, workspace: row });
  });

  app.delete("/dummy-samples/workspaces/:id", (req, res) => {
    const gone = workspace.deleteWorkspace(req.params.id);
    if (!gone) {
      return res.status(404).json({ error: "not_found" });
    }
    res.status(204).end();
  });

  app.get("/dummy-samples/metrics", (_req, res) => {
    res.json({ ok: true, metrics: metrics.snapshot() });
  });

  app.post("/dummy-samples/integration/ping", (req, res) => {
    const op =
      req.body && typeof req.body.operation === "string"
        ? req.body.operation
        : "ping";
    const out = integration.simulateExternalCall(op);
    res.json({ ok: true, result: out });
  });
}

module.exports = { registerDummySamples };
