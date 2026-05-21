# Health-check report contract

Canonical wire format for what `scripts/report.mjs` emits, and what the
VVibe dashboard / `vibe_report_health_check` MCP tool expects.

`schemaVersion: '0.1.0'` — bump when the shape changes in a way clients
can't tolerate.

## Top-level shape

```jsonc
{
  "schemaVersion": "0.1.0",
  "projectDir": "/abs/path/to/scanned/project",
  "standard": "pre-launch",        // "pre-launch" | "routine" | "gold" | "report-only"
  "score": 73,                     // 0-100, from computeHealthScore
  "band": "needs attention",       // human label of the band
  "passes": false,                 // true iff blockingCount === 0 for the chosen standard
  "blockThreshold": "CRITICAL",    // null if standard === "report-only"
  "counts": {
    "critical": 1,
    "warning": 4,
    "info": 7
  },
  "layers": [
    {
      "layer": "secrets",          // "secrets" | "deps" | "sast" | "vvibe"
      "status": "ok",              // "ok" | "skipped" | "error"
      "reason": null,              // string when status !== "ok"
      "counts": { "critical": 0, "warning": 1, "info": 0 }
    }
    // ...one entry per layer that was attempted
  ],
  "findings": [
    // Sorted CRITICAL → WARNING → INFO. See "Finding shape" below.
  ],
  "ranAt": "2026-05-21T03:14:15.926Z"
}
```

## Finding shape

```jsonc
{
  "code": "SECRETS-AWS-ACCESS-TOKEN",  // <layer>-<rule>; layer prefix is canonical
  "severity": "CRITICAL",              // "CRITICAL" | "WARNING" | "INFO"
  "title": "Secret leak: AWS Access Token",
  "file": "src/lib/secrets.ts",        // nullable for findings that don't tie to a file
  "line": 14,                          // nullable
  "fix": "Rotate the credential ...",  // plain-language remediation
  "rawTool": "gitleaks",               // gitleaks | osv-scanner | npm-audit | semgrep | vvibe-sentry
  "rawId": "aws-access-token"          // the tool's native rule id, for traceability
}
```

The agent uses `title` + `fix` when talking to the creator; `rawTool` /
`rawId` are for log forensics and dedup.

## Why these fields?

- `schemaVersion` — the dashboard / MCP tool gates on this. A 0.2.0
  break will be rejected defensively (unknown fields ignored, missing
  required fields fail with a clear error).
- `score` + `band` — surfaced as the dashboard's headline.
- `counts` (top-level + per-layer) — drives the sparkline + per-layer
  badges without re-scanning the `findings` array.
- `findings` (max 50 when sent over the wire) — the dashboard's "Top
  issues" table. The orchestrator already sorts by severity, so the
  first 50 are the worst 50.
- `ranAt` — used by the weekly-cron view to label each scan.

## Reporting endpoint

REST: `POST ${VVIBE_API_HOST}/api/creator-subscription/health-check-reports`

```
Authorization: Bearer ${VVIBE_API_KEY}
Content-Type: application/json
```

Body = the JSON above with `findings` truncated to 50 entries.

The endpoint returns the dashboard URL:

```json
{ "data": { "scanId": "scn_...", "url": "https://vvibe.ai/dashboard/sentry-scans/scn_..." } }
```

## MCP path (preferred when agent is connected)

Instead of POSTing, an agent connected via the VVibe MCP server should
call the `vibe_report_health_check` tool with the same payload shape.
Benefit: no API key needed on the user's machine — the MCP session is
already authenticated. The tool returns the dashboard URL.

The agent decides between MCP and REST automatically:

- MCP connected → call `vibe_report_health_check`
- No MCP, `VVIBE_API_KEY` set → POST to REST
- Neither → show the local report only, skip remote reporting
