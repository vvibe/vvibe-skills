# Health-check report contract

Canonical wire format for what `scripts/report.mjs` emits, and what the
VVibe dashboard / `vibe_report_health_check` MCP tool expects.

`schemaVersion: '0.2.0'` — bump when the shape changes in a way clients
can't tolerate. **0.2.0 added scanner-tier metadata, coverage gating, and
GitHub augmentation status.** Receivers that ignore unknown fields stay
forward-compatible; receivers that gate behavior on the new fields must
require `schemaVersion >= '0.2.0'`.

## Top-level shape

```jsonc
{
  "schemaVersion": "0.2.0",
  "projectDir": "/abs/path/to/scanned/project",
  "standard": "pre-launch",        // "pre-launch" | "routine" | "gold" | "report-only"
  "score": 73,                     // 0-100, from computeHealthScore
  "band": "needs attention",       // human label of the band
  "passes": false,                 // true iff blockingCount === 0 AND coverage gate didn't fail
  "blockThreshold": "CRITICAL",    // null if standard === "report-only"
  "counts": {
    "critical": 1,
    "warning": 4,
    "info": 7
  },

  // ── 0.2.0: project relevance ──────────────────────────────────────────
  // Tells the receiver which layers were even attempted, and why.
  "relevance": {
    "git": true,                       // has .git directory
    "lockfiles": {                     // which ecosystems are present
      "npm": true,
      "pnpm": false,
      "yarn": false,
      "bun": false,
      "python": false,
      "go": false,
      "rust": false,
      "ruby": false,
      "php": false
    },
    "depsRelevant": true,              // at least one manifest/lockfile
    "sastRelevant": true               // at least one source-tree marker
  },

  // ── 0.2.0: coverage gate ──────────────────────────────────────────────
  // Distinct from `passes` — coverage tracks whether layers ran at all,
  // not what they found. Pre-launch + Gold treat skipped layers as
  // certification-blocking unless --allow-skipped was passed.
  "coverage": {
    "skipped": ["sast"],               // layer names that couldn't run
    "tier0":   ["secrets", "deps"],    // layer names that ran via built-in fallback
    "coverageFail": false,             // true iff standard required full coverage and skipped is non-empty
    "allowSkipped": false              // whether --allow-skipped was set
  },

  // ── 0.2.0: GitHub server-side augmentation ────────────────────────────
  // Whether and how the orchestrator pulled in Dependabot / Secret
  // Scanning / Code Scanning alerts. `used: false` covers all reasons
  // (not on GitHub, gh CLI not installed/authed, --no-github, etc.).
  "github": {
    "used": true,
    "repo": { "owner": "acme", "repo": "store-app", "host": "github.com" },
    "layerStatus": {                   // per-feed state from the GH API
      "secrets": "ok",                 // "ok" | "disabled" | "forbidden" | "error" | "unknown"
      "deps":    "forbidden",
      "sast":    "disabled"
    },
    "contributions": {                 // how many new findings each feed added (after dedup)
      "secrets": 0,
      "deps":    0,
      "sast":    0
    }
    // When `used: false`:
    // { "used": false, "reason": "not a GitHub repo" }
    // or { "used": false, "reason": "gh CLI not authenticated", "installHint": "..." }
  },

  "layers": [
    {
      "layer": "secrets",          // "secrets" | "deps" | "sast" | "vvibe"

      // ── 0.2.0: five-state status (was: "ok" | "skipped" | "error") ──
      "status": "ok-tier0",        // "ok" | "ok-tier0" | "n/a" | "skipped" | "error"

      // ── 0.2.0: runner + installHint ──
      "runner": "secrets-builtin+github",   // raw source string (for debugging)
      "reason": null,                       // string when status is non-ok or ok-tier0
      "installHint": {                      // present when status === "skipped" with a hint
        "command": "winget install --id Gitleaks.Gitleaks",
        "note": null,
        "platform": "win32",
        "dockerFallback": true
      },

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

Unchanged from 0.1.0:

```jsonc
{
  "code": "SECRETS-AWS-ACCESS-TOKEN",  // <layer>-<rule>; layer prefix is canonical
  "severity": "CRITICAL",              // "CRITICAL" | "WARNING" | "INFO"
  "title": "Secret leak: AWS Access Token",
  "file": "src/lib/secrets.ts",        // nullable for findings that don't tie to a file
  "line": 14,                          // nullable
  "fix": "Rotate the credential ...",  // plain-language remediation
  "rawTool": "gitleaks",               // gitleaks | osv-scanner | osv-api | npm-audit | semgrep | sast-builtin | secrets-builtin | github | vvibe-sentry
  "rawId": "aws-access-token"          // the tool's native rule id, for traceability
}
```

Severity bands are consistent across `rawTool`s as of 0.2.0:

| Severity | Threshold |
|---|---|
| CRITICAL | CVSS ≥ 9.0, or upstream label "critical" |
| WARNING  | CVSS 7.0–8.9, or upstream label "high"/"medium"/"moderate" |
| INFO     | CVSS < 7.0, or upstream label "low"/"note" |

The 0.1.0 behavior of mapping NPM/GitHub `high` → CRITICAL was inconsistent
with CVSS-derived severities; 0.2.0 unifies on the CVSS bands.

## Why these fields?

- `schemaVersion` — gate-able by the dashboard / MCP receiver.
- `score` + `band` — surfaced as the dashboard's headline.
- `counts` (top-level + per-layer) — drives the sparkline + per-layer
  badges without re-scanning the `findings` array.
- `relevance` (**0.2.0**) — lets the dashboard explain *why* a layer is
  `n/a` instead of just hiding it.
- `coverage` (**0.2.0**) — distinguishes "we scanned and found nothing"
  from "we couldn't scan". The dashboard should never claim PASS without
  surfacing `coverage.skipped`.
- `github` (**0.2.0**) — drives the dashboard's "GitHub-side coverage"
  panel and powers the prompts to enable Dependabot / generate CodeQL.
- `layers[].installHint` (**0.2.0**) — the dashboard's "fix the gap"
  panel uses this verbatim. Package IDs are pre-validated upstream.
- `findings` (max 50 when sent over the wire) — the dashboard's "Top
  issues" table. The orchestrator already sorts by severity, so the
  first 50 are the worst 50.
- `ranAt` — used by the weekly-cron view to label each scan.

## Reporting endpoint

REST: `POST ${VVIBE_API_HOST}/api/health-scans/reports`

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

## Migration notes (0.1.0 → 0.2.0)

Forward-compatible additions only. A 0.1.0-only receiver:

- Will see new top-level fields (`relevance`, `coverage`, `github`) — ignore them
- Will see new layer field (`runner`, `installHint`) — ignore them
- Will see new `status` enum values (`ok-tier0`, `n/a`) — treat as opaque, but
  must NOT assume `status === "ok"` means full canonical-scanner coverage
- May see severity rebalancing: counts shift from CRITICAL to WARNING for
  NPM/GitHub-sourced "high" advisories

Receivers that surface coverage to the user (the dashboard especially)
SHOULD require `schemaVersion >= '0.2.0'` and surface `coverage.skipped`
prominently when non-empty — otherwise the user gets a misleading PASS.
