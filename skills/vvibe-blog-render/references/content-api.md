# The VVibe content API (what you consume)

Public, read-only, unauthenticated, CORS-open. Base is the creator's VVibe
deployment host; the blog lives under `/api/blog/public/{merchantSlug}`.
Everything is scoped by the merchant **slug** in the path — there are no
credentials and no merchant id in the payload.

## Endpoints

### List
`GET {base}/api/blog/public/{merchantSlug}?cursor=&limit=`

```jsonc
{
  "blog": { "title": "My Blog", "description": "..." },   // index header
  "posts": [
    {
      "slug": "why-magic-links-win",
      "title": "...",
      "excerpt": "...",
      "coverImageUrl": "https://… | null",
      "coverImageCredit": "Jane Doe | null",              // photographer — show as attribution
      "coverImageCreditUrl": "https://www.pexels.com/photo/… | null",
      "publishedAt": "2026-06-04T10:00:00.000Z",          // ISO-8601
      "metaTitle": "… | null",
      "metaDescription": "… | null"
    }
  ],
  "nextCursor": "20"      // opaque; pass back as ?cursor= for the next page, or null
}
```

- Newest first. `limit` defaults to 20 (max 50). To collect every post
  (e.g. at build time), loop while `nextCursor !== null`, passing it as
  `?cursor=`.

### Single post
`GET {base}/api/blog/public/{merchantSlug}/{postSlug}`

```jsonc
{
  "post": {
    "slug": "why-magic-links-win",
    "title": "...",
    "excerpt": "… | null",
    "coverImageUrl": "… | null",
    "coverImageCredit": "Jane Doe | null",                // photographer — show as attribution
    "coverImageCreditUrl": "https://www.pexels.com/photo/… | null",
    "publishedAt": "2026-06-04T10:00:00.000Z",
    "updatedAt": "2026-06-04T11:30:00.000Z",
    "metaTitle": "… | null",
    "metaDescription": "… | null",
    "bodyHtml": "<h2>…</h2><p>…</p>",       // sanitized by VVibe
    "schemaJsonld": { "@context": "https://schema.org", "@graph": [ … ] } // or null
  }
}
```

## Status codes
- `200` — found (list or post).
- `404` `{ "error": "not_found" }` — unknown slug, the post isn't
  published, **or** the creator's public blog is disabled. Treat all three
  the same in the UI: "no posts yet" (and, when setting up, route the
  creator to publish first).
- No other states matter to a consumer — there is no auth, so no 401/403.

## Caching / conditional GET
Both endpoints send `ETag` and `Last-Modified`. Send back `If-None-Match`
(preferred) or `If-Modified-Since` and you'll get `304 Not Modified` when
nothing changed — cheap polling for revalidation. `Cache-Control` is a
short `public, max-age`, so a CDN/browser can cache too.

## What is NOT here (by design)
- **No RSS / JSON Feed / sitemap from VVibe.** Those are head formats
  whose links must point at *your* rendered pages — generate them in the
  creator's app (see `rendering.md`). The JSON above *is* the machine feed.
- **No drafts or internal fields** — only published posts, and only
  reader-safe fields (no version, status, remote ids, etc.).
- **No write paths.** Publishing/unpublishing is `vvibe-blog-writer`.
