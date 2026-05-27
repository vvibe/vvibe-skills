---
name: vvibe-sentry
version: 0.2.0
description: Run a pre-deploy security and reliability audit on the creator's codebase. Trigger when the user mentions VVibe sentry scan, security audit, pre-deploy check, secret leak, dependency CVE, vulnerability scan, or wants to verify the codebase is safe to go live.
---

# VVibe Sentry — Codebase Security Audit

Use this skill to run a pre-deploy security audit on a VVibe creator's codebase. Sentry **orchestrates established open-source scanners** — it does not re-invent them. The agent's value is in driving the tools, normalizing their output into a single severity-graded report, layering in a thin set of VVibe-specific checks, and presenting actionable fix steps to a non-engineer creator.

This skill is designed for **non-engineers using vibe coding tools** who want to ship with confidence. Keep output human and actionable: lead with a plain-language summary, only show technical detail when the user drills in.

## What Sentry checks

Four layers. Each layer is one OSS scanner plus glue:

| Code | Layer | Tool | What it catches |
|---|---|---|---|
| **SECRETS** | Secret leakage | [gitleaks](https://github.com/gitleaks/gitleaks) | Committed API keys, AWS/GCP credentials, `.env` leaks, `pcs_live_*` / `VVIBE_API_KEY` tokens, GitHub tokens, OpenAI keys |
| **DEPS** | Dependency CVEs | [osv-scanner](https://github.com/google/osv-scanner) + `npm audit` | Known vulnerabilities in installed packages, including transitive deps |
| **SAST** | Static analysis | [semgrep](https://semgrep.dev/) with `p/owasp-top-ten` + `p/javascript` + `p/typescript` | SQL injection, XSS, SSRF, hardcoded secrets, missing auth, unsafe `eval`, weak crypto, open redirects |
| **VVIBE** | Integration hygiene | sentry-internal scripts | API key read from env (not hardcoded), member sync uses idempotency keys, email skill respects opt-out, analytics scripts don't include PII in event params |

**Severity model** — every finding is one of:

- 🔴 **CRITICAL** — exploitable now or imminent (committed prod token, `eval(userInput)`, known-exploited CVE)
- 🟡 **WARNING** — exploitable under realistic conditions (CVE without known exploit, missing CSRF on state-changing route, outdated TLS)
- 🔵 **INFO** — best-practice gap that is not directly exploitable (missing CSP header, outdated dep without known CVE)

The agent presents the same set of findings every time; what changes between standards is the **block-or-not threshold** the creator picked (see Step 3).

## Quick Start

### Step 1 — Confirm the project

- Confirm the user has a project to scan (look for `package.json` and a git remote).
- If the directory is not a git repo, secret-scanning over history is unavailable — the agent still runs gitleaks against the working tree only and notes the limitation in the report.

### Step 2 — Introduce what Sentry checks, in plain language

Show the user this intro **before** asking what to scan. First-time users have no idea what "SECRETS" or "DEPS" means until you explain it.

Template:

```
VVibe Sentry runs four layers of checks against your codebase:

🔐 Secrets       — did anything sensitive get committed to git? (gitleaks)
📦 Dependencies  — do any installed packages have known vulnerabilities? (osv-scanner)
🛡️  Code patterns — common security anti-patterns in your source. (semgrep)
🪢 VVibe         — is your VVibe integration following safe patterns?

Findings come out as CRITICAL / WARNING / INFO. I'll show you a plain-
language summary first; you can dive into details from there.
```

### Step 3 — Ask which project and which standard

Do **not** pick a default. Ask both questions and wait for an answer.

Template:

```
Two things before I start:
① Which project should I scan? (e.g. ~/my-store)
② Which standard?
   🚀 Pre-launch    — block on CRITICAL
   🔧 Routine check — block on CRITICAL + WARNING
   🏆 Gold standard — block on everything (incl. INFO)
   📄 Report only   — scan and show results, skip the fix workflow
   ⏰ Weekly auto   — schedule a recurring scan instead of scanning now
```

Standard → behaviour:

| User choice | Scan scope | Block threshold | Fix workflow offered |
|---|---|---|---|
| 🚀 Pre-launch | all 4 layers | CRITICAL | yes |
| 🔧 Routine check | all 4 layers | CRITICAL + WARNING | yes |
| 🏆 Gold standard | all 4 layers | all | yes |
| 📄 Report only | all 4 layers | n/a | **no** |
| ⏰ Weekly auto | (skip scan) | n/a | n/a — jumps to scheduling, see Step 8 |

All non-scheduled standards run **the same** 4 layers. The standard only changes the pass/fail line on the summary and whether the fix workflow is offered. 📄 Report only is for audits or code-review handoffs where the creator just wants to see results.

**Advanced — single-layer mode.** If the user explicitly asks to run only one layer ("only check secrets", "re-run SAST"), accept that as `--layer secrets|deps|sast|vvibe`. Do not surface this as a main option.

### Step 4 — Scanner tiers (orchestrator handles this)

**Do not pre-flight scanner availability with shell commands before invoking `report.mjs`.** The orchestrator runs detection itself and picks the best available source per layer. The agent's job is to invoke the orchestrator and explain the resulting tier to the user — not to second-guess.

Each layer has a cascade of sources, prioritized by user cost (cheaper to user wins when the rule set matches):

| Tier | Source | Coverage | User cost | Use case |
|---|---|---|---|---|
| **2 (canonical)** | Native binary (`gitleaks`/`osv-scanner`/`semgrep`) | Full | High (install) | Dedicated security-conscious teams |
| **2 (Docker)** | Pinned Docker image | Full | High (4 GB Docker Desktop) | Already-Docker shops |
| **1 (GitHub)** | `gh api` reading Secret Scanning + Dependabot + Code Scanning | Near-full (server-side) | 1-click setup | GitHub-hosted repos |
| **0 (built-in)** | Pure-Node scanners shipped with the skill (regex, OSV.dev HTTP) | Partial | **Zero** | Default for everyone |

Tier-0 is **always available** (no install, no Docker, no network beyond OSV.dev). Tier-1 augments on top when `gh` CLI is installed + authenticated AND the repo is on GitHub. Tier-2 replaces tier-0 when the canonical tool is detected on PATH or in Docker.

**Pinned Docker images** (tier-2 Docker variant):

| Tool | Image |
|---|---|
| gitleaks | `zricethezav/gitleaks:latest` |
| osv-scanner | `ghcr.io/google/osv-scanner:latest` |
| semgrep | `semgrep/semgrep:latest` |

First Docker run pulls the image (~50–500 MB). The orchestrator prints `📦 First-time pull: <image>` to stderr before pulling so the user understands the wait.

**Layer status in the report — five states** (distinct, agent must explain differently):

| Status | Meaning | What the agent should say |
|---|---|---|
| `ok` | Tier-2 canonical scanner ran → full coverage | Normal — show the count |
| `ok-tier0` | Only built-in / OSV API fallback ran → partial coverage | "Scanned with built-in rules. For deeper coverage, install \<tool\> or enable Docker." |
| `n/a` | Layer doesn't apply to this project (e.g. DEPS on a no-lockfile site) | "Not applicable — nothing to scan" |
| `skipped` | Layer is relevant but no source could run (rare — only for unparseable lockfiles like Cargo.lock without osv-scanner) | "I couldn't scan this layer — \<install hint surfaces here\>" |
| `error` | A scanner was invoked but crashed | Surface the stderr; do not retry blindly |

**GitHub augmentation status** is reported separately in `report.github`:

- `used: bool` — whether augmentation ran
- `repo: { owner, repo }` — only present if used
- `layerStatus: { secrets, deps, sast }` each one of `ok | disabled | forbidden | error`
  - `disabled` → feature is off on the repo. Offer to enable Dependabot/Secret Scanning, or generate a CodeQL workflow.
  - `forbidden` → `gh` token lacks the scope. Suggest `gh auth refresh -s security_events`.

When `sast: disabled`, you can call `generateCodeqlWorkflow()` from `scripts/scanners/github.mjs` and offer to write `.github/workflows/codeql.yml`. **Do not auto-commit** — show the diff and let the user commit.

**Project relevance** drives whether each layer is even attempted (`report.relevance`):

- `git: bool` — without `.git`, gitleaks runs with `--no-git` (working-tree only, no history coverage). Built-in tier-0 SECRETS is always working-tree-only.
- `lockfiles: { npm, pnpm, yarn, bun, python, go, rust, ruby, php }` — which ecosystems are present.
- `depsRelevant: bool` — at least one manifest or lockfile exists.
- `sastRelevant: bool` — at least one source-tree marker exists (`src/`, `app/`, `main.py`, etc.).

**Coverage gate** (`report.coverage`):

- `pre-launch` and `gold` standards **fail with exit 1** when any layer is `skipped` (banner: `🔴 INCOMPLETE — N layers couldn't run; cannot certify`). Reasoning: shipping with unknown coverage is worse than acknowledging the gap.
- `routine` and `report-only` warn but pass.
- `--allow-skipped` is the ship-anyway escape hatch for CI users who knowingly accept the gap.

**Install hints**: when a layer ends up `skipped`, the report carries `installHint: { command, note, platform }`. The agent should surface the command verbatim — these IDs are verified (`Gitleaks.Gitleaks`, `Google.OSVScanner`, `brew install ...`, `pipx install semgrep`). If `command` is null + `note` mentions Docker, the platform has no native install path (e.g. semgrep on Windows) — prefer tier-0 + Docker over recommending WSL.

### Step 5 — Run the scan

```bash
node scripts/report.mjs --project <path> --standard <pre-launch|routine|gold|report-only>
```

Internally `report.mjs`:

1. Detects which scanners are available
2. Runs each available scanner with JSON output
3. Parses each tool's output into a normalised `{ code, severity, title, file, line, fix }` shape
4. Runs the VVibe-specific layer (see `scripts/check_vvibe_integration.mjs`)
5. Computes a health score via `scripts/computeHealthScore.mjs`
6. Emits both human-readable Markdown and a machine-readable JSON

Pass `--json` to suppress the Markdown layer and emit JSON only. Useful for CI.

### Step 6 — Present the results in three layers

Always lead with Layer 1. Only proceed to Layer 2 if the user picked Pre-launch / Routine / Gold and there is at least one finding at or above the block threshold. Layer 3 is shown when the user asks for technical detail.

#### Layer 1 — Plain-language summary

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

1. Show the finding plain-language ("Your OpenAI API key got committed to git history. Anyone who pulls this repo can use your account.")
2. Show the fix steps (revoke the key, regenerate, add to `.env`, run `gitleaks detect --redact` to confirm)
3. Wait for the user to confirm done, or skip
4. Re-run that layer to verify the fix

Don't bulk-fix; the user needs to understand each issue. If there are >10 blocking findings, group by code (e.g., "5 dependency CVEs — fix together by running `npm audit fix`?") but still let the user confirm.

#### Layer 3 — Technical detail (on request)

The full JSON report from `scripts/report.mjs`. The agent should be able to answer "show me the raw output for SECRETS" by pasting that section of the JSON.

### Step 7 — Report results to VVibe (optional)

If the user has connected an agent via MCP, the agent calls the MCP tool:

```
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

This populates the creator's dashboard at `/dashboard/sentry-scans`. The MCP tool returns a URL the creator can visit. The full report (with all findings) goes via REST POST to `${VVIBE_API_HOST}/api/health-scans/reports` if an API key is set; otherwise the dashboard sees only the summary.

See `references/health-check-contract.md` for the full payload schema.

### Step 8 — Weekly auto-scan (if user picked ⏰)

Wire a recurring scan into the user's CI. See `references/ci-setup-guide.md` for the canonical setups (GitHub Actions, GitLab CI, Vercel cron). The agent should ask which CI the user is on, then write the workflow file with the right secrets reference. Do not commit on the user's behalf — generate the file, show the diff, let the user commit.

## Layer details

### SECRETS (gitleaks)

Gitleaks scans both the working tree and the full git history. The agent should run:

```bash
gitleaks detect --source <project> --report-format json --report-path /tmp/gitleaks.json --exit-code 0
```

`--exit-code 0` means gitleaks doesn't kill the orchestrator on findings; `report.mjs` parses the JSON and decides severity.

**Severity mapping**:

- Any committed token matching a known live-credential pattern (`pcs_live_`, `sk-`, `AKIA`, `ghp_`, GitHub OAuth, GCP service account JSON) → **CRITICAL**
- Test-credential or dev-only token patterns (`pcs_test_`, OpenAI `sk-test-`, fake AWS) → **WARNING**
- Non-credential matches caught by gitleaks (e.g., generic high-entropy strings) → **INFO**

A custom rule file at `scripts/gitleaks-rules.toml` adds VVibe-specific patterns (`VVIBE_API_KEY=...`, `pcs_(live|test)_*`). The orchestrator passes `--config` automatically.

**Don't tell the user "rotate the key" without telling them which key.** Always include the finding's file + line + masked value (first 4 + last 4 chars only).

### DEPS (osv-scanner + npm audit)

Two tools, deduplicated:

```bash
osv-scanner --json --lockfile <project>/package-lock.json > /tmp/osv.json
cd <project> && npm audit --json > /tmp/npm-audit.json
```

osv-scanner is the canonical source (Google's OSV database covers more ecosystems and is faster to update). `npm audit` is a cross-check — sometimes catches things osv-scanner misses for npm-internal advisories.

**Severity mapping**:

- Known-exploited vulnerabilities (CISA KEV list, or osv-scanner's `severity: CRITICAL`) → **CRITICAL**
- High severity CVEs not in KEV → **WARNING**
- Medium / low severity → **INFO**

Always include the upgrade path in the finding: `axios 0.27.2 → 1.7.7 fixes CVE-2024-XXXXX`. `npm audit fix` handles most cases; `npm audit fix --force` only when the user accepts a major version bump.

### SAST (semgrep)

Three rule packs cover the bulk of web-app issues:

```bash
semgrep --config p/owasp-top-ten --config p/javascript --config p/typescript \
        --json --output /tmp/semgrep.json --no-error --quiet <project>
```

Severity comes from semgrep itself (`ERROR` → CRITICAL, `WARNING` → WARNING, `INFO` → INFO).

**False positives are normal.** Semgrep flags a lot. The agent should:

1. Read each finding's `extra.message` for context
2. Filter out test files (`*.test.*`, `__tests__/`) unless the user opts in to test-file scanning
3. When a finding looks like a false positive (e.g., `eval()` in a sandboxed REPL), call it out in Layer 2 and let the user mark it acknowledged

### VVIBE (sentry-internal checks)

Small layer — currently ~5 checks. See `scripts/check_vvibe_integration.mjs`:

| Code | Check | Severity if failing |
|---|---|---|
| `VVIBE-001` | `VVIBE_API_KEY` read from env, never hardcoded | CRITICAL |
| `VVIBE-002` | Member-sync calls include `Idempotency-Key` header | WARNING |
| `VVIBE-003` | Email-skill sends respect `unsubscribed_at` filter | CRITICAL |
| `VVIBE-004` | Analytics event payloads don't include raw email / phone | WARNING |
| `VVIBE-005` | `vibe_heartbeat` MCP call wired (so dashboard knows agent is alive) | INFO |

This layer only fires on files that look like they call VVibe — the script greps for `vvibe.ai` / `VVIBE_API_` / `@vvibe/` imports first and skips projects that don't integrate. A non-VVibe project still gets the other 3 layers.

## Provider configuration

The reporting endpoint defaults to `https://vvibe.ai/api/health-scans/reports`. Override via `VVIBE_API_HOST` (honoured by `scripts/report.mjs`). See [PROVIDER.md](../../PROVIDER.md) at the repo root.

## CI integration

Run sentry on every PR and on a weekly cron. See `references/ci-setup-guide.md` for the GitHub Actions / GitLab CI / Vercel cron recipes.

## Fix patterns

When the agent helps the user fix a finding, follow the patterns in `references/fix-explanations.md`. Don't paste raw scanner output at the user — translate to plain language first.

## Common false positives

Known noisy patterns and how to suppress them safely: see `references/common-pitfalls.md`.
