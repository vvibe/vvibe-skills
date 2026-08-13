/**
 * PostToolUse(Bash) — after a successful `git commit`, remind the agent to log
 * a user-visible change via the vvibe-changelog skill.
 *
 * Why a hook and not skill prose: vvibe-changelog's trigger fires on work the
 * agent has just FINISHED, and an after-the-fact trigger written in a SKILL.md
 * reliably never fires — the skill isn't loaded at the moment it becomes
 * relevant. A hook fires whether or not the agent remembered to think about it.
 *
 * Never blocks and never fails loudly: a broken nudge must not break a commit.
 */

// Conventional-commit prefixes that are never user-visible on their own.
const INTERNAL = /^(chore|docs?|test|tests|style|refactor|ci|build|perf|revert)([(!:])/i

// `git commit` prints "[branch abc1234] subject" on success. Matching it both
// confirms the commit happened and hands us the subject — no need to parse -m
// out of the command line.
//
// What sits before the sha is not always a bare branch name; git also emits
// "[master (root-commit) 2bd80dd] …" for the first commit in a repo and
// "[detached HEAD f6c7d5d] …" off a detached checkout. Allow anything up to the
// sha, so those don't silently go un-nudged.
const COMMITTED = /^\[[^\]]+ [0-9a-f]{7,40}\] +(.+)$/m

/**
 * Subject of HEAD. Only consulted for `git commit -q`, which succeeds while
 * printing nothing at all, so there is no summary line to read.
 *
 * execFileSync with an argument array, never a shell string — the cwd comes
 * from the hook payload and must not reach a shell.
 */
function headSubject(cwd) {
  try {
    return require('node:child_process')
      .execFileSync('git', ['log', '-1', '--pretty=%s'], {
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

/** @returns {string|null} context to inject, or null to stay quiet */
function nudgeFor({ command = '', stdout = '', stderr = '', cwd = '' } = {}, readSubject = headSubject) {
  if (!/\bgit\b[^|;&]*\bcommit\b/.test(command)) return null
  // An amend re-commits work that was already nudged once.
  if (/--amend/.test(command)) return null

  const m = COMMITTED.exec(stdout)
  let subject
  if (m) {
    subject = m[1].trim()
  } else if (stdout.trim() === '' && stderr.trim() === '') {
    // Silence is how `git commit -q` reports success. Every failure path
    // (nothing to commit, bad pathspec, hook rejection) says so on one stream
    // or the other, so anything printed that ISN'T the summary line means no
    // commit was made — fall through to null below.
    subject = readSubject(cwd)
  }
  if (!subject) return null

  if (INTERNAL.test(subject)) return null

  return [
    `Committed: "${subject}".`,
    'If that change is user-visible — a shipped feature, pricing or plan config,',
    'positioning/marketing copy, or a notable fix — log it now with the',
    'vvibe-changelog skill (`vibe_log_product_change`), so VVibe can flag a stale',
    'Product Knowledge Base and suggest announcing it. If it is not user-visible,',
    'ignore this and carry on.',
  ].join(' ')
}

/**
 * One nudge per session: five feature commits in a row are one change to log,
 * not five. `wx` makes the claim atomic, so two hooks firing at once can't both
 * win it.
 *
 * Degrades to always-nudging rather than to silence — a session with no usable
 * id (another host's payload shape) or an unwritable tmpdir must not turn the
 * nudge off permanently.
 *
 * @returns {boolean} true when this call owns the session's single nudge
 */
function claimSession(sessionId, dir = require('node:os').tmpdir()) {
  // The id reaches the filesystem, so strip it to a filename first.
  const safe = String(sessionId ?? '').replace(/[^A-Za-z0-9._-]/g, '')
  if (!safe) return true
  const fs = require('node:fs')
  try {
    fs.closeSync(fs.openSync(require('node:path').join(dir, `vvibe-changelog-nudge-${safe}`), 'wx'))
    return true
  } catch (err) {
    return err.code !== 'EEXIST'
  }
}

module.exports = { nudgeFor, claimSession }

// ponytail: the marker files are left for the OS to reap, and the session's one
// nudge covers the whole session even if a second, unrelated change ships later
// in it. Key the marker on session + repo if that proves too coarse.
if (require.main === module) {
  let raw = ''
  process.stdin.on('data', (c) => (raw += c))
  process.stdin.on('end', () => {
    try {
      const e = JSON.parse(raw)
      const context = nudgeFor({
        command: e.tool_input?.command,
        stdout: e.tool_response?.stdout,
        stderr: e.tool_response?.stderr,
        cwd: e.cwd,
      })
      // Claim only once there's something to say, so an internal commit doesn't
      // burn the session's one nudge.
      if (context && claimSession(e.session_id)) {
        process.stdout.write(
          JSON.stringify({
            hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context },
          }),
        )
      }
    } catch {
      // Malformed payload, closed stdout, anything at all: stay silent.
    }
  })
}
