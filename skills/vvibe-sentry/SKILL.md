---
name: vvibe-sentry
version: 0.3.0
manifest_version: 1
description: Run a pre-deploy security and reliability audit on a VVibe creator's codebase end-to-end — orchestrate gitleaks / osv-scanner / semgrep / VVibe-internal checks, present a plain-language summary, and (optionally) report results back to the VVibe dashboard via REST or the Vibe MCP. Trigger when the user mentions VVibe sentry scan, security audit, pre-deploy check, secret leak, dependency CVE, vulnerability scan, code-pattern check, wants to verify the codebase is safe to go live, or asks to push a health-check report to the VVibe dashboard.

---

# VVibe Sentry Skill — Routing

This file is a router. It decides **which** sentry workflow the human user
needs, then directs you to a single deep-dive in `references/`.

When you load this skill: read this whole file, run the capability checks in
§2, pick a mode using §3 / §4, then **Read the matching `references/*.md`**.
Do not read every reference upfront.

## 1. What this skill does

Sentry **orchestrates established OSS scanners** (gitleaks, osv-scanner,
semgrep) + thin VVibe-specific checks, normalises their output, and
presents a plain-language report. Designed for non-engineers using vibe
coding tools who want to ship with confidence: lead with the summary,
show technical detail only when the user drills in.

Three reporting modes — pick exactly one. The **scan is identical** across
modes; what differs is where the results land:

- **local-scan-only** — present in chat, no upload. Zero integration.
- **report-via-rest** — POST to `${VVIBE_API_HOST}/api/health-scans/reports`. Needs `VVIBE_API_KEY`.
- **report-via-mcp** — call `vibe_report_health_check` via the Vibe MCP. Needs MCP connection.

Out of scope: line-by-line fixing (Layer 2 fix workflow lives in
`references/fix-explanations.md`), scanner maintenance (those are OSS),
ad-hoc tool subsets (use the underlying CLIs directly).

## 2. Capability checklist (run BEFORE asking the user anything)

Detect from the project. Don't ask if you can find out.

| Capability | How to detect | Used by |
|---|---|---|
| `has_project` | A directory with `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, or similar — and a tree of source files. | all three modes |
| `has_git` | `.git/` exists at project root. | all three modes (gitleaks history coverage) |
| `has_lockfile` | Any of `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `requirements.txt`, `go.sum`, `Cargo.lock`, `Gemfile.lock`, `composer.lock`. | dependency layer relevance |
| `has_api_key_local` | `VVIBE_API_KEY` in `.env*` or framework env. | report-via-rest, REST fallback inside report-via-mcp |
| `vibe_mcp_connected` | `vibe_*` tools registered on this session (look for `vibe_report_health_check`). | report-via-mcp |
| `has_github_origin` | `git remote -v` shows a `github.com` origin AND `gh` CLI is authenticated. | tier-1 GitHub augmentation (any mode) |

After detection, tell the user briefly what you found. If detection is
impossible (closed-source repo, thin context): ask one yes/no per missing
capability, defaulting to *assume missing* — over-routing to
`local-scan-only` is safer than claiming integration that doesn't work.

## 3. Modes

```yaml
modes:
  local-scan-only:
    status: available
    when: >
      Zero VVibe integration. One-off audit, pre-launch sanity check, or
      code-review handoff. No API key, no MCP. Always works.
    triggers: ["scan my project", "security audit", "pre-deploy check", "is this safe to ship", "I don't have a VVibe account", "just show me what's wrong"]
    requires: [has_project]
    load: references/local-scan-only.md

  report-via-rest:
    status: available
    when: >
      Has `VVIBE_API_KEY`; wants scan summary on the VVibe dashboard via
      the REST API. CI-friendly (deterministic, scriptable). Canonical
      fallback when MCP is intermittent.
    triggers: ["push to VVibe dashboard", "upload health check", "report scan to VVibe", "wire sentry into CI", "API key for sentry reporting"]
    requires: [has_project, has_api_key_local]
    load: references/report-via-rest.md

  report-via-mcp:
    status: available
    when: >
      Agent connected to the creator's Vibe MCP (typical for hosted creators
      onboarded via vvibe.ai). MCP handles auth, dedup, and dashboard
      rendering natively. Preferred default for managed creators. Falls back
      to REST or local on MCP failure (see mode reference).
    triggers: ["send scan to dashboard", "vibe_report_health_check", "report via MCP", "show my scan on the dashboard"]
    requires: [has_project, vibe_mcp_connected]
    load: references/report-via-mcp.md
```

## 4. Recipes (common combos)

```yaml
recipes:
  one-shot-audit:
    description: "Pre-launch or code-review audit. Local only."
    load_in_order: [local-scan-only]

  hosted-creator:
    description: "Default for hosted creators. MCP-primary, REST-fallback."
    load_in_order: [report-via-mcp]
    optional: [report-via-rest]

  ci-automation:
    description: "Weekly auto-scan in CI. See references/ci-setup-guide.md."
    load_in_order: [local-scan-only]
    optional: [report-via-rest]

  production-launch:
    description: "Scan + REST (audit trail) + MCP (live dashboard)."
    load_in_order: [report-via-mcp, report-via-rest]
```

Recipe defaults — match the user's phrase first, then fall back by
capability:

- "set up sentry properly" / "wire sentry up" → `hosted-creator` if `vibe_mcp_connected`, else `report-via-rest` if `has_api_key_local`, else `one-shot-audit`.
- "weekly scan" / "schedule" / "CI" / "GitHub Actions" → `ci-automation`.
- "fastest" / "no account" / "just check" → `one-shot-audit`.

Always name the recipe back to the user before running it.

## 5. Disambiguators

```yaml
disambiguators:
  - signal: ["report to VVibe", "push to dashboard", "send results", "upload scan", "set up sentry reporting"]
    scope: >
      This question is ONLY about WHERE results land (modes A/B/C are
      mutually exclusive). The choice of *what to scan* (4 layers) and
      *which standard* (pre-launch / routine / gold / report-only) is
      orthogonal — every mode runs the same scan.
    ask: >
      VVibe Sentry can run the audit and either keep results in chat or
      push them to your VVibe dashboard. Three options:

      - **A. Local only** — I run the scan, show you the report here. No VVibe account needed. Fastest.
      - **B. Report via REST** — I run the scan and POST the report to your VVibe dashboard at `/dashboard/sentry-scans`. Needs `VVIBE_API_KEY` set in your env. CI-friendly.
      - **C. Report via MCP** — I run the scan and call the Vibe MCP `vibe_report_health_check` tool so the dashboard updates immediately. Needs your agent connected to the Vibe MCP.

      Which fits your setup?
    map:
      "A|local|chat|no account": local-scan-only
      "B|REST|API key|CI": report-via-rest
      "C|MCP|dashboard|vibe_report": report-via-mcp
    tiebreaker: >
      If `vibe_mcp_connected = true`, mention C first and explain "you almost
      certainly want C since your agent is already wired to the Vibe MCP."
      If `has_api_key_local = true` but no MCP, mention B first.
      Otherwise lead with A.
```

**Tiebreaker rule.** If the user's phrase matches a §3 trigger directly
(e.g. "run sentry via MCP"), route there and skip §5.

## 6. Cross-cutting facts (apply to ALL modes)

**The 4 scan layers (run by every mode).** Each layer is one OSS scanner +
glue.

| Code | Layer | Tool | What it catches |
|---|---|---|---|
| **SECRETS** | Secret leakage | [gitleaks](https://github.com/gitleaks/gitleaks) | Committed API keys, AWS / GCP credentials, `.env` leaks, `pcs_live_*` / `VVIBE_API_KEY` tokens, GitHub tokens, OpenAI keys |
| **DEPS** | Dependency CVEs | [osv-scanner](https://github.com/google/osv-scanner) + `npm audit` | Known vulnerabilities in installed packages including transitive deps |
| **SAST** | Static analysis | [semgrep](https://semgrep.dev/) with `p/owasp-top-ten` + `p/javascript` + `p/typescript` | SQL injection, XSS, SSRF, hardcoded secrets, missing auth, unsafe `eval`, weak crypto, open redirects |
| **VVIBE** | Integration hygiene | sentry-internal scripts | API key read from env, member sync uses idempotency keys, email respects opt-out, analytics scripts don't include PII |

See `references/scanning-execution.md` for the tier cascade, layer status
states, GitHub augmentation, project-relevance gating, coverage gate, and
install hints. **All three modes use the same scanning manual.**

**Severity model.** Every finding is one of:

- 🔴 **CRITICAL** — exploitable now or imminent (committed prod token, `eval(userInput)`, known-exploited CVE)
- 🟡 **WARNING** — exploitable under realistic conditions (CVE without known exploit, missing CSRF on state-changing route, outdated TLS)
- 🔵 **INFO** — best-practice gap that is not directly exploitable (missing CSP header, outdated dep without known CVE)

The agent presents the same set of findings every time; what changes
between standards is the **block-or-not threshold** the creator picked.

**Standards (orthogonal to mode — ask the user inside the chosen mode).**

| Standard | Block threshold | Fix workflow |
|---|---|---|
| 🚀 Pre-launch | CRITICAL | yes |
| 🔧 Routine | CRITICAL + WARNING | yes |
| 🏆 Gold | all (incl. INFO) | yes |
| 📄 Report only | n/a | **no** |
| ⏰ Weekly auto | n/a — schedules recurring scan; see `references/ci-setup-guide.md` |

All non-scheduled standards run the same 4 layers; the standard only changes
the pass/fail line and whether Layer 2 (fix workflow) is offered. **Advanced
— single-layer mode:** accept `--layer secrets|deps|sast|vvibe` if the user
explicitly asks; don't surface as a main option. Single-layer runs route
through whichever mode is already in play (defaulting to `local-scan-only`
if none chosen) — the layer flag narrows the scan, not the reporting path.

**API host.** Default `https://vvibe.ai`, overridable via `VVIBE_API_HOST`.
Always use `${VVIBE_API_HOST:-https://vvibe.ai}` in shell /
`process.env.VVIBE_API_HOST || 'https://vvibe.ai'` in TS — never hardcode.
Override applies to REST reporting + GitHub augmentation. See
`PROVIDER.md` at the repo root.

**Authentication.** Same `pcs_live_*` / `pcs_test_*` Bearer token as
vvibe-member and vvibe-email, **only for REST reporting**:

```http
Authorization: Bearer ${VVIBE_API_KEY}
```

The Vibe MCP uses its own Bearer token; do **not** pass `VVIBE_API_KEY`
to MCP calls.

**Don't pre-flight scanner availability.** The orchestrator (`report.mjs`)
runs detection itself and picks the best available source per layer. The
agent's job is to invoke the orchestrator and explain the resulting tier
to the user — not to second-guess by `which gitleaks` / `docker ps`.

## 7. Output preferences (apply to ALL modes)

**Pre-scan intro — show this BEFORE asking which mode / standard.** First-time
users have no idea what "SECRETS" or "DEPS" means until you explain it. Use
this template verbatim:

```
VVibe Sentry runs four layers of checks against your codebase:

🔐 Secrets       — did anything sensitive get committed to git? (gitleaks)
📦 Dependencies  — do any installed packages have known vulnerabilities? (osv-scanner)
🛡️  Code patterns — common security anti-patterns in your source. (semgrep)
🪢 VVibe         — is your VVibe integration following safe patterns?

Findings come out as CRITICAL / WARNING / INFO. I'll show you a plain-
language summary first; you can dive into details from there.
```

Then proceed to the §5 disambiguator (which reporting mode) and, inside
the chosen mode reference, the "which standard" prompt.

Translate this template to match the user's language. Preserve the emoji
glyphs, layer codes (SECRETS / DEPS / SAST / VVIBE), and the
CRITICAL / WARNING / INFO severity labels verbatim — receivers and the
dashboard depend on them.

**Presentation rules:**

- Lead with the plain-language Layer 1 summary; only show Layer 2 / 3
  detail when the user drills in or there are blocking findings.
- Use the severity colour codes (🔴 / 🟡 / 🔵) consistently — they're the
  user's primary signal.
- For each blocking finding in Layer 2, walk the user through ONE finding
  at a time. Don't bulk-fix.
- For a SECRETS finding: **never** say "rotate the key" without naming
  which key (mask the value first 4 + last 4 chars).
- For a DEPS finding: always include the upgrade path
  (e.g. `axios 0.27.2 → 1.7.7 fixes CVE-2024-XXXXX`).
- For a SAST finding: filter `*.test.*` / `__tests__/` by default unless
  the user opts in to test-file scanning.
- Keep secrets out of chat (mask them). Tell the user how to set env vars
  rather than pasting values back.
- Never auto-commit the generated CodeQL workflow file — show the diff,
  let the user commit.

## 8. Reference documents

| File | Contains | Load when |
|---|---|---|
| `references/local-scan-only.md` | Mode A: scan + present locally. 4-step workflow + pitfalls. | mode = local-scan-only |
| `references/report-via-rest.md` | Mode B: scan + REST POST. Error handling (401 / 429 / 5xx / offline), retries. | mode = report-via-rest |
| `references/report-via-mcp.md` | Mode C: scan + MCP tool call. Top-50 truncation, fallback ladder. | mode = report-via-mcp |
| `references/scanning-execution.md` | Shared. `report.mjs` invocation, tier cascade, layer status, GitHub augmentation, coverage gate, per-layer details. | every mode, scan step |
| `references/health-check-contract.md` | Shared. REST + MCP payload schema. | report-via-rest, report-via-mcp |
| `references/fix-explanations.md` | Shared. Plain-language Layer 2 fix patterns. | any mode, when blocking findings exist |
| `references/common-pitfalls.md` | Shared. False-positive patterns + safe suppression. | when Semgrep / gitleaks flag a contested finding |
| `references/ci-setup-guide.md` | Shared. GitHub Actions / GitLab CI / Vercel cron recipes. | recipe = ci-automation, or "⏰ Weekly auto" standard |
