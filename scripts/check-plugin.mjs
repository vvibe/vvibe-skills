// Checks the plugin wiring for both hosts. Run from the repo root:
//   node scripts/check-plugin.mjs
// No dependencies and no CI — this repo has neither. Run it by hand after
// touching any manifest.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = (f) => JSON.parse(readFileSync(f, 'utf8'))

const claude = read('.claude-plugin/plugin.json')
const codex = read('.codex-plugin/plugin.json')
assert.equal(claude.name, codex.name, 'the two plugin.json files must agree on name')
assert.equal(claude.version, codex.version, 'bump BOTH plugin.json versions together')

// Both marketplaces must offer the plugin under the same name, or one host
// silently installs nothing.
for (const [file, entryName] of [
  ['.claude-plugin/marketplace.json', (p) => p.name],
  ['.agents/plugins/marketplace.json', (p) => p.name],
]) {
  const mk = read(file)
  const names = mk.plugins.map(entryName)
  assert.ok(names.includes(claude.name), `${file} has no "${claude.name}" entry (found ${names})`)
}

// The skills the plugins ship are the repo's own skills/ tree — no second copy.
const skills = readdirSync('skills', { withFileTypes: true }).filter((d) => d.isDirectory())
assert.ok(skills.length > 0, 'no skills found')
for (const s of skills) {
  assert.ok(existsSync(`skills/${s.name}/SKILL.md`), `${s.name} is missing SKILL.md`)
  // Normalize CRLF first — checkouts on Windows would otherwise miss every match.
  const src = readFileSync(`skills/${s.name}/SKILL.md`, 'utf8').replace(/\r\n/g, '\n')
  const front = src.match(/^---\n([\s\S]*?)\n---/)
  assert.ok(front, `${s.name}: SKILL.md has no frontmatter`)
  const desc = front[1].match(/^description:[ \t]*(.*)$/m)
  assert.ok(desc && desc[1].trim(), `${s.name}: SKILL.md frontmatter has no description`)
  // `description` is a YAML plain scalar, and every way it can end early costs
  // us the whole value: ": " terminates it, " #" opens a comment, and a leading
  // indicator char makes the line parse as something else. The skill still
  // *registers* either way — it just carries no trigger text, so the model
  // never has a reason to fire it. vvibe-changelog shipped dead for weeks on
  // exactly this, with both this script and `claude plugin validate` green,
  // because neither looks at description content. The tell is the always-on
  // cost in `claude plugin details`: < 20 tok against 150-370 for a healthy
  // sibling. Both truncators below were confirmed by measuring that number.
  const breakers = [
    [/:[ \t]/, '": " — ends the YAML value there; use an em dash'],
    [/[ \t]#/, '" #" — opens a YAML comment; drop the "#"'],
    [/^[-?:,[\]{}#&*!|>'"%@`]/, 'a leading YAML indicator char; reword so it starts with a letter'],
  ]
  for (const [re, why] of breakers) {
    assert.ok(
      !re.test(desc[1]),
      `${s.name}: description contains ${why}. YAML truncates it and the skill loads with no trigger text.`,
    )
  }
}
assert.equal(codex.skills, './skills/', 'codex manifest must point at the shared skills/ tree')

// Claude speaks HTTP MCP directly; Codex is stdio-only, so it gets its own
// file bridging through mcp-remote. Same server, two transports.
const claudeMcp = read('.mcp.json').mcpServers
const codexMcp = read(codex.mcpServers.replace(/^\.\//, '')).mcpServers
assert.deepEqual(Object.keys(claudeMcp), Object.keys(codexMcp), 'both hosts must expose the same server names')
for (const [name, cfg] of Object.entries(claudeMcp)) {
  assert.equal(cfg.type, 'http', `${name}: claude entry must be http`)
  assert.match(cfg.url, /^https:\/\//, `${name}: url must be https`)
  const args = codexMcp[name].args ?? []
  assert.ok(args.includes('mcp-remote'), `${name}: codex entry must bridge through mcp-remote`)
  assert.ok(args.includes(cfg.url), `${name}: codex entry points at a different URL than ${cfg.url}`)
}

// One hooks file for both hosts — they share the hookSpecificOutput contract,
// so a second copy would only drift.
assert.equal(claude.hooks, codex.hooks, 'both manifests must point at the same hooks file')
const hooks = read(claude.hooks.replace(/^\.\//, ''))
const commands = Object.values(hooks.hooks).flatMap((ms) => ms.flatMap((m) => m.hooks))
assert.ok(commands.length > 0, 'hooks file declares no commands')
for (const c of commands) {
  // Windows users are a large share of the audience: a POSIX-only hook would
  // silently never fire for them.
  assert.ok(c.commandWindows, 'every hook needs a commandWindows variant')
  // Scan BOTH variants — the Windows one uses backslashes, and a script named
  // only there would otherwise go unvalidated.
  const scripts = [c.command, c.commandWindows].flatMap((cmd) =>
    [...cmd.matchAll(/hooks[/\\]([\w.-]+\.js)/g)].map((m) => m[1]),
  )
  assert.ok(scripts.length > 0, `hook "${c.statusMessage}" references no hooks/*.js script`)
  for (const script of scripts) {
    assert.ok(existsSync(`hooks/${script}`), `hook references missing hooks/${script}`)
    assert.ok(existsSync(`hooks/${script.replace(/\.js$/, '.check.js')}`), `hooks/${script} has no .check.js`)
  }
}

console.log(
  `OK ${claude.name} ${claude.version} — ${skills.length} skills, ${Object.keys(claudeMcp).length} mcp server, ${commands.length} hook, 2 hosts`,
)
