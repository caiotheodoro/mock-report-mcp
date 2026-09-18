# mock-report-mcp

Demo-only MCP server (**streamable HTTP**) for a TrueFoundry Agent Gateway governance demo:
an agent drafts a report as usual, and the final **publish** is gated by MCP Tool Approval so
a human reviewer opens the file link, reads it, and approves or denies.

Tools: `draft_report` (ungated, writes `reports/<id>.html`, returns url + sha256 + summary),
`publish_report` (gated; refuses if the file's sha256 no longer matches the reviewed one),
`get_report_status`. The process also serves `GET /reports/<id>.html` as a stand-in for S3.

**No real data.** Numbers come from a fixed fake ledger.

```
REPORT_DESK_SECRET=<secret> PUBLIC_URL=https://<tunnel-host> PORT=4848 node src/index.js
```
Register `https://<tunnel-host>/mcp` in MCP Gateway as a remote (streamable HTTP) server with
Header Auth `x-report-desk-secret`.
