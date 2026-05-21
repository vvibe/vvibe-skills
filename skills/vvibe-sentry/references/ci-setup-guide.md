# CI setup — running sentry on every PR + weekly

VVibe Sentry is designed to run unattended in CI. The orchestrator
(`scripts/report.mjs`) exits non-zero when findings exceed the chosen
standard's block threshold, so the CI job fails accordingly.

The recipes below assume the project has cloned `vvibe/vvibe-skills`
as a sibling (most projects install via `npx skills add` which puts
the skill under `.claude/skills/vvibe-sentry/`).

## GitHub Actions

`.github/workflows/sentry.yml`:

```yaml
name: VVibe Sentry

on:
  pull_request:
  schedule:
    # Weekly Mondays 08:00 UTC. Tune to your timezone.
    - cron: '0 8 * * 1'

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # gitleaks needs history to scan past commits
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'

      - name: Install scanners
        run: |
          # gitleaks — release binary
          curl -sSfL https://github.com/gitleaks/gitleaks/releases/download/v8.21.0/gitleaks_8.21.0_linux_x64.tar.gz \
            | tar -xz -C /tmp gitleaks
          sudo mv /tmp/gitleaks /usr/local/bin/gitleaks

          # osv-scanner — go install
          go install github.com/google/osv-scanner/cmd/osv-scanner@latest
          echo "$(go env GOPATH)/bin" >> "$GITHUB_PATH"

          # semgrep
          pip install --user semgrep

      - name: Install project deps
        run: npm ci

      - name: Run sentry
        env:
          VVIBE_API_KEY: ${{ secrets.VVIBE_API_KEY }}
        run: |
          # Adjust path if you installed the skill elsewhere
          node .claude/skills/vvibe-sentry/scripts/report.mjs \
            --dir . \
            --standard pre-launch \
            --report-to-vvibe
```

**Notes:**

- The `--report-to-vvibe` flag posts the summary to your VVibe
  dashboard. Drop it for an offline-only run.
- `VVIBE_API_KEY` should be a `pcs_test_*` key for PRs from forks (so
  forked CI doesn't see prod data) or `pcs_live_*` for trunk runs.
- Use `--standard routine` on `main` if you want WARNING-level findings
  to block merge as well.

## GitLab CI

`.gitlab-ci.yml`:

```yaml
sentry:
  image: node:20-bullseye
  before_script:
    - apt-get update -qq && apt-get install -y -qq python3-pip golang
    - curl -sSfL https://github.com/gitleaks/gitleaks/releases/download/v8.21.0/gitleaks_8.21.0_linux_x64.tar.gz | tar -xz -C /usr/local/bin gitleaks
    - go install github.com/google/osv-scanner/cmd/osv-scanner@latest
    - export PATH="$PATH:$(go env GOPATH)/bin"
    - pip3 install semgrep
    - npm ci
  script:
    - node .claude/skills/vvibe-sentry/scripts/report.mjs --dir . --standard pre-launch --report-to-vvibe
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_PIPELINE_SOURCE == "schedule"
```

## Vercel cron (weekly only — Vercel runs in a sandbox, can't install gitleaks)

Vercel's runtime doesn't have a writable system for installing Go
binaries. If you're on Vercel, prefer running sentry from GitHub
Actions and pointing it at the same `VVIBE_API_KEY`. Vercel cron is
fine for *triggering* a remote run, but not for executing the scan
itself.

## Self-hosted runners

The recipes above work on any Linux runner with internet access (the
scanners pull their rule databases on first run). For air-gapped
environments, pre-bake the binaries into a base image and pre-download
semgrep / osv-scanner rule packs before the runner goes offline.

## Reading the results

Locally:

```
node scripts/report.mjs --dir . --standard routine
```

prints a coloured summary plus the JSON report appended. In CI, prefer
`--json` and pipe it into a downstream artifact:

```bash
node scripts/report.mjs --dir . --standard pre-launch --json > sentry-report.json
```

The report is the same shape as `references/health-check-contract.md`
documents.
