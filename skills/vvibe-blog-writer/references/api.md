# Blog API — MCP tools (+ the REST they wrap)

**Use the MCP `vibe_*` tools.** They are the agent surface and carry your
VVibe connection token automatically. The REST rows below are simply the
endpoints those tools call — listed so you know the shapes, and so a
daemon-run agent can call them directly with the **same** connection token
(`Authorization: Bearer <your MCP connection token>`). REST base is
`https://vvibe.ai` (override with `VVIBE_API_HOST` for self-host).

There is **no `pcs_…` API-key path for the blog.** Those keys authenticate
only the commerce / subscription API; the blog routes accept a dashboard
session (the creator) or your MCP connection token (you). If you have
neither, stop and have the creator connect VVibe (daemon or MCP).

All operations are scoped to the calling connection's merchant — there's
no merchant id in the payloads.

## Posts

### List
- MCP: `vibe_list_blog_posts` — optional `{ includeBody }` (default `false`)
- REST: `GET /api/blog/posts` → `{ data: BlogPost[] }` (newest-updated
  first, full shape — see "BlogPost shape" below)

**The MCP tool's default response is a lightweight projection, not the
full BlogPost shape** — the raw REST call still returns full rows; the
thinning happens only in the MCP tool. Default fields: `id, slug, title,
status, updatedAt, publishedAt, excerpt, metaDescription, outline`
(heading strings only — no per-heading `notes`), `categories, tags,
language, version`. No `bodyHtml` / `schemaJsonld`. That's enough to find
a post's id + `version`, report what's in flight, and judge topical
overlap for a new post's internal links — title + excerpt + outline
headings + tags are sufficient for relevance/duplication checks, so don't
fetch full article bodies just to compare posts. Pass `includeBody: true`
only if you genuinely need every post's full HTML at once (expensive on a
blog with many/long posts) — prefer `vibe_get_blog_post` for a single
post's full content instead.

### Get one
- MCP: `vibe_get_blog_post({ postId })`
- REST: `GET /api/blog/posts/{id}` → `{ data: BlogPost }` (full shape,
  including `bodyHtml` and `schemaJsonld`) or `404`.

Call this when you need the actual article — to read/quote it, edit it
(grab `version` for `expectedVersion`), or review before publishing.

### Create
- MCP: `vibe_create_blog_post`
- REST: `POST /api/blog/posts`
```jsonc
{
  "topic": "Why magic-link auth beats passwords",
  "title": "A working title",                 // refined by generation
  "fixedDirection": "product_features",        // or product_philosophy | related_user_inflow | tutorial_and_problem_solving
  "targetKeyword": "passwordless login",       // optional
  "tone": "warm, plain",                       // optional; KB tone used if omitted
  "articleLength": "medium",                   // short | medium | long (default medium)
  "publishingSiteId": "uuid",                  // optional; can attach later
  "categories": ["Guides"],                    // optional WordPress category names (draft also proposes its own)
  "tags": ["passwordless"],                    // optional WordPress tag names
  "referenceUrl": "https://example.com/src",   // optional source link (kept for record)
  "referenceText": "<cleaned source text>"     // optional grounding text — fetch the URL yourself and paste it
}
```
→ `201 { data: BlogPost }` with `status: "created"`, `version: 1`.

### Generate (brief → draft)
- MCP: `vibe_generate_blog_post` (pass `postId`)
- REST: `POST /api/blog/posts/{id}/generate` → `{ data: BlogPost }` at
  `status: "draft_ready"`.
- `422` `{ message }` when no LLM provider is configured (drafting off).
- `409` when the post can't be generated from its current state
  (e.g. already published).

### Edit (prose surface)
- MCP: `vibe_update_blog_post`
- REST: `PATCH /api/blog/posts/{id}`
```jsonc
{
  "expectedVersion": 3,           // REQUIRED — optimistic concurrency
  "title": "...",                 // any subset of the editable fields
  "bodyHtml": "...",
  "outline": [{ "heading": "...", "notes": "..." }],
  "metaTitle": "...",
  "metaDescription": "...",
  "slug": "lowercase-hyphenated",
  "excerpt": "...",
  "coverImageUrl": "https://...",  // null to clear; becomes the WP featured image
  "categories": ["Guides"],        // WordPress category names (replaces the stored list)
  "tags": ["passwordless"],        // WordPress tag names (replaces the stored list)
  "referenceUrl": "https://...",   // null to clear
  "referenceText": "..."           // null to clear; re-generate to apply
}
```
→ `{ data: BlogPost }` with `version` incremented. `409` on a version
mismatch (re-read and re-apply). Each edit appends a revision.

### Publish
- MCP: `vibe_publish_blog_post` — normally just `{ postId }`. The server
  publishes to the creator's **configured destination** (`default_target`
  in Blog settings). `target` / `publishingSiteId` are per-post overrides.
- REST: `POST /api/blog/posts/{id}/publish`. With **no** `target` /
  `publishingSiteId` in the body, it follows the account default:
  - default **native** → publishes on the VVibe blog.
  - default **external** → sends a draft to the merchant's connected
    WordPress site (exactly one → used automatically; none → `422` "connect
    one in settings"; more than one → `400`, pass a `publishingSiteId`).
  Body fields are **overrides** for one post:
  - **VVibe blog (native):** `{ "target": "native" }` (optional
    `expectedVersion`) → `{ data: BlogPost }` at `status: "published"`.
    Served from `GET /api/blog/public/{merchantSlug}[/{postSlug}]`. No
    site/credentials. First native publish auto-enables the public blog.
  - **WordPress (draft):** `{ "publishingSiteId" }` (or rely on the post's
    attached site) → `status: "published_draft"` with `remotePostUrl`.
    `422` + plain reason on a provider failure (post moves to `failed`).
  - `target: "native"` **and** a `publishingSiteId` together → `400`
    (ambiguous). `409` if `expectedVersion` is stale.

### Unpublish (VVibe blog only)
- REST: `POST /api/blog/posts/{id}/unpublish` (optional `expectedVersion`)
  → `{ data: BlogPost }` at `status: "cover_ready"`. `422` if the post
  isn't natively published (a WordPress draft is removed in WordPress).

### Public content API (read-only, unauthenticated)
- `GET /api/blog/public/{merchantSlug}` → `{ blog, posts[], nextCursor }`
  (`?cursor=&limit=`). `GET /api/blog/public/{merchantSlug}/{postSlug}` →
  `{ post }`. CORS-open; supports `ETag` / `If-None-Match`. 404 if the
  slug is unknown or the creator's blog is disabled. This is what a
  consumer site (the `vvibe-blog-render` skill) reads.

## Cover images

A post can carry one cover image (`coverImageUrl`) — shown on the VVibe blog
and uploaded as the WordPress **featured image** on publish. Three ways to set
one; all end with a `PATCH` (`vibe_update_blog_post`) that writes
`coverImageUrl`:

### Search a stock library
- MCP: `vibe_search_cover_images` — `{ query }` (English, from the topic + Brain)
- REST: `GET /api/blog/cover/search?q=` → `{ data: { configured, images[] } }`,
  each image `{ url, thumbUrl, alt, photographer, sourceUrl }`. Apply one with
  `vibe_update_blog_post` (`coverImageUrl: url`, plus `coverImageCredit` =
  `photographer` and `coverImageCreditUrl` = `sourceUrl` — stock licenses
  require attribution). `configured: false` → no stock provider on this
  deployment; ask for a URL or skip.

### Generate with AI
- MCP: `vibe_generate_cover_image` — `{ postId }` (auto-derives a brief from the
  post) or `{ prompt }` (describe the scene in English; the model renders no text)
- REST: `POST /api/blog/cover/generate` → `{ data: { url } }` (a hosted image).
  Apply with `vibe_update_blog_post` (`coverImageUrl: url`); AI covers need no
  attribution (leave `coverImageCredit` null). `422` + plain message if AI
  image generation isn't configured — fall back to stock or a pasted URL.

### Paste a URL
- Any https image URL straight into `vibe_update_blog_post` (`coverImageUrl`).

## Taxonomies (WordPress)

### List a site's existing categories + tags
- MCP: `vibe_get_blog_taxonomies` — `{ publishingSiteId }`
- REST: `GET /api/blog/sites/{id}/taxonomies` → `{ data: { categories[], tags[] } }`,
  each term `{ id, name, slug }`. Pass the `name`s to `categories` / `tags` on
  create/update so you reuse the site's existing terms instead of coining
  near-duplicates. The WordPress adapter resolves names → term ids on publish,
  creating any that don't exist. `422` if the site's terms can't be read.

## Publishing sites

### List / Connect
- REST: `GET /api/blog/sites` → `{ data: PublishingSite[] }` (no secrets,
  only a `credentialPrefix` hint).
- REST: `POST /api/blog/sites`
```jsonc
{
  "provider": "wordpress",
  "name": "My Blog",
  "siteUrl": "https://blog.example.com",       // public https only
  "credential": { "username": "wp_admin", "applicationPassword": "abcd efgh ijkl" }
}
```
→ `201`. `422` if publishing isn't configured on the deployment or the
URL isn't a public HTTPS host.

### Test
- REST: `POST /api/blog/sites/{id}/test` → `{ data: { ok, status } }`.

## BlogPost shape (read)
Full shape, as returned by create / generate / edit / publish / unpublish
and `vibe_get_blog_post` (`vibe_list_blog_posts`'s default response is the
smaller list projection described above):

`id, status, topic, title, targetKeyword, tone, articleLength,
fixedDirection, referenceUrl, referenceText, outline[], bodyHtml, metaTitle,
metaDescription, slug, excerpt, coverImageUrl, coverImageCredit,
coverImageCreditUrl, categories[], tags[], schemaJsonld, specVersion,
llmProvider, llmModel, version, publishingSiteId, remotePostId,
remotePostUrl, errorMessage, publishedAt, createdAt, updatedAt`.

`status`: `created → brief_ready → draft_ready → cover_ready →
{ published_draft | published }`; `failed` is recoverable (fix + retry).
`published_draft` = draft pushed to WordPress; `published` = live on the
VVibe blog (native), with `publishedAt` set.
