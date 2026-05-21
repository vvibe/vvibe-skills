/**
 * OSV.dev API client — DEPS scanning without installing osv-scanner.
 *
 * Tier-0 fallback for the DEPS layer: parses common lockfiles, queries the
 * public OSV.dev API for known vulnerabilities, and returns findings in the
 * orchestrator's normalized shape. Always available as long as the user has
 * network — no Docker, no Go toolchain, no install.
 *
 * Supported ecosystems:
 *   - npm        via package-lock.json
 *   - PyPI       via requirements.txt
 *   - Go         via go.sum
 *
 * Other ecosystems (Rust, Ruby, PHP, pnpm/yarn) are deferred — they need
 * TOML/YAML/custom-format parsers we don't want to ship. Users on those
 * ecosystems still get coverage via the native osv-scanner Docker path.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const OSV_API = 'https://api.osv.dev'
// 10s per call. Long enough for the slowest reasonable batch query, short
// enough that a hung connection doesn't stall the whole scan. AbortController
// is the standard way to time-bound fetch() since Node 18.
const FETCH_TIMEOUT_MS = 10_000

async function fetchWithTimeout(url, init = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Run a tier-0 DEPS scan via the OSV API.
 * Returns an array of partial finding objects ({ id, severity, summary,
 * package, version, fix, ecosystem }) — caller wraps in makeFinding.
 */
export async function runOsvApiScan(projectDir) {
  const packages = collectPackages(projectDir)
  if (packages.length === 0) return { findings: [], scanned: 0, ecosystems: [] }

  // /v1/querybatch returns only vuln IDs. We follow up with /v1/vulns/{id}
  // for each unique advisory to get severity + summary + fix info.
  const queries = packages.map((p) => ({
    package: { name: p.name, ecosystem: p.ecosystem },
    version: p.version,
  }))

  const vulnRefs = await batchQuery(queries)
  // vulnRefs[i] is the array of {id, modified} for packages[i].
  const uniqueIds = new Set()
  for (const refs of vulnRefs) for (const v of refs) uniqueIds.add(v.id)

  const details = await fetchVulnDetails([...uniqueIds])
  const detailById = new Map(details.map((d) => [d.id, d]))

  const findings = []
  for (let i = 0; i < packages.length; i++) {
    const pkg = packages[i]
    for (const ref of vulnRefs[i]) {
      const detail = detailById.get(ref.id)
      if (!detail) continue
      findings.push({
        id: detail.id,
        severity: mapOsvApiSeverity(detail),
        summary: detail.summary ?? detail.id,
        package: pkg.name,
        version: pkg.version,
        ecosystem: pkg.ecosystem,
        lockfile: pkg.lockfile,
        fix: extractFix(detail, pkg),
      })
    }
  }

  const ecosystems = [...new Set(packages.map((p) => p.ecosystem))]
  return { findings, scanned: packages.length, ecosystems }
}

// ── batched API calls ───────────────────────────────────────────────────────

async function batchQuery(queries) {
  // API limit is 1000 queries per batch. Almost always fits in one for a
  // single project, but chunk to be safe.
  const out = []
  for (let i = 0; i < queries.length; i += 1000) {
    const chunk = queries.slice(i, i + 1000)
    const res = await fetchWithTimeout(`${OSV_API}/v1/querybatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: chunk }),
    })
    if (!res.ok) throw new Error(`OSV querybatch ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    for (const r of data.results ?? []) out.push(r.vulns ?? [])
  }
  return out
}

async function fetchVulnDetails(ids) {
  // /v1/vulns/{id} has no batch endpoint — fire in parallel, cap concurrency.
  const out = []
  const CONCURRENCY = 8
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      chunk.map(async (id) => {
        try {
          const res = await fetchWithTimeout(`${OSV_API}/v1/vulns/${encodeURIComponent(id)}`)
          if (!res.ok) return null
          return await res.json()
        } catch {
          return null
        }
      }),
    )
    for (const r of results) if (r) out.push(r)
  }
  return out
}

// ── severity mapping ────────────────────────────────────────────────────────

function mapOsvApiSeverity(vuln) {
  // OSV vulns can carry a CVSS score in vuln.severity[] OR a database_specific
  // severity label. CVSS is canonical when present.
  const sevArr = vuln.severity ?? []
  if (sevArr.length > 0) {
    const score = sevArr[0]?.score ?? ''
    const m = score.match(/CVSS:[\d.]+\/[A-Z:/0-9]+/) ? score : score
    // Pull the base score number out of the CVSS vector if present.
    const numMatch = score.match(/\/(\d+\.\d+)\b/) || score.match(/^(\d+\.\d+)/)
    const num = parseFloat(numMatch?.[1] ?? '0')
    if (num >= 9.0) return 'CRITICAL'
    if (num >= 7.0) return 'WARNING'
    if (num > 0) return 'INFO'
  }
  // Fall back to GHSA-style label if present. Mapping aligns with the
  // CVSS bands above and with report.mjs's mapNpmSeverity — see comment
  // there. `high` is WARNING (not CRITICAL) to stay cross-source consistent.
  const dbSev = vuln.database_specific?.severity ?? vuln.database_specific?.cwe_severity
  if (typeof dbSev === 'string') {
    const s = dbSev.toLowerCase()
    if (s === 'critical') return 'CRITICAL'
    if (s === 'high' || s === 'moderate' || s === 'medium') return 'WARNING'
    if (s === 'low') return 'INFO'
  }
  return 'WARNING'
}

function extractFix(detail, pkg) {
  // Look for a `fixed` event in the affected ranges for this ecosystem.
  for (const aff of detail.affected ?? []) {
    if (aff.package?.ecosystem !== pkg.ecosystem) continue
    for (const range of aff.ranges ?? []) {
      const fixed = (range.events ?? []).find((e) => e.fixed)?.fixed
      if (fixed) return `Upgrade ${pkg.name} to ${fixed} or later.`
    }
  }
  return `See ${detail.id} advisory for upgrade guidance.`
}

// ── lockfile parsers ────────────────────────────────────────────────────────

function collectPackages(dir) {
  const packages = []
  packages.push(...parseNpmLock(dir))
  packages.push(...parsePythonReqs(dir))
  packages.push(...parseGoSum(dir))
  return packages
}

function parseNpmLock(dir) {
  const path = join(dir, 'package-lock.json')
  if (!existsSync(path)) return []
  let raw
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
  const out = []
  const seen = new Set()
  // npm v7+: flat `packages` map keyed by relative install path.
  if (raw.packages) {
    for (const [key, val] of Object.entries(raw.packages)) {
      if (!val?.version) continue
      if (key === '') continue // root project — not a dep
      const idx = key.lastIndexOf('node_modules/')
      const name = idx >= 0 ? key.slice(idx + 'node_modules/'.length) : key
      const dedupe = `${name}@${val.version}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      out.push({ name, version: val.version, ecosystem: 'npm', lockfile: 'package-lock.json' })
    }
    return out
  }
  // npm v6 fallback: nested dependencies tree.
  const walk = (deps) => {
    for (const [name, info] of Object.entries(deps ?? {})) {
      if (info?.version) {
        const dedupe = `${name}@${info.version}`
        if (!seen.has(dedupe)) {
          seen.add(dedupe)
          out.push({ name, version: info.version, ecosystem: 'npm', lockfile: 'package-lock.json' })
        }
      }
      if (info?.dependencies) walk(info.dependencies)
    }
  }
  walk(raw.dependencies)
  return out
}

function parsePythonReqs(dir) {
  const path = join(dir, 'requirements.txt')
  if (!existsSync(path)) return []
  const out = []
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.split('#')[0].trim()
    if (!trimmed) continue
    // We can only meaningfully query pinned versions. Skip ranges (>=) and
    // markers (foo; python_version<'3.9') since OSV needs an exact version.
    const m = trimmed.match(/^([A-Za-z0-9_.\-]+)\s*==\s*([0-9][^\s;]*)/)
    if (!m) continue
    out.push({ name: m[1], version: m[2], ecosystem: 'PyPI', lockfile: 'requirements.txt' })
  }
  return out
}

function parseGoSum(dir) {
  const path = join(dir, 'go.sum')
  if (!existsSync(path)) return []
  const out = []
  const seen = new Set()
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    // Format: `module/path v1.2.3[/go.mod] h1:hash`
    const m = line.match(/^(\S+)\s+v(\S+?)(?:\/go\.mod)?\s+h1:/)
    if (!m) continue
    const name = m[1]
    const version = `v${m[2]}`
    const key = `${name}@${version}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, version, ecosystem: 'Go', lockfile: 'go.sum' })
  }
  return out
}
