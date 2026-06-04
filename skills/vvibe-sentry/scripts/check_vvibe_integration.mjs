/**
 * VVIBE layer — sentry-internal checks for VVibe integration hygiene.
 *
 * Only fires on files that actually touch VVibe (greps for vvibe.ai,
 * VVIBE_API_, or @vvibe/* imports first). A non-VVibe project gets
 * no VVIBE-* findings, which is correct — there's nothing to audit.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo'])
const SCAN_EXT = /\.(m?[jt]sx?|cjs|cts)$/i

// Exclude the scanner's own source tree from scanning. Rule definitions
// literally contain the patterns they detect, so without this guard a
// self-scan reports the regex source as a finding.
const SELF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Detect candidate files (anything that mentions VVibe). */
async function findVVibeFiles(root) {
  const matches = []
  async function walk(dir) {
    const resolvedDir = resolve(dir)
    if (resolvedDir === SELF_ROOT || resolvedDir.startsWith(SELF_ROOT + sep)) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue
        await walk(join(dir, e.name))
        continue
      }
      if (!e.isFile() || !SCAN_EXT.test(e.name)) continue
      const path = join(dir, e.name)
      let content = ''
      try {
        const buf = await readFile(path, 'utf8')
        if (!/vvibe\.ai|VVIBE_API_|['"]@vvibe\//.test(buf)) continue
        content = buf
      } catch {
        continue
      }
      matches.push({ path, content })
    }
  }
  await walk(root)
  return matches
}

function f({ code, severity, title, file, line, fix }) {
  return { code, severity, title, file, line, fix, rawTool: 'vvibe-sentry', rawId: code }
}

/**
 * VVIBE-001: VVIBE_API_KEY must be read from env, not hardcoded.
 * Looks for assignments like:
 *   const key = 'pcs_live_...'
 *   const key = "pcs_test_..."
 *   apiKey: 'pcs_live_...'
 */
function checkHardcodedApiKey(file, content, rel) {
  const findings = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (/['"]pcs_(?:live|test)_[A-Za-z0-9_-]{12,}['"]/.test(lines[i])) {
      findings.push(
        f({
          code: 'VVIBE-001',
          severity: 'CRITICAL',
          title: 'VVibe API key appears hardcoded — read from environment instead',
          file: rel,
          line: i + 1,
          fix:
            'Replace the literal with `process.env.VVIBE_API_KEY`. Rotate the leaked key at vvibe.ai/dashboard, then commit the change. If the key is also in git history, scrub via gitleaks + filter-repo.',
        }),
      )
    }
  }
  return findings
}

/**
 * VVIBE-002: member-sync should send an Idempotency-Key header.
 * Triggers on fetch calls to /members/sync that lack the header.
 */
function checkMemberSyncIdempotency(file, content, rel) {
  if (!/members\/sync/.test(content)) return []
  // Look at each fetch(...) block touching members/sync; if the block doesn't
  // contain "Idempotency-Key", flag it.
  const findings = []
  const re = /fetch\s*\(([^)]*members\/sync[^)]*)\)/g
  let m
  while ((m = re.exec(content))) {
    const block = content.slice(m.index, Math.min(content.length, m.index + 600))
    if (!/Idempotency-Key/i.test(block)) {
      const line = lineOf(content, m.index)
      findings.push(
        f({
          code: 'VVIBE-002',
          severity: 'WARNING',
          title: 'Member sync call missing `Idempotency-Key` header',
          file: rel,
          line,
          fix:
            'Add an `Idempotency-Key: <stable-id>` header so retries (network blips, function restarts) do not double-count members. Use a deterministic key — e.g. user UUID + last_update timestamp.',
        }),
      )
    }
  }
  return findings
}

/**
 * VVIBE-003: email skill must respect unsubscribed_at when sending.
 * Looks for code that posts to /email/campaigns/.../send without
 * a guard on unsubscribed status.
 */
function checkEmailUnsubscribeRespected(file, content, rel) {
  if (!/email\/campaigns\/[^"'`]+\/send/.test(content)) return []
  if (/unsubscribed[_-]?at|unsubscribedAt|status.*unsubscribed|isUnsubscribed/i.test(content)) {
    return []
  }
  const line = lineOf(content, content.search(/email\/campaigns\/[^"'`]+\/send/))
  return [
    f({
      code: 'VVIBE-003',
      severity: 'CRITICAL',
      title: 'Email send path has no visible unsubscribe gate',
      file: rel,
      line,
      fix:
        'Before calling the send endpoint, filter the recipient list by `unsubscribed_at IS NULL` (or its equivalent). VVibe will reject unsubscribed addresses defensively, but the client should skip them to avoid wasted credits and ESP reputation damage.',
    }),
  ]
}

/**
 * VVIBE-004: analytics event payloads should not include raw email / phone.
 * Common pitfall when forwarding signup events to GA4.
 */
function checkAnalyticsPiiHygiene(file, content, rel) {
  if (!/(?:gtag|dataLayer\.push|trackEvent|vvibe\s*\.\s*track)\s*\(/.test(content)) return []
  const findings = []
  // crude: events with `email:` or `phone:` properties near a gtag/dataLayer call
  const re = /(gtag|dataLayer\.push|trackEvent|vvibe\.track)\s*\([^;]{0,400}\b(email|phone|phone_number)\s*:/g
  let m
  while ((m = re.exec(content))) {
    findings.push(
      f({
        code: 'VVIBE-004',
        severity: 'WARNING',
        title: 'Analytics event includes raw email/phone — strip before sending',
        file: rel,
        line: lineOf(content, m.index),
        fix:
          'Replace raw PII with a stable hashed identifier (e.g. SHA-256 of email). GA4 and most analytics providers prohibit raw PII in event params; sentry flags it because it usually means the integration was wired without the hashing step.',
      }),
    )
  }
  return findings
}

/**
 * VVIBE-005: vibe_heartbeat MCP call wired so dashboard knows agent is alive.
 * Soft check — INFO only. We look for it across the project; if no file
 * mentions it, surface one informational finding rooted at package.json.
 */
function checkHeartbeatWired(allFiles, root) {
  const wired = allFiles.some((m) => /vibe_heartbeat|vibeHeartbeat/.test(m.content))
  if (wired) return []
  return [
    f({
      code: 'VVIBE-005',
      severity: 'INFO',
      title: '`vibe_heartbeat` MCP tool not detected in project',
      file: 'package.json',
      line: null,
      fix:
        'If this project does talk to VVibe via MCP, call `vibe_heartbeat` at agent session start (or on every API request) so the creator dashboard knows the connection is alive. Skip this if the project is just a VVibe API consumer without an MCP agent.',
    }),
  ]
}

function lineOf(content, idx) {
  if (idx < 0) return null
  return content.slice(0, idx).split('\n').length
}

export async function runVVibeIntegrationChecks({ projectDir }) {
  const files = await findVVibeFiles(projectDir)
  if (files.length === 0) return []
  const findings = []
  for (const file of files) {
    const rel = relative(projectDir, file.path) || file.path
    findings.push(...checkHardcodedApiKey(file.path, file.content, rel))
    findings.push(...checkMemberSyncIdempotency(file.path, file.content, rel))
    findings.push(...checkEmailUnsubscribeRespected(file.path, file.content, rel))
    findings.push(...checkAnalyticsPiiHygiene(file.path, file.content, rel))
  }
  findings.push(...checkHeartbeatWired(files, projectDir))
  return findings
}
