# Blog writer — end-to-end flow

Read this once you've passed the §2 capability checks in SKILL.md. Each
step says what to call and what to tell the creator. Use the MCP tools
when available; the REST equivalents are in `api.md`.

## 1. Read the brand context first

Always start with `vibe_get_product_kb`. Use it to:
- suggest a fixed direction + specific subjects the ICP cares about,
- pre-fill tone from `company.brand_voice`,
- know the `forbidden_claims` you must never write toward.

If `data` is null, stop and route the creator to **vvibe-product-brain** —
a blog drafted with no brand context is generic and off-voice.

## 2. Agree the brief

Confirm with the creator, in plain language:
- **topic** (what the article is about),
- **fixed direction** (one of the four — suggest based on the Product Brain),
- optional **target keyword**, **tone** override, **length**
  (`short` | `medium` | `long`, default `medium`).

Don't over-interrogate — propose a brief from the Product Brain and let them adjust.

## 3. Create the post

Call `vibe_create_blog_post` with the brief. It returns a post with
`status: "created"` and a `version`. Keep the `id` and `version`.

## 4. Generate brief → draft

Trigger generation with `vibe_generate_blog_post` (REST:
`POST /api/blog/posts/{id}/generate`). The server runs the two-stage
pipeline and the post lands at `status: "draft_ready"` with:
- an `outline` and 3 SEO-title candidates (the first is adopted as the
  working title),
- `body_html`, `meta_title`, `meta_description`, `slug`, `excerpt`,
- `schema_jsonld` (Article + FAQPage).

If generation returns a **422 "connect an AI provider"**, drafting is
disabled on this deployment — tell the creator their operator must set an
LLM provider; they can still write manually in the dashboard.

Show the creator the title options + outline and ask if they want changes
before/after the full draft.

## 5. Edit the prose

The creator edits in the dashboard (Blog → the post), or asks you to.
To edit, `PATCH /api/blog/posts/{id}` (or `vibe_update_blog_post`) with
the changed fields **and** the `expectedVersion` you last read. Editable:
`title`, `bodyHtml`, `outline`, `metaTitle`, `metaDescription`, `slug`
(lowercase-hyphen), `excerpt`.

A **409** means someone edited it under you — re-read the post to get the
new `version`, re-apply, and tell the creator you picked up their change.

Every edit is recorded as a revision tagged with who made it (agent vs
human), so the brand voice improves over time. Don't silently overwrite a
draft the creator has been editing — offer the change.

### Cover image (optional, before publishing)

Give the post a cover so it looks finished on the blog and in shares:

1. `vibe_search_cover_images({ query })` — describe the image in English
   (derived from the topic + Product Brain, e.g. "minimalist developer
   workspace"). It returns `images[]` (each with `url`, `thumbUrl`, `alt`,
   `photographer`, `sourceUrl`).
2. Pick one and set it with `vibe_update_blog_post({ postId,
   expectedVersion, coverImageUrl: <chosen url> })`. Pass `null` to remove.

The cover is **destination-agnostic**: it renders on the VVibe blog and is
uploaded as the WordPress **featured image** when you publish there. If
`vibe_search_cover_images` returns `configured: false`, the deployment has
no stock-image library set up — tell the creator and either set a public
https image URL they provide, or skip the cover (it's optional). The
creator can also pick a cover in the dashboard (Blog → the post → Cover
image).

## 6. Re-generate after a product change

If the product changed, refresh the Product Brain first (vvibe-product-brain), then
re-run generate on a post that isn't published yet. Generation can re-run
from `brief_ready` or `draft_ready`; it won't touch a `published_draft`.

## 7. List posts

`vibe_list_blog_posts` (`GET /api/blog/posts`) returns the creator's
posts newest-updated first, with `status` and `remote_post_url` (set once
published). Use it to answer "what's in flight?" or to find a post id.

## 8. Publish

When the creator is happy, go to `publishing.md`. Publishing creates a
**draft** in their CMS — never a live post.
