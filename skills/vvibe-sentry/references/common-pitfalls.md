# Common pitfalls — false positives the agent should recognise

Sentry runs three independent OSS scanners. Each has known noisy
patterns. The agent's job is to filter these BEFORE showing the
creator a report — burying real issues under noise erodes trust.

## gitleaks

| Pattern | Why it's flagged | When to suppress |
|---|---|---|
| Example keys in `README.md` / docs | gitleaks doesn't know if a token is real | Keep `--redact` on; ignore findings inside `docs/`, `*.md`, `examples/` unless the file is in `.env*` |
| Test fixtures (`*.fixture.*`, `__fixtures__/`) | Often contain dummy tokens for tests | Add to `.gitleaksignore` once confirmed |
| `localStorage.setItem('token', '…')` | High-entropy literal looks like a key | Verify the literal is a hash / fingerprint, not a credential |
| Test credentials (`pcs_test_*`, `sk-test-*`) | Real shape but sandboxed | sentry already drops these to WARNING |

**Do NOT auto-suppress.** Always pause and ask the creator: "this looks
like a test/example, OK to ignore?" before adding to `.gitleaksignore`.
Suppressions are checked into the repo and outlive the agent session.

## osv-scanner / npm audit

| Pattern | Why it's noisy | When to suppress |
|---|---|---|
| Dev-only deps with CVEs (eslint plugins, build tools) | The CVE is in code that never reaches production | Map to INFO if the dep is in `devDependencies` AND no shipped code imports it |
| `axios` / `lodash` advisories with no fix yet | Sometimes the maintainer hasn't released a patch | Track upstream; document the mitigation; keep visible (don't suppress) |
| Transitive deps you can't directly upgrade | Pinned by a sibling dep | Use `overrides` (npm 8+) in `package.json` and re-scan |

**Do NOT run `npm audit fix --force` in CI.** It does major-version
bumps; only use it interactively after reviewing each breaking change.

## semgrep

This is the noisiest layer by far. Filters the orchestrator already
applies:

- `*.test.*` / `__tests__/` / `*.spec.*` are skipped by default
- Findings tagged as `severity: INFO` by semgrep are kept but not blocking
  (they map to sentry's INFO band)

Known-loud rules to consider muting per-project:

| Rule | Why noisy | Mitigation |
|---|---|---|
| `javascript.lang.security.detect-eval-with-expression` | False positive on `eval()` in legitimate REPL / interpreter code | Confirm with the creator; suppress per-file via `// nosemgrep` |
| `typescript.react.security.audit.react-href-var.react-href-var` | Flags any `<a href={variable}>` — common in dashboards | Verify the variable is URL-sanitised; suppress when confirmed |
| `javascript.express.security.audit.express-cors.express-cors` | Fires on broad CORS config | Tighten the config to specific origins instead of suppressing |

**Suppressing semgrep findings should be deliberate.** The `// nosemgrep:
rule.id` comment is checked into git and visible in code review. That
visibility is the point — anyone can see what was knowingly accepted.

## VVibe-layer false positives

The five VVIBE-* checks are pattern-matched, not AST-aware. Known
limitations:

- **VVIBE-001** (hardcoded API key) misses keys read from a custom env
  loader that wraps `process.env`. False negative — not a false positive.
- **VVIBE-002** (idempotency key) misses calls behind a typed wrapper
  function. If the wrapper itself sets the header, manually mark
  findings as acknowledged.
- **VVIBE-003** (email unsubscribe gate) flags any `/send` call without
  the string `unsubscribed`. If your filter uses a join / database
  predicate, add a comment like `// unsubscribed gate enforced in
  queries/emailRecipients.sql` so future scans don't re-flag.

## When to escalate vs. suppress

Rule of thumb: **the creator should know about anything CRITICAL even
if it's a false positive.** Suppressions hide context. Better to leave
a flagged CRITICAL with a `// reviewed:` comment than to suppress it
and forget why.

WARNING and INFO can be suppressed more freely once confirmed false —
they're noise unless reviewed.
