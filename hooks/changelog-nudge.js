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
const COMMITTED = /^\[[^\]\s]+ +[0-9a-f]{7,40}\] +(.+)$/m

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

module.exports = { nudgeFor }

// ponytail: fires once per matching commit, with no per-session dedupe — five
// feature commits get five nudges. Add a session-keyed marker file if that
// turns out to be noisy in practice.
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
      if (context) {
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
