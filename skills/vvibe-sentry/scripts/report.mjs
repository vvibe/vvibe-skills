#!/usr/bin/env node
/**
 * VVibe Sentry — Codebase security audit orchestrator.
 *
 * Sentry doesn't re-implement security scanners. It runs three OSS tools
 * (gitleaks, osv-scanner, semgrep), plus a small VVibe-integration layer,
 * normalises the output into one severity-graded report, and optionally
 * reports the summary to the creator's VVibe dashboard.
 *
 * Gracefully degrades — a missing tool downgrades its layer to `skipped`
 * instead of failing the whole run. That way a creator without semgrep
 * still gets secret + dependency scanning.
 *
 * Usage:
 *   node report.mjs --dir /path/to/project
 *   node report.mjs --dir . --standard pre-launch
 *   node report.mjs --dir . --layer secrets       # single layer
 *   node report.mjs --dir . --json                # machine-readable only
 *
 * Flags:
 *   --dir <path>          Project root to scan (default: cwd)
 *   --standard <name>     pre-launch (default) | routine | gold | report-only
 *                         Controls only the block threshold + whether to
 *                         offer a fix workflow. All standards run the same
 *                         scan.
 *   --layer <name>        Run a single layer: secrets|deps|sast|vvibe
 *   --json                Emit JSON only (suppress the Markdown summary)
 *   --no-color            Disable ANSI colour in stdout
 *   --report-to-vvibe     POST the summary to VVIBE_API_HOST as well
 *
 * Environment:
 *   VVIBE_API_HOST        Override the reporting endpoint base URL
 *                         (default: https://vvibe.ai)
 *   VVIBE_API_KEY         Required if --report-to-vvibe is set
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { computeHealthScore, healthBandLabel } from './computeHealthScore.mjs'
import { runVVibeIntegrationChecks } from './check_vvibe_integration.mjs'
import { runOsvApiScan } from './scanners/osv-api.mjs'
import { runBuiltinSecretsScan } from './scanners/secrets-builtin.mjs'
import { runBuiltinSastScan } from './scanners/sast-builtin.mjs'
import { detectGithubRepo, ghStatus, fetchGithubAlerts, generateCodeqlWorkflow } from './scanners/github.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── CLI parsing ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const arg = (name, fallback = null) => {
  const idx = args.indexOf(name)
  return idx !== -1 ? args[idx + 1] ?? fallback : fallback
}
const flag = (name) => args.includes(name)

const projectDir = resolve(arg('--dir', process.cwd()))
const standard = arg('--standard', 'pre-launch')
const onlyLayer = arg('--layer', null)
const jsonOnly = flag('--json')
const noColor = flag('--no-color') || jsonOnly
const reportToVVibe = flag('--report-to-vvibe')
const noDocker = flag('--no-docker') // opt out of Docker fallback (testing / air-gapped)
const noGithub = flag('--no-github') // opt out of GitHub alerts augmentation
const allowSkipped = flag('--allow-skipped') // ship-anyway flag: pre-launch/gold won't fail on missing layer coverage

const VALID_STANDARDS = new Set(['pre-launch', 'routine', 'gold', 'report-only'])
if (!VALID_STANDARDS.has(standard)) {
  process.stderr.write(`Unknown --standard: ${standard}\n`)
  process.exit(2)
}

const VALID_LAYERS = new Set(['secrets', 'deps', 'sast', 'vvibe'])
if (onlyLayer && !VALID_LAYERS.has(onlyLayer)) {
  process.stderr.write(`Unknown --layer: ${onlyLayer}\n`)
  process.exit(2)
}

// ── tiny helpers ────────────────────────────────────────────────────────────

function c(text, code) {
  return noColor ? text : `\x1b[${code}m${text}\x1b[0m`
}
const red = (s) => c(s, '31')
const yellow = (s) => c(s, '33')
const blue = (s) => c(s, '34')
const dim = (s) => c(s, '2')
const bold = (s) => c(s, '1')

function checkCommand(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return r.status === 0
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

// ── tool detection: native PATH → Docker fallback ───────────────────────────
//
// Each scanner can run three ways: (a) installed natively on PATH, (b) inside
// Docker via a pinned image, (c) not available. The orchestrator prefers (a)
// for speed; falls back to (b) so Windows users without WSL still get SAST,
// and so creators don't need to install three CLIs to do a first scan. Use
// --no-docker to disable the fallback (useful for tests / air-gapped runs).

// Per-tool Docker config. `entrypointArgv` is prepended inside the container
// when the image's entrypoint isn't the tool binary (semgrep's image runs a
// shell, so we have to pass `semgrep` ourselves).
const TOOL_IMAGES = {
  gitleaks: { image: 'zricethezav/gitleaks:latest', entrypointArgv: [] },
  'osv-scanner': { image: 'ghcr.io/google/osv-scanner:latest', entrypointArgv: [] },
  semgrep: { image: 'semgrep/semgrep:latest', entrypointArgv: ['semgrep'] },
}

// Verified install commands per OS. Package IDs were checked against the
// upstream registry before being committed (winget search confirmed
// Gitleaks.Gitleaks + Google.OSVScanner; semgrep has no winget entry, hence
// the explicit null). Keep this table next to TOOL_IMAGES so they evolve
// together when upstream changes happen.
const INSTALL_HINTS = {
  gitleaks: {
    darwin: 'brew install gitleaks',
    win32: 'winget install --id Gitleaks.Gitleaks',
    linux: 'brew install gitleaks   # or: go install github.com/gitleaks/gitleaks/v8@latest',
  },
  'osv-scanner': {
    darwin: 'brew install osv-scanner',
    win32: 'winget install --id Google.OSVScanner',
    linux: 'brew install osv-scanner   # or download release from github.com/google/osv-scanner/releases',
  },
  semgrep: {
    darwin: 'brew install semgrep',
    // Semgrep does not build for Windows natively (verified: no winget
    // package, no official Windows binary). Docker is the supported path.
    win32: null,
    linux: 'pipx install semgrep   # or: brew install semgrep',
  },
}

function installHintFor(tool) {
  const platform = process.platform
  const command = INSTALL_HINTS[tool]?.[platform] ?? null
  const note = !command && platform === 'win32' && tool === 'semgrep'
    ? 'semgrep has no native Windows build — Docker is the supported path. Install Docker Desktop from https://docker.com/products/docker-desktop'
    : null
  return { command, note, platform, dockerFallback: !noDocker }
}

let _dockerCached
function hasUsableDocker() {
  if (noDocker) return false
  if (_dockerCached !== undefined) return _dockerCached
  if (!checkCommand('docker')) return (_dockerCached = false)
  // `docker version --format` returns non-zero if the daemon isn't reachable.
  const r = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  return (_dockerCached = r.status === 0)
}

// First Docker run pulls the image. Without inheriting stderr the user sees
// nothing — for a 500MB semgrep image that looks like a hang. Pre-pull with
// stderr visible so the user knows it's downloading, not stuck.
const _pulledImages = new Set()
function ensureDockerImage(image) {
  if (_pulledImages.has(image)) return true
  const inspect = spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' })
  if (inspect.status === 0) {
    _pulledImages.add(image)
    return true
  }
  process.stderr.write(`📦 First-time pull: ${image} (one-off; subsequent runs reuse the image)\n`)
  const pull = spawnSync('docker', ['pull', image], { stdio: ['ignore', 'inherit', 'inherit'] })
  if (pull.status === 0) {
    _pulledImages.add(image)
    return true
  }
  return false
}

function detectRunner(tool) {
  if (checkCommand(tool)) return { kind: 'native', tool }
  if (hasUsableDocker() && TOOL_IMAGES[tool]) {
    const cfg = TOOL_IMAGES[tool]
    return { kind: 'docker', tool, image: cfg.image, entrypointArgv: cfg.entrypointArgv }
  }
  let reason
  if (noDocker) {
    reason = `${tool} not on PATH and --no-docker is set`
  } else if (checkCommand('docker')) {
    reason = `${tool} not on PATH; Docker present but daemon not reachable`
  } else {
    reason = `${tool} not installed and Docker fallback unavailable`
  }
  return { kind: 'none', tool, reason, installHint: installHintFor(tool) }
}

/**
 * Build a spawnSync invocation that runs `tool toolArgs` either natively or
 * inside Docker. Caller provides:
 *   mounts: [{ host, container, mode? }, ...]  — host paths bind-mounted in
 *   toolArgs: string[]                          — args using container paths
 *
 * For native runs, container paths in toolArgs must equal host paths (the
 * caller is responsible for keeping them in sync via the `mounts` mapping).
 */
function buildCommand(runner, { mounts, toolArgs }) {
  if (runner.kind === 'native') return { cmd: runner.tool, args: toolArgs, ready: true }
  const ready = ensureDockerImage(runner.image)
  const args = ['run', '--rm']
  for (const m of mounts) {
    const mode = m.mode ? `:${m.mode}` : ''
    args.push('-v', `${m.host}:${m.container}${mode}`)
  }
  args.push(runner.image, ...(runner.entrypointArgv ?? []), ...toolArgs)
  return { cmd: 'docker', args, ready }
}

// ── project-relevance pre-flight ────────────────────────────────────────────
//
// Not every layer is meaningful for every project. A static HTML site has no
// DEPS layer to scan; a non-git scratch dir can't have secrets in history.
// We report `n/a` (distinct from `skipped`) so the user understands the layer
// was *intentionally* not run rather than blocked by a missing tool.

function assessProjectRelevance(dir) {
  const has = (rel) => existsSync(join(dir, rel))
  const git = has('.git')
  const lockfiles = {
    npm: has('package-lock.json') || has('npm-shrinkwrap.json'),
    pnpm: has('pnpm-lock.yaml'),
    yarn: has('yarn.lock'),
    bun: has('bun.lockb') || has('bun.lock'),
    python: has('requirements.txt') || has('Pipfile.lock') || has('poetry.lock') || has('uv.lock'),
    go: has('go.sum'),
    rust: has('Cargo.lock'),
    ruby: has('Gemfile.lock'),
    php: has('composer.lock'),
  }
  const hasManifest = has('package.json') || has('pyproject.toml') || has('go.mod') || has('Cargo.toml') || has('Gemfile') || has('composer.json')
  const depsRelevant = hasManifest || Object.values(lockfiles).some(Boolean)
  // SAST cheap heuristic — does the dir look like it has source to scan?
  const sourceMarkers = ['src', 'app', 'lib', 'pages', 'components', 'cmd', 'internal', 'pkg', 'main.py', 'main.go', 'package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml']
  const sastRelevant = sourceMarkers.some((m) => has(m))
  return { git, lockfiles, depsRelevant, sastRelevant }
}

// ── layer runners ───────────────────────────────────────────────────────────

const SEVERITY_ORDER = { CRITICAL: 0, WARNING: 1, INFO: 2 }

function makeFinding({ code, severity, title, file, line, fix, rawTool, rawId }) {
  return { code, severity, title, file: normalizeFile(file), line, fix, rawTool, rawId }
}

// Tools running inside Docker emit findings with container paths like
// `/src/foo.ts`; native runs emit absolute host paths. Both are noise to the
// creator. Normalize to project-relative paths.
function normalizeFile(p) {
  if (!p) return p
  if (p.startsWith('/src/')) return p.slice(5)
  if (p === '/src') return '.'
  if (p.startsWith(projectDir)) {
    const rel = p.slice(projectDir.length).replace(/^[\\/]+/, '')
    return rel || '.'
  }
  return p
}

/** SECRETS — gitleaks */
async function runSecretsLayer(workDir, { isGit }) {
  const runner = detectRunner('gitleaks')
  if (runner.kind === 'none') {
    // Tier-0 fallback: built-in regex scan of working tree. No git history
    // coverage but catches secrets currently checked in. Always available.
    const builtin = await runBuiltinSecretsScan(projectDir)
    const findings = builtin.findings.map((f) =>
      makeFinding({
        code: `SECRETS-${f.id.toUpperCase()}`,
        severity: f.severity,
        title: `Secret leak: ${f.description} (${f.masked})`,
        file: f.file,
        line: f.line,
        fix: 'Rotate the credential at the issuer immediately, remove it from source, then re-run sentry. If it was committed previously, also rewrite git history (`git filter-repo` or BFG) — built-in tier-0 scan only sees the current working tree.',
        rawTool: 'secrets-builtin',
        rawId: f.id,
      }),
    )
    return {
      layer: 'secrets',
      status: 'ok-tier0',
      runner: 'secrets-builtin',
      installHint: runner.installHint,
      reason: 'gitleaks unavailable — using built-in regex scanner (working tree only, no git history)',
      findings,
    }
  }
  const outFile = join(workDir, 'gitleaks.json')
  const customRules = resolve(__dirname, 'gitleaks-rules.toml')
  const hasCustomRules = existsSync(customRules)

  const mounts = [
    { host: projectDir, container: runner.kind === 'docker' ? '/src' : projectDir },
    { host: workDir, container: runner.kind === 'docker' ? '/out' : workDir },
  ]
  const srcPath = mounts[0].container
  const outPath = runner.kind === 'docker' ? `/out/${basename(outFile)}` : outFile
  // gitleaks `detect` requires a git repo by default. Non-git dirs need
  // --no-git so the working tree is scanned as a flat filesystem. We lose
  // history coverage in that case but still catch committed secrets in HEAD.
  const toolArgs = [
    'detect',
    '--source', srcPath,
    '--report-format', 'json',
    '--report-path', outPath,
    '--exit-code', '0',
    '--no-banner',
    '--redact',
    ...(isGit ? [] : ['--no-git']),
  ]
  if (hasCustomRules) {
    if (runner.kind === 'docker') {
      mounts.push({ host: dirname(customRules), container: '/rules', mode: 'ro' })
      toolArgs.push('--config', `/rules/${basename(customRules)}`)
    } else {
      toolArgs.push('--config', customRules)
    }
  }
  const { cmd, args, ready } = buildCommand(runner, { mounts, toolArgs })
  if (!ready) {
    return { layer: 'secrets', status: 'error', runner: runner.kind, reason: `Failed to pull Docker image ${runner.image}`, findings: [] }
  }
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  if (r.status !== 0 && r.status !== null && r.status !== 1) {
    return {
      layer: 'secrets',
      status: 'error',
      runner: runner.kind,
      reason: `gitleaks exited ${r.status}: ${r.stderr?.toString().slice(0, 200) ?? ''}`,
      findings: [],
    }
  }
  const raw = readJsonIfExists(outFile) ?? []
  const findings = raw.map((g) => {
    // RuleID conveys what kind of secret. Live-credential patterns are
    // CRITICAL; test patterns and generic high-entropy strings drop to
    // WARNING / INFO so the creator isn't paged for a sandbox key.
    const ruleId = (g.RuleID ?? '').toLowerCase()
    const isLive = /aws|gcp|github|stripe-live|openai|vvibe-live|pcs[_-]live|generic[_-]api[_-]key/.test(ruleId)
    const isTest = /pcs[_-]test|stripe-test|openai-test|test/.test(ruleId)
    const severity = isLive ? 'CRITICAL' : isTest ? 'WARNING' : 'INFO'
    return makeFinding({
      code: `SECRETS-${(g.RuleID ?? 'UNKNOWN').toUpperCase()}`,
      severity,
      title: `Secret leak: ${g.Description ?? g.RuleID ?? 'unknown rule'}`,
      file: g.File ?? null,
      line: g.StartLine ?? null,
      fix:
        'Rotate the credential at the issuer immediately, then remove it from git history (`git filter-repo --invert-paths --path <file>` or BFG). After cleanup, re-run sentry to confirm.',
      rawTool: 'gitleaks',
      rawId: g.RuleID,
    })
  })
  return { layer: 'secrets', status: 'ok', runner: runner.kind, findings }
}

/** DEPS — osv-scanner + npm audit (deduplicated) */
async function runDepsLayer(workDir) {
  const findings = []
  let status = 'ok'
  let usedCanonicalScanner = false
  const osvRunner = detectRunner('osv-scanner')
  const npmAvailable = existsSync(join(projectDir, 'package.json')) && checkCommand('npm')
  const usedRunners = []

  if (osvRunner.kind !== 'none') {
    usedCanonicalScanner = true
    usedRunners.push(`osv-scanner:${osvRunner.kind}`)
    const outFile = join(workDir, 'osv.json')
    const mounts = [
      { host: projectDir, container: osvRunner.kind === 'docker' ? '/src' : projectDir },
      { host: workDir, container: osvRunner.kind === 'docker' ? '/out' : workDir },
    ]
    const outPath = osvRunner.kind === 'docker' ? `/out/${basename(outFile)}` : outFile
    const srcPath = mounts[0].container
    const { cmd, args, ready } = buildCommand(osvRunner, {
      mounts,
      toolArgs: ['--format', 'json', '--output', outPath, srcPath],
    })
    if (!ready) {
      status = 'error'
    } else {
      const r = spawnSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
      // osv-scanner exits 1 when vulnerabilities found — that's expected.
      if (r.status !== 0 && r.status !== 1) {
        status = 'error'
      }
    }
    const raw = readJsonIfExists(outFile)
    if (raw?.results) {
      for (const result of raw.results) {
        for (const pkg of result.packages ?? []) {
          for (const vuln of pkg.vulnerabilities ?? []) {
            const severity = mapOsvSeverity(vuln.severity)
            findings.push(
              makeFinding({
                code: `DEPS-${vuln.id}`,
                severity,
                title: `${pkg.package?.name ?? 'unknown'}@${pkg.package?.version ?? '?'}: ${vuln.summary ?? vuln.id}`,
                file: result.source?.path ?? null,
                line: null,
                fix: `Upgrade ${pkg.package?.name}: ${
                  vuln.affected?.[0]?.ranges?.[0]?.events?.find((e) => e.fixed)?.fixed ??
                  'see advisory'
                }. Run \`npm audit fix\` first.`,
                rawTool: 'osv-scanner',
                rawId: vuln.id,
              }),
            )
          }
        }
      }
    }
  }

  // Tier-0 fallback: query OSV.dev API directly when osv-scanner isn't
  // available. Covers npm/PyPI/Go from parseable lockfiles, no install.
  if (!usedCanonicalScanner) {
    try {
      const apiResult = await runOsvApiScan(projectDir)
      if (apiResult.scanned > 0) {
        usedRunners.push(`osv-api:builtin(${apiResult.ecosystems.join(',')})`)
        for (const f of apiResult.findings) {
          findings.push(
            makeFinding({
              code: `DEPS-${f.id}`,
              severity: f.severity,
              title: `${f.package}@${f.version}: ${f.summary}`,
              file: f.lockfile,
              line: null,
              fix: f.fix,
              rawTool: 'osv-api',
              rawId: f.id,
            }),
          )
        }
      }
    } catch (err) {
      // Network failure or API down — log but don't fail the layer. npm audit
      // may still produce results, and the report.runner field will reflect
      // that OSV API didn't contribute.
      process.stderr.write(`OSV API fallback failed: ${err.message.slice(0, 120)}\n`)
    }
  }

  if (npmAvailable) {
    usedRunners.push('npm-audit:native')
    const r = spawnSync('npm', ['audit', '--json'], {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    try {
      const raw = JSON.parse(r.stdout.toString() || '{}')
      const advisories = raw.vulnerabilities ?? {}
      for (const [pkgName, info] of Object.entries(advisories)) {
        // npm aggregates by package; iterate the via list to surface each advisory.
        for (const via of info.via ?? []) {
          if (typeof via !== 'object') continue
          const advisoryId = via.source ?? via.name ?? pkgName
          const dedupKey = `DEPS-NPM-${advisoryId}`
          if (findings.some((f) => f.code === dedupKey || f.rawId === String(advisoryId))) continue
          findings.push(
            makeFinding({
              code: dedupKey,
              severity: mapNpmSeverity(info.severity ?? via.severity),
              title: `${pkgName}: ${via.title ?? via.name ?? 'CVE'}`,
              file: 'package-lock.json',
              line: null,
              fix:
                info.fixAvailable === true
                  ? `Run \`npm audit fix\` (no breaking change).`
                  : info.fixAvailable
                    ? `Upgrade ${pkgName} (may require major-version bump — review changes).`
                    : 'No upstream fix yet — track the advisory and add a runtime mitigation.',
              rawTool: 'npm-audit',
              rawId: String(advisoryId),
            }),
          )
        }
      }
    } catch {
      // npm audit failed to produce JSON — skip silently rather than panic.
    }
  }

  if (usedRunners.length === 0) {
    return {
      layer: 'deps',
      status: 'skipped',
      runner: 'none',
      reason: 'no usable DEPS scanner (no osv-scanner, no Docker, no parseable lockfile, no npm)',
      installHint: osvRunner.installHint,
      findings: [],
    }
  }

  // ok = canonical osv-scanner ran. ok-tier0 = only built-in fallbacks ran;
  // coverage is still acceptable but the agent should mention it.
  const finalStatus = status === 'error' ? 'error' : usedCanonicalScanner ? 'ok' : 'ok-tier0'
  return { layer: 'deps', status: finalStatus, runner: usedRunners.join('+'), findings }
}

function mapOsvSeverity(sevArr) {
  if (!Array.isArray(sevArr) || sevArr.length === 0) return 'WARNING'
  const score = sevArr[0]?.score ?? ''
  // CVSS prefix gives the version; second token is the score itself.
  const m = score.match(/(?:CVSS:[\d.]+\/)([A-Z:]+)?(\d+(?:\.\d+)?)?/)
  const num = parseFloat(m?.[2] ?? '0')
  if (num >= 9.0) return 'CRITICAL'
  if (num >= 7.0) return 'WARNING'
  if (num > 0) return 'INFO'
  return 'WARNING'
}

function mapNpmSeverity(s) {
  // Severity bands match CVSS interpretation: CRITICAL is reserved for
  // CVSS 9.0+ / npm `critical`. `high` (CVSS 7.0-8.9) is a real concern but
  // not "exploitable now" — that's WARNING per the contract in SKILL.md.
  // Without this alignment, the same advisory ranks differently depending
  // on which scanner reported it (osv-api vs npm-audit vs github).
  if (!s) return 'INFO'
  switch (s.toLowerCase()) {
    case 'critical': return 'CRITICAL'
    case 'high': return 'WARNING'
    case 'moderate': return 'WARNING'
    case 'medium': return 'WARNING'
    case 'low': return 'INFO'
    default: return 'INFO'
  }
}

/** SAST — semgrep */
async function runSastLayer(workDir) {
  const runner = detectRunner('semgrep')
  if (runner.kind === 'none') {
    // Tier-0 fallback: built-in regex pattern scan. Smaller rule set than
    // semgrep (~15 patterns vs thousands) but catches the highest-impact
    // common issues. No install, no Docker, works on Windows.
    const builtin = await runBuiltinSastScan(projectDir)
    const findings = builtin.findings.map((f) =>
      makeFinding({
        code: `SAST-${f.id.toUpperCase()}`,
        severity: f.severity,
        title: `${f.description}`,
        file: f.file,
        line: f.line,
        fix: 'Refactor to remove the dangerous pattern, or use a safer API (parameterized queries, output encoding, allow-list of redirect URLs, etc.). For deeper coverage install semgrep — `brew install semgrep` on macOS/Linux, or enable Docker on Windows.',
        rawTool: 'sast-builtin',
        rawId: f.id,
      }),
    )
    return {
      layer: 'sast',
      status: 'ok-tier0',
      runner: 'sast-builtin',
      installHint: runner.installHint,
      reason: 'semgrep unavailable — using built-in pattern scanner (~15 rules vs thousands; high-impact subset only)',
      findings,
    }
  }
  const outFile = join(workDir, 'semgrep.json')
  const mounts = [
    { host: projectDir, container: runner.kind === 'docker' ? '/src' : projectDir },
    { host: workDir, container: runner.kind === 'docker' ? '/out' : workDir },
  ]
  const outPath = runner.kind === 'docker' ? `/out/${basename(outFile)}` : outFile
  const srcPath = mounts[0].container
  const { cmd, args, ready } = buildCommand(runner, {
    mounts,
    toolArgs: [
      '--config', 'p/owasp-top-ten',
      '--config', 'p/javascript',
      '--config', 'p/typescript',
      '--json',
      '--output', outPath,
      '--no-error',
      '--quiet',
      srcPath,
    ],
  })
  if (!ready) {
    return { layer: 'sast', status: 'error', runner: runner.kind, reason: `Failed to pull Docker image ${runner.image}`, findings: [] }
  }
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  if (r.status !== 0 && r.status !== 1) {
    return {
      layer: 'sast',
      status: 'error',
      runner: runner.kind,
      reason: `semgrep exited ${r.status}: ${r.stderr?.toString().slice(0, 200) ?? ''}`,
      findings: [],
    }
  }
  const raw = readJsonIfExists(outFile)
  const findings = (raw?.results ?? [])
    .filter((res) => !/(\.test\.|__tests__|\.spec\.)/.test(res.path ?? ''))
    .map((res) =>
      makeFinding({
        code: `SAST-${(res.check_id ?? '').split('.').pop()?.toUpperCase() ?? 'UNKNOWN'}`,
        severity: mapSemgrepSeverity(res.extra?.severity),
        title: res.extra?.message ?? res.check_id ?? 'semgrep finding',
        file: res.path ?? null,
        line: res.start?.line ?? null,
        fix: res.extra?.metadata?.fix ?? 'See semgrep finding URL for guidance.',
        rawTool: 'semgrep',
        rawId: res.check_id,
      }),
    )
  return { layer: 'sast', status: 'ok', runner: runner.kind, findings }
}

function mapSemgrepSeverity(s) {
  switch ((s ?? '').toUpperCase()) {
    case 'ERROR': return 'CRITICAL'
    case 'WARNING': return 'WARNING'
    case 'INFO': return 'INFO'
    default: return 'WARNING'
  }
}

/** VVIBE — sentry-internal */
async function runVVibeLayer() {
  const findings = await runVVibeIntegrationChecks({ projectDir })
  return { layer: 'vvibe', status: 'ok', findings }
}

/**
 * Tier-1 GitHub augmentation. Mutates layers in-place by appending dedup'd
 * findings and updating the runner field. Returns metadata for the report.
 */
async function maybeRunGithubAugmentation(layers) {
  if (noGithub) return { used: false, reason: '--no-github set' }
  const repo = detectGithubRepo(projectDir)
  if (!repo) return { used: false, reason: 'not a GitHub repo' }
  if (repo.isGheOrLike) {
    return {
      used: false,
      reason: 'GitHub Enterprise host detected — sentry currently only augments github.com repos. Tier-0 / tier-2 still apply.',
    }
  }
  const gh = ghStatus()
  if (!gh.usable) return { used: false, reason: gh.reason, installHint: gh.installHint, repo }

  let alerts
  try {
    alerts = await fetchGithubAlerts(repo)
  } catch (err) {
    return { used: false, reason: `gh alerts fetch failed: ${err.message.slice(0, 120)}`, repo }
  }

  // Merge into existing layers. Per-source dedup key avoids double-counting
  // a CVE that both osv-scanner AND Dependabot reported.
  const byLayer = { secrets: alerts.secretsFindings, deps: alerts.depsFindings, sast: alerts.sastFindings }
  const layerMap = new Map(layers.map((l) => [l.layer, l]))
  const contributions = { secrets: 0, deps: 0, sast: 0 }

  for (const [layerName, ghFindings] of Object.entries(byLayer)) {
    const target = layerMap.get(layerName)
    if (!target) continue
    for (const f of ghFindings) {
      const code = layerName === 'secrets'
        ? `SECRETS-GH-${f.id.toUpperCase()}`
        : layerName === 'deps'
          ? `DEPS-${f.id}`
          : `SAST-GH-${f.id.toUpperCase()}`
      // Dedup against local findings by ID (GHSA / advisory code).
      if (target.findings.some((existing) => existing.rawId === f.id || existing.code === code)) continue
      const finding = makeFinding({
        code,
        severity: f.severity,
        title: layerName === 'secrets'
          ? `Secret leak: ${f.description}${f.masked ? ` (${f.masked})` : ''} [GitHub Secret Scanning]`
          : layerName === 'deps'
            ? `${f.package}@${f.version}: ${f.summary} [Dependabot]`
            : `${f.description}${f.message ? ` — ${f.message.slice(0, 80)}` : ''} [GitHub Code Scanning${f.tool ? `/${f.tool}` : ''}]`,
        file: f.file ?? null,
        line: f.line ?? null,
        fix: layerName === 'deps' ? f.fix : `See GitHub alert: ${f.url}`,
        rawTool: 'github',
        rawId: f.id,
      })
      target.findings.push(finding)
      contributions[layerName]++
    }
    // Update the layer's runner string to record GitHub augmentation, even
    // when it contributed zero new findings (the scan still happened — that
    // information is meaningful for coverage reporting).
    if (alerts.status[layerName] === 'ok') {
      target.runner = (target.runner ? `${target.runner}+` : '') + 'github'
    }
  }

  return {
    used: true,
    repo,
    layerStatus: alerts.status,
    contributions,
  }
}

// ── orchestrate ─────────────────────────────────────────────────────────────

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'vvibe-sentry-'))
  const layers = []
  const relevance = assessProjectRelevance(projectDir)

  const shouldRun = (layer) => !onlyLayer || onlyLayer === layer

  // n/a stub for layers the project doesn't need scanned. Distinct from
  // `skipped` (= relevant but tool unavailable) and `error` (= tool crashed).
  const naLayer = (layer, reason) => ({
    layer,
    status: 'n/a',
    runner: 'n/a',
    reason,
    findings: [],
  })

  try {
    if (shouldRun('secrets')) layers.push(await runSecretsLayer(workDir, { isGit: relevance.git }))
    if (shouldRun('deps')) {
      layers.push(
        relevance.depsRelevant
          ? await runDepsLayer(workDir)
          : naLayer('deps', 'no lockfile or manifest found — nothing to scan for CVEs'),
      )
    }
    if (shouldRun('sast')) {
      layers.push(
        relevance.sastRelevant
          ? await runSastLayer(workDir)
          : naLayer('sast', 'no recognized source tree found'),
      )
    }
    if (shouldRun('vvibe')) layers.push(await runVVibeLayer())
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }

  // Tier-1 augmentation: merge GitHub server-side scan results. Adds
  // coverage from Secret Scanning / Dependabot / Code Scanning without
  // needing any local tool install. Skipped when --no-github, not a GitHub
  // repo, or gh CLI not authenticated.
  const githubInfo = await maybeRunGithubAugmentation(layers)

  const allFindings = layers.flatMap((l) => l.findings)
  const counts = {
    critical: allFindings.filter((f) => f.severity === 'CRITICAL').length,
    warning: allFindings.filter((f) => f.severity === 'WARNING').length,
    info: allFindings.filter((f) => f.severity === 'INFO').length,
  }
  const score = computeHealthScore(counts)
  const band = healthBandLabel(score)
  const blockThreshold = standardBlockThreshold(standard)
  const blockingCount = countAtOrAbove(allFindings, blockThreshold)

  // Coverage gate: distinct from finding count. A scan that skipped half the
  // layers can't honestly claim PASS even with zero findings, because we
  // don't know what we missed. n/a layers are fine (the project genuinely
  // doesn't need them). `--allow-skipped` is the explicit ship-anyway flag.
  const skippedLayers = layers.filter((l) => l.status === 'skipped').map((l) => l.layer)
  const tier0Layers = layers.filter((l) => l.status === 'ok-tier0').map((l) => l.layer)
  const coverageRequired = ['pre-launch', 'gold'].includes(standard)
  const coverageFail = coverageRequired && !allowSkipped && skippedLayers.length > 0
  const passes = blockingCount === 0 && !coverageFail

  const report = {
    schemaVersion: '0.2.0',
    projectDir,
    standard,
    score,
    band,
    passes,
    blockThreshold,
    counts,
    relevance,
    coverage: {
      skipped: skippedLayers,
      tier0: tier0Layers,
      coverageFail,
      allowSkipped,
    },
    github: githubInfo,
    layers: layers.map((l) => ({
      layer: l.layer,
      status: l.status,
      runner: l.runner ?? null,
      reason: l.reason ?? null,
      installHint: l.installHint ?? null,
      counts: countByLayer(l.findings),
    })),
    findings: allFindings.sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    ),
    ranAt: new Date().toISOString(),
  }

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  } else {
    printHumanReport(report)
    process.stdout.write('\n---\n')
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  }

  if (reportToVVibe) {
    await postToVVibe(report).catch((err) => {
      process.stderr.write(`Failed to report to VVibe: ${err.message}\n`)
    })
  }

  process.exit(passes ? 0 : 1)
}

function standardBlockThreshold(s) {
  switch (s) {
    case 'pre-launch': return 'CRITICAL'
    case 'routine': return 'WARNING'
    case 'gold': return 'INFO'
    default: return null // report-only
  }
}

function countAtOrAbove(findings, threshold) {
  if (!threshold) return 0
  const limit = SEVERITY_ORDER[threshold]
  return findings.filter((f) => SEVERITY_ORDER[f.severity] <= limit).length
}

function countByLayer(findings) {
  return {
    critical: findings.filter((f) => f.severity === 'CRITICAL').length,
    warning: findings.filter((f) => f.severity === 'WARNING').length,
    info: findings.filter((f) => f.severity === 'INFO').length,
  }
}

function printHumanReport(r) {
  const dot = (n, kind) => {
    if (n === 0) return dim('· 0')
    if (kind === 'critical') return red(`● ${n}`)
    if (kind === 'warning') return yellow(`● ${n}`)
    return blue(`● ${n}`)
  }
  // Banner reflects both finding-count blocking AND coverage gating. The
  // worst-case order is: coverage fail > critical finding > warning > clean.
  // Report-only never blocks so it gets a neutral banner regardless.
  const total = r.counts.critical + r.counts.warning + r.counts.info
  const cov = r.coverage
  let banner
  if (r.standard === 'report-only') {
    banner = total === 0
      ? c('🟢 CLEAN — no findings', '32')
      : c(`📄 REPORT — ${total} findings`, '36')
  } else if (cov?.coverageFail) {
    banner = red(`🔴 INCOMPLETE — ${cov.skipped.length} layer(s) couldn't run; cannot certify`)
  } else if (!r.passes && r.counts.critical > 0) {
    banner = red('🔴 BLOCK — critical issues')
  } else if (!r.passes) {
    banner = yellow('🟡 ATTENTION — review before deploy')
  } else if (cov?.tier0?.length > 0) {
    banner = yellow(`🟡 PASS (tier-0 — ${cov.tier0.length} layer(s) used built-in fallbacks)`)
  } else {
    banner = c('🟢 PASS — ready to deploy', '32')
  }
  process.stdout.write(`\n${bold(banner)}\n`)
  process.stdout.write(`Score: ${score3digits(r.score)} (${r.band})  Standard: ${r.standard}\n`)
  if (r.coverage?.coverageFail) {
    process.stdout.write(`  ${red('↑ Coverage gate failed.')} ${dim(`Layers that couldn't run: ${r.coverage.skipped.join(', ')}. Use --allow-skipped to override, or fix coverage (see install hints below).`)}\n`)
  }
  process.stdout.write('\n')
  for (const l of r.layers) {
    if (l.status === 'n/a') {
      process.stdout.write(`  ${dim(`${labelForLayer(l.layer)}: n/a — ${l.reason}`)}\n`)
      continue
    }
    if (l.status === 'skipped') {
      process.stdout.write(`  ${yellow(`${labelForLayer(l.layer)}: skipped — ${l.reason}`)}\n`)
      const hint = l.installHint
      if (hint?.command) {
        process.stdout.write(`      ${dim(`→ install: ${hint.command}`)}\n`)
      } else if (hint?.note) {
        process.stdout.write(`      ${dim(`→ ${hint.note}`)}\n`)
      }
      continue
    }
    if (l.status === 'error') {
      process.stdout.write(`  ${red(`${labelForLayer(l.layer)}: error — ${l.reason}`)}\n`)
      continue
    }
    const tag = displayTier(l)
    process.stdout.write(
      `  ${labelForLayer(l.layer)}: ${dot(l.counts.critical, 'critical')}  ${dot(l.counts.warning, 'warning')}  ${dot(l.counts.info, 'info')}${tag}\n`,
    )
    // Tier-0 SECRETS only scans the working tree. If the project is a git
    // repo AND GitHub Secret Scanning isn't covering it server-side, the
    // user has a real history-coverage gap — call it out so they don't
    // assume a clean tier-0 secrets scan means "history is clean too."
    if (l.layer === 'secrets' && l.status === 'ok-tier0' && r.relevance?.git) {
      const githubCovers = r.github?.used && r.github.layerStatus?.secrets === 'ok'
      if (!githubCovers) {
        process.stdout.write(`      ${dim('→ tip: working-tree only — git history not scanned. Install gitleaks for full coverage, or enable GitHub Secret Scanning.')}\n`)
      }
    }
  }
  // GitHub augmentation status — surface so the agent can prompt the user
  // to enable disabled feeds or fix `gh` scope issues.
  const gh = r.github
  if (gh?.used) {
    const flagsBy = ['secrets', 'deps', 'sast'].map((l) => {
      const s = gh.layerStatus?.[l]
      if (s === 'ok') return `${l}=✓`
      if (s === 'disabled') return dim(`${l}=off`)
      if (s === 'forbidden') return yellow(`${l}=403`)
      return dim(`${l}=?`)
    }).join('  ')
    process.stdout.write(`\n  ${dim('GitHub:')} ${gh.repo.owner}/${gh.repo.repo}   ${flagsBy}\n`)
  } else if (gh?.reason) {
    process.stdout.write(`\n  ${dim(`GitHub: skipped — ${gh.reason}`)}\n`)
  }
  const top = r.findings.slice(0, 5)
  if (top.length > 0) {
    process.stdout.write(`\n  ${bold('Top issues:')}\n`)
    for (const f of top) {
      const sevTag = f.severity === 'CRITICAL' ? red('CRIT ') : f.severity === 'WARNING' ? yellow('WARN ') : blue('INFO ')
      const loc = f.file ? ` ${dim(`(${f.file}${f.line ? `:${f.line}` : ''})`)}` : ''
      process.stdout.write(`    ${sevTag} ${f.title}${loc}\n`)
    }
  }
}

/**
 * Compact tier tag for the human report. The raw `runner` string is great
 * for debugging — `osv-api:builtin(npm)+npm-audit:native+github` — but
 * unhelpful for users who just want to know "did the canonical scanner run
 * or am I on the fallback?". Derive a short tag instead and keep the raw
 * field in JSON for anyone who wants the detail.
 */
function displayTier(l) {
  if (!l.runner || l.runner === 'none' || l.runner === 'native') return ''
  const r = l.runner
  const hasBuiltin = /builtin|osv-api/.test(r)
  const hasDocker = /docker/.test(r) && !hasBuiltin
  const hasGithub = /github/.test(r)
  let main
  if (hasBuiltin) main = 'tier-0'
  else if (hasDocker) main = 'docker'
  else if (hasGithub) main = 'github-only'
  else return '' // native is the unmarked default
  const augmented = hasGithub && main !== 'github-only' ? ' +github' : ''
  return dim(` [${main}${augmented}]`)
}

function labelForLayer(l) {
  switch (l) {
    case 'secrets': return '🔐 Secrets    '
    case 'deps': return '📦 Dependencies'
    case 'sast': return '🛡️  Code patterns'
    case 'vvibe': return '🪢 VVibe       '
    default: return l
  }
}

function score3digits(n) {
  return String(Math.round(n)).padStart(3, ' ')
}

async function postToVVibe(report) {
  const apiHost = process.env.VVIBE_API_HOST || 'https://vvibe.ai'
  const apiKey = process.env.VVIBE_API_KEY
  if (!apiKey) {
    throw new Error('VVIBE_API_KEY not set — cannot --report-to-vvibe')
  }
  const res = await fetch(`${apiHost}/api/creator-subscription/health-check-reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    // Payload mirrors the JSON schema documented in
    // references/health-check-contract.md. Schema 0.2.0 added: `coverage`,
    // `github`, `relevance`, `band`, `passes`, `blockThreshold`. Older
    // receivers that don't know the new fields will ignore them (forward-
    // compatible). Findings are capped at 50 to keep the payload bounded.
    body: JSON.stringify({
      schemaVersion: report.schemaVersion,
      score: report.score,
      band: report.band,
      passes: report.passes,
      standard: report.standard,
      blockThreshold: report.blockThreshold,
      counts: report.counts,
      coverage: report.coverage,
      relevance: report.relevance,
      github: report.github,
      layers: report.layers,
      findings: report.findings.slice(0, 50),
      ranAt: report.ranAt,
    }),
  })
  if (!res.ok) {
    throw new Error(`POST returned ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
}

main().catch((err) => {
  process.stderr.write(`sentry crashed: ${err.stack ?? err.message}\n`)
  process.exit(2)
})
