"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const express = require("express");
const http = require("node:http");
const { registerReviewDemo } = require("../lib/reviewDemo");

describe("reviewDemo routes", () => {
  it("registers /demo/ping", async () => {
    const app = express();
    registerReviewDemo(app);
    await new Promise((resolve, reject) => {
      const srv = app.listen(0, async () => {
        const port = srv.address().port;
        http.get(`http://127.0.0.1:${port}/demo/ping`, (res) => {
          assert.strictEqual(res.statusCode, 200);
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            const j = JSON.parse(body);
            assert.strictEqual(j.ok, true);
            srv.close(() => resolve());
          });
        }).on("error", reject);
      });
    });
  });
});
