# Rendering the blog in the creator's app

Goal: an **index** route and a **post** route that read the content API
(`content-api.md`), render VVibe's article HTML, carry its SEO through to
the page head, revalidate as posts change, and expose an RSS feed +
sitemap. Examples are **Next.js App Router** (the most common); other
frameworks follow the same shape — see §5.

Parameterise two values once (env): `VVIBE_BASE` (the deployment host) and
`VVIBE_SLUG` (the creator's merchant slug). Never hardcode them in pages.

## 0. Detect an existing blog first (mandatory)

Never scaffold `/blog` blind. Before writing a single file, check whether
the creator's app already has a blog:

- **Existing routes** — search the router for `/blog`, `/posts`, `/news`,
  `/articles` (Next.js App Router: `app/blog/`, `app/posts/`; Pages
  Router: `pages/blog/`; Astro: `src/pages/blog/`; Nuxt: `pages/blog/`;
  SvelteKit: `src/routes/blog/`).
- **Existing content source** — a CMS integration (Contentful, Sanity,
  WordPress via REST/GraphQL, Ghost, …) or a local markdown/MDX content
  folder (`content/`, `posts/`, `_posts/`) already feeding a blog-like
  page.
- **Navigation** — a "Blog" / "Articles" / "News" link in the site's nav
  component, even before you've located the route it points to.

Pick exactly one of these three strategies from what you find — say which
one out loud and why before writing any files, so the creator can correct
you:

| What you find | Strategy |
|---|---|
| Nothing — no matching routes, content source, or nav link | **(a) Scaffold.** Build the index/post routes as in §1–§3 below, and add a link to them from the site's navigation so the new blog is actually reachable. |
| A blog-like route already exists **and** it collides with the path you'd scaffold (e.g. `app/blog/page.tsx` already renders something else) | **(b) Never overwrite.** Do not touch the existing route or its content source. Mount VVibe's rendering at a non-conflicting path instead (e.g. `/vvibe-blog`, `/updates` — whatever fits the site) and ask the creator where they actually want it before deciding for them. |
| A blog-like route/index already exists and does **not** collide (its own path is free, or you'd be extending rather than replacing) | **(c) Merge.** Don't create a second, disconnected blog. Either (i) merge VVibe's posts into the existing listing/index's data source — call `listAllPosts()` alongside the existing content and render one combined list/feed — or, if merging the data isn't practical (e.g. the existing blog is backed by a CMS you don't want to touch), at minimum add a link from the existing blog index to the new VVibe-rendered pages so a reader can find them. |

This applies to RSS/sitemap too (§4): merge into an existing feed/sitemap
where one already exists rather than emitting a second, competing one.

## 1. A tiny typed client

```ts
// lib/vvibeBlog.ts
const BASE = process.env.VVIBE_BASE!        // e.g. https://app.vvibe.example
const SLUG = process.env.VVIBE_SLUG!        // the merchant slug

export type BlogListItem = {
  slug: string; title: string; excerpt: string | null
  coverImageUrl: string | null; publishedAt: string
  // Cover attribution — show "Photo by {credit}" linking to creditUrl
  // wherever you render coverImageUrl (stock licenses require it).
  coverImageCredit: string | null; coverImageCreditUrl: string | null
  metaTitle: string | null; metaDescription: string | null
}
export type BlogPost = BlogListItem & {
  updatedAt: string; bodyHtml: string
  schemaJsonld: Record<string, unknown> | null
}

const api = (path: string) => `${BASE}/api/blog/public/${SLUG}${path}`

/** Every published post (follows the cursor). */
export async function listAllPosts(): Promise<BlogListItem[]> {
  const out: BlogListItem[] = []
  let cursor: string | null = null
  do {
    const url = api(`?limit=50${cursor ? `&cursor=${cursor}` : ''}`)
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (res.status === 404) return out          // blog disabled / none yet
    if (!res.ok) throw new Error(`vvibe blog list ${res.status}`)
    const data = await res.json()
    out.push(...data.posts)
    cursor = data.nextCursor
  } while (cursor)
  return out
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  const res = await fetch(api(`/${encodeURIComponent(slug)}`), {
    next: { revalidate: 300 },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`vvibe blog post ${res.status}`)
  return (await res.json()).post
}

/** Blog-level header (title/description) for the index. */
export async function getBlogMeta() {
  const res = await fetch(api(`?limit=1`), { next: { revalidate: 300 } })
  if (!res.ok) return { title: '', description: null as string | null }
  return (await res.json()).blog
}
```

`next: { revalidate: 300 }` makes Next cache + refresh every 5 min — the
freshness knob. (Internally Next's fetch cache + the API's `ETag` keep it
cheap.) Tune the interval to how fast the creator publishes.

## 2. Index route

```tsx
// app/blog/page.tsx
import Link from 'next/link'
import { getBlogMeta, listAllPosts } from '@/lib/vvibeBlog'

export async function generateMetadata() {
  const blog = await getBlogMeta()
  return { title: blog.title, description: blog.description ?? undefined }
}

export default async function BlogIndex() {
  const [blog, posts] = await Promise.all([getBlogMeta(), listAllPosts()])
  return (
    <main>
      <h1>{blog.title}</h1>
      {blog.description && <p>{blog.description}</p>}
      <ul>
        {posts.map((p) => (
          <li key={p.slug}>
            <Link href={`/blog/${p.slug}`}>{p.title}</Link>
            {p.excerpt && <p>{p.excerpt}</p>}
            <time dateTime={p.publishedAt}>
              {new Date(p.publishedAt).toLocaleDateString()}
            </time>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

## 3. Post route — render HTML + carry the SEO

```tsx
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { getPost, listAllPosts } from '@/lib/vvibeBlog'

export async function generateStaticParams() {
  return (await listAllPosts()).map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) return {}
  return {
    title: post.metaTitle ?? post.title,
    description: post.metaDescription ?? undefined,
    openGraph: {
      title: post.metaTitle ?? post.title,
      description: post.metaDescription ?? undefined,
      images: post.coverImageUrl ? [post.coverImageUrl] : undefined,
      type: 'article',
    },
  }
}

// Escape `<` so a value can't break out of the script element.
const ldJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c')

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) notFound()
  return (
    <article>
      <h1>{post.title}</h1>
      <time dateTime={post.publishedAt}>
        {new Date(post.publishedAt).toLocaleDateString()}
      </time>
      {/* bodyHtml is sanitized server-side by VVibe; render via the
          framework's HTML mechanism and keep your site CSP. */}
      <div dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
      {/* JSON-LD — omit entirely when null/invalid. */}
      {post.schemaJsonld && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: ldJson(post.schemaJsonld) }}
        />
      )}
    </article>
  )
}
```

## 4. Feeds + sitemap (emit from the creator's site)

The links here must be **absolute URLs to the rendered pages** — VVibe
can't produce these, which is exactly why they live here.

```ts
// app/sitemap.ts
import type { MetadataRoute } from 'next'
import { listAllPosts } from '@/lib/vvibeBlog'

const SITE = process.env.SITE_URL! // e.g. https://creator.example.com

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await listAllPosts()
  return [
    { url: `${SITE}/blog`, changeFrequency: 'daily' },
    ...posts.map((p) => ({
      url: `${SITE}/blog/${p.slug}`,
      lastModified: p.publishedAt,
    })),
  ]
}
```

```ts
// app/blog/feed.xml/route.ts  → RSS 2.0
import { getBlogMeta, listAllPosts } from '@/lib/vvibeBlog'

const SITE = process.env.SITE_URL!
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const revalidate = 300

export async function GET() {
  const [blog, posts] = await Promise.all([getBlogMeta(), listAllPosts()])
  const items = posts
    .map(
      (p) => `<item>
  <title>${esc(p.title)}</title>
  <link>${SITE}/blog/${p.slug}</link>
  <guid>${SITE}/blog/${p.slug}</guid>
  <pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
  ${p.excerpt ? `<description>${esc(p.excerpt)}</description>` : ''}
</item>`
    )
    .join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${esc(blog.title)}</title>
  <link>${SITE}/blog</link>
  ${blog.description ? `<description>${esc(blog.description)}</description>` : ''}
  ${items}
</channel></rss>`
  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
```

## 5. Other frameworks (same shape)
- **Astro** — `src/pages/blog/index.astro` + `[slug].astro` with
  `getStaticPaths()` calling `listAllPosts()`; `@astrojs/rss` for the
  feed; `@astrojs/sitemap`. Set `set:html={post.bodyHtml}`.
- **Nuxt** — `pages/blog/index.vue` + `[slug].vue`, `useAsyncData` +
  `useHead` for meta/JSON-LD; a server route for `feed.xml`;
  `@nuxtjs/sitemap`.
- **SvelteKit** — `+page.server.ts` loaders; `<svelte:head>` for meta;
  `+server.ts` endpoints for `feed.xml` / `sitemap.xml`.
- **Plain static (SSG script)** — fetch `listAllPosts()` + each `getPost`
  at build, write HTML files; generate `feed.xml` + `sitemap.xml` the same
  way. Re-run the build (e.g. nightly cron / deploy hook) to pull new
  posts.

In every case: render `bodyHtml`, map `metaTitle/metaDescription` to the
head, inject `schemaJsonld` (escaped, omit when null), and revalidate on
an interval. The data contract is identical — only the framework glue
differs.
