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

// A marker this old is not a nudge anyone remembers seeing. Sessions outlive
// their own working day only by being resumed.
const MARKER_TTL_MS = 12 * 60 * 60 * 1000

// How far a marker's timestamp may lead the clock before it reads as stale.
// Measured lead between a write and the next `stat` is under 2ms, so 60s is a
// five-thousand-fold margin that still can't be reached by a real clock step.
const CLOCK_LEAD_SLACK_MS = 60 * 1000

/**
 * One nudge per session: five feature commits in a row are one change to log,
 * not five. `wx` makes the claim atomic, so two hooks firing at once can't both
 * win it.
 *
 * Every failure degrades to nudging, never to silence. An id that isn't a
 * string (another host's payload shape), an unwritable tmpdir, an unreadable
 * marker, or a marker older than `ttlMs` all nudge — the last of those is what
 * keeps `--resume` working, since `session_id` survives it and the tmpdir
 * marker outlives the run that wrote it.
 *
 * @returns {boolean} true when this call owns the session's single nudge
 */
function claimSession(sessionId, dir = require('node:os').tmpdir(), ttlMs = MARKER_TTL_MS) {
  // Stringifying can't keep ids apart (123 and '123' collide, as do any two
  // objects), and the id reaches the filesystem — so demand a string, then
  // strip it to a filename.
  if (typeof sessionId !== 'string') return true
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, '')
  if (!safe) return true
  const fs = require('node:fs')
  const marker = require('node:path').join(dir, `vvibe-changelog-nudge-${safe}`)
  try {
    fs.closeSync(fs.openSync(marker, 'wx'))
    return true
  } catch (err) {
    if (err.code !== 'EEXIST') return true
    try {
      // Filesystem timestamps and `Date.now()` read different clock sources —
      // on Windows the file time leads by a millisecond or two — so a marker
      // written moments ago can measure as a slightly negative age. Tolerate
      // that much lead and no more: a marker dated genuinely ahead (clock step
      // back, restored snapshot, skewed network mount) is stale, since read as
      // a plain signed age it would be a nudge that never expires.
      const age = Date.now() - fs.statSync(marker).mtimeMs
      if (age > -CLOCK_LEAD_SLACK_MS && age < ttlMs) return false
      // Stale: an earlier run of a resumed session, or debris that happens to
      // carry this name. Take it over, and re-date it so this run dedupes.
      fs.utimesSync(marker, new Date(), new Date())
    } catch {
      // Can't judge its age. Nudge rather than go quiet.
    }
    return true
  }
}

module.exports = { nudgeFor, claimSession }

// ponytail: marker files are left for the OS to reap, the 12h TTL is a guess at
// "same working day" rather than a real session boundary, and one nudge covers a
// whole session even if a second, unrelated change ships later in it. Key the
// marker on session + repo if that proves too coarse.
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
