# Public changelog feed

VVibe exposes shipped, **announced** product changes through a public,
unauthenticated JSON feed. This is data only — **VVibe does not render a
changelog page.** Read this when the human wants a public changelog /
"what's new" page, whether that page lives on the creator's own site or
comes from pointing a third-party changelog tool at the feed.

## 1. What "announced" means here

The feed only ever contains entries that have been **explicitly marked
announced** via `vibe_mark_change_announced` (see `logging.md` §7 and
`announce-flow.md` §4). Logging a change with `vibe_log_product_change`
records it internally — that alone does **not** put anything on this
feed. Announcing is what publishes an entry here, whether the
announcement itself was an email send, a blog post, or nothing more than
a deliberate "yes, show this publicly" for a minor entry.

If the human wants something to show up on their public changelog page
and it isn't appearing, the fix is almost always **run the announce flow
for it first** (`references/announce-flow.md`), not to debug this
endpoint. Check `vibe_get_product_changelog` for the entry's
`announced_at` — `null` means it hasn't been announced, and no amount of
polling the public feed will surface it until it has.

## 2. The endpoint

```
GET {base}/api/changelog/public/{merchantSlug}
```

- Public, unauthenticated — no `VVIBE_API_KEY`, no MCP connection, no
  Bearer token. Same posture as `vvibe-blog-render`'s public content API.
- `{base}` defaults to `https://vvibe.ai` (or a self-hosted
  `VVIBE_API_HOST`); `{merchantSlug}` is the creator's merchant slug.

```jsonc
{
  "data": {
    "product": { /* basic product identity for the feed header, e.g. a name */ },
    "entries": [
      {
        "id": "chg_...",
        "summary": "Free tier now includes 3 projects instead of 1.",
        "change_type": "feature",  // feature | pricing | positioning | fix | other — see logging.md §3
        "significance": "major",   // major | minor — see logging.md §4
        "announced_at": "2026-07-20T10:00:00.000Z",
        "created_at": "2026-07-18T09:00:00.000Z"
      }
    ]
  }
}
```

- Only announced entries appear — see §1. Both `major` and `minor`
  significance can show up here; `significance` isn't a filter on this
  endpoint, only `announced_at` being set is.
- An empty `entries[]` means "nothing announced yet" — render that as a
  plain empty state ("No updates yet"), not an error.

## 3. Cache-Control — 5 minutes

The response sends a 5-minute `Cache-Control`. That's the freshness
ceiling: polling more often than every 5 minutes gets you the same
cached response, not fresher data. If the creator's page is
server-rendered or statically generated, use a revalidation window of
roughly 300s — this happens to match `vvibe-blog-render`'s own
`revalidate: 300` convention, so reuse it if the two features sit
side by side in the same app.

## 4. Wiring it up

Two legitimate paths — pick whichever fits how the creator's site is
built:

**(a) Build a page in the creator's own codebase.** A `/changelog` (or
"what's new") route/component, in *their* stack — this skill doesn't
dictate a framework. Minimal, framework-agnostic example (swap the
render step for React/Vue/whatever the creator already uses; the fetch
and data shape are the same everywhere):

```js
// changelog.js
const VVIBE_BASE = 'https://vvibe.ai' // or the creator's self-hosted VVIBE_API_HOST
const MERCHANT_SLUG = 'your-merchant-slug'

async function getPublicChangelog() {
  const res = await fetch(`${VVIBE_BASE}/api/changelog/public/${MERCHANT_SLUG}`)
  if (!res.ok) return [] // feed unavailable — render an empty state, not an error
  const { data } = await res.json()
  return data.entries ?? []
}

// summary is plain text, not sanitized HTML like a blog post body —
// escape it before inserting into innerHTML.
const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function renderChangelog(container) {
  const entries = await getPublicChangelog()
  container.innerHTML = entries.length
    ? entries
        .map(
          (e) => `<li>
  <time datetime="${e.announced_at}">${new Date(e.announced_at).toLocaleDateString()}</time>
  <span class="tag">${e.change_type}</span>
  <p>${escapeHtml(e.summary)}</p>
</li>`
        )
        .join('\n')
    : '<li>No updates yet.</li>'
}
```

**(b) Point a third-party changelog tool at the feed.** Some hosted
"what's new" widgets can ingest a JSON URL directly — hand them
`{base}/api/changelog/public/{merchantSlug}` and map their fields to
`summary` / `change_type` / `significance` / `announced_at`. No code to
write in this case, just the URL.

## 5. What NOT to do

- **Don't scrape the dashboard.** The changelog dashboard view is for
  the creator's own eyes; use this public feed instead of scraping HTML
  off `/dashboard/*`.
- **Don't expose a PAT / `VVIBE_API_KEY` client-side for this.** The
  feed needs no auth at all — if you find yourself reaching for a
  credential to call this endpoint, you're solving the wrong problem (or
  you actually want `vibe_get_product_changelog`, which is
  MCP/authenticated, shows unannounced entries too, and is for the
  creator's own eyes only — never expose that one publicly either).
- **Don't build the rendered page inside VVibe.** VVibe provides the
  data; rendering it is the creator's own site's job (or a third-party
  tool's) — the same division of labor as `vvibe-blog-render` vs. the
  VVibe-hosted blog content API.
