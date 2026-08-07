// node hooks/changelog-nudge.check.js
const assert = require('node:assert/strict')
const { nudgeFor } = require('./changelog-nudge.js')

const ok = (subject, command = 'git commit -m "x"') =>
  nudgeFor({ command, stdout: `[main a1b2c3d] ${subject}\n 2 files changed, 9 insertions(+)` })

// Fires on a real, user-visible commit, and names the subject.
const n = ok('feat(billing): annual plans')
assert.ok(n && n.includes('feat(billing): annual plans'))
assert.ok(n.includes('vibe_log_product_change'))

// Internal commits stay quiet.
for (const s of ['chore: bump deps', 'docs: fix typo', 'test: add case', 'refactor(api)!: split']) {
  assert.equal(ok(s), null, `should ignore "${s}"`)
}

// A subject that merely starts with those letters is still user-visible.
assert.ok(ok('documented pricing is now live'), 'must not match on prefix letters alone')

// No commit line in stdout = the commit did not happen.
assert.equal(nudgeFor({ command: 'git commit -m "x"', stdout: 'nothing to commit, working tree clean' }), null)
assert.equal(nudgeFor({ command: 'git commit -m "x"', stdout: 'error: pathspec did not match' }), null)
// ...including when git said so on stderr instead.
assert.equal(nudgeFor({ command: 'git commit -q', stderr: 'error: could not commit' }, () => 'feat: x'), null)

// `git commit -q` succeeds while printing nothing, so the subject has to come
// from HEAD instead of the (absent) summary line.
const quiet = nudgeFor({ command: 'git commit -q -m "x"' }, () => 'feat(billing): annual plans')
assert.ok(quiet && quiet.includes('feat(billing): annual plans'), 'quiet commit must still nudge')
assert.equal(nudgeFor({ command: 'git commit -q' }, () => 'chore: bump'), null, 'quiet filters too')
// An unreadable HEAD (not a repo, git missing) stays quiet rather than throwing.
assert.equal(nudgeFor({ command: 'git commit -q' }, () => ''), null)

// Amends re-commit already-nudged work.
assert.equal(ok('feat: thing', 'git commit --amend --no-edit'), null)

// Unrelated commands, including ones that merely mention the word.
assert.equal(nudgeFor({ command: 'git status', stdout: '[main a1b2c3d] feat: x' }), null)
assert.equal(nudgeFor({ command: 'git log --oneline | grep commit', stdout: '[main a1b2c3d] feat: x' }), null)

// Missing fields must not throw.
assert.equal(nudgeFor(), null)
assert.equal(nudgeFor({}), null)

console.log('OK changelog-nudge')
