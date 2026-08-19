/**
 * PostToolUse(Bash) — records this session's shipped work (commits, PRs) into
 * a session-scoped tmpdir file, so the Stop hook (activity-recap-nudge.js) can
 * remind the agent to journal it via vibe_log_activity once the session ends
 * (VV-162; the MCP tool itself ships separately under VV-161).
 *
 * Unlike changelog-nudge.js, this file does not decide what's user-visible —
 * the activity journal is meant to be exhaustive, so amends and internal
 * (chore/docs/test/…) commits are collected too. That filtering stays local
 * to the changelog nudge.
 *
 * Never blocks and never fails loudly: a broken collector must not break a
 * commit or a PR create.
 */

const { COMMITTED, headSubject } = require('./changelog-nudge.js')

// `gh pr create` prints the new PR's URL (usually the last line of stdout) on
// success. Owner/repo are lowercased to match the dedup_key convention.
const GH_PR_URL = /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i

/**
 * Full sha of HEAD. `git commit`'s own stdout only ever carries the short
 * (7-40 char, usually abbreviated) sha from the `[branch abc1234]` line, so
 * the dedup_key format (`commit:<full-sha>`) needs this extra call.
 */
function fullSha(cwd) {
  try {
    return require('node:child_process')
      .execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: cwd || undefined,
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      .trim()
  } catch {
    return ''
  }
}

/** @returns {object|null} one activity record, or null to collect nothing */
function collectFrom(
  { command = '', stdout = '', stderr = '', cwd = '' } = {},
  readSha = fullSha,
  readSubject = headSubject,
) {
  if (/\bgit\b[^|;&]*\bcommit\b/.test(command)) {
    const m = COMMITTED.exec(stdout)
    let subject
    if (m) {
      subject = m[1].trim()
    } else if (stdout.trim() === '' && stderr.trim() === '') {
      // `git commit -q` succeeds silently — same reasoning as changelog-nudge.js.
      subject = readSubject(cwd)
    }
    if (!subject) return null // nothing printed and HEAD unreadable = no commit happened

    const sha = readSha(cwd)
    if (!sha) return null
    return { kind: 'commit', sha, subject, dedup_key: `commit:${sha}` }
  }

  if (/\bgh\b[^|;&]*\bpr\b[^|;&]*\bcreate\b/.test(command)) {
    const m = GH_PR_URL.exec(stdout)
    if (!m) return null // failure, or a shape we don't recognize — stay quiet
    const [url, owner, repo, number] = m
    return { kind: 'pr', url, dedup_key: `pr:${owner.toLowerCase()}/${repo.toLowerCase()}#${number}` }
  }

  return null
}

/**
 * Appends one JSON line to this session's activity file. Same session_id
 * sanitization as changelog-nudge.js's claimSession, for the same reason: the
 * id reaches the filesystem.
 */
function appendActivity(sessionId, record, dir = require('node:os').tmpdir()) {
  if (typeof sessionId !== 'string') return
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, '')
  if (!safe) return
  const file = require('node:path').join(dir, `vvibe-activity-${safe}.jsonl`)
  try {
    require('node:fs').appendFileSync(file, JSON.stringify(record) + '\n')
  } catch {
    // Unwritable tmpdir, etc. Losing one journal entry isn't worth failing
    // the tool call over.
  }
}

module.exports = { collectFrom, appendActivity, GH_PR_URL }

// ponytail: the activity file is never trimmed or capped — a very long-lived
// resumed session accumulates entries forever. Left for the OS to reap, same
// as the nudge markers; revisit if a session's journal ever gets big enough
// to matter.
if (require.main === module) {
  let raw = ''
  process.stdin.on('data', (c) => (raw += c))
  process.stdin.on('end', () => {
    try {
      const e = JSON.parse(raw)
      const record = collectFrom({
        command: e.tool_input?.command,
        stdout: e.tool_response?.stdout,
        stderr: e.tool_response?.stderr,
        cwd: e.cwd,
      })
      if (record) appendActivity(e.session_id, record)
    } catch {
      // Malformed payload, closed stdin, anything at all: stay silent.
    }
  })
}
