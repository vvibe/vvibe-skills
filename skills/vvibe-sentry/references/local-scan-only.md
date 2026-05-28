# Local scan only — no VVibe reporting

> **Before invoking this workflow**, the pre-scan four-layer intro template
> from `SKILL.md` §7 must have already been shown to the user. If you came
> straight to this file without reading `SKILL.md`, show that intro first
> (translate the prose to match the user's language; preserve emoji + layer
> codes verbatim).

## When to use this

This is the **cheapest path** through Sentry. Run all four scanner layers locally and present the results to the user — nothing leaves the machine, nothing lands on a VVibe dashboard. Use this for one-off audits, pre-PR code reviews, security spot-checks, or any "just show me what's wrong" request. No VVibe account, no `VVIBE_API_KEY`, and no MCP connection required — this mode is always available, even on projects that have never heard of VVibe.

## Prerequisites

- A project directory to scan (a source tree). That's it.
- No `VVIBE_API_KEY`. No MCP server. No network access beyond OSV.dev (used by tier-0 dependency lookups).

## Workflow

### Step 1 — Confirm the project

- Confirm the user has a project to scan (look for `package.json` and a git remote).
- If the directory is not a git repo, secret-scanning over history is unavailable — the agent still runs gitleaks against the working tree only and notes the limitation in the report.

### Step 2 — Ask which project and which standard

Do **not** pick a default. Ask both questions and wait for an answer.

Template (use verbatim):

```
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

### Step 3 — Run the scan

```bash
node scripts/report.mjs --dir <path> --standard <pre-launch|routine|gold|report-only>
```

**Do not pre-flight scanner availability with shell commands before invoking `report.mjs`.** The orchestrator detects available scanners, picks the best tier per layer (tier-0 built-in, tier-1 GitHub augmentation, tier-2 canonical/Docker), applies the coverage gate, and emits install hints when a layer ends up `skipped`. For the full tier ladder, GitHub augmentation contract, coverage-gate semantics, and verified install-hint IDs, see `scanning-execution.md`.

### Step 4 — Present results in three layers

Always lead with Layer 1. Only proceed to Layer 2 if the user picked Pre-launch / Routine / Gold and there is at least one finding at or above the block threshold. Layer 3 is shown when the user asks for technical detail.

#### Layer 1 — Plain-language summary (use this format verbatim)

```
🟢 / 🟡 / 🔴  Status: <pass | needs attention | not ready>
Score: <0-100>

Layer breakdown:
  🔐 Secrets:       <count> findings   (🔴 X 🟡 Y 🔵 Z)
  📦 Dependencies:  <count> findings   (🔴 X 🟡 Y 🔵 Z)
  🛡️  Code patterns: <count> findings  (🔴 X 🟡 Y 🔵 Z)
  🪢 VVibe:         <count> findings   (🔴 X 🟡 Y 🔵 Z)

Top issues to fix:
  1. [SECRETS] OpenAI API key committed in commit f3a91c (src/lib/openai.ts:14)
  2. [DEPS] `axios@0.27.2` has CVE-2024-XXXXX (medium severity), fix: bump to 1.7.x
  3. [SAST] SQL injection sink at src/api/orders.ts:42 — string-interpolated query
```

#### Layer 2 — Fix workflow (only if blocking findings exist)

Walk the user through fixing each blocking finding, one at a time. For each:

1. Show the finding in plain language ("Your OpenAI API key got committed to git history. Anyone who pulls this repo can use your account.")
2. Show the fix steps (revoke, regenerate, add to `.env`, re-run to confirm).
3. Wait for the user to confirm done, or skip.
4. Re-run that layer to verify the fix.

Don't bulk-fix; the user needs to understand each issue. If there are >10 blocking findings, group by code (e.g., "5 dependency CVEs — fix together by `npm audit fix`?") but still let the user confirm. For per-code fix templates, see `fix-explanations.md`.

#### Layer 3 — Technical detail (on request)

The full JSON report from `scripts/report.mjs`. Be ready to answer "show me the raw output for SECRETS" by pasting that section of the JSON.

## What this mode does NOT do

- **No reporting to VVibe.** No `vibe_report_health_check` MCP call, no REST POST to `/api/health-scans/reports`, no dashboard URL to hand back.
- **No `scanId` persistence.** Each run is ephemeral — closing the chat loses the result unless the user saves the JSON.
- **No dashboard certification.** If the user wants their scan history visible at `/dashboard/sentry-scans`, they need either `report-via-rest` (API key) or `report-via-mcp` (MCP connection) instead.

## Pitfalls

- **Not a git repo** → gitleaks runs `--no-git` (working tree only). History-based secret detection is unavailable; mention this in Layer 1 so the user knows the gap.
- **Test-file false positives in SAST** → filter `*.test.*` / `__tests__/` by default; only include test files if the user explicitly opts in.
- **"I revoked the key but it's still in the report"** → revoking at the provider does not remove the key from git history. Rotation is mandatory; cleaning history (`git filter-repo` or BFG) is the follow-up. Don't let the user think revoke alone is sufficient.
- **For weekly automation**, this mode is wrong — point the user at `ci-setup-guide.md` for GitHub Actions / GitLab CI / Vercel cron recipes.
