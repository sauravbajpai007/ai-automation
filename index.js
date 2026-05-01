"use strict";

// Optional: copy .env.example to .env and set PORT=...
require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
/**
 * Default 3150 — avoids 8080 (Jenkins) and 3040 (often already in use).
 * Override: .env (PORT=...), or `PORT=3040 npm start`, or `npm run start:3040`.
 */
const PORT = Number(process.env.PORT) || 3150;
const REPO_ROOT = __dirname;
const LOG_DIR = path.join(REPO_ROOT, "logs");
// Default log under logs/ (ai/ is reserved for Ollama CI scripts in this project)
const LOG_FILE = process.env.LOG_FILE || path.join(LOG_DIR, "backend_server.log");
const ANALYSIS_FILE = path.join(LOG_DIR, "last_analysis.json");

fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(path.join(REPO_ROOT, "test-output"), { recursive: true });

const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

/** Avoid JSON.stringify throwing on BigInt / lone UTF-16 surrogates in report text */
function jsonPayload(value) {
  return JSON.stringify(value, (_k, v) => {
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "string") {
      return v.replace(/[\uD800-\uDFFF]/g, "");
    }
    return v;
  });
}

function safeReadUtf8(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function readJsonFile(filePath) {
  const raw = safeReadUtf8(filePath);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function logLine(level, message, meta = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  });
  // eslint-disable-next-line no-console
  console.log(line);
  logStream.write(line + "\n");
}

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  req._start = process.hrtime.bigint();
  res.on("finish", () => {
    const durMs = Number(process.hrtime.bigint() - req._start) / 1e6;
    if (durMs > 5000) {
      logLine("warn", "slow_request", { path: req.path, durationMs: durMs });
    }
  });
  next();
});

const { registerReviewDemo } = require("./lib/reviewDemo");
const { registerDummySamples } = require("./lib/dummySamples");
registerReviewDemo(app);
registerDummySamples(app);

/** Simple CPU load sampling: warn if 1m load average exceeds core count */
function startCpuWatchdog() {
  const cores = os.cpus().length || 1;
  const intervalMs = 15000;
  setInterval(() => {
    const load = os.loadavg()[0];
    if (load > cores * 1.5) {
      logLine("alert", "cpu_overload_detected", {
        load1m: load,
        cores,
        hint: "system load sustained above threshold",
      });
    }
  }, intervalMs).unref();
}

app.get("/health", (_req, res) => {
  res.status(200).type("text/plain").send("OK");
});

app.get("/ai-debug", (_req, res) => {
  try {
    if (!fs.existsSync(ANALYSIS_FILE)) {
      return res.status(200).json({
        ok: true,
        message: "No AI analysis available yet",
        analysis: null,
      });
    }
    const raw = fs.readFileSync(ANALYSIS_FILE, "utf8");
    const analysis = JSON.parse(raw);
    return res.status(200).json({ ok: true, analysis });
  } catch (err) {
    logLine("error", "ai_debug_read_failed", { error: String(err) });
    return res.status(500).json({
      ok: false,
      error: "Failed to read AI analysis",
    });
  }
});

app.get("/api/ai-dashboard", (_req, res) => {
  try {
    const paths = {
      logAnalysis: path.join(LOG_DIR, "last_analysis.json"),
      deployDecision: path.join(REPO_ROOT, "deploy_decision.json"),
      /** Legacy OpenAI-era filenames at repo root */
      codeReview: path.join(REPO_ROOT, "ai_report.txt"),
      security: path.join(REPO_ROOT, "security_report.txt"),
      bugs: path.join(REPO_ROOT, "bug_report.txt"),
      pipelineSummary: path.join(REPO_ROOT, "pipeline_summary.txt"),
      /** Ollama CI outputs (ai/*.sh) */
      ollamaCodeReview: path.join(LOG_DIR, "ai_code_review.txt"),
      ollamaTestIdeas: path.join(REPO_ROOT, "test-output", "ai_generated_test_suggestions.txt"),
      ollamaDecisionRaw: path.join(LOG_DIR, "ollama_decision_raw.txt"),
      npmTestLog: path.join(REPO_ROOT, "test-output", "npm-test.log"),
    };

    const logAnalysis = readJsonFile(paths.logAnalysis);
    const deployDecision = readJsonFile(paths.deployDecision);

    const legacyReview = safeReadUtf8(paths.codeReview);
    const ollamaReview = safeReadUtf8(paths.ollamaCodeReview);
    const mergedCodeReview = legacyReview || ollamaReview || null;

    const payload = {
      ok: true,
      generatedAt: new Date().toISOString(),
      logAnalysis,
      deployDecision,
      reports: {
        codeReview: mergedCodeReview,
        security: safeReadUtf8(paths.security),
        bugs: safeReadUtf8(paths.bugs),
        pipelineSummary: safeReadUtf8(paths.pipelineSummary),
        ollamaCodeReview,
        ollamaTestIdeas: safeReadUtf8(paths.ollamaTestIdeas),
        ollamaDecisionRaw: safeReadUtf8(paths.ollamaDecisionRaw),
        npmTestLog: safeReadUtf8(paths.npmTestLog),
      },
      availability: {
        logAnalysis: fs.existsSync(paths.logAnalysis),
        deployDecision: fs.existsSync(paths.deployDecision),
        codeReview: fs.existsSync(paths.codeReview),
        security: fs.existsSync(paths.security),
        bugs: fs.existsSync(paths.bugs),
        pipelineSummary: fs.existsSync(paths.pipelineSummary),
        ollamaCodeReview: fs.existsSync(paths.ollamaCodeReview),
        ollamaTestIdeas: fs.existsSync(paths.ollamaTestIdeas),
        ollamaDecisionRaw: fs.existsSync(paths.ollamaDecisionRaw),
        npmTestLog: fs.existsSync(paths.npmTestLog),
      },
    };

    const body = jsonPayload(payload);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200).send(body);
  } catch (err) {
    logLine("error", "ai_dashboard_api_failed", { error: String(err), stack: err.stack });
    const detail = process.env.NODE_ENV === "production" ? undefined : String(err);
    res.status(500).json({ ok: false, error: "Failed to aggregate AI data", detail });
  }
});

app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(REPO_ROOT, "public", "dashboard.html"));
});

app.use(express.static(path.join(REPO_ROOT, "public"), { index: false }));

app.get("/", (req, res) => {
  const host = req.get("host") || `127.0.0.1:${PORT}`;
  const proto = req.protocol === "https" ? "https" : "http";
  const base = `${proto}://${host}`;
  res.json({
    service: "github-ai-backend",
    status: "running",
    dashboard: `${base}/dashboard`,
    endpoints: {
      health: "/health",
      aiDebug: "/ai-debug",
      aiDashboardApi: "/api/ai-dashboard",
      demoRoutes: "/demo/ping",
      dummySamples: "/dummy-samples/metrics",
    },
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Not Found", path: req.path });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  logLine("error", "unhandled_error", {
    path: req.path,
    error: err.message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
  const status = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
  res.status(status).json({
    error: "Internal Server Error",
    requestId: req.headers["x-request-id"],
  });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  logLine("info", "server_listen", { port: PORT, logFile: LOG_FILE });
  startCpuWatchdog();
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    // eslint-disable-next-line no-console
    console.error(
      `[github-ai-backend] Port ${PORT} is already in use. Set another in .env or: PORT=3250 npm start`
    );
    process.exit(1);
  }
  throw err;
});

function shutdown(signal) {
  logLine("info", "shutdown", { signal });
  server.close(() => {
    logStream.end(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
