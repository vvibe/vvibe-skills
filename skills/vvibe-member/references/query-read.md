# VVibe Member — Query-Read Mode

## When to use this

Pick query-read when the vibe coder wants to **build something with VVibe's
member data** inside their own app — a custom admin table, a CRM lookup
panel, an internal report, a "subscription badge" on a profile page, or a
"sync health" dashboard widget. This mode is **read-only**; it never mutates
VVibe state. If the vibe coder also wants to push their users into VVibe,
that's the outbound-sync mode — wire that first, then come back. Query-read
is also fine on its own when VVibe is already the source of truth (e.g. the
app embeds VVibe-hosted auth).

## 1. Prerequisites

From the routing SKILL.md §2 capability checks, query-read needs:

- **`has_server_runtime`** — every call goes through the vibe coder's
  backend. Do not call these endpoints from a browser bundle; the API key
  must not ship to the client.
- **`has_api_key_local`** — `VVIBE_API_KEY` in the project's env config.
  If missing, stop and ask the user to paste it from
  `https://vvibe.ai/dashboard` before generating code.

## 2. Authentication

All four endpoints accept either of:

- **Bearer API Key** — `Authorization: Bearer ${VVIBE_API_KEY}`. Use this
  for any server-to-server call. Prefix decides the dataset: `pcs_live_*`
  → production, `pcs_test_*` → sandbox.
- **Firebase JWT** — only for in-browser Dashboard usage. If you use this
  path you **must** also pass `?profileId=<profile-uuid>` — the JWT alone
  doesn't disambiguate which creator profile to query.

Exact header shape and error responses are in
[`./api-contract.md`](./api-contract.md). Examples below use the
server-side API Key path.

## 3. The four endpoints

The Member API has five endpoints in total; the fifth is `POST /api/members/sync`,
which lives in the outbound-sync mode. This section covers only the four read-only
GETs.

All examples assume:

```ts
const VVIBE_API_HOST = process.env.VVIBE_API_HOST || 'https://vvibe.ai'
const VVIBE_API_KEY = process.env.VVIBE_API_KEY
```

### 3.1 `GET /api/members` — list with pagination + search

Use when you're building anything that shows more than one member: admin
tables, picker UIs, CSV exports, bulk-action screens.

**Query params** (full list in [`./api-contract.md`](./api-contract.md)):
`page` (default 1), `limit` (default 20, **max 100**), `search` (ILIKE on
email + display_name), `mode`, `profileId` (JWT only).

```ts
async function listMembers(opts: { page?: number; limit?: number; search?: string } = {}) {
  const qs = new URLSearchParams()
  if (opts.page) qs.set('page', String(opts.page))
  if (opts.limit) qs.set('limit', String(opts.limit))
  if (opts.search) qs.set('search', opts.search)
  const res = await fetch(`${VVIBE_API_HOST}/api/members?${qs}`, {
    headers: { Authorization: `Bearer ${VVIBE_API_KEY}` },
  })
  if (!res.ok) throw new Error(`VVibe list members ${res.status}`)
  return res.json() // { data: [...], pagination: { page, limit, total, totalPages } }
}
```

**Notable fields:** each row carries `subscription` (or `null` for free
users). Use `pagination.totalPages` to drive page controls.

### 3.2 `GET /api/members/{userId}` — single user

Use when you already have a VVibe `id` (uuid) and want a focused profile
view, e.g. a "View in VVibe" panel on a user-detail page. `userId` is
VVibe's **internal uuid**, not your `external_user_id` — see pitfall #5.

```ts
async function getMember(userId: string) {
  const res = await fetch(`${VVIBE_API_HOST}/api/members/${userId}`, {
    headers: { Authorization: `Bearer ${VVIBE_API_KEY}` },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`VVibe get member ${res.status}`)
  return res.json() // { data: { id, email, subscription, ... } }
}
```

**Notable fields:** `subscription.planName`, `subscription.status`,
`subscription.nextBillingAt`; `subscription` is `null` for free users.

### 3.3 `GET /api/members/stats` — aggregate counts

Use for top-of-page KPI cards: total members, paying vs. free split.

```ts
async function getMemberStats() {
  const res = await fetch(`${VVIBE_API_HOST}/api/members/stats`, {
    headers: { Authorization: `Bearer ${VVIBE_API_KEY}` },
  })
  if (!res.ok) throw new Error(`VVibe stats ${res.status}`)
  return res.json() // { data: { total, withSubscription, withoutSubscription } }
}
```

### 3.4 `GET /api/members/sync-logs` — sync history

Use for an internal "sync health" view — confirm last sync ran, surface
recent errors, debug a missing user. **`limit` max is 50.**

```ts
async function listSyncLogs(opts: { page?: number; limit?: number } = {}) {
  const qs = new URLSearchParams()
  if (opts.page) qs.set('page', String(opts.page))
  if (opts.limit) qs.set('limit', String(opts.limit))
  const res = await fetch(`${VVIBE_API_HOST}/api/members/sync-logs?${qs}`, {
    headers: { Authorization: `Bearer ${VVIBE_API_KEY}` },
  })
  if (!res.ok) throw new Error(`VVibe sync-logs ${res.status}`)
  return res.json() // { data: [{ id, status, errorCount, errors, ... }], pagination }
}
```

**Notable fields:** `status` enum is `success` / `partial` / `failed`;
`errors` is `null` for successful runs.

## 4. Common recipes

### Paginated admin table

Wire `listMembers({ page, limit: 20, search })` to your table. Render
`pagination.totalPages` as page buttons; debounce the search input (~300ms).

### Subscription badge on a profile page

Call `getMember(vvibeUserId)` once and render from `subscription`:

```ts
const member = await getMember(vvibeUserId)
const badge = member?.data.subscription
  ? `${member.data.subscription.planName} · ${member.data.subscription.status}`
  : 'Free'
```

### "Sync health" dashboard widget

Count problem entries in the recent sync logs:

```ts
const { data } = await listSyncLogs({ limit: 20 })
const bad = data.slice(0, 10).filter(l => l.status !== 'success').length
const healthy = bad === 0
```

Surface `healthy` as a green/red dot and link to a details view that
renders each entry's `errors[]`.

## 5. Pitfalls

1. **Never call these endpoints from the browser.** The API key would ship
   in the client bundle. Always proxy through your own server route (Next.js
   route handler, Express endpoint, etc.) and forward results to the client.
2. **`subscription` is `null` for free users.** Don't blindly read
   `subscription.planName` — guard with optional chaining. `metadata`,
   `role`, `planName`, `lastLoginAt`, `externalUserId` are all nullable too.
3. **`mode` defaults from the API Key prefix.** Only pass an explicit
   `mode` if you intentionally need to override it.
4. **Pagination caps differ.** `limit` max is **100** for `/api/members`
   and **50** for `/api/members/sync-logs`. Going higher is silently capped
   or returns 400.
5. **`/api/members/{userId}` takes VVibe's internal uuid, not your
   `external_user_id`.** Sync responses do **not** include per-user ids
   (only aggregate counts — see `./api-contract.md`). To look up by your
   own id, either (a) call `GET /api/members?search=<email>` (email is
   the dedup key, so this is reliable), or (b) after the first sync,
   fetch the user via list/search to retrieve the VVibe `id`, then
   store the mapping in your DB for direct lookups later.
6. **Firebase JWT path needs `profileId`.** Every JWT-authed request must
   carry `?profileId=<uuid>` or it returns 401 even with a valid token.

For wire-level details (exact response shapes, error codes, zod
validation errors), see [`./api-contract.md`](./api-contract.md).
