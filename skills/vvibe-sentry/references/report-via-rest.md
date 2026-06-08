# Report via REST — POST to /api/health-scans/reports

> **Before invoking this workflow**, the pre-scan four-layer intro template
> from `SKILL.md` §7 must have already been shown to the user. If you came
> straight to this file without reading `SKILL.md`, show that intro first
> (translate the prose to match the user's language; preserve emoji + layer
> codes verbatim).

## When to use this

Use this mode when the user has a `VVIBE_API_KEY` but no Vibe MCP connection — they want their scan to land in the dashboard at `/dashboard/sentry-scans`, but they're vibe-coding outside the Vibe MCP (a CI runner, a plain editor, a remote sandbox) so the MCP path isn't available. This is also the **CI-friendly path**: deterministic, scriptable, no interactive MCP handshake, replayable from a workflow. And it is the canonical fallback when an agent on the MCP path tries `vibe_report_health_check` and the tool call fails mid-flow — switch to REST with the same payload rather than dropping the upload.

## Prerequisites

- A project directory to scan (same as the local-scan-only mode — a source tree, ideally with `.git` so secret-scanning covers history).
- `VVIBE_API_KEY` set in the environment. The API uses Bearer auth: requests carry `Authorization: Bearer ${VVIBE_API_KEY}`. If the key is missing, stop and surface the missing-env-var error before attempting the scan.
- Network reachable to `${VVIBE_API_HOST:-https://vvibe.ai}`. The host is overridable for staging / self-hosted deployments (see Pitfalls).

## Workflow

### Step 1 — Confirm the project

- Confirm the user has a project to scan (look for `package.json` and a git remote).
- If the directory is not a git repo, secret-scanning over history is unavailable — the agent still runs gitleaks against the working tree only and notes the limitation in the report.

### Step 2 — Ask which standard

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

(Weekly auto-scan is intentionally omitted here — for recurring scans, see `ci-setup-guide.md`.)

The standard only changes the pass/fail line and whether a fix workflow is offered. All four layers (SECRETS, DEPS, SAST, VVIBE) always run.

### Step 3 — Run the scan and capture JSON

```bash
node scripts/report.mjs --dir <path> --standard <pre-launch|routine|gold|report-only> --json > /tmp/sentry-report.json
```

`--json` suppresses the Markdown layer and emits the machine-readable report only — that's what you POST. The orchestrator handles tier detection, GitHub augmentation, coverage gating, and install hints itself. **Do not pre-flight scanner availability with shell commands.** For the full tier ladder, GitHub augmentation contract, coverage-gate semantics, and verified install-hint IDs, see `scanning-execution.md`.

You still need the human-readable Markdown for Step 5. Either run the scan twice (once without `--json` for the user, once with for the upload), or tee the JSON to a file and render the summary from the structured fields yourself.

### Step 4 — POST the JSON report to VVibe

```bash
curl -sS -X POST "${VVIBE_API_HOST:-https://vvibe.ai}/api/health-scans/reports" \
  -H "Authorization: Bearer ${VVIBE_API_KEY}" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/sentry-report.json
```

Always use the `${VVIBE_API_HOST:-https://vvibe.ai}` env-var pattern — never hardcode `https://vvibe.ai`. This is the catalog convention across vvibe-skills (every curl example in the repo uses it).

Alternatively, `scripts/report.mjs` ships with a `--report-to-vvibe` flag that POSTs internally with the same envelope, reading `VVIBE_API_HOST` / `VVIBE_API_KEY` from the environment. Prefer that for one-shot interactive flows; reach for the explicit `curl` form when you need to inspect the JSON, retry, or stage the upload from a separate CI step.

### Step 5 — Present the dashboard URL and the Layer 1 summary side-by-side

A successful POST returns:

```json
{ "data": { "reportId": "...", "score": 0, "dashboardUrl": "https://vvibe.ai/dashboard/sentry-scans" } }
```

`dashboardUrl` is the dashboard's scans **list page** — the creator opens the new report from there (it's the top row, opens in a modal). Show `dashboardUrl` verbatim next to the Layer 1 plain-language summary (status banner, score, per-layer counts, top 3 issues — same format as the local-scan-only mode). Don't replace the local summary with just the URL — the user wants both: the immediate verdict in chat, and the link for sharing / drill-down later.

If the user picked Pre-launch / Routine / Gold and there are blocking findings, proceed to the Layer 2 fix workflow as usual (see `fix-explanations.md` for per-code fix templates).

## Payload schema

The POST body is the same envelope `scripts/report.mjs` produces — top-level: `schemaVersion`, `score`, `band`, `passes`, `standard`, `blockThreshold`, `counts`, `coverage`, `relevance`, `github`, `layers`, `findings`, `ranAt`. For the full schema including each field's type, the per-layer status enum, and the finding shape, see `health-check-contract.md`.

**Truncation rule**: the wire payload caps `findings` at the top 50 (already sorted CRITICAL → WARNING → INFO, so these are the worst 50). The `--report-to-vvibe` codepath in `report.mjs` enforces this cap before sending; if you're handcrafting the POST from raw output, do the same. The server treats the array as already-truncated and renders the dashboard's "Top issues" table directly from it. Layer counts and coverage data come from the structured fields, not from re-counting `findings`, so the cap doesn't distort the dashboard's numbers.

## Error handling

- **`401 Unauthorized`** → the key is invalid, expired, or lacks the `health-scans:write` scope. Surface the response body verbatim and tell the user to mint a fresh key from `/dashboard/api-keys` (the API-key analogue of `gh auth refresh -s security_events`). Do not retry — auth failures don't get better with backoff.
- **`429 Too Many Requests`** → rate limited. Sleep + retry with exponential backoff: 1s → 5s → 30s, max 3 attempts. Honour `Retry-After` if the response sets it (use that value instead of the next step in the schedule). After 3 failures, fall through to the local-save path below.
- **`5xx` (server error)** → transient. Same 1s → 5s → 30s backoff, max 3 attempts. After 3 failures, save `/tmp/sentry-report.json` to a path the user can find (print the absolute path) and tell them: "Upload failed after 3 retries. The report is saved at <path>; re-run `curl ... --data-binary @<path>` once VVibe is reachable again." Do not delete the local file.
- **Network unreachable** (DNS failure, connection refused, TLS handshake error) → don't burn retries on a clearly-down endpoint. Fall back to the local-only presentation (the local-scan-only mode does this end-to-end), persist the JSON report to a stable path, and surface the path so the user can upload later. Tell them explicitly: "Couldn't reach VVibe. Showing the local report only. Saved at <path> — upload manually once you're back online."

In every failure case, the four-layer scan results themselves are still valid — present Layer 1 to the user regardless of upload state. The dashboard is a delivery mechanism, not the source of truth.

## Pitfalls

- **Hardcoded `https://vvibe.ai` in scripts** — always use `${VVIBE_API_HOST:-https://vvibe.ai}`. CodeRabbit flags any hardcoded host in vvibe-skills curl examples; same rule applies here. Staging deploys and self-hosted instances rely on the override.
- **Don't add an `Idempotency-Key` header on your own initiative.** The v1 contract documented in `health-check-contract.md` does **not** specify this header — `scripts/report.mjs` does not send one, and the server's dedup behavior for replays is unspecified. There was a real prior incident where a CodeRabbit suggestion added `Idempotency-Key` without verifying the contract; that header has to be a server-coordinated change, not a client guess. **If it isn't in `health-check-contract.md`, omit it.** When the contract grows the field, add it then; until then, a duplicate POST may create a duplicate scan and that's the server's problem to deduplicate, not yours.
- **Test scans uploading to prod** — there is no `?dry_run=1` or equivalent in `scripts/report.mjs` today; the v1 contract has no documented dry-run mode. To test without polluting the creator's dashboard, point `VVIBE_API_HOST` at a staging deployment instead of relying on a flag that isn't implemented. Do not invent a dry-run query parameter.
- **`VVIBE_API_HOST` override applies here too.** Same env var as click-tracking, hosted-waitlist, email, and every other vvibe-skill HTTP endpoint — see `../../PROVIDER.md` at the repo root for the full provider-configuration model. One override flips every reporting endpoint at once; don't try to override per-skill.
- **`--json` and the human Markdown are mutually exclusive in one `report.mjs` invocation.** If you need both for the same scan (you usually do — JSON to upload, Markdown to show), either run twice or render the Layer 1 summary yourself from the JSON's structured fields. Don't try to grep Markdown out of a `--json` run.
