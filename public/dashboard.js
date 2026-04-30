(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  function sevClass(s) {
    const v = (s || "").toLowerCase();
    if (v === "high") return "high";
    if (v === "medium") return "medium";
    if (v === "low") return "low";
    return "neutral";
  }

  function textOrEmpty(s, emptyMsg) {
    if (s == null || String(s).trim() === "") {
      return emptyMsg;
    }
    return String(s);
  }

  function setBanner(el, msg, isError) {
    if (!el) return;
    if (!msg) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    el.classList.remove("hidden");
    el.textContent = msg;
    el.classList.toggle("error", Boolean(isError));
  }

  async function load() {
    const btn = $("#refresh");
    const errEl = $("#load-error");
    const updated = $("#updated");
    setBanner(errEl, "", false);
    btn.disabled = true;
    try {
      const r = await fetch("/api/ai-dashboard", { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      updated.textContent = `Updated ${new Date(data.generatedAt || Date.now()).toLocaleString()}`;

      const la = data.logAnalysis;
      const sev =
        la &&
        (la.severity ||
          (la.verdict === "UNSAFE" ? "high" : la.verdict === "SAFE" ? "low" : null));
      $("#la-severity").textContent = la ? sev || la.verdict || "—" : "—";
      $("#la-severity").className = "badge " + sevClass(sev || (la && la.severity));

      $("#la-root").textContent = textOrEmpty(
        la && (la.root_cause || la.verdict),
        la ? "No analysis yet — run ./ai/ai_decision.sh or CI." : "No log analysis yet."
      );
      $("#la-fix").textContent = textOrEmpty(
        la && la.suggested_fix,
        la ? "—" : "Run Ollama CI scripts under ai-automation/coder/ai/."
      );

      const st = la && la.structured;
      const summary = st && st.summary;
      $("#la-stats").textContent = summary
        ? `Lines: ${summary.total_lines} · CPU signals: ${summary.cpu_spike_signals} · Errors: ${summary.error_signals} · Timeouts: ${summary.timeout_signals}`
        : st && typeof st.npmTestExit === "number"
          ? `npm test exit code: ${st.npmTestExit} · source: ${la.source || "—"}`
          : "—";

      const dd = data.deployDecision;
      if (dd && typeof dd.deploy === "boolean") {
        $("#dd-deploy").textContent = dd.deploy ? "Go" : "Hold";
        $("#dd-deploy").className = "badge " + (dd.deploy ? "low" : "high");
        $("#dd-confidence").textContent =
          typeof dd.confidence === "number" ? `${Math.round(dd.confidence * 100)}%` : "—";
        $("#dd-reason").textContent = textOrEmpty(dd.reason, "—");
        const blockers = Array.isArray(dd.blockers) ? dd.blockers.filter(Boolean) : [];
        $("#dd-blockers").textContent = blockers.length ? blockers.join(", ") : "None";
      } else {
        $("#dd-deploy").textContent = "—";
        $("#dd-deploy").className = "badge neutral";
        $("#dd-confidence").textContent = "—";
        $("#dd-reason").textContent = "No deploy_decision.json yet (run CI or deploy_decision_ai.py).";
        $("#dd-blockers").textContent = "—";
      }

      function fillReport(id, content) {
        const el = $(id);
        if (!el) return;
        const has = content != null && String(content).trim() !== "";
        el.textContent = has ? String(content) : "No file generated yet.";
        el.classList.toggle("empty", !has);
      }

      const rep = (data.reports && data.reports) || {};
      fillReport("#rep-code", rep.codeReview);
      fillReport("#rep-sec", rep.security);
      fillReport("#rep-bugs", rep.bugs);
      fillReport("#rep-pipe", rep.pipelineSummary);

      const av = data.availability || {};
      $("#rep-meta").textContent = Object.keys(av)
        .filter((k) => av[k])
        .map((k) => k)
        .join(", ") || "No report files on disk";
    } catch (e) {
      setBanner(errEl, `Could not load dashboard data: ${e.message}`, true);
    } finally {
      btn.disabled = false;
    }
  }

  $("#refresh").addEventListener("click", load);
  load();
})();
