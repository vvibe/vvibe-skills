# Source: website_url

Crawl a creator's public marketing site. Use this when:

- The repo is bare (starter template, infrastructure-only) and the
  website has the marketing copy.
- The repo and website have diverged — the site is the canonical
  surface; the repo can have stale copy nobody bothered to delete.
- The agent has no repo access at all (running over MCP, creator
  pasted a URL).

This file tells you WHERE to look on a site. Field-level extraction
rules live in `extraction-discipline.md`; schema in `kb-schema.md`.

## Crawl order — strict precedence per VV-18

Try these in order and stop at the first one that yields useful
pages.

### 1. `${root}/sitemap.xml`

The cleanest source. A well-formed sitemap gives you every public
page in one fetch with no JS rendering needed.

- Parse the `<urlset><url><loc>` entries.
- Sort by URL pattern affinity:
  1. `/` (homepage) — always first
  2. `/pricing` — second
  3. `/features` / `/product` — third
  4. `/about` / `/company` — fourth
  5. `/customers` / `/case-studies` / `/testimonials` — fifth
  6. `/blog/*` — last, for brand-voice inference only
- Skip URLs matching `/blog/tag/`, `/category/`, `/search`,
  `/login`, `/signup`, `/account/` — they're navigational, not
  content.

### 2. `${root}/robots.txt`

If `sitemap.xml` is missing or empty, `robots.txt` often declares
`Sitemap: <url>` — follow it.

If both are missing, robots.txt may at least list `Disallow:` paths;
inverse-infer the high-value paths from what's blocked from search
engines (admin paths, internal tools — what's NOT in `Disallow` is
the public site).

### 3. Fallback crawl

If sitemap + robots both yield nothing useful, hit these URLs in
sequence:

```
${root}/
${root}/pricing
${root}/features
${root}/product
${root}/about
${root}/company
${root}/customers
${root}/case-studies
${root}/testimonials
${root}/manifesto
```

Most modern marketing sites use one of these slugs. 404s are fine —
the absent paths are signal too (no `/pricing` means
`pricing` → `missing_fields[]`).

Don't crawl deeper than two levels. Marketing copy is on the top
nav, not in `/blog/2023/03/12/some-thought-leadership-post`.

## What each page typically yields

### Homepage (`/`)

- `<title>` and `<meta name="description">` → `company.one_liner`
  candidate (the meta description is often the clean version of the
  hero headline).
- `<h1>` → hero headline. Sometimes `company.one_liner`, sometimes
  `product.core_value_prop` depending on the project's framing.
- The sub-headline under the hero → the other of those two.
- Feature grid (typically 3–6 cards) → `features[]` (extract `name`
  and `description` from each card).
- "Trusted by" / customer-logo row — **not** `cases[]`. Logos
  without quotes are marketing decoration; only fill `cases[]`
  when the source has a verbatim attributed quote (see
  `extraction-discipline.md` §4).
- Final CTA section often contains `product.target_audience` ("For
  founders who …").

### Pricing page (`/pricing`)

The most structured page. Walk every pricing card:

- `tier.name` from the card title.
- `tier.price` from the price label — strip currency symbols, parse
  to number; if "Custom" / "Contact us", set `price: null` and
  `billing_period: null`.
- `tier.billing_period` from the suffix ("/mo", "/year",
  "per seat" → `"monthly"`, `"yearly"`, `"usage_based"`).
- `tier.features_included` from the bullet list under each card.

Top of page often has:

- "Save N% with annual" → `discounts: ["annual: <verbatim string>"]`
- "Start free, no credit card" → `free_trial.available: true`
- "14-day free trial" → `free_trial.duration_days: 14`

If `currency` isn't shown explicitly, infer from the symbol (`$` →
`USD`, `€` → `EUR`, `NT$` → `TWD`). When ambiguous (`$` could be
USD, CAD, AUD), set `currency: null` and add it to
`missing_fields[]` — don't guess.

### Features / Product page (`/features`, `/product`)

If a dedicated features page exists, prefer it over the homepage
grid — it usually has fuller `description` + `benefit` copy per
feature.

- Each feature section → one entry in `features[]`.
- `id` slug from the section's anchor (`<section id="auto-resume">`
  → `"auto-resume"`), or slugify from `name` if no anchor.
- `benefit` from the "Why it matters" / "What you get" line — often
  a separate paragraph from the description.
- `keywords` from the section's sub-bullets + any related-features
  callouts.

### About page (`/about`, `/company`)

- `company.long_description` from the opening paragraph (verbatim).
- `growth_context.icp_persona` from any "We built this for …" or
  "Acme is for …" copy (INFER if it's not phrased as a sentence
  about a customer).
- `company.brand_voice.examples` from the founder bio paragraphs
  (good first-person voice samples).

### Customer / case-study pages (`/customers`, `/case-studies`)

The ONLY legitimate source for `cases[]`. For each case:

- `customer_name` — verbatim from the page heading
- `use_case` — from the "Challenge" / "Problem" / "How they use it"
  block
- `result` — from the "Outcome" / "Result" block, with units kept
  verbatim (`"3× engagement rate"`, not `"engagement improved"`)
- `testimonial` — the pull-quote with attribution
- `published: true` — these are on the public site by definition

Logos rows without quotes don't count — see
`extraction-discipline.md` §4.

### Blog posts (`/blog/*`)

Use SPARINGLY and only for brand-voice inference. Read 2–3 recent
posts max.

- `company.brand_voice.tone` (INFER, set `_confidence = "medium"`).
- `growth_context.primary_channels` if the post mentions launches
  ("featured on ProductHunt", "go-to-market via Reddit").

DO NOT extract feature claims from blog posts — they're often
aspirational or about future features. Stick to the
features/product page for `features[]`.

## HTML parsing tips

- Strip nav / footer / cookie-banner content before extracting.
  They contain repeated boilerplate that pollutes every page.
- Prefer `<meta property="og:*">` tags for clean canonical strings
  (`og:description`, `og:image` → `growth_context.brand_assets.og_image`).
- For React / Vue / Svelte SPA sites, the marketing copy is usually
  in the SSR'd HTML (hydration target). If the body is empty until
  JS runs, the site is client-rendered — you'll need a real browser
  fetch (Playwright / headless Chrome via the agent's tools) rather
  than a plain HTTP GET.

## What NOT to crawl

- `/login`, `/signup`, `/account`, `/dashboard` — gated, no
  marketing copy.
- `/admin`, `/internal` — accidentally public, never useful.
- File downloads (PDFs linked from the site) — those are
  `document_set` material; the human should explicitly pass them.
- `/api/*` JSON endpoints — irrelevant to the Product Brain.

## Worked example

`https://acme.app/sitemap.xml` returns 12 URLs. Read in order:

1. `https://acme.app/` — hero + 4-card feature grid → `company.one_liner`, 4 entries seeded into `features[]`.
2. `https://acme.app/pricing` — 3-tier table → `pricing.tiers[]`, `pricing.currency: "USD"`, `pricing.free_trial.duration_days: 14`.
3. `https://acme.app/about` — `company.long_description`, INFER `growth_context.icp_persona`.
4. `https://acme.app/customers` — 2 case studies → `cases[]` (named customers verbatim).
5. `https://acme.app/blog/launch-recap` — INFER `brand_voice.tone: "calm, direct, practical"`.

Stop. `company` + `product` + `pricing` + `features` + `cases`
high-confidence; `growth_context.icp_persona` medium; everything
else (legal_compliance, brand_voice examples) → `missing_fields[]`.
