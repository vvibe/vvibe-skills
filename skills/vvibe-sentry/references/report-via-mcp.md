# Report via MCP — Vibe MCP-connected agents

> **Before invoking this workflow**, the pre-scan four-layer intro template
> from `SKILL.md` §7 must have already been shown to the user. If you came
> straight to this file without reading `SKILL.md`, show that intro first
> (translate the prose to match the user's language; preserve emoji + layer
> codes verbatim).

## When to use this

Use this mode when the agent's session has the Vibe MCP server connected — i.e., `vibe_*` tools (specifically `vibe_report_health_check`) are registered and callable. This is the **preferred default for hosted VVibe creators** who reached the agent through vvibe.ai's onboarding, because the Vibe MCP server handles authentication, retry, and dedup natively. Auth flows through the MCP session's Vibe MCP Bearer token — **not** the `VVIBE_API_KEY` env var, which is REST-only. If MCP is unavailable, this mode falls back to REST (see Fallback below).

## Prerequisites

- A project directory to scan (a source tree with `package.json` or equivalent).
- Vibe MCP connected — the `vibe_report_health_check` tool is registered and callable in this session. (If it isn't, switch to `report-via-rest` mode or `local-scan-only`.)

## Workflow

### Step 1 — Confirm the project

- Confirm the user has a project to scan (look for `package.json` and a git remote).
- If the directory is not a git repo, secret-scanning over history is unavailable — the agent still runs gitleaks against the working tree only and notes the limitation in the report.

### Step 2 — Ask which project and which standard

Do **not** pick a default. Ask both questions and wait for an answer.

Template (use verbatim):

```text
Two things before I start:
① Which project should I scan? (e.g. ~/my-store)
② Which standard?
   🚀 Pre-launch    — block on CRITICAL
   🔧 Routine check — block on CRITICAL + WARNING
   🏆 Gold standard — block on everything (incl. INFO)
   📄 Report only   — scan and show results, skip the fix workflow
```

All four layers (SECRETS, DEPS, SAST, VVIBE) always run; the standard only changes the pass/fail line and whether the fix workflow is offered.

### Step 3 — Run the scan

```bash
node scripts/report.mjs --dir <path> --standard <pre-launch|routine|gold|report-only>
```

**Do not pre-flight scanner availability with shell commands before invoking `report.mjs`.** The orchestrator detects available scanners, picks the best tier per layer (tier-0 built-in, tier-1 GitHub augmentation, tier-2 canonical/Docker), applies the coverage gate, and emits install hints when a layer ends up `skipped`. For the full tier ladder, GitHub augmentation contract, coverage-gate semantics, and verified install-hint IDs, see `scanning-execution.md`.

The orchestrator emits both a human-readable Markdown summary and a machine-readable JSON report. The JSON is what you'll hand to MCP in Step 4.

### Step 4 — Call `vibe_report_health_check`

Call the MCP tool with the truncated payload (top 50 findings):

```js
vibe_report_health_check({
  scanId,
  score,
  blockingCount,
  warningCount,
  infoCount,
  byLayer: { secrets: { critical, warning, info }, deps: ..., sast: ..., vvibe: ... },
  findings: [ ... top 50 ... ],
  ranAt
})
```

**Truncation rule.** The MCP tool accepts at most 50 findings — and so does the REST endpoint (per `health-check-contract.md:152` and `:166`: "max 50 when sent over the wire"). The dashboard renders its "Top issues" table from this top-50 array regardless of which channel delivered the payload; layer counts and coverage data come from the structured fields, so the cap doesn't distort the dashboard's numbers. **There is no "full-report-via-REST" alternative** — older docs implied REST shipped the unabridged findings list, but `scripts/report.mjs` and the contract both cap at 50 today. If a creator complains they're missing findings that show locally, surface the un-truncated JSON from `local-scan-only`-style output or from `--json` capture, not from the dashboard.

Always pre-sort findings by severity (CRITICAL → WARNING → INFO) and slice the top 50 before sending — the `report.mjs` JSON output is already sorted, so a straight `.slice(0, 50)` is safe.

### Step 5 — Surface the dashboard URL

The MCP tool returns `{ reportUrl, scanId }` (the same shape the REST endpoint returns under `data`). Present the URL plus the Layer 1 plain-language summary to the user, e.g.:

```text
🟡 Scan complete — 1 critical, 4 warnings.
Dashboard: https://vvibe.ai/dashboard/sentry-scans/scn_...
Score: 73/100 (needs attention)

Top issues to fix:
  1. [SECRETS] OpenAI API key committed in src/lib/openai.ts:14
  2. [DEPS] axios@0.27.2 has CVE-2024-XXXXX — fix: bump to 1.7.x
  ...
```

Then proceed to Layer 2 (the fix workflow) if the standard's block threshold is hit. Layer 2 / Layer 3 presentation is identical regardless of reporting mode.

## Payload schema

The MCP tool accepts the same JSON shape that REST does, minus the `Authorization` header. For the full top-level shape, `findings[]` shape, `relevance` / `coverage` / `github` 0.2.0 fields, and migration notes, see `health-check-contract.md`. Do not duplicate the schema here — that file is canonical.

## Fallback

MCP can disconnect mid-flow or `vibe_report_health_check` can return an error (timeout, transient 5xx, schema mismatch). Treat MCP failure as recoverable, not terminal:

- **If `VVIBE_API_KEY` is set in env** — fall back to REST: `POST ${VVIBE_API_HOST:-https://vvibe.ai}/api/health-scans/reports` with header `Authorization: Bearer ${VVIBE_API_KEY}` and the same payload schema (see `health-check-contract.md`). This is the `report-via-rest` mode path; switch to it transparently and tell the user "MCP didn't respond — reported over REST instead". The dashboard URL comes back the same way.
- **If no `VVIBE_API_KEY` either** — persist the full scan JSON to disk (e.g. `./.vvibe-sentry/scan-<scanId>.json`), surface the file path to the user, and tell them to either reconnect MCP or set `VVIBE_API_KEY` and re-run the report step. Do not silently drop the report.

If the MCP call **hangs** (no response, no error), cancel after a 60s timeout and apply the same fallback ladder.

## Why MCP is preferred (when available)

- **Auth handled by the MCP framework** — the session token is negotiated at connect time; no per-API-key management on the user's machine, no env-var leak surface.
- **Auto-dedup by `scanId`** — the Vibe MCP server checks for replays, so re-running the same scan (e.g. after a transient network blip) doesn't double-count in the dashboard.
- **Identical rendering** — the MCP server proxies to the same REST endpoint server-side, so the report URL the creator visits and the dashboard view are byte-identical whether you went MCP or REST. The mode choice is invisible downstream.

## Pitfalls

- Treating an MCP error as terminal. It's not — fall back to REST (if `VVIBE_API_KEY` is set) or to local disk. The user shouldn't lose a scan because of a transient MCP hiccup.
- Sending more than 50 findings via MCP — anything past the 50th is dropped server-side. Always pre-sort by severity (CRITICAL > WARNING > INFO) and slice the top 50 so the dashboard surfaces the worst issues first.
- Mixing the auth model. The MCP session token is **not** `VVIBE_API_KEY`. Never construct `Authorization: Bearer ${VVIBE_API_KEY}` for the MCP call — MCP handles auth itself; setting an Authorization header is at best ignored, at worst rejected.
- "MCP is connected but the call hangs." Cancel after a sensible timeout (60s) and fall back rather than blocking the user indefinitely.
- Mistaking the universal top-50 cap for an MCP-only quirk. The dashboard ALWAYS sees at most 50 findings — REST POSTs are capped too (see Truncation rule in Step 4 + `health-check-contract.md:152`). If the creator complains "the dashboard is missing findings I saw locally", the answer is to surface the un-truncated `--json` capture from `scripts/report.mjs` directly, NOT to switch reporting channels.

For canonical false-positive handling and noisy-rule suppression, see `common-pitfalls.md`. For end-to-end CI wiring (so MCP-mode reporting runs on every PR), see `ci-setup-guide.md`. For the plain-language remediation patterns to use when walking the user through fixes, see `fix-explanations.md`.
