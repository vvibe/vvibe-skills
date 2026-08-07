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

/** @returns {string|null} context to inject, or null to stay quiet */
function nudgeFor({ command = '', stdout = '' } = {}) {
  if (!/\bgit\b[^|;&]*\bcommit\b/.test(command)) return null
  // An amend re-commits work that was already nudged once.
  if (/--amend/.test(command)) return null

  const m = COMMITTED.exec(stdout)
  if (!m) return null // failed, aborted, or nothing to commit

  const subject = m[1].trim()
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
