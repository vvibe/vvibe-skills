// node hooks/changelog-nudge.check.js
const assert = require('node:assert/strict')
const { nudgeFor, claimSession } = require('./changelog-nudge.js')

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

// Not every summary line is "[branch sha]". These three are verbatim git output.
for (const line of [
  '[master 6c0ad56] feat: second thing',
  '[master (root-commit) 2bd80dd] feat: initial release',
  '[detached HEAD f6c7d5d] feat: detached thing',
]) {
  const n = nudgeFor({ command: 'git commit -m "x"', stdout: `${line}\n 1 file changed` })
  assert.ok(n, `must parse: ${line}`)
  assert.ok(n.includes(line.slice(line.indexOf('] ') + 2)), `wrong subject from: ${line}`)
}
// The bracket form still has to be a real summary line, not any bracketed text.
assert.equal(nudgeFor({ command: 'git commit -m "x"', stdout: '[INFO] feat: not a commit' }), null)

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

// One nudge per session, and no way for dedupe to become silence.
const fs = require('node:fs')
const path = require('node:path')
const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'nudge-check-'))
try {
  assert.equal(claimSession('s-1', tmp), true)
  assert.equal(claimSession('s-1', tmp), false, 'second commit of a session stays quiet')
  assert.equal(claimSession('s-2', tmp), true, 'a different session nudges again')
  // Anything that isn't a usable string id, and an unusable dir, fall back to
  // nudging. Non-strings are rejected rather than stringified: `123` and `'123'`
  // would land on one marker, as would any two objects.
  for (const id of [undefined, null, '', 123, {}, { a: 1 }, ['x']]) {
    assert.equal(claimSession(id, tmp), true, `must nudge for ${JSON.stringify(id) ?? typeof id}`)
  }
  assert.equal(claimSession('s-3', path.join(tmp, 'does-not-exist')), true)

  // `session_id` survives --resume and the marker outlives the run that wrote
  // it, so an aged marker must not silence the resumed session for good.
  const aged = path.join(tmp, 'vvibe-changelog-nudge-s-resumed')
  fs.closeSync(fs.openSync(aged, 'wx'))
  const longAgo = new Date(Date.now() - 13 * 60 * 60 * 1000)
  fs.utimesSync(aged, longAgo, longAgo)
  assert.equal(claimSession('s-resumed', tmp), true, 'a stale marker must not silence a resumed session')
  assert.equal(claimSession('s-resumed', tmp), false, 'taking a stale marker over re-dates it')
  // A marker inside the window still dedupes.
  assert.equal(claimSession('s-1', tmp, 60_000), false)

  // Dated in the future (clock step back, restored snapshot) is stale as well —
  // a negative age read literally would be a nudge that never expires.
  const future = path.join(tmp, 'vvibe-changelog-nudge-s-future')
  fs.closeSync(fs.openSync(future, 'wx'))
  const ahead = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  fs.utimesSync(future, ahead, ahead)
  assert.equal(claimSession('s-future', tmp), true, 'a future-dated marker must not silence a session')
  assert.equal(claimSession('s-future', tmp), false, 'and it gets re-dated on take-over')
  // An id carrying path separators lands inside dir, and still dedupes.
  assert.equal(claimSession('../../escape', tmp), true)
  assert.equal(claimSession('../../escape', tmp), false, 'sanitized id must still dedupe')
  assert.deepEqual(
    fs.readdirSync(tmp).sort(),
    [
      'vvibe-changelog-nudge-....escape',
      'vvibe-changelog-nudge-s-1',
      'vvibe-changelog-nudge-s-2',
      'vvibe-changelog-nudge-s-future',
      'vvibe-changelog-nudge-s-resumed',
    ],
    'markers must stay in dir',
  )
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

// Claiming only AFTER nudgeFor() returns something is what stops a `chore:`
// commit from burning the session's one nudge — and that ordering lives in the
// main block, so only running the script end to end can check it.
{
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'nudge-e2e-'))
  const run = (subject) =>
    require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, 'changelog-nudge.js')], {
      input: JSON.stringify({
        session_id: 'e2e',
        tool_input: { command: 'git commit -m "x"' },
        tool_response: { stdout: `[main a1b2c3d] ${subject}\n 1 file changed` },
      }),
      encoding: 'utf8',
      // os.tmpdir() reads TMPDIR on POSIX and TEMP/TMP on Windows.
      env: { ...process.env, TMPDIR: dir, TEMP: dir, TMP: dir },
    })
  try {
    assert.equal(run('chore: bump deps'), '', 'an internal commit stays silent')
    assert.match(run('feat: dark mode'), /vibe_log_product_change/, 'the chore must not have burned the nudge')
    assert.equal(run('feat: something else'), '', 'and the session is spent after its one nudge')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

console.log('OK changelog-nudge')
