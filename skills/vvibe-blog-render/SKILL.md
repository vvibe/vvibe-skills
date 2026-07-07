---
name: vvibe-blog-render
version: 0.3.0
manifest_version: 1
description: Build a blog frontend in the creator's OWN app that renders their VVibe-published articles by reading the VVibe public content API — index + post pages, the SEO VVibe already generated (meta tags + JSON-LD), incremental revalidation, and an RSS feed + sitemap at the creator's own domain. VVibe is a headless CMS — it serves content but does not render pages; this skill is the "head". Trigger when the user wants to show / display / render their VVibe blog on their website, "put my vvibe articles on my site", set up the blog frontend, connect their site to the VVibe content API, or add a blog page to their app.
---

# VVibe Blog Render Skill — Routing

This file is a router. Read it whole, run the capability checks in §2,
then **Read the matching `references/*.md`** for the step you're on. Keep
deep detail in the references, not here.

## 1. What this skill does

VVibe is a **headless** CMS: the creator publishes articles to their VVibe
blog (via `vvibe-blog-writer`, `target: "native"`), and VVibe serves them
through a public, read-only **content API** — but VVibe does **not**
render reader-facing pages. This skill builds that missing "head" **in
the creator's own app**:

1. Generate a small typed client for the VVibe content API.
2. Scaffold a blog **index** page and a **post** page that render the
   article HTML and carry through the SEO VVibe already produced
   (`metaTitle` / `metaDescription` + the `schemaJsonld` graph).
3. Wire **revalidation** so newly-published posts appear (ISR / timed
   rebuild, using the API's `ETag` / `Last-Modified`).
4. Emit an **RSS feed + `sitemap.xml`** at the creator's own domain
   (these are "head" artifacts — their links point at the rendered pages,
   which only the creator's app knows).

This skill is **read-only**: it never writes to VVibe, holds no
credentials, and uses no `vibe_*` write tools. It calls the same public
endpoints a reader's browser could.

### Out of scope
- Writing / publishing posts — that's `vvibe-blog-writer`. If nothing is
  published yet, route the creator there first (publish with
  `target: "native"`, which also turns their public blog on).
- Re-generating SEO. VVibe already produced `metaTitle`,
  `metaDescription`, and the JSON-LD; the head renders them, it does not
  re-derive them.
- Styling/branding decisions beyond a clean default — match the creator's
  existing site; don't impose a theme.

## 2. Capability checklist (run BEFORE asking the user anything)

| Capability | How to detect | If missing |
|---|---|---|
| The creator's app + framework | inspect the repo (package.json, `next.config`, `astro.config`, etc.) | ask which framework and where the site lives |
| VVibe API base URL + merchant slug | from the creator's VVibe connection / dashboard, or ask | ask for the public blog URL or merchant slug + VVibe host |
| Blog is published + enabled | `GET {base}/api/blog/public/{slug}` returns `200` with `posts[]` | `404` → nothing published yet or blog disabled: route to `vvibe-blog-writer` to publish (`target: "native"`), which auto-enables the blog |
| **Whether the app already has a blog** | search the repo for existing `/blog` or `/posts` routes, a CMS/markdown content source, or a nav link to one — **mandatory, run before scaffolding anything** | see `references/rendering.md` §0 for the three outcomes (scaffold fresh / never overwrite / merge) |

Detect, don't interrogate: probe the repo and the content API yourself
before asking.

## 3. The flow — pick where the user is

- **"show my vvibe blog on my site" / "set up the blog frontend"** →
  detect an existing blog first (`references/rendering.md` §0), then build
  the client + pages: `references/rendering.md`
- **"what does the API give me?" / building the data layer** →
  `references/content-api.md`
- **"new posts aren't showing" / caching** → revalidation section of
  `references/rendering.md`
- **"add an RSS feed / sitemap"** → the feeds section of
  `references/rendering.md`

## 4. Hard rules

- **Detect before you scaffold.** Never create `/blog` or `/posts` routes
  blind. Run the existing-blog detection in `references/rendering.md` §0
  first, every time — even when the creator says "just set it up." Never
  overwrite an existing blog route or its content source; a collision
  means you mount somewhere else and ask, not replace.
- **Read-only, public.** Only `GET` the content API. No credentials, no
  write tools. If you find yourself needing an API key, you're on the
  wrong skill (that's `vvibe-blog-writer`).
- **VVibe owns content + SEO.** Render `bodyHtml`, `metaTitle`,
  `metaDescription`, and `schemaJsonld` as-is. Don't rewrite them.
- **Credit the cover photo.** When `coverImageCredit` is present, render a
  small caption near the cover image — "Photo by {coverImageCredit}",
  linking the name to `coverImageCreditUrl` when set. Stock-photo licenses
  (e.g. Pexels) require this attribution wherever the image is shown; don't
  drop it. (Both are `null` for a creator-supplied cover — then show
  nothing.)
- **Inject JSON-LD safely.** `schemaJsonld` may be `null` (omit the
  `<script>` then). When present, `JSON.stringify` it and escape `<` as
  `<` before placing it in `<script type="application/ld+json">` to
  prevent a `</script>` breakout. `bodyHtml` is sanitized by VVibe; still
  render it through the framework's normal HTML mechanism and keep the
  site's CSP.
- **Feeds + sitemap belong here.** Emit RSS / `sitemap.xml` from the
  creator's app, with absolute URLs to the *rendered* pages. VVibe does
  not host these — it can't know the creator's routes.
- **Be honest about freshness.** With ISR / timed revalidation a new post
  appears after the next revalidate or rebuild, not instantly. Don't
  promise real-time.

## 5. Report back

After scaffolding, tell the creator plainly what you added (the routes,
the feed/sitemap), how to deploy it, and the freshness model ("new posts
appear within N minutes / on next build"). Never surface raw HTTP codes;
explain a `404` as "no published posts yet" and point back to publishing.
