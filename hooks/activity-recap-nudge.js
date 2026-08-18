/**
 * Stop — once a session finishes, if activity-collector.js recorded any
 * commits or PRs for it that haven't been journaled yet, reminds the agent
 * to log them via `vibe_log_activity` (VV-161 ships the MCP tool itself;
 * this hook only ever emits text instructions, never calls it).
 *
 * `stop_hook_active` guards against the obvious trap: this hook's own
 * "block" decision re-triggers Stop, so it must recognize a Stop it caused
 * and bail before doing anything else.
 *
 * One nudge per session — reuses changelog-nudge.js's claimSession under a
 * different marker prefix, so the same atomic-wx / TTL / clock-slack
 * handling doesn't need reproducing here.
 *
 * Never blocks progress and never fails loudly: a broken recap must not
 * stop a session from ending.
 */

const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { claimSession } = require('./changelog-nudge.js')

const MARKER_PREFIX = 'vvibe-activity-nudge-'

function sanitize(sessionId) {
  if (typeof sessionId !== 'string') return null
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, '')
  return safe || null
}

function activityPath(sessionId, dir = os.tmpdir()) {
  const safe = sanitize(sessionId)
  return safe ? path.join(dir, `vvibe-activity-${safe}.jsonl`) : null
}

/** @returns {object[]} parsed activity records; empty on any read/parse trouble */
function readActivity(sessionId, dir = os.tmpdir()) {
  const file = activityPath(sessionId, dir)
  if (!file) return []
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return [] // no file yet = no activity this session
  }
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null // a torn/partial line from a racing writer — skip it
      }
    })
    .filter(Boolean)
}

/** @returns {string|null} reason to inject, or null to stay quiet */
function recapFor(sessionId, dir = os.tmpdir()) {
  const entries = readActivity(sessionId, dir)
  if (entries.length === 0) return null

  const commits = entries.filter((e) => e && e.kind === 'commit')
  const prs = entries.filter((e) => e && e.kind === 'pr')
  if (commits.length === 0 && prs.length === 0) return null

  const lines = [
    'This session shipped work that has not been journaled yet.',
    "If the vvibe MCP connection isn't installed, ignore this and stop normally.",
    'Otherwise, call vibe_log_activity now, once per item below:',
  ]

  for (const pr of prs) {
    lines.push(`- kind:'pr', dedup_key:'${pr.dedup_key}', summarizing ${pr.url}.`)
  }
  if (commits.length > 0) {
    lines.push(
      "- One combined call for whatever commits above aren't already covered by a PR: " +
        `kind:'session', dedup_key:'session:${sessionId}', with metadata.intent describing ` +
        'what this session was working on. Commits collected this session:',
    )
    for (const c of commits) {
      lines.push(`  - ${c.sha} "${c.subject}" (dedup_key: ${c.dedup_key})`)
    }
  }

  return lines.join('\n')
}

module.exports = { recapFor, activityPath, MARKER_PREFIX }

if (require.main === module) {
  let raw = ''
  process.stdin.on('data', (c) => (raw += c))
  process.stdin.on('end', () => {
    try {
      const e = JSON.parse(raw)
      if (e.stop_hook_active) return // this hook's own prior "block" — don't loop

      const reason = recapFor(e.session_id)
      if (reason && claimSession(e.session_id, os.tmpdir(), undefined, MARKER_PREFIX)) {
        process.stdout.write(JSON.stringify({ decision: 'block', reason }))
      }
    } catch {
      // Malformed payload, closed stdout, anything at all: stay silent.
    }
  })
}
