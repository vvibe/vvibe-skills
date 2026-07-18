# Extraction discipline

Behavioural contract for this skill. **Read this before extracting
anything.** Every section of the Product Brain has to obey these rules — they're
what stops this skill from producing a confident-looking document
full of fabricated facts.

## 1. The three layers, in priority order

The Builder fills every field by trying these in order, and stops at
the first one that applies.

### EXTRACT (verbatim)

If the source contains the exact wording, lift it verbatim — including
punctuation, em-dashes, and the creator's own idiosyncratic phrasing.

This is the default for:
- `company.one_liner` — usually a `<meta name="description">`, a
  hero headline, or the first sentence of the README.
- `product.core_value_prop` — the headline-under-the-hero on the
  landing page, or the project's `package.json` description.
- `product.differentiators` — bullet lists labelled "Why us", "What
  makes us different", "We're not like …".
- `legal_compliance.forbidden_claims` — anything found inside a
  `compliance.md`, `disclaimers/`, `terms.md` style file.

Set `meta._confidence.<section> = "high"` when a section was mostly
EXTRACT.

### INFER (synthesise + flag)

When the source is fuzzy but signal is present, synthesise a
best-guess and set `meta._confidence.<section> = "medium"`.

Common INFER cases:
- `company.brand_voice.tone` — inferred from existing emails / blog
  posts / social copy. Pick a 2-4 word descriptor (e.g.
  "warm, plain, encouraging") rather than long prose.
- `growth_context.icp_persona` — inferred from who the marketing
  copy addresses. Phrase it as a customer profile, not a fact.
- `product.target_audience` — inferred when there's no explicit
  "for X" statement.

INFER does **not** mean "make it up". It means "the source implies
this; here's the best summary I can write while staying honest." If
you can't point at a sentence in the source that backs your INFER
choice, you're fabricating — drop to NO FABRICATION instead.

### NO FABRICATION (null + missing_fields)

When source has no signal at all, set the field to `null` (or `[]`
for arrays) and add the dotted path to `missing_fields[]`.

Examples that ALWAYS go in `missing_fields[]` when source is silent:
- `growth_context.icp_persona` if no marketing copy exists yet
- `pricing.tiers` if no pricing page exists
- `cases[]` — until the source explicitly names a customer (see §4)
- `company.brand_voice.examples` — until the creator has approved
  drafts this skill can lift from
- `legal_compliance.region` if no jurisdiction is mentioned

Setting `_confidence.<section> = "low"` is allowed when this skill
managed to fill **some** fields by INFER but most went to
`missing_fields[]` — useful for downstream skills to know they should
ask the creator before drafting against this section.

## 2. The Builder's mantra

> **No source signal → null + `missing_fields[]`. Never invent.**

If you find yourself writing a sentence and you can't quote the
source that backs it, stop. That sentence is fabrication. Set the
field to `null`, log the path, move on.

## 2.5 The starter-template guard (don't treat demo data as product fact)

Many first-time creators run build mode on a **starter template they
haven't customised yet** — the showcase repo still ships its seed
data, placeholder copy, and example domains. That demo content is not
the creator's product. Building a KB from it writes fiction into
`pricing`, `company`, and `growth_context.icp_persona` that every
downstream skill then treats as fact.

**Detection — treat the source as suspect starter / demo content when
you see any of:**

- **Seed / preset / fixture data used as a source of product facts** —
  files like `presets*`, `seed*.{mjs,ts,js,json}`, `*.seed.*`,
  `fixtures/`, `demo-data/`, `mock*`, or a "preview" seeding script.
- **Example / test domains** in the marketing copy or config —
  `example.com`, `example.org`, `test.com`, `localhost`,
  `yourdomain.*`, `acme.*`, `mysite.*`, or an unset
  `appBaseUrl` / `NEXT_PUBLIC_*_URL`.
- **Placeholder copy** — `Lorem ipsum`, `Your product name`,
  `Company Name`, `Product description goes here`, `TODO`,
  `Coming soon`, visibly templated hero text, or demo prices like
  `$0` / `$XX` / a round `99.99` sitting in a sample pricing table.
- **Showcase content that contradicts the README** — the landing page
  sells "Acme CRM" but the README describes a member-hub starter; the
  showcased product and the documented product don't match.

**Behaviour when detected — stop and ask; never silently proceed.**
Do not write demo values into the KB. Ask the creator one plain
question and wait for the answer:

> This looks like the starter template's default content — I can still
> see placeholder copy / example domains / seed data (specifically:
> `<the exact signal you found>`). Want me to build the Product Brain
> from these defaults anyway, or hold off until you've swapped in your
> real product content?

- If the creator says **build from defaults anyway** → proceed, but
  keep `_confidence` low on any section sourced from demo content and
  flag in the closing summary that it was placeholder-derived.
- If the creator says **hold off / it's still the template** → don't
  write. Tell them what to replace (product copy, pricing, domain) and
  offer to re-run once it's real.

This is a data-authenticity gate, not fabrication by another name: the
fix is to ask, not to guess. It pairs with §2's mantra — no
trustworthy source signal → don't manufacture one from demo data. The
capability-gate ordering in `mode-build.md` §1 and this guard together
mean build mode never burns a full extraction on content it shouldn't
have trusted.

## 3. Source-precedence when sections conflict

When multiple sources are available and they disagree, this is the
order of authority:

| Section | Source ranking (highest first) |
|---|---|
| `company.name` / `company.one_liner` | website > `package.json` description > README headline |
| `company.brand_voice.*` | document_set (style guide if present) > emails the creator has actually sent > marketing copy on website |
| `company.author.*` (v2) | About / Team / author bio page > `package.json` `author` field > git commit-history primary author > nothing |
| `product.*` | website (canonical marketing copy) > docs (`docs/`, `README.md`) > inline component copy in github_repo |
| `pricing.*` | website pricing page > a `pricing.md` / `pricing.json` in the repo > nothing |
| `features[]` | docs (`docs/features/*`, README "Features" section) > website "Features" page > component copy |
| `cases[]` | website case-study pages (verbatim) > customer-testimonial blocks > nothing — see §4 |
| `growth_context.*` | document_set (creator's own positioning doc) > website (who-it's-for copy) > marketing emails |
| `growth_context.faq_bank` (v2) | dedicated FAQ / help-center page (verbatim Q&A) > docs FAQ section > nothing — never synthesise from prose |
| `growth_context.trusted_facts` (v2) | trust / security / compliance page > "our promise" copy > footer disclaimers > nothing — extract verbatim only |
| `growth_context.preferred_terms` (v2) | style-guide page > repeated terminology across the corpus > nothing |
| `growth_context.reader_pain_points` (v2) | website hero "the problem" copy > pain-point list on landing page > podcast / about intro > inference from testimonials |
| `legal_compliance.*` | document_set (legal docs) > `compliance.md` / `terms.md` in repo > website footer pages |

If the website says X and the repo says Y, the website wins —
the public surface is what the creator actually stands behind. The
repo can have old wording that nobody bothered to delete.

## 4. The customer-fabrication rule (hard prohibition)

`cases[]` is the most dangerous section. **The Builder must not
invent customers.** Empty is correct when:

- No `case-studies/`, `customers/`, `testimonials/` page exists, AND
- No `<blockquote>` with a `cite="Name, Company"` attribution
  appears anywhere in the marketing copy, AND
- The user didn't paste case studies as part of `document_set`.

If even one of those is missing, write `cases: []` and add `"cases"`
to `missing_fields[]`. **Do not** write placeholder cases ("example
customer", "imagined enterprise client"). Do not write `cases` based
on language like "Many of our users have …" — that's marketing copy,
not a named customer.

When you DO find a real case study, extract it verbatim:

```json
{
  "customer_name": "Exact name as published",
  "use_case": "Lifted from the source",
  "result": "The metric or outcome the source claims (verbatim, including units)",
  "testimonial": "The pull-quote with attribution",
  "published": true
}
```

`published: false` is for cases the creator has documented in
`document_set` but hasn't put on their public site yet. Default to
`true` only when the case is already published.

## 5. Forbidden-claims taxonomy

Inspect every piece of marketing copy you read for these patterns and
copy verbatim hits into `legal_compliance.forbidden_claims`:

| Regime | Look for |
|---|---|
| **CAN-SPAM** (US email) | "we will never share your email" (true only if literally true), "100% spam-free", subject-line claims that don't match body |
| **FTC** (US advertising) | "guaranteed results", "X% income increase", "no risk", "proven to …" without a citation, before/after photos without a "results not typical" caveat |
| **Medical** (FDA / HIPAA-adjacent) | "cures", "treats <condition>", "FDA-approved" when not actually approved, weight-loss claims with a number |
| **Financial** (SEC / FINRA-adjacent) | "guaranteed return", "<N>% APR / APY" outside of a regulated product context, "risk-free investment" |

Lift the verbatim phrase from the source. Downstream skills (email
campaigns, SEO, conversion copy) read this list and reject drafts
that re-use these phrases — that's the entire point of recording
them. Don't paraphrase; the matching is exact-string.

If the creator's existing marketing already contains these claims
(common — most early-stage marketing has at least one), this skill
isn't telling the creator to fix them. It's telling downstream
agents to stop reinforcing them.

## 6. Worked example — "what does good look like"

Source: a SaaS landing page with a hero headline, three pricing
tiers, two case studies, no docs directory, no style guide.

```jsonc
{
  "meta": {
    "schema_version": 1,
    "_confidence": {
      "company": "high",          // verbatim hero + meta description
      "product": "high",          // verbatim from "What it does" block
      "pricing": "high",          // verbatim from pricing table
      "features": "medium",       // inferred from feature grid icons + labels
      "cases": "high",            // verbatim from /customers
      "growth_context": "low",    // only "for solo founders" hinted in copy
      "legal_compliance": "low"   // footer only
    }
  },
  "company": {
    "name": "Acme",                                              // EXTRACT — header logo alt text
    "one_liner": "The opinionated CRM for solo founders.",       // EXTRACT — meta description
    "long_description": null,                                    // → missing_fields
    "brand_voice": { "tone": null, "examples": [], "avoid": [] },// → missing_fields (all three)
    "socials": [/* … extracted */]
  },
  // … other sections …
}
```

Corresponding `missing_fields[]`:

```json
[
  "company.long_description",
  "company.brand_voice.tone",
  "company.brand_voice.examples",
  "company.brand_voice.avoid",
  "growth_context.icp_persona",
  "growth_context.primary_channels",
  "legal_compliance.region",
  "legal_compliance.forbidden_claims"
]
```

That's a legitimate first-pass KB. Empty fields aren't failures —
they're signals that the next pass needs more source material (a
style guide, an analytics export, the actual terms-of-service page).

## 7. When to fail loudly

The Builder should refuse to write and surface the problem in chat
(rather than ship a partial KB) when:

- The source set is empty — no repo, no URL, no documents.
  Tell the user explicitly which source types you'd accept.
- The `vibe_set_product_kb` MCP tool isn't available AND
  `VVIBE_API_KEY` isn't in the env. The Builder can extract but
  can't write; that's not "soft fail and move on" — the creator
  needs to wire one of the two paths.
- Schema validation fails on the constructed payload (extra keys,
  wrong types). Dump the failing payload so the human can see the
  drift; don't retry blindly.
- The `cases[]` array would contain anything you can't quote
  verbatim from source. Fail hard rather than ship invented
  customers.

## 8. Source consent — asking before you read images

Images can carry the richest product signal (a pricing screenshot, a
landing-page hero export, a brand / style board, a slide exported to
PNG) — but reading them costs meaningfully more tokens than text, and
the creator may not expect the agent to open every image it can see.
So images get an explicit consent gate. **This is the skill's single
consent rule for source access — there is no second, looser one; when
another surface (e.g. `sources/document-set.md` screenshots) needs to
read an image, it defers here.**

**Never read an image source without asking first.** This holds in
build and refresh, and for every image entry point: files in the repo,
uploads / pastes in a `document_set`, and inline images on a crawled
page.

**When image sources are present, before reading any of them:**

1. **List them.** Show the creator the specific images you've spotted
   that look like they carry product info — surface the filename / URL
   and why it looks relevant. Prioritise obvious signal: `pricing*`,
   `landing*`, `hero*`, `brand*`, `logo*`, `style*`, `screenshot*`,
   `og*` / social-card images, and slide / deck exports (a `*.png` /
   `*.jpg` sitting next to a `.pdf` deck).
2. **Ask for permission, and name the cost.** State plainly that
   reading images uses more tokens than text, and let the creator
   approve **all, some, or none**:

   > I found 3 images that might hold product details:
   > 1. `pricing-table.png`
   > 2. `hero-shot.jpg`
   > 3. `team-photo.png`
   >
   > Reading images costs more tokens than text, so I won't open any
   > without your OK. Which should I scan — all, just some (say which),
   > or none?

3. **Scan only what they approve.** Read the approved images and treat
   the extracted text as a single-page document of whatever type it
   shows (apply `sources/document-set.md`). Leave un-approved images
   unread.

**When the creator declines (all or some):** proceed with the text
sources as normal. For every field an un-scanned image might have
filled, leave it in `missing_fields[]` and **record that an image
source went unread**, so the gap is explainable later. Use the
lightest annotation the current schema already supports — do **not**
change the schema:

- In **build** mode there is no `change_log`; note the unread image(s)
  in the step-7 closing summary (e.g. "I left `pricing` missing —
  `pricing-table.png` wasn't scanned").
- In **refresh** mode, add a `change_log` entry recording the skipped
  scan (`path` = the affected section, `before` / `after` unchanged),
  and mention it in the diff you show before writing.

**If nothing product-relevant is in an image** (a decorative
background, a UI icon), you don't need to ask — the gate is for images
that plausibly carry product facts, judged by the filename / context
signals above.
