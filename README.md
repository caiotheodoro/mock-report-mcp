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

Set `TFY_API_KEY` (a TrueFoundry virtual-account key with Mlf Project Editor on the ML repo),
`TFY_HOST` and `TFY_ML_REPO` to store drafts as **TrueFoundry artifact versions** in the
tenant's own blob storage instead of the local `reports/` folder. `draft_report` then returns
a signed S3 read URL (1 hour) and a `storage` block with the artifact FQN, and
`publish_report` re-reads the stored object to verify the sha256. Finalized versions are
read-only through the platform API.
Register `https://<tunnel-host>/mcp` in MCP Gateway as a remote (streamable HTTP) server with
Header Auth `x-report-desk-secret`.
