#!/usr/bin/env node
// DEMO ONLY. Drafts a deterministic HTML "treasury liquidity report" from a seeded fake
// ledger, serves it over HTTP (stand-in for S3), and exposes publish_report as the tool a
// TrueFoundry MCP Tool Approval policy gates. Nothing here touches real data.
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 4848);
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const SECRET = process.env.REPORT_DESK_SECRET ?? "";
const SECRET_HEADER = (process.env.REPORT_DESK_SECRET_HEADER ?? "x-report-desk-secret").toLowerCase();
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPORTS = join(ROOT, "reports");
mkdirSync(REPORTS, { recursive: true });

const seed = { "ACC-1001": 500000, "ACC-2044": 125000, "ACC-3090": 82000 };
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const stamp = () => new Date().toISOString();
const log = (...a) => console.log(stamp(), ...a);

function renderReport({ period, audience, revision }) {
  const total = Object.values(seed).reduce((a, b) => a + b, 0);
  const rows = Object.entries(seed).map(([acc, bal]) => `<tr><td>${acc}</td><td style="text-align:right">$${bal.toLocaleString("en-US")}</td><td style="text-align:right">${((bal / total) * 100).toFixed(1)}%</td></tr>`).join("");
  const note = revision > 1 ? `<p><b>Revision ${revision}.</b> Regenerated after the first draft was submitted for review.</p>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Treasury liquidity report — ${period}</title>
<style>body{font:16px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#14181D}h1{font-size:28px}table{border-collapse:collapse;width:100%}td,th{padding:8px 10px;border-bottom:1px solid #ddd;text-align:left}.tag{display:inline-block;font:12px monospace;background:#eee;padding:2px 6px;border-radius:3px}</style></head>
<body><span class="tag">DEMO ONLY · fake seeded ledger · no real data</span>
<h1>Treasury liquidity report — ${period}</h1>
<p>Prepared by <code>report-writer-agent</code> for <b>${audience}</b>. Generated ${stamp()}.</p>${note}
<h2>Balances</h2><table><thead><tr><th>Account</th><th style="text-align:right">Balance (USD)</th><th style="text-align:right">Share</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><th>Total</th><th style="text-align:right">$${total.toLocaleString("en-US")}</th><th style="text-align:right">100%</th></tr></tfoot></table>
<h2>Commentary</h2><p>Liquidity is concentrated in ACC-1001 (${((seed["ACC-1001"] / total) * 100).toFixed(1)}% of the total). No transfers above the review threshold were executed in the period without human approval. This document is a generated draft awaiting reviewer sign-off before publication.</p>
</body></html>`;
}

const revisions = new Map(); // period -> count
function buildServer() {
const mcp = new McpServer({ name: "report-desk", version: "1.0.0" });

mcp.registerTool("draft_report", {
  title: "Draft report",
  description: "Generate a treasury liquidity report (HTML) for a period and audience, store it, and return its URL, sha256 and a one-line summary. DEMO ONLY: deterministic content from a fake ledger. Ungated.",
  inputSchema: { period: z.string().describe("e.g. 2026-Q3"), audience: z.string().describe("who will read it, e.g. Board Audit Committee") },
}, async ({ period, audience }) => {
  const revision = (revisions.get(period) ?? 0) + 1; revisions.set(period, revision);
  const html = renderReport({ period, audience, revision });
  const report_id = `rpt-${period.replace(/[^a-z0-9]/gi, "").toLowerCase()}-${randomUUID().slice(0, 8)}`;
  writeFileSync(join(REPORTS, `${report_id}.html`), html);
  const out = { report_id, url: `${PUBLIC_URL}/reports/${report_id}.html`, sha256: sha256(html), revision, summary: `Treasury liquidity report ${period} for ${audience}: 3 accounts, total $${Object.values(seed).reduce((a, b) => a + b, 0).toLocaleString("en-US")}, revision ${revision}.` };
  log("draft_report", out.report_id, out.sha256.slice(0, 12));
  return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
});

mcp.registerTool("publish_report", {
  title: "Publish report",
  description: "Publish a drafted report to its audience. GATED by MCP Tool Approval: the reviewer opens `url`, checks it, and approves. Refuses if the stored file's sha256 no longer matches the reviewed `sha256`. DEMO ONLY: marks the report as published, sends nothing.",
  inputSchema: {
    report_id: z.string(), url: z.string().url(), sha256: z.string().length(64),
    summary: z.string().describe("one line the reviewer sees in the approval request"),
  },
}, async ({ report_id, url, sha256: reviewed }) => {
  const p = join(REPORTS, `${report_id}.html`);
  if (!existsSync(p)) return { isError: true, content: [{ type: "text", text: `No draft ${report_id}.` }] };
  const current = sha256(readFileSync(p, "utf8"));
  if (current !== reviewed) {
    log("publish_report REFUSED hash mismatch", report_id, reviewed.slice(0, 12), "!=", current.slice(0, 12));
    return { isError: true, content: [{ type: "text", text: `Refused: content of ${report_id} changed since review (reviewed sha256 ${reviewed.slice(0, 12)}…, current ${current.slice(0, 12)}…). Draft again and re-submit.` }] };
  }
  const rec = { report_id, url, sha256: current, published_at: stamp() };
  writeFileSync(join(REPORTS, `${report_id}.published.json`), JSON.stringify(rec, null, 2));
  log("publish_report OK", report_id);
  return { content: [{ type: "text", text: `Published ${report_id} (sha256 ${current.slice(0, 12)}…) at ${rec.published_at}. DEMO ONLY: nothing was sent.` }] };
});

mcp.registerTool("get_report_status", {
  title: "Report status",
  description: "Return draft/published state and current sha256 of a report. Ungated.",
  inputSchema: { report_id: z.string() },
}, async ({ report_id }) => {
  const p = join(REPORTS, `${report_id}.html`);
  if (!existsSync(p)) return { isError: true, content: [{ type: "text", text: `No draft ${report_id}.` }] };
  const pub = join(REPORTS, `${report_id}.published.json`);
  const out = { report_id, status: existsSync(pub) ? "published" : "draft", sha256: sha256(readFileSync(p, "utf8")), url: `${PUBLIC_URL}/reports/${report_id}.html`, ...(existsSync(pub) ? JSON.parse(readFileSync(pub, "utf8")) : {}) };
  return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
});

return mcp;
}

// Stateless streamable HTTP: fresh server + transport per request (the gateway itself runs stateless).
const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_URL);
  log(req.method, url.pathname, `ua=${req.headers["user-agent"] ?? "-"}`, `secret=${SECRET_HEADER in req.headers}`);
  if (url.pathname === "/healthz") { res.writeHead(200, { "content-type": "application/json" }); return res.end('{"ok":true}'); }
  if (req.method === "GET" && url.pathname.startsWith("/reports/") && url.pathname.endsWith(".html")) {
    const p = join(REPORTS, url.pathname.slice("/reports/".length));
    if (!existsSync(p)) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(readFileSync(p));
  }
  if (url.pathname === "/mcp") {
    if (SECRET && req.headers[SECRET_HEADER] !== SECRET) { res.writeHead(401, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: `missing or invalid ${SECRET_HEADER}` })); }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const mcp = buildServer();
    res.on("close", () => { transport.close(); mcp.close().catch(() => {}); });
    await mcp.connect(transport);
    return transport.handleRequest(req, res);
  }
  res.writeHead(404); res.end("not found");
});
httpServer.listen(PORT, () => log(`report-desk listening on :${PORT} public=${PUBLIC_URL} secret=${SECRET ? "REQUIRED" : "OFF"}`));
