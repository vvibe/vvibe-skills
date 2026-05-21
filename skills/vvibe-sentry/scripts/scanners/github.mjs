/**
 * GitHub Code Scanning integration — tier-1 augmentation across all layers.
 *
 * When a project is hosted on GitHub and the user has `gh` CLI installed +
 * authenticated, sentry reads the alerts GitHub already produces server-side
 * and merges them into the local report. The user gains comprehensive
 * coverage without installing scanners or running Docker.
 *
 * Three feeds:
 *   - /secret-scanning/alerts → SECRETS layer
 *   - /dependabot/alerts       → DEPS layer
 *   - /code-scanning/alerts    → SAST layer (CodeQL or third-party uploaders)
 *
 * Auth model: this module only READS. Enabling features (Dependabot, secret
 * scanning) is a settings change with security implications and we leave
 * that to the agent's conversation with the user.
 *
 * Failure model: any error degrades to "no GitHub data". We never block the
 * local report on GitHub availability.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Detect whether this is a GitHub-hosted repo. Reads `.git/config` directly
 * to avoid spawning `git` if we don't need to. Returns null if not GitHub
 * or if no remote is configured.
 *
 * GitHub Enterprise (`github.mycompany.com`) is intentionally NOT matched —
 * the gh CLI auth model and API surface differ enough that supporting GHE
 * needs its own pass. GHE users see `github.used: false, reason: "not a
 * github.com remote"`. To add GHE support later, accept any host that
 * `gh auth status` reports as authenticated.
 */
export function detectGithubRepo(projectDir) {
  const gitConfig = join(projectDir, '.git', 'config')
  if (!existsSync(gitConfig)) return null
  let content
  try {
    content = readFileSync(gitConfig, 'utf8')
  } catch {
    return null
  }
  // Match any GitHub URL: ssh (git@github.com:owner/repo) or https
  // (https://github.com/owner/repo[.git]). Whole-host match avoids
  // false-positives on suffixes like `not-github.com`.
  const sshMatch = content.match(/git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/m)
  const httpsMatch = content.match(/https:\/\/[\w-]*@?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\s|$)/m)
  const m = sshMatch || httpsMatch
  if (!m) {
    // Detect GHE-style hosts so we can return a more specific reason to
    // the user instead of a misleading "not a GitHub repo".
    if (/git@[\w.-]*github[\w.-]*:|https:\/\/[\w.-]*github[\w.-]*\//.test(content)) {
      return { isGheOrLike: true, host: null }
    }
    return null
  }
  return { owner: m[1], repo: m[2], host: 'github.com' }
}

/**
 * Check if `gh` is installed and authenticated. Returns a status object the
 * caller can surface to the user — e.g. tell them to run `gh auth login` if
 * the CLI exists but isn't logged in.
 */
export function ghStatus() {
  const present = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['gh'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  }).status === 0
  if (!present) return { usable: false, reason: 'gh CLI not installed', installHint: ghInstallHint() }

  // `gh auth status` exits 0 only if at least one host is authenticated.
  const auth = spawnSync('gh', ['auth', 'status'], { stdio: ['ignore', 'ignore', 'ignore'] })
  if (auth.status !== 0) {
    return { usable: false, reason: 'gh CLI not authenticated — run `gh auth login`', installHint: null }
  }
  return { usable: true, reason: null, installHint: null }
}

function ghInstallHint() {
  if (process.platform === 'darwin') return 'brew install gh'
  if (process.platform === 'win32') return 'winget install --id GitHub.cli'
  return 'See https://cli.github.com/manual/installation'
}

/**
 * Fetch alerts from all three GitHub endpoints and normalize into per-layer
 * finding arrays. Returns null if anything fundamental fails (e.g. repo
 * not accessible). Per-endpoint failures (e.g. Dependabot disabled) degrade
 * to empty arrays for that layer with a `disabled` flag.
 *
 * Shape:
 *   {
 *     secretsFindings: [...],
 *     depsFindings: [...],
 *     sastFindings: [...],
 *     status: { secrets: 'ok'|'disabled'|'forbidden', deps: ..., sast: ... }
 *   }
 */
export async function fetchGithubAlerts(repo) {
  const out = {
    secretsFindings: [],
    depsFindings: [],
    sastFindings: [],
    status: { secrets: 'unknown', deps: 'unknown', sast: 'unknown' },
  }

  // Each endpoint is independent — we don't want one disabled feature to
  // shadow the other two.
  await Promise.all([
    fetchSecretScanning(repo).then((r) => {
      out.secretsFindings = r.findings
      out.status.secrets = r.state
    }),
    fetchDependabot(repo).then((r) => {
      out.depsFindings = r.findings
      out.status.deps = r.state
    }),
    fetchCodeScanning(repo).then((r) => {
      out.sastFindings = r.findings
      out.status.sast = r.state
    }),
  ])

  return out
}

async function ghApi(path) {
  // `gh api` handles auth, pagination (with --paginate), and returns JSON.
  // We pull up to 100 alerts per endpoint — sufficient for the report's
  // top-N use case and avoids unbounded calls on huge repos.
  const r = spawnSync('gh', ['api', '--method', 'GET', `${path}?per_page=100&state=open`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  // gh returns 0 for success. Common non-zero cases:
  //   - HTTP 404: feature disabled (e.g. Dependabot off, repo not private-eligible)
  //   - HTTP 403: forbidden (insufficient scope, or feature requires GHAS)
  //   - HTTP 401: not authenticated
  if (r.status !== 0) {
    const stderr = r.stderr ?? ''
    if (/HTTP 404|Not Found/.test(stderr)) return { state: 'disabled', data: [] }
    if (/HTTP 403|Forbidden|HTTP 401/.test(stderr)) return { state: 'forbidden', data: [] }
    return { state: 'error', data: [], error: stderr.slice(0, 200) }
  }
  try {
    return { state: 'ok', data: JSON.parse(r.stdout) }
  } catch {
    return { state: 'error', data: [], error: 'invalid JSON' }
  }
}

async function fetchSecretScanning({ owner, repo }) {
  const { state, data } = await ghApi(`/repos/${owner}/${repo}/secret-scanning/alerts`)
  if (state !== 'ok') return { findings: [], state }
  const findings = (data ?? []).map((a) => ({
    id: `gh-secret-${a.number}`,
    severity: 'CRITICAL',
    description: `${a.secret_type_display_name ?? a.secret_type ?? 'Secret'} committed to repo`,
    file: a.locations_url ? '(see GitHub alert)' : null,
    line: null,
    masked: a.secret ? mask(a.secret) : null,
    url: a.html_url,
    state: a.state,
  }))
  return { findings, state }
}

async function fetchDependabot({ owner, repo }) {
  const { state, data } = await ghApi(`/repos/${owner}/${repo}/dependabot/alerts`)
  if (state !== 'ok') return { findings: [], state }
  const findings = (data ?? []).map((a) => ({
    id: a.security_advisory?.ghsa_id ?? `gh-dependabot-${a.number}`,
    severity: mapGhSeverity(a.security_advisory?.severity ?? a.security_vulnerability?.severity),
    summary: a.security_advisory?.summary ?? a.security_advisory?.cve_id ?? 'Dependabot alert',
    package: a.dependency?.package?.name ?? '(unknown)',
    version: a.security_vulnerability?.vulnerable_version_range ?? '?',
    ecosystem: a.dependency?.package?.ecosystem ?? '?',
    fix: a.security_vulnerability?.first_patched_version?.identifier
      ? `Upgrade to ${a.security_vulnerability.first_patched_version.identifier} or later.`
      : 'See advisory for upgrade guidance.',
    url: a.html_url,
  }))
  return { findings, state }
}

async function fetchCodeScanning({ owner, repo }) {
  const { state, data } = await ghApi(`/repos/${owner}/${repo}/code-scanning/alerts`)
  if (state !== 'ok') return { findings: [], state }
  const findings = (data ?? []).map((a) => ({
    id: a.rule?.id ?? `gh-code-${a.number}`,
    severity: mapGhSeverity(a.rule?.security_severity_level ?? a.rule?.severity),
    description: a.rule?.description ?? a.rule?.id ?? 'Code scanning alert',
    message: a.most_recent_instance?.message?.text ?? '',
    file: a.most_recent_instance?.location?.path ?? null,
    line: a.most_recent_instance?.location?.start_line ?? null,
    tool: a.tool?.name,
    url: a.html_url,
  }))
  return { findings, state }
}

function mapGhSeverity(s) {
  // Same banding as report.mjs's mapNpmSeverity — see comment there. The
  // contract: CRITICAL means "exploitable now or imminent" (CVSS 9.0+),
  // not just "high severity". `high` drops to WARNING for cross-source
  // consistency.
  switch ((s ?? '').toLowerCase()) {
    case 'critical': return 'CRITICAL'
    case 'high':
    case 'medium':
    case 'moderate':
    case 'error': return 'WARNING'
    case 'low':
    case 'warning':
    case 'note': return 'INFO'
    default: return 'WARNING'
  }
}

function mask(s) {
  if (!s) return s
  if (s.length <= 8) return `${s.slice(0, 1)}***${s.slice(-1)}`
  return `${s.slice(0, 4)}***${s.slice(-4)}`
}

/**
 * Generate a CodeQL workflow file the user can drop into .github/workflows/.
 * Returns the YAML content as a string — caller decides whether to write it,
 * show as a diff, or just discuss with the user. We don't write files
 * implicitly.
 */
export function generateCodeqlWorkflow({ languages = ['javascript', 'typescript'] } = {}) {
  return `# Generated by VVibe Sentry — GitHub Code Scanning (CodeQL)
# Commit this file to enable server-side SAST. No local install needed; the
# scan runs on GitHub-hosted runners. Results show up in Security > Code
# scanning, and sentry will read them on subsequent runs.

name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 06:00 UTC

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write
    strategy:
      fail-fast: false
      matrix:
        language: [${languages.map((l) => `'${l}'`).join(', ')}]
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: \${{ matrix.language }}
      - uses: github/codeql-action/analyze@v3
        with:
          category: '/language:\${{ matrix.language }}'
`
}
