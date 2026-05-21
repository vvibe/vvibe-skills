# Fix explanations — how the agent walks the creator through each layer

When a sentry finding is non-trivial, the agent shouldn't dump the raw
scanner output at the user. Translate first. The patterns below give the
agent a template per layer.

The agent should follow this loop per finding:

1. **What happened, in one sentence, no jargon.**
2. **Why it matters** (one sentence, focus on user-visible impact).
3. **What to do** — numbered steps the creator can execute.
4. **How to verify** — one short command or check.
5. **Wait for confirmation** before moving on.

## Secrets (gitleaks)

### Live-credential leak (CRITICAL)

> "Your `<name>` API key is sitting inside your git history. Anyone who
> pulls this repo — including bots scanning GitHub — can use it as if
> they were you."

**Why it matters.** Even if you delete the file in a later commit, the
key is still in git history. Attackers scrape public repos for these
within minutes of being pushed.

**Steps:**

1. Rotate the key at the issuer (`<provider>` dashboard → "regenerate")
2. Add the new value to `.env` and confirm `.env` is in `.gitignore`
3. Remove the literal from your source — replace with `process.env.<NAME>`
4. Scrub git history:
   - Simple case (key only in recent commits): `git filter-repo --invert-paths --path <file>`
   - Wider: use [BFG](https://rtyley.github.io/bfg-repo-cleaner/)
5. Force-push the cleaned history (coordinate with anyone else on the repo)

**Verify:** `gitleaks detect --source . --redact` returns no findings
for that rule.

### Test-credential leak (WARNING)

> "Your `<name>` test API key is in git history. It's a sandbox key, so
> no production damage, but anyone can spam your test environment."

Same steps as above; rotation is less urgent. You may decide to leave
it after confirming it's only a sandbox key.

## Dependencies (osv-scanner / npm audit)

### Known-exploited CVE (CRITICAL)

> "`<package>@<version>` is on CISA's known-exploited list. Active
> exploit code exists. Upgrade immediately."

**Steps:**

1. Try `npm audit fix` — works for ~80% of cases without breakage
2. If that fails: `npm install <package>@<safe-version>` and resolve
   any peer-dep conflicts
3. If the fix requires a major-version bump: read the package's
   CHANGELOG for the breaking changes, then `npm install <package>@<new-major>`
4. Run your test suite

**Verify:** `npx osv-scanner --lockfile package-lock.json` no longer
flags the advisory.

### High CVE without known exploit (WARNING)

> "`<package>@<version>` has a high-severity CVE. No active exploit
> yet, but the patch path is short — best to upgrade this week."

Same steps; can be slotted into normal maintenance rather than rushed.

### Medium / low (INFO)

> "`<package>` has a medium/low CVE. Track it; upgrade when convenient."

Don't block deploys on these. Mention them in standups / changelogs.

## SAST (semgrep)

### SQL injection (CRITICAL)

> "Line `<file>:<line>` builds a SQL query by string-concatenating user
> input. An attacker can change the query to read or destroy any data
> in your database."

**Steps:**

1. Switch the call to use parameterised queries (every database client
   supports this)
2. Find every other place in the file using the same pattern
3. Re-run sentry to confirm

**Verify:** semgrep no longer flags the line.

### XSS sink (CRITICAL)

> "Line `<file>:<line>` renders user input directly into HTML without
> escaping. An attacker can inject `<script>` tags that run as your
> page."

**Steps:**

1. Use the framework's safe-render API (`{value}` in React/JSX,
   `{{ value }}` in Vue, `<%- escape(value) %>` in EJS)
2. If you genuinely need to render HTML, use a sanitiser
   (DOMPurify, sanitize-html)
3. Search for sibling sinks (`dangerouslySetInnerHTML`, `innerHTML =`)

### Missing CSRF on state-changing route (WARNING)

> "Your `POST <route>` endpoint doesn't check a CSRF token. A malicious
> page in another tab could trigger this action as a logged-in user."

**Steps:**

1. If the framework has built-in CSRF middleware, enable it
2. Otherwise: set a session-bound CSRF cookie, require its echo in a
   header for state-changing requests
3. Audit the rest of your `POST` / `PUT` / `DELETE` routes the same way

### Other semgrep findings

Each finding includes a URL (`extra.metadata.source` in the JSON) that
points at semgrep's docs for the rule. When the agent isn't sure how
to explain a finding, paste the URL and read the canonical write-up
instead of guessing.

## VVibe integration layer

### VVIBE-001 (hardcoded API key) — CRITICAL

> "Your VVibe API key is hardcoded in `<file>:<line>` instead of being
> read from an environment variable. Anyone reading this file gets your
> key."

**Steps:**

1. Rotate the key at vvibe.ai/dashboard
2. Replace the literal with `process.env.VVIBE_API_KEY`
3. Add `VVIBE_API_KEY=...` to `.env` (gitignored)
4. Re-run sentry

### VVIBE-002 (member sync without Idempotency-Key) — WARNING

> "Your member sync calls don't include an `Idempotency-Key` header.
> If the network blips and the request retries, you'll create duplicate
> members in the dashboard."

**Steps:**

1. Add a header: `Idempotency-Key: <user_uuid>:<last_updated>`
2. The key should be stable for the same logical sync; if the
   user/timestamp combination matches a prior request, VVibe returns
   the cached result.

### VVIBE-003 (email send without unsubscribe gate) — CRITICAL

> "Your email send code doesn't filter out unsubscribed recipients.
> Sending to unsubscribed addresses damages your sender reputation,
> wastes credits, and may violate CAN-SPAM / GDPR."

**Steps:**

1. Add `WHERE unsubscribed_at IS NULL` (or equivalent) to the recipient
   query
2. If you can't filter at query time, drop unsubscribed recipients
   client-side before posting to `/send`

### VVIBE-004 (analytics PII leak) — WARNING

> "Your analytics event includes raw email/phone in the params. GA4
> rejects events with PII; even if it doesn't, you're sending personal
> data to a third party without explicit consent."

**Steps:**

1. Hash the value before sending: `sha256(email.toLowerCase().trim())`
2. Use a stable hash so the same user always maps to the same id
3. Document the change in your privacy policy

### VVIBE-005 (no `vibe_heartbeat`) — INFO

> "Your project doesn't call `vibe_heartbeat` via MCP. The dashboard
> will say 'agent not connected' even when the agent is running."

If the project isn't using the MCP agent at all (just hitting the REST
API), suppress this finding — it doesn't apply.

If it IS using MCP, add a `vibe_heartbeat()` call at agent session
start, or on every authenticated request.
