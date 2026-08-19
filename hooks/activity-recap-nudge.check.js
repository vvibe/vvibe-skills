// node hooks/activity-recap-nudge.check.js
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { recapFor, MARKER_PREFIX } = require('./activity-recap-nudge.js')
const { claimSession } = require('./changelog-nudge.js')

const sha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const write = (dir, sessionId, lines) =>
  fs.writeFileSync(path.join(dir, `vvibe-activity-${sessionId}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')

const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'recap-check-'))
try {
  // No activity file at all: stay quiet.
  assert.equal(recapFor('no-file', tmp), null)

  // An empty file: stay quiet.
  fs.writeFileSync(path.join(tmp, 'vvibe-activity-empty.jsonl'), '')
  assert.equal(recapFor('empty', tmp), null)

  // Commits only: names each one with its dedup_key, and asks for one combined
  // session-kind call.
  write(tmp, 'commits-only', [{ kind: 'commit', sha, subject: 'feat: dark mode', dedup_key: `commit:${sha}` }])
  {
    const r = recapFor('commits-only', tmp)
    assert.ok(r.includes(`commit:${sha}`))
    assert.ok(r.includes('feat: dark mode'))
    assert.ok(r.includes("kind:'session'"))
    assert.ok(r.includes('dedup_key:\'session:commits-only\''))
    assert.ok(!r.includes("kind:'pr'"), 'no PR entry means no PR-shaped instruction')
  }

  // PRs only: one instruction line per PR, dedup_key format intact.
  write(tmp, 'prs-only', [{ kind: 'pr', url: 'https://github.com/a/b/pull/9', dedup_key: 'pr:a/b#9' }])
  {
    const r = recapFor('prs-only', tmp)
    assert.ok(r.includes("kind:'pr'"))
    assert.ok(r.includes('pr:a/b#9'))
    assert.ok(!r.includes("kind:'session'"), 'no commits means no session-summary instruction')
  }

  // Mixed: both instructions present.
  write(tmp, 'mixed', [
    { kind: 'commit', sha, subject: 'feat: x', dedup_key: `commit:${sha}` },
    { kind: 'pr', url: 'https://github.com/a/b/pull/1', dedup_key: 'pr:a/b#1' },
  ])
  {
    const r = recapFor('mixed', tmp)
    assert.ok(r.includes("kind:'pr'") && r.includes("kind:'session'"))
  }

  // A torn/malformed line (racing writer, truncated append) is skipped, not fatal.
  fs.writeFileSync(
    path.join(tmp, 'vvibe-activity-torn.jsonl'),
    `${JSON.stringify({ kind: 'commit', sha, subject: 'ok', dedup_key: `commit:${sha}` })}\n{not json\n`,
  )
  {
    const r = recapFor('torn', tmp)
    assert.ok(r && r.includes('ok'), 'the good line must still be used')
  }

  // A file whose only lines fail to parse (or parse to something without a
  // recognizable kind) must not throw and must stay quiet.
  fs.writeFileSync(path.join(tmp, 'vvibe-activity-garbage.jsonl'), 'not json at all\n')
  assert.equal(recapFor('garbage', tmp), null)

  // Missing/non-string session id: no crash, quiet.
  assert.equal(recapFor(undefined, tmp), null)
  assert.equal(recapFor(123, tmp), null)

  // One nudge per session — same claimSession primitive as changelog-nudge.js,
  // just under this hook's own marker prefix so the two never collide.
  assert.equal(claimSession('sess-a', tmp, undefined, MARKER_PREFIX), true)
  assert.equal(claimSession('sess-a', tmp, undefined, MARKER_PREFIX), false, 'second Stop of a session stays quiet')
  assert.equal(claimSession('sess-b', tmp, undefined, MARKER_PREFIX), true, 'a different session nudges again')
  // The changelog nudge's own marker for the same session id is untouched —
  // different prefixes, no collision.
  assert.equal(claimSession('sess-a', tmp), true, "the changelog nudge's marker is independent")
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

// End-to-end: run the real script over stdin.
{
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'recap-e2e-'))
  const run = (payload) =>
    require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, 'activity-recap-nudge.js')], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: dir, TEMP: dir, TMP: dir },
    })
  try {
    // stop_hook_active must short-circuit before anything else runs — even
    // with activity on disk, it must not nudge (this is what stops the
    // hook's own "block" decision from looping forever).
    write(dir, 'loop', [{ kind: 'commit', sha, subject: 'x', dedup_key: `commit:${sha}` }])
    assert.equal(run({ session_id: 'loop', stop_hook_active: true }), '')

    // No activity: silent.
    assert.equal(run({ session_id: 'no-activity' }), '')

    // Real activity, first Stop: nudges with a block decision naming the commit.
    write(dir, 'e2e', [{ kind: 'commit', sha, subject: 'feat: e2e', dedup_key: `commit:${sha}` }])
    const out = run({ session_id: 'e2e' })
    const parsed = JSON.parse(out)
    assert.equal(parsed.decision, 'block')
    assert.ok(parsed.reason.includes('feat: e2e'))
    assert.ok(parsed.reason.includes('vibe_log_activity'))

    // Second Stop of the same session: already nudged, stays quiet.
    assert.equal(run({ session_id: 'e2e' }), '')

    // Malformed stdin must not throw.
    require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, 'activity-recap-nudge.js')], {
      input: 'not json',
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: dir, TEMP: dir, TMP: dir },
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

console.log('OK activity-recap-nudge')
