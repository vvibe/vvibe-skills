# Source: github_repo

Walk a creator's codebase to extract product facts. Use this when the
agent is already operating inside a project — that's the most common
case, since the Vibe MCP / Claude Code session typically opens with a
repo at `cwd`.

This file tells you WHERE to look. Field-level extraction rules live
in `extraction-discipline.md`; schema shape lives in `kb-schema.md`.

## Order of operations

Read these files in order. Most repos give 80% of the KB signal in
the first 4–5 you find.

### 1. `README.md` (always read first)

The single highest-yield file. Look for:

- **Project tagline** — usually the first `# Heading` or first
  paragraph → `company.one_liner` (verbatim) and often
  `product.core_value_prop`.
- **"Features" / "What it does" section** → `features[]` (extract
  each bullet as a separate feature).
- **"For X" / "Who it's for" section** → `product.target_audience`.
- **Installation / quickstart** — implicit signal for category
  (`"npm install acme-cli"` suggests `category: "developer tool"`).
- **Badges and links** at the top — homepage URL, license, social
  handles → seed for `socials[]` and `website_url` (if you didn't
  have one).

### 2. `package.json` (or equivalent — `pyproject.toml`, `go.mod`,
`Cargo.toml`, `Gemfile`)

- `name` → fallback for `company.name` or `product.name` if README
  doesn't have a friendlier marketing name.
- `description` → fallback `company.one_liner` if README is bare.
- `homepage` / `repository` → website URL discovery.
- `keywords` → seed for `growth_context.seo_focus_keywords`.
- Dependencies → seed for `product.integrations` (e.g. `stripe`,
  `sendgrid`, `clerk`, `posthog`, `sentry` — well-known SaaS deps
  become integration list entries).

### 3. `docs/` (if present)

Project docs are usually the cleanest source of structured product
copy.

- `docs/features/*` → one feature per file is the common shape.
- `docs/integrations/*` → directly into `product.integrations`.
- `docs/pricing.{md,mdx}` → `pricing.*` if no website pricing page.
- `docs/about.{md,mdx}` → `company.long_description`.
- `docs/customers/*` or `docs/case-studies/*` → `cases[]` (every
  file = one case; extract verbatim).

### 4. `app/`, `pages/`, `src/`, `components/` — marketing copy in
   route handlers

For Next.js / Remix / SvelteKit / Astro projects, the marketing
copy often lives in route files, not docs.

Look for:

- `app/page.tsx`, `pages/index.{tsx,vue}`, `src/routes/+page.svelte`
  — the homepage. Hero headline, sub-headline, feature grid.
- `app/pricing/page.tsx` / `pages/pricing.{tsx,vue}` — full
  pricing tiers, often with `tiers: [{ name, price, features }]`
  arrays in the source.
- `app/about/page.tsx` — `company.long_description`,
  `growth_context.icp_persona` (the "we're built for X" copy).
- `app/customers/page.tsx` or `app/case-studies/page.tsx` —
  `cases[]`. Pull named customers verbatim; skip placeholder
  "Customer A" / "Big Co Inc." dummies.
- `components/marketing/*` or `components/landing/*` — feature grids,
  CTA copy, brand-voice exemplars.

For non-framework projects (vanilla HTML, Vite SPA), check
`index.html` and any landing-page directories.

### 5. `compliance.md`, `LEGAL.md`, `terms.md`, `privacy.md`

Direct hits for `legal_compliance`:

- A compliance file with a "DO NOT SAY" or "Avoid claims like …"
  block → `legal_compliance.forbidden_claims` (lift verbatim).
- Privacy policy mentioning GDPR / Article 6 → `gdpr_required: true`.
- Privacy policy mentioning CAN-SPAM / opt-out / unsubscribe footers
  → `can_spam_required: true`.
- `region` is whatever jurisdiction the privacy policy declares.

If none of these files exist, `legal_compliance` mostly lands in
`missing_fields[]` — that's fine; it's the most common reality for
early-stage projects.

### 6. `.env.example` / config files

Not for marketing copy, but useful for `product.integrations`:

- `STRIPE_*` → Stripe integration
- `SUPABASE_*` / `FIREBASE_*` → respective backend
- `RESEND_API_KEY` / `SENDGRID_*` / `POSTMARK_*` → email provider
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` → LLM integration
- `POSTHOG_*` / `GA_*` / `MIXPANEL_*` → analytics

The .env list is a fact, not marketing copy. Use it to corroborate
or fill in `integrations[]`, not to invent capability claims.

### 7. Existing email / blog drafts (brand voice gold)

If the repo has email drafts (search for files named
`emails/*.{tsx,html,md}`, `lib/emails/*`, or content under
`content/blog/*`):

- Voice exemplars → `company.brand_voice.examples[]`. Mark
  `source: "human-edit-inferred"` since the agent didn't see them
  approved; the creator can re-mark them later via the dashboard.
- Tone inference → 2–4 word descriptor for
  `company.brand_voice.tone`. Set
  `_confidence.company = "medium"` since this is INFER.

## What NOT to read

- `node_modules/` — never.
- `.git/`, `.next/`, `dist/`, `build/` — generated, no signal.
- Test files (`*.test.*`, `__tests__/`, `*.spec.*`) — implementation
  detail, not marketing copy.
- Migration files (`drizzle/*`, `prisma/migrations/*`) — schema
  detail; gives integration hints but not marketing copy.
- Source files >50KB — usually generated; bail early.

## Stop conditions

Stop walking the repo once you've gathered enough signal to fill
high-confidence sections. The token-budget guidance in
`SKILL.md` §6 caps input at 80k tokens — for a typical repo with a
README + landing page + pricing page + docs/, that's the entire
budget. Don't burn it on test fixtures.

If after walking the above you still have most fields in
`missing_fields[]` (e.g. a starter template repo with no marketing
copy at all), tell the human and ask whether they want to add a
website URL or paste in some marketing material as `document_set`.

## Worked example

A typical Next.js SaaS repo:

```
acme/
├── README.md                       # → company.one_liner, product.core_value_prop
├── package.json                    # → product.name, seed integrations[]
├── app/
│   ├── page.tsx                    # → hero, features[]
│   ├── pricing/page.tsx            # → pricing.tiers[]
│   ├── customers/page.tsx          # → cases[] (verbatim)
│   └── about/page.tsx              # → company.long_description
├── content/blog/*.mdx              # → brand_voice (INFER tone)
├── components/marketing/Hero.tsx   # → seed for differentiators
├── compliance.md                   # → forbidden_claims
└── .env.example                    # → confirm integrations[]
```

That walk takes ~30k tokens, returns a high-confidence
`company` + `product` + `pricing` + `features` + `cases`, a
medium-confidence `brand_voice`, and leaves `growth_context.icp_persona`
in `missing_fields[]` (no analytics signal in the repo).
