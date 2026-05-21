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
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { computeHealthScore, healthBandLabel } from './computeHealthScore.mjs'
import { runVVibeIntegrationChecks } from './check_vvibe_integration.mjs'

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

function which(cmd) {
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

// ── layer runners ───────────────────────────────────────────────────────────

const SEVERITY_ORDER = { CRITICAL: 0, WARNING: 1, INFO: 2 }

function makeFinding({ code, severity, title, file, line, fix, rawTool, rawId }) {
  return { code, severity, title, file, line, fix, rawTool, rawId }
}

/** SECRETS — gitleaks */
function runSecretsLayer(workDir) {
  if (!which('gitleaks')) {
    return { layer: 'secrets', status: 'skipped', reason: 'gitleaks not installed', findings: [] }
  }
  const outFile = join(workDir, 'gitleaks.json')
  const customRules = resolve(__dirname, 'gitleaks-rules.toml')
  const cmdArgs = [
    'detect',
    '--source', projectDir,
    '--report-format', 'json',
    '--report-path', outFile,
    '--exit-code', '0',
    '--no-banner',
    '--redact',
  ]
  if (existsSync(customRules)) {
    cmdArgs.push('--config', customRules)
  }
  const r = spawnSync('gitleaks', cmdArgs, { stdio: ['ignore', 'ignore', 'pipe'] })
  if (r.status !== 0 && r.status !== null && r.status !== 1) {
    return {
      layer: 'secrets',
      status: 'error',
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
  return { layer: 'secrets', status: 'ok', findings }
}

/** DEPS — osv-scanner + npm audit (deduplicated) */
function runDepsLayer(workDir) {
  const findings = []
  let status = 'ok'
  let osvAvailable = which('osv-scanner')
  let npmAvailable = existsSync(join(projectDir, 'package.json')) && which('npm')

  if (!osvAvailable && !npmAvailable) {
    return {
      layer: 'deps',
      status: 'skipped',
      reason: 'no osv-scanner and no package.json/npm',
      findings: [],
    }
  }

  if (osvAvailable) {
    const outFile = join(workDir, 'osv.json')
    const r = spawnSync('osv-scanner', ['--format', 'json', '--output', outFile, projectDir], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    // osv-scanner exits 1 when vulnerabilities found — that's expected.
    if (r.status !== 0 && r.status !== 1) {
      status = 'error'
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

  if (npmAvailable) {
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

  return { layer: 'deps', status, findings }
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
  if (!s) return 'INFO'
  switch (s.toLowerCase()) {
    case 'critical': return 'CRITICAL'
    case 'high': return 'CRITICAL'
    case 'moderate': return 'WARNING'
    case 'low': return 'INFO'
    default: return 'INFO'
  }
}

/** SAST — semgrep */
function runSastLayer(workDir) {
  if (!which('semgrep')) {
    return { layer: 'sast', status: 'skipped', reason: 'semgrep not installed', findings: [] }
  }
  const outFile = join(workDir, 'semgrep.json')
  const r = spawnSync(
    'semgrep',
    [
      '--config', 'p/owasp-top-ten',
      '--config', 'p/javascript',
      '--config', 'p/typescript',
      '--json',
      '--output', outFile,
      '--no-error',
      '--quiet',
      projectDir,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  if (r.status !== 0 && r.status !== 1) {
    return {
      layer: 'sast',
      status: 'error',
      reason: `semgrep exited ${r.status}`,
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
  return { layer: 'sast', status: 'ok', findings }
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

// ── orchestrate ─────────────────────────────────────────────────────────────

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'vvibe-sentry-'))
  const layers = []

  const shouldRun = (layer) => !onlyLayer || onlyLayer === layer

  try {
    if (shouldRun('secrets')) layers.push(runSecretsLayer(workDir))
    if (shouldRun('deps')) layers.push(runDepsLayer(workDir))
    if (shouldRun('sast')) layers.push(runSastLayer(workDir))
    if (shouldRun('vvibe')) layers.push(await runVVibeLayer())
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }

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
  const passes = blockingCount === 0

  const report = {
    schemaVersion: '0.1.0',
    projectDir,
    standard,
    score,
    band,
    passes,
    blockThreshold,
    counts,
    layers: layers.map((l) => ({
      layer: l.layer,
      status: l.status,
      reason: l.reason ?? null,
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
  const banner = r.passes
    ? c('🟢 PASS — ready to deploy', '32')
    : r.counts.critical > 0
      ? red('🔴 BLOCK — critical issues')
      : yellow('🟡 ATTENTION — review before deploy')
  process.stdout.write(`\n${bold(banner)}\n`)
  process.stdout.write(`Score: ${score3digits(r.score)} (${r.band})  Standard: ${r.standard}\n\n`)
  for (const l of r.layers) {
    if (l.status === 'skipped') {
      process.stdout.write(`  ${dim(`${labelForLayer(l.layer)}: skipped — ${l.reason}`)}\n`)
      continue
    }
    if (l.status === 'error') {
      process.stdout.write(`  ${red(`${labelForLayer(l.layer)}: error — ${l.reason}`)}\n`)
      continue
    }
    process.stdout.write(
      `  ${labelForLayer(l.layer)}: ${dot(l.counts.critical, 'critical')}  ${dot(l.counts.warning, 'warning')}  ${dot(l.counts.info, 'info')}\n`,
    )
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
    body: JSON.stringify({
      schemaVersion: report.schemaVersion,
      score: report.score,
      counts: report.counts,
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
