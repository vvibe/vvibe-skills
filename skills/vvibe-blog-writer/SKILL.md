---
name: vvibe-blog-writer
version: 0.5.1
manifest_version: 1
description: Draft SEO blog articles for a VVibe creator from their Product Brain, then publish them either to the creator's own VVibe headless blog (no external CMS, no setup) or as a draft to their WordPress. Reads the Product Brain for brand voice, forbidden claims, FAQ, and audience so the article matches the brand and avoids legal landmines. Trigger when the user asks to write / draft / generate a blog post or article, "write a blog about X", "draft an SEO article", refresh, publish or unpublish a post, or connect a WordPress site for publishing.
---

# VVibe Blog Writer Skill — Routing

This file is a router. It decides which step of the blog flow the user is
at, then directs you to a single deep-dive in `references/`. Keep the
flow detail in the referenced files, not here. When you load this skill:
read this whole file, run the capability checks in §2, then **Read the
matching `references/*.md`** for the step you're on. Do not read every
reference up front.

## 1. What this skill does

Turn a topic into a publish-ready SEO article for a VVibe creator:

1. Read the creator's **Product Brain** (`vibe_get_product_kb`)
   so the article uses their real brand voice, audience, FAQ, and
   forbidden claims — never re-derive the product.
2. Create a blog post from a brief (topic + one of four fixed
   directions), generate a brief (3 SEO-title candidates + outline),
   let the creator pick/adjust, then generate the full draft.
3. The creator edits the prose in the dashboard; you can also refine it,
   and give the post a cover image (search a stock library with
   `vibe_search_cover_images`, or set a URL) — it shows on the VVibe blog
   and becomes the WordPress featured image on publish.
4. Publish to one of two destinations:
   - **VVibe blog (built-in, headless)** — no external CMS, no
     credentials. The post goes live on the creator's VVibe content API;
     their site (built with the `vvibe-blog-render` skill) renders it.
   - **The creator's WordPress** — push the article as a **draft**; the
     creator hits Publish in their own CMS.

VVibe is the headless CMS + brain; this skill is how the agent operates
it. The server enforces the generation spec and writing rules (Taiwan
Traditional Chinese, answer-first structure, no fabricated stats, no
ranking guarantees) — you orchestrate, the server drafts.

### Out of scope
- Building / refreshing the Product Brain itself — that's `vvibe-product-brain`. If the
  Product Brain is empty, route the user there first (a blog drafted with
  no brand context is generic).
- Auto-publishing. v1 only ever creates a CMS **draft**. Never tell the
  creator the post is live.
- Inventing customers, statistics, or ranking promises. The KB's
  `forbidden_claims` are hard-rejected server-side; don't try to work
  around them.

## 2. Capability checklist (run BEFORE asking the user anything)

| Capability | How to detect | If missing |
|---|---|---|
| Blog tools available | `vibe_create_blog_post` (+ the other `vibe_*_blog_post` tools) are in your tool list | **Two different cases — don't conflate them.** If you have NO `vibe_*` tools at all → VVibe isn't connected; have the creator connect it (daemon or MCP). If you have core `vibe_*` tools (e.g. `vibe_get_product_kb`) but NOT the blog ones → you're connected but this skill isn't activated for the connection (common when you obtained the skill files outside VVibe's install flow): call `vibe_report_skill_installed({ skillId: 'blog_writer', version: '<from this file\'s frontmatter>' })`. That registers the skill for your connection and the blog tools become available on the same session (if your MCP client caches the tool list and they don't show, reconnect once). Confirm with `vibe_list_skills`, which shows `installed` per skill. There is no `pcs_…` API-key path for the blog — those keys are commerce-only. |
| Product Brain exists | `vibe_get_product_kb` returns non-null `data` | Route to `vvibe-product-brain` first, then come back |
| AI drafting enabled | a generate call returns content (not a 422 "connect an AI provider") | Tell the creator their VVibe operator must enable an LLM provider; manual writing still works in the dashboard |
| Publishing configured | the creator has a connected publishing site, or can add one | Only needed at the publish step — see `references/publishing.md` |

Detect, don't interrogate: check the Product Brain and tool availability yourself
before asking the creator for anything.

## 3. The flow — pick where the user is

Read `references/flow.md` for the full step-by-step. Quick map:

- **"write/draft a blog about X"** → create + generate (flow.md §1–§4)
- **"change the title / outline / section"** → edit the draft (flow.md §5)
- **"the product changed, redo this post"** → re-generate (flow.md §6)
- **"publish this" / "put it on my blog" / "connect my WordPress" / "take it down"** → `references/publishing.md` (VVibe blog or WordPress; publish + unpublish)
- **"what posts do I have?"** → list (flow.md §7)

## 4. Tools (MCP)

Operate the blog through the `vibe_*` MCP tools — they carry your VVibe
connection token. The REST column is the endpoint each tool wraps (what a
daemon-run agent would call directly with the same token); full shapes are
in `references/api.md`. There is no separate API-key surface for the blog.

| Intent | MCP tool | REST it wraps |
|---|---|---|
| List the creator's posts | `vibe_list_blog_posts` | `GET /api/blog/posts` |
| Create a post from a brief | `vibe_create_blog_post` | `POST /api/blog/posts` |
| Generate brief + draft | `vibe_generate_blog_post` | `POST /api/blog/posts/{id}/generate` |
| Edit prose (title/body/outline/meta) | `vibe_update_blog_post` | `PATCH /api/blog/posts/{id}` |
| Search stock images for a cover | `vibe_search_cover_images` | `GET /api/blog/cover/search` |
| Set the cover image | `vibe_update_blog_post` (`coverImageUrl`) | `PATCH /api/blog/posts/{id}` |
| Publish to the creator's configured destination | `vibe_publish_blog_post` (just `postId`) | `POST /api/blog/posts/{id}/publish` |
| Unpublish from the VVibe blog | (dashboard) | `POST /api/blog/posts/{id}/unpublish` |
| Connect / test a WordPress site | (dashboard) | `POST /api/blog/sites`, `POST /api/blog/sites/{id}/test` |

Edits made through `PATCH` / `vibe_update_blog_post` are recorded as
revisions; the post's `version` increments on every write. When you edit,
pass the `expectedVersion` you last read — a `409` means the creator (or
another session) edited it under you; re-read and re-apply.

## 5. The four fixed directions

Every post starts from one of these (the creator picks; you suggest based
on the Product Brain). Keep the first choice general — it's a content *type*, not a
specific feature:

- **product_philosophy** — the thinking / values behind the product.
- **product_features** — what the product does and why it matters.
- **related_user_inflow** — top-of-funnel topics the ICP searches for,
  not the product by name.
- **tutorial_and_problem_solving** — step-by-step how-to / fixes.

## 6. Hard rules (server-enforced; don't fight them)

- **Destination is set once, not per post.** Where articles publish is an
  account-level setting (Blog → Settings); to publish, call
  `vibe_publish_blog_post({ postId })` and the server routes accordingly —
  don't ask the creator to choose a destination for each article. The two
  destinations differ in finality: the **VVibe blog** makes the post live
  on the content API immediately (`status: published`), but it appears on
  the creator's site only once that site — built with the
  `vvibe-blog-render` skill — next pulls or rebuilds, so don't promise it's
  visible to readers until their site is set up; **WordPress** only ever
  creates a *draft* (`published_draft`) that the creator publishes there —
  never claim a WordPress post is live. (`target: 'native'` or a
  `publishingSiteId` are per-post overrides, used only when the creator
  explicitly wants one article to go somewhere other than their default.)
- **No fabrication.** No invented customers, statistics, or sources. No
  ranking / revenue guarantees. The KB's `forbidden_claims` are rejected
  server-side.
- **Brand voice first.** The KB's `brand_voice`, `preferred_terms`, and
  `forbidden_claims` override default writing rules. Don't paraphrase
  preferred terms.
- **Traditional Chinese (Taiwan).** v1 articles are written in Taiwan
  Traditional Chinese. Don't switch locale unless the creator's KB says
  otherwise.
- **The creator owns the prose.** After generation, the creator is the
  editor. Offer edits; don't silently rewrite a draft they've touched.

## 7. Report back

After each meaningful step, tell the creator plainly what happened and
the one next action — e.g. "Draft ready. Review it in your dashboard
under Blog, then say 'publish to <site>' when you're happy." Never show
raw HTTP status codes or stack traces; surface the plain-language error
the API returns.
