# Scanning execution

## Purpose

This is the canonical "how to run a sentry scan" reference. It describes
exactly what happens when `report.mjs` runs: tier detection, GitHub
augmentation, project-relevance gating, the coverage gate, install hints,
and what each of the four scan layers actually checks. All three sentry
modes share this scan — the only thing that changes per mode is what gets
done with the resulting JSON afterward. When you need to know how a layer
behaves or how to interpret a status, look here.

## Invocation

```bash
node scripts/report.mjs --dir <path> --standard <pre-launch|routine|gold|report-only>
```

Add `--json` to suppress the Markdown layer and emit JSON only (CI-friendly).

**The orchestrator handles ALL tier detection — DO NOT pre-flight scanner
availability with shell commands first.** Quoting the behavioral contract
verbatim: "Do not pre-flight scanner availability with shell commands
before invoking `report.mjs`. The orchestrator runs detection itself and
picks the best available source per layer. The agent's job is to invoke
the orchestrator and explain the resulting tier to the user — not to
second-guess."

Other flags worth knowing:

- `--layer <secrets|deps|sast|vvibe>` — run a single layer (advanced; only
  surface this if the user explicitly asks for one layer)
- `--allow-skipped` — ship-anyway escape hatch; lets `pre-launch` / `gold`
  pass even when a relevant layer couldn't run
- `--no-docker` — opt out of Docker fallback (testing / air-gapped)
- `--no-github` — opt out of GitHub server-side augmentation
- `--no-color` — disable ANSI colour
- `--report-to-vvibe` — POST the summary to `VVIBE_API_HOST` (used by REST mode)

## Tier cascade

Each layer has a cascade of sources, prioritized by user cost. Cheaper to
the user wins when the rule set matches:

| Tier | Source | Coverage | User cost | Use case |
|---|---|---|---|---|
| **2 (canonical)** | Native binary (`gitleaks`/`osv-scanner`/`semgrep`) | Full | High (install) | Dedicated security-conscious teams |
| **2 (Docker)** | Pinned Docker image | Full | High (4 GB Docker Desktop) | Already-Docker shops |
| **1 (GitHub)** | `gh api` reading Secret Scanning + Dependabot + Code Scanning | Near-full (server-side) | 1-click setup | GitHub-hosted repos |
| **0 (built-in)** | Pure-Node scanners shipped with the skill (regex, OSV.dev HTTP) | Partial | **Zero** | Default for everyone |

Tier 0 is **always available** (no install, no Docker, no network beyond
OSV.dev). Tier 1 augments on top when `gh` CLI is installed + authenticated
AND the repo is on GitHub. Tier 2 replaces tier 0 when the canonical tool
is detected on PATH or in Docker.

**Pinned Docker images** (tier-2 Docker variant):

| Tool | Image |
|---|---|
| gitleaks | `zricethezav/gitleaks:latest` |
| osv-scanner | `ghcr.io/google/osv-scanner:latest` |
| semgrep | `semgrep/semgrep:latest` |

First Docker run pulls the image (~50–500 MB). The orchestrator prints
`📦 First-time pull: <image>` to stderr before pulling so the user
understands the wait.

## Layer status — five states

Each layer's `status` field in the report is one of these. The agent must
explain them differently:

| Status | Meaning | What the agent should say |
|---|---|---|
| `ok` | Tier-2 canonical scanner ran → full coverage | Normal — show the count |
| `ok-tier0` | Only built-in / OSV API fallback ran → partial coverage | "Scanned with built-in rules. For deeper coverage, install \<tool\> or enable Docker." |
| `n/a` | Layer doesn't apply to this project (e.g. DEPS on a no-lockfile site) | "Not applicable — nothing to scan" |
| `skipped` | Layer is relevant but no source could run (rare — only for unparseable lockfiles like Cargo.lock without osv-scanner) | "I couldn't scan this layer — \<install hint surfaces here\>" |
| `error` | A scanner was invoked but crashed | Surface the stderr; do not retry blindly |

## GitHub augmentation

GitHub augmentation runs **in addition to** the local tiers and is reported
separately in `report.github`:

- `used: bool` — whether augmentation ran
- `repo: { owner, repo }` — only present if `used` is true
- `layerStatus: { secrets, deps, sast }` — each one of `ok | disabled | forbidden | error`
  - `disabled` → the feature is off on the repo. Offer to enable Dependabot
    or Secret Scanning. For SAST, the agent may generate a CodeQL workflow
    (see below).
  - `forbidden` → the `gh` token lacks the scope. Suggest
    `gh auth refresh -s security_events`.

When SAST is `disabled`, the agent MAY call `generateCodeqlWorkflow()`
exported from `scripts/scanners/github.mjs` and offer to write
`.github/workflows/codeql.yml`. **Do not auto-commit** — show the diff,
let the user commit.

## Project relevance gating

`report.relevance` tells the receiver which layers were attempted at all,
and why:

- `git: bool` — without `.git`, gitleaks runs with `--no-git` (working-tree
  only, no history coverage). Built-in tier-0 SECRETS is always
  working-tree-only.
- `lockfiles: { npm, pnpm, yarn, bun, python, go, rust, ruby, php }` —
  which ecosystems are detected.
- `depsRelevant: bool` — at least one manifest or lockfile is present.
- `sastRelevant: bool` — at least one source-tree marker exists (`src/`,
  `app/`, `main.py`, etc.).

A layer that isn't relevant gets `status: 'n/a'`, not `skipped`.

## Coverage gate

`report.coverage` is distinct from `report.passes`. Coverage tracks whether
layers ran at all; `passes` tracks whether they found blocking issues.

- `pre-launch` and `gold` standards **fail with exit 1** when any layer is
  `skipped` (banner: `🔴 INCOMPLETE — N layers couldn't run; cannot
  certify`). Reasoning: shipping with unknown coverage is worse than
  acknowledging the gap.
- `routine` and `report-only` warn but pass.
- `--allow-skipped` is the ship-anyway escape hatch for CI users who
  knowingly accept the gap.

## Install hints

When a layer ends up `skipped`, the report carries
`installHint: { command, note, platform }`. The agent should surface
`command` **verbatim** — these IDs are verified:

- `Gitleaks.Gitleaks`
- `Google.OSVScanner`
- `brew install ...`
- `pipx install semgrep`

If `command` is null and `note` mentions Docker, the platform has no native
install path (e.g. semgrep on Windows). Prefer tier-0 + Docker over
recommending WSL.

## Layer details

### SECRETS (gitleaks)

Gitleaks scans both the working tree and the full git history (when `.git`
is present). The orchestrator invokes:

```bash
gitleaks detect --source <project> --report-format json --report-path /tmp/gitleaks.json --exit-code 0
```

`--exit-code 0` means gitleaks doesn't kill the orchestrator on findings;
`report.mjs` parses the JSON and decides severity.

**Severity mapping:**

- Any committed token matching a known live-credential pattern (`pcs_live_`,
  `sk-`, `AKIA`, `ghp_`, GitHub OAuth, GCP service account JSON) → **CRITICAL**
- Test-credential or dev-only token patterns (`pcs_test_`, OpenAI
  `sk-test-`, fake AWS) → **WARNING**
- Non-credential matches caught by gitleaks (e.g. generic high-entropy
  strings) → **INFO**

A custom rule file at `scripts/gitleaks-rules.toml` adds VVibe-specific
patterns (`VVIBE_API_KEY=...`, `pcs_(live|test)_*`). The orchestrator
passes `--config` automatically.

**Don't tell the user "rotate the key" without telling them which key.**
Always include the finding's file + line + masked value (first 4 + last 4
chars only).

### DEPS (osv-scanner + npm audit)

Two tools, deduplicated:

```bash
osv-scanner --json --lockfile <project>/package-lock.json > /tmp/osv.json
cd <project> && npm audit --json > /tmp/npm-audit.json
```

osv-scanner is the canonical source (Google's OSV database covers more
ecosystems and is faster to update). `npm audit` is a cross-check —
sometimes catches things osv-scanner misses for npm-internal advisories.

**Severity mapping:**

- Known-exploited vulnerabilities (CISA KEV list, or osv-scanner's
  `severity: CRITICAL`) → **CRITICAL**
- High severity CVEs not in KEV → **WARNING**
- Medium / low severity → **INFO**

Always include the upgrade path in the finding:
`axios 0.27.2 → 1.7.7 fixes CVE-2024-XXXXX`. `npm audit fix` handles most
cases; `npm audit fix --force` only when the user accepts a major version
bump.

### SAST (semgrep)

Three rule packs cover the bulk of web-app issues:

```bash
semgrep --config p/owasp-top-ten --config p/javascript --config p/typescript \
        --json --output /tmp/semgrep.json --no-error --quiet <project>
```

Severity comes from semgrep itself (`ERROR` → CRITICAL, `WARNING` →
WARNING, `INFO` → INFO).

**False positives are normal.** Semgrep flags a lot. The agent should:

1. Read each finding's `extra.message` for context.
2. Filter out test files (`*.test.*`, `__tests__/`) by default unless the
   user opts in to test-file scanning.
3. When a finding looks like a false positive (e.g. `eval()` in a
   sandboxed REPL), call it out and let the user mark it acknowledged.

### VVIBE (sentry-internal checks)

Small layer — currently 5 checks. See `scripts/check_vvibe_integration.mjs`:

| Code | Check | Severity if failing |
|---|---|---|
| `VVIBE-001` | `VVIBE_API_KEY` read from env, never hardcoded | CRITICAL |
| `VVIBE-002` | Member-sync calls include `Idempotency-Key` header | WARNING |
| `VVIBE-003` | Email-skill sends respect `unsubscribed_at` filter | CRITICAL |
| `VVIBE-004` | Analytics event payloads don't include raw email / phone | WARNING |
| `VVIBE-005` | `vibe_heartbeat` MCP call wired (so dashboard knows agent is alive) | INFO |

This layer only fires on files that look like they call VVibe — the
script greps for `vvibe.ai` / `VVIBE_API_` / `@vvibe/` imports first and
skips projects that don't integrate. A non-VVibe project still gets the
other three layers.

## JSON output shape

`report.mjs` emits a single report object containing:

- **Per-layer normalized findings** — every finding is shaped as
  `{ code, severity, title, file, line, fix }`.
- **Overall** — `{ schemaVersion, projectDir, standard, score, band,
  passes, blockThreshold, counts, byLayer, relevance, coverage, github,
  layers, ranAt }`.
- **Findings array** — full and untruncated. Modes that upload to a
  remote receiver truncate themselves before posting.

This object is the input to every mode's reporting step. For the payload
shape that the REST endpoint and the `vibe_report_health_check` MCP tool
expect (which wraps a **subset** of this output), see
[`health-check-contract.md`](./health-check-contract.md).
