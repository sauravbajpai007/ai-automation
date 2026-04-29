"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
/** Default avoids 8080 (often Jenkins / other Java stacks). Override with PORT=. */
const PORT = Number(process.env.PORT) || 3040;
const LOG_FILE = process.env.LOG_FILE || path.join(process.cwd(), "backend_server.log");
const ANALYSIS_FILE = path.join(__dirname, "ai", "last_analysis.json");
const REPO_ROOT = __dirname;

const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

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
      logAnalysis: path.join(REPO_ROOT, "ai", "last_analysis.json"),
      deployDecision: path.join(REPO_ROOT, "deploy_decision.json"),
      codeReview: path.join(REPO_ROOT, "ai_report.txt"),
      security: path.join(REPO_ROOT, "security_report.txt"),
      bugs: path.join(REPO_ROOT, "bug_report.txt"),
      pipelineSummary: path.join(REPO_ROOT, "pipeline_summary.txt"),
    };

    const logAnalysis = readJsonFile(paths.logAnalysis);
    const deployDecision = readJsonFile(paths.deployDecision);

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      logAnalysis,
      deployDecision,
      reports: {
        codeReview: safeReadUtf8(paths.codeReview),
        security: safeReadUtf8(paths.security),
        bugs: safeReadUtf8(paths.bugs),
        pipelineSummary: safeReadUtf8(paths.pipelineSummary),
      },
      availability: {
        logAnalysis: fs.existsSync(paths.logAnalysis),
        deployDecision: fs.existsSync(paths.deployDecision),
        codeReview: fs.existsSync(paths.codeReview),
        security: fs.existsSync(paths.security),
        bugs: fs.existsSync(paths.bugs),
        pipelineSummary: fs.existsSync(paths.pipelineSummary),
      },
    });
  } catch (err) {
    logLine("error", "ai_dashboard_api_failed", { error: String(err) });
    res.status(500).json({ ok: false, error: "Failed to aggregate AI data" });
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
      `[github-ai-backend] Port ${PORT} is already in use. Pick another, e.g. PORT=8050 npm start`
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
