---
name: vvibe-blog-writer
version: 0.1.0
manifest_version: 1
description: Draft SEO blog articles for a VVibe creator from their Product Brain and push them to their CMS (WordPress) as a draft — never auto-published. Reads the Product Brain for brand voice, forbidden claims, FAQ, and audience so the article matches the brand and avoids legal landmines. Trigger when the user asks to write / draft / generate a blog post or article, "write a blog about X", "draft an SEO article", refresh or publish a post, or connect a WordPress site for publishing.
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
3. The creator edits the prose in the dashboard; you can also refine it.
4. Connect the creator's CMS (WordPress) and push the article as a
   **draft** — the creator hits Publish in their own CMS.

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
| VVibe connection | MCP tools `vibe_*` available, OR `VVIBE_API_KEY` (`pcs_live_*` / `pcs_test_*`) set | Stop; have the user connect VVibe (daemon or MCP) or set the key |
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
- **"connect my WordPress" / "publish this"** → `references/publishing.md`
- **"what posts do I have?"** → list (flow.md §7)

## 4. Tools (MCP) and the REST fallback

Primary path is the MCP tools; when the agent only has an API key, the
same operations are plain HTTPS calls. Both are documented in
`references/api.md`. Summary:

| Intent | MCP tool | REST |
|---|---|---|
| List the creator's posts | `vibe_list_blog_posts` | `GET /api/blog/posts` |
| Create a post from a brief | `vibe_create_blog_post` | `POST /api/blog/posts` |
| Generate brief + draft | (via create options / generate) | `POST /api/blog/posts/{id}/generate` |
| Edit prose (title/body/outline/meta) | `vibe_update_blog_post` | `PATCH /api/blog/posts/{id}` |
| Publish as CMS draft | `vibe_publish_blog_post` | `POST /api/blog/posts/{id}/publish` |
| Connect / test a publishing site | (dashboard) | `POST /api/blog/sites`, `POST /api/blog/sites/{id}/test` |

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

- **Draft only.** Publishing creates a WordPress *draft*. The creator
  publishes from their CMS. Never claim a post is live.
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
