// node hooks/activity-collector.check.js
const assert = require('node:assert/strict')
const { collectFrom, appendActivity } = require('./activity-collector.js')

const sha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const withSha = (record) => collectFrom(record, () => sha)

// A normal commit is collected, full sha included (not the short one git printed).
{
  const r = withSha({ command: 'git commit -m "x"', stdout: '[main a1b2c3d] feat: dark mode\n 1 file changed' })
  assert.deepEqual(r, { kind: 'commit', sha, subject: 'feat: dark mode', dedup_key: `commit:${sha}` })
}

// Unlike changelog-nudge, internal-prefix commits ARE collected — the journal
// is exhaustive, filtering is the nudge's job alone.
for (const subject of ['chore: bump deps', 'docs: fix typo', 'test: add case']) {
  const r = withSha({ command: 'git commit -m "x"', stdout: `[main a1b2c3d] ${subject}` })
  assert.ok(r && r.subject === subject, `internal commit "${subject}" must still be collected`)
}

// Amends ARE collected too, for the same reason.
{
  const r = withSha({ command: 'git commit --amend --no-edit', stdout: '[main a1b2c3d] feat: thing' })
  assert.ok(r && r.kind === 'commit', 'amend must still be collected')
}

// `git commit -q` succeeds silently — subject comes from the injected HEAD reader.
{
  const r = collectFrom({ command: 'git commit -q -m "x"' }, () => sha, () => 'feat: quiet')
  assert.deepEqual(r, { kind: 'commit', sha, subject: 'feat: quiet', dedup_key: `commit:${sha}` })
}

// No commit happened: nothing printed to either stream, and HEAD unreadable.
assert.equal(collectFrom({ command: 'git commit -q' }, () => sha, () => ''), null)
assert.equal(withSha({ command: 'git commit -m "x"', stdout: 'nothing to commit, working tree clean' }), null)
// git printed a summary line but `git rev-parse HEAD` failed — stay quiet rather
// than record a commit with no sha.
assert.equal(collectFrom({ command: 'git commit -m "x"', stdout: '[main a1b2c3d] feat: x' }, () => ''), null)

// Unrelated commands, including ones that merely mention the words.
assert.equal(collectFrom({ command: 'git status' }), null)
assert.equal(collectFrom({ command: 'git log --oneline | grep commit', stdout: '[main a1b2c3d] feat: x' }), null)
assert.equal(collectFrom(), null)
assert.equal(collectFrom({}), null)

// `gh pr create` success: URL parsed, owner/repo lowercased for the dedup_key.
{
  const r = collectFrom({ command: 'gh pr create --fill', stdout: 'https://github.com/Vvibe/Vvibe-Skills/pull/42\n' })
  assert.deepEqual(r, { kind: 'pr', url: 'https://github.com/Vvibe/Vvibe-Skills/pull/42', dedup_key: 'pr:vvibe/vvibe-skills#42' })
}
// A multi-line success message with the URL not on the last line still parses.
{
  const r = collectFrom({
    command: 'gh pr create --title "x" --body "y"',
    stdout: 'Creating pull request for feat-branch into main in vvibe/vvibe-skills\n\nhttps://github.com/vvibe/vvibe-skills/pull/7\n',
  })
  assert.equal(r.dedup_key, 'pr:vvibe/vvibe-skills#7')
}
// Failure: no URL in stdout (error went to stderr, or gh isn't authenticated).
assert.equal(collectFrom({ command: 'gh pr create --fill', stdout: '', stderr: 'error: not authenticated' }), null)
assert.equal(collectFrom({ command: 'gh pr view' }), null, 'gh pr view is not gh pr create')

// Missing fields must not throw.
assert.equal(collectFrom(undefined, () => sha), null)

// appendActivity: sanitizes the session id the same way claimSession does,
// writes one JSON line per call, and degrades silently rather than throwing.
{
  const fs = require('node:fs')
  const path = require('node:path')
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'activity-check-'))
  try {
    appendActivity('s-1', { kind: 'commit', sha, subject: 'x', dedup_key: `commit:${sha}` }, tmp)
    appendActivity('s-1', { kind: 'pr', url: 'https://github.com/a/b/pull/1', dedup_key: 'pr:a/b#1' }, tmp)
    const file = path.join(tmp, 'vvibe-activity-s-1.jsonl')
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
    assert.equal(lines.length, 2)
    assert.equal(JSON.parse(lines[0]).kind, 'commit')
    assert.equal(JSON.parse(lines[1]).dedup_key, 'pr:a/b#1')

    // Path-separator-carrying ids land inside dir, same sanitization as claimSession.
    appendActivity('../../escape', { kind: 'commit', sha, subject: 'x', dedup_key: `commit:${sha}` }, tmp)
    assert.ok(fs.existsSync(path.join(tmp, 'vvibe-activity-....escape.jsonl')))

    // Non-string / empty ids and an unwritable dir must not throw.
    for (const id of [undefined, null, '', 123, {}]) {
      appendActivity(id, { kind: 'commit' }, tmp)
    }
    appendActivity('s-2', { kind: 'commit' }, path.join(tmp, 'does-not-exist'))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

// End-to-end: run the real script over stdin, confirm it writes the file.
{
  const fs = require('node:fs')
  const path = require('node:path')
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'activity-e2e-'))
  try {
    require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, 'activity-collector.js')], {
      input: JSON.stringify({
        session_id: 'e2e',
        cwd: __dirname, // a real git repo, so `git rev-parse HEAD` succeeds
        tool_input: { command: 'git commit -m "x"' },
        tool_response: { stdout: '[main a1b2c3d] chore: e2e check\n 1 file changed' },
      }),
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: dir, TEMP: dir, TMP: dir },
    })
    const file = path.join(dir, 'vvibe-activity-e2e.jsonl')
    const entry = JSON.parse(fs.readFileSync(file, 'utf8').trim())
    assert.equal(entry.kind, 'commit')
    assert.equal(entry.subject, 'chore: e2e check')
    assert.match(entry.sha, /^[0-9a-f]{40}$/, 'must be the full sha, not the short one git printed')
    assert.equal(entry.dedup_key, `commit:${entry.sha}`)

    // Malformed stdin must not throw or write anything.
    require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, 'activity-collector.js')], {
      input: 'not json',
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: dir, TEMP: dir, TMP: dir },
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

console.log('OK activity-collector')
