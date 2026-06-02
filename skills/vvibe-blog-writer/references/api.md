# Blog API — MCP tools + REST

Two equivalent surfaces. Use the MCP tools when the agent is
MCP-connected; otherwise call REST with the API key. REST base is
`https://vvibe.ai` (override with `VVIBE_API_HOST` for self-host /
compatible backends). REST auth: `Authorization: Bearer ${VVIBE_API_KEY}`.

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

### Publish (CMS draft)
- MCP: `vibe_publish_blog_post`
- REST: `POST /api/blog/posts/{id}/publish` → `{ data: BlogPost }` at
  `status: "published_draft"` with `remotePostUrl`. `422` with a
  plain-language reason on a provider failure (post moves to `failed`).

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
createdAt, updatedAt`.

`status`: `created → brief_ready → draft_ready → cover_ready →
published_draft`; `failed` is recoverable (fix + retry).
