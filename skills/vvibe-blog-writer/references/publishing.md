# Publishing a post

**Destination is an account-level setting, not a per-post choice.** The
creator picks where their articles go ONCE — in the dashboard (Blog →
Settings → "where your articles publish", stored as
`creator_blog_settings.default_target`). To publish, just call
`vibe_publish_blog_post({ postId })` (REST: `POST .../publish` with only
`expectedVersion`) — the server routes to whatever they configured. **Do
not ask the creator to choose a destination for each article**, and don't
pass `target`/`publishingSiteId` as a matter of course.

The two destinations the setting selects between:

- **VVibe blog (built-in, headless)** — the zero-setup default. No external
  CMS, no credentials. The post goes live on the creator's VVibe
  **content API**; the creator's own site renders it (see the
  `vvibe-blog-render` skill). Best when the creator has (or can stand up)
  a site/app but no CMS.
- **WordPress** — push the article as a **draft** to a site the creator
  already runs. Best when they're already on WordPress.

If the creator wants to *change* where articles publish, that's a one-time
settings change (Blog → Settings), not something to decide per post. The
sections below cover what each destination means and the one-time
WordPress connection; you normally won't pass `target` at all. (`target:
"native"` / a `publishingSiteId` remain available as a per-post **override**
when the creator explicitly asks to send one article somewhere different.)

---

## A. Publish to the VVibe blog (native)

No connection step, no credentials. When the VVibe blog is the creator's
configured destination (the zero-setup default), just publish with
`vibe_publish_blog_post({ postId })` — you only pass `target: "native"` to
**override** a WordPress default for one post. (REST: `POST .../publish`
with `{ expectedVersion }`, or `{ target: "native" }` to force it.)
Requirements: the post has a generated body **and a slug** (i.e. it's been
drafted).

On success the post moves to `status: "published"` and is served,
read-only, from the public content API:

- list:   `GET /api/blog/public/{merchantSlug}`
- single: `GET /api/blog/public/{merchantSlug}/{postSlug}`

Give the creator the content API URL, and be honest about what
"published" means here: the article is now **available**, but a reader
sees it only once the creator's **own site** pulls it. That site is built
with the **`vvibe-blog-render`** skill — if they haven't set it up,
route them there next ("Your post is published — let's get your site
showing it"). Don't claim readers can already see it.

- The **first** native publish turns the creator's public blog on
  automatically. They can toggle it off in the dashboard (Blog →
  Settings), which 404s the whole content API again.
- If two posts would share the same URL slug, the server auto-appends
  `-2`, `-3`, … and returns the final slug. If it can't find a free one,
  it asks the creator to pick a unique slug — edit the post's slug and
  retry.
- No `PUBLISHING_SECRET_KEK` required (that gate is only for credentialed
  external CMSes).

### Unpublish (VVibe blog only)
`POST /api/blog/posts/{id}/unpublish` takes a `published` post back off
the content API (`status` → `cover_ready`). It only works on VVibe-blog
posts — a WordPress draft lives in WordPress, and the creator removes it
there.

---

## B. Publish to WordPress (draft)

WordPress publishing always creates a **draft** — the creator reviews and
hits Publish themselves. Never tell them the post is live.

### B1. Connect a WordPress site (one-time)

The creator needs a WordPress **application password** — NOT their login
password. Walk them through it in plain language:

1. In WordPress admin: **Users → Profile → Application Passwords**.
2. Name it "VVibe" and click **Add New Application Password**.
3. Copy the generated password (spaces are fine; they're stripped).

Then connect it: `POST /api/blog/sites` with
`{ provider: "wordpress", name, siteUrl, credential: { username, applicationPassword } }`.

- `siteUrl` must be the public **https://** address of their site (e.g.
  `https://blog.example.com`). The server rejects `http://`, `localhost`,
  and private/internal addresses.
- The password is encrypted at rest and never returned. Only a
  non-secret hint (the username) is shown back.
- If the deployment hasn't configured publishing
  (`PUBLISHING_SECRET_KEK`), this returns 422 — tell the creator their
  operator must enable publishing.

Site connection + management is primarily a **dashboard** task (Blog →
Settings → Sites). Prefer pointing the creator there for entering
credentials rather than handling the application password in chat.

### B2. Test the connection

`POST /api/blog/sites/{id}/test` verifies reachability + auth and caches
the site's categories/tags for later selection. It returns
`{ ok, status }` — `ok:false` means bad credentials or an unreachable
site (a normal, fixable result, not an error to panic over). Relay the
plain reason and suggest re-checking the application password / URL.

### B3. Publish the draft

When WordPress is the creator's configured destination, just publish with
`vibe_publish_blog_post({ postId })` (REST: `POST .../publish` with only
`expectedVersion`) — the server sends the draft to their connected site.
Only pass an explicit `publishingSiteId` to **override** (e.g. they have
more than one site connected and want a specific one). Requirements:

- the post has a generated body (`draft_ready`),
- a connected publishing site for this merchant (if none, the publish
  returns a plain-language error telling the creator to connect one in
  Blog settings; if more than one, you must pass `publishingSiteId`).

> Sending both `target: "native"` and a `publishingSiteId` is rejected
> (400, ambiguous) — a post has one destination. Pick native **or** a site.

On success the post moves to `published_draft` with `remote_post_url`
pointing at the WordPress **edit** screen for the draft. Tell the
creator: "Your draft is in WordPress — open it, review, and publish from
there." Give them the `remote_post_url`.

On failure the post moves to `failed` with a plain-language reason
(bad credentials, site unreachable, redirect). Relay it and suggest the
fix; the creator can retry after correcting.

---

## What v1 does NOT do
- No auto-publish to WordPress (draft only).
- VVibe does **not** render the blog itself — it serves content via the
  API; the creator's site (built with `vvibe-blog-render`) is the "head".
  No VVibe-hosted RSS / sitemap either; the render skill emits those at
  the creator's site, where the links resolve.
- No cover-image upload yet (the field exists; the image feature lands
  later). Don't promise featured images.
- No Ghost (the provider is declared but not shipped) — if the creator
  asks, say WordPress is the supported external CMS today.
