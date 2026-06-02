# Publishing to the creator's CMS

v1 supports **WordPress**. Publishing always creates a **draft** in the
creator's WordPress — they review and hit Publish themselves. Never tell
them the post is live.

## 1. Connect a WordPress site (one-time)

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

## 2. Test the connection

`POST /api/blog/sites/{id}/test` verifies reachability + auth and caches
the site's categories/tags for later selection. It returns
`{ ok, status }` — `ok:false` means bad credentials or an unreachable
site (a normal, fixable result, not an error to panic over). Relay the
plain reason and suggest re-checking the application password / URL.

## 3. Publish the draft

`POST /api/blog/posts/{id}/publish` with `{ publishingSiteId }` (or rely
on the post's attached site). Requirements:

- the post has a generated body (`draft_ready`),
- a connected publishing site for this merchant.

On success the post moves to `published_draft` with `remote_post_url`
pointing at the WordPress **edit** screen for the draft. Tell the
creator: "Your draft is in WordPress — open it, review, and publish from
there." Give them the `remote_post_url`.

On failure the post moves to `failed` with a plain-language reason
(bad credentials, site unreachable, redirect). Relay it and suggest the
fix; the creator can retry after correcting.

## 4. What v1 does NOT do
- No auto-publish (draft only).
- No cover-image upload yet (the field exists; the image feature lands
  later). Don't promise featured images.
- No Ghost (the provider is declared but not shipped) — if the creator
  asks, say WordPress is the supported CMS today.
