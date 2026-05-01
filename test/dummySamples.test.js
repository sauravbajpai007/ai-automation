"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const express = require("express");
const http = require("node:http");
const { registerDummySamples } = require("../lib/dummySamples");

function requestJson(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(opts, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, json: raw ? JSON.parse(raw) : null });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    if (body != null) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

describe("dummySamples routes", () => {
  it("GET /dummy-samples/metrics returns snapshot", async () => {
    const app = express();
    app.use(express.json({ limit: "64kb" }));
    registerDummySamples(app);
    await new Promise((resolve, reject) => {
      const srv = app.listen(0, async () => {
        const port = srv.address().port;
        try {
          const { status, json } = await requestJson(port, "GET", "/dummy-samples/metrics");
          assert.strictEqual(status, 200);
          assert.strictEqual(json.ok, true);
          assert.strictEqual(typeof json.metrics.requestsTotal, "number");
          srv.close(() => resolve());
        } catch (e) {
          srv.close(() => reject(e));
        }
      });
    });
  });

  it("POST workspace requires name", async () => {
    const app = express();
    app.use(express.json({ limit: "64kb" }));
    registerDummySamples(app);
    await new Promise((resolve, reject) => {
      const srv = app.listen(0, async () => {
        const port = srv.address().port;
        try {
          const { status, json } = await requestJson(port, "POST", "/dummy-samples/workspaces", {});
          assert.strictEqual(status, 400);
          assert.strictEqual(json.error, "name_required");
          srv.close(() => resolve());
        } catch (e) {
          srv.close(() => reject(e));
        }
      });
    });
  });
});
