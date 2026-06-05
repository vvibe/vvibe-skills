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
- MCP: `vibe_list_blog_posts`
- REST: `GET /api/blog/posts` → `{ data: BlogPost[] }` (newest-updated first)

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
  "publishingSiteId": "uuid"                   // optional; can attach later
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
  "excerpt": "..."
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
`id, status, topic, title, targetKeyword, tone, articleLength,
fixedDirection, outline[], bodyHtml, metaTitle, metaDescription, slug,
excerpt, coverImageUrl, schemaJsonld, specVersion, llmProvider, llmModel,
version, publishingSiteId, remotePostId, remotePostUrl, errorMessage,
publishedAt, createdAt, updatedAt`.

`status`: `created → brief_ready → draft_ready → cover_ready →
{ published_draft | published }`; `failed` is recoverable (fix + retry).
`published_draft` = draft pushed to WordPress; `published` = live on the
VVibe blog (native), with `publishedAt` set.
