# KB schema — eight sections + meta

This is the authoritative shape of the Product Knowledge Base
document. The Builder fills this shape and passes it to
`vibe_set_product_kb` as `kb_data`. Field names are snake_case
because downstream prose-generating skills key off them in their
prompts; drift breaks those skills silently.

Every field is nullable / defaulting in the schema — what you can't
extract leaves the field as `null` (or `[]` for arrays) and lands in
`missing_fields[]`. See `extraction-discipline.md` §1.

## meta

```jsonc
{
  "meta": {
    "schema_version": 1,
    "_confidence": {
      "company": "high" | "medium" | "low",
      "product": "high" | "medium" | "low",
      "pricing": "high" | "medium" | "low",
      "features": "high" | "medium" | "low",
      "cases": "high" | "medium" | "low",
      "growth_context": "high" | "medium" | "low",
      "legal_compliance": "high" | "medium" | "low"
    }
  }
}
```

`schema_version` is `1` until the document shape itself changes. Bump
only when a future version of this skill ships with a new shape.

`_confidence` is per-section, not per-field. Set the level based on
how much of the section came verbatim (high) vs. inferred (medium)
vs. mostly-missing (low). Downstream skills decide whether to ask the
creator for confirmation based on this.

## company

The creator's company / project as an identity.

```jsonc
{
  "company": {
    "name": "string | null",
    "one_liner": "string | null",              // marketing tagline, ≤ 12 words
    "long_description": "string | null",       // 2–4 sentence "about" paragraph
    "brand_voice": {
      "tone": "string | null",                 // 2–4 word descriptor — "warm, plain, encouraging"
      "examples": [
        {
          "snippet": "string",
          "source": "creator-approved | human-edit-inferred",
          "captured_at": "ISO-8601 datetime"
        }
      ],
      "avoid": ["string"]                      // phrases the brand doesn't use
    },
    "socials": [
      { "platform": "string", "handle": "string | null", "url": "string | null" }
    ]
  }
}
```

Notes:
- `brand_voice.examples` should be **verbatim** snippets the creator
  has either approved (set `source: "creator-approved"`) or that
  appear in already-published copy you can infer-attribute (set
  `source: "human-edit-inferred"`). Build mode rarely fills this —
  leave empty unless the source explicitly includes "approved by
  Creator" or a style-guide page.
- `brand_voice.examples[].captured_at` — when the snippet comes from
  a real approval / human-edit event with a known timestamp, use
  that. When the snippet is lifted from current source code or a
  current website pass (build mode's common case), use the Builder
  run's extraction timestamp. Refresh mode keeps the existing
  `captured_at` for snippets it preserves; only new entries get the
  fresh-run timestamp.
- `socials[].platform`: lowercase platform key (`"twitter"`,
  `"linkedin"`, `"instagram"`, `"github"`, …). Both handle and url
  may be null if only one is on the page.

## product

What the product is and what makes it different.

```jsonc
{
  "product": {
    "name": "string | null",
    "category": "string | null",               // "SaaS CRM", "Mobile fitness app", …
    "target_audience": "string | null",        // who it's for, one sentence
    "core_value_prop": "string | null",        // the main benefit, ≤ 20 words
    "differentiators": ["string"],             // 3–5 bullet points, verbatim from source
    "integrations": ["string"]                 // third-party product names
  }
}
```

`core_value_prop` is the highest-leverage field in the document —
downstream skills lean on it in every prompt. Spend extra effort
extracting verbatim rather than synthesising.

## pricing

```jsonc
{
  "pricing": {
    "model": "free | freemium | subscription | usage_based | one_time | null",
    "currency": "string | null",               // ISO 4217 — "USD", "EUR", "TWD"
    "tiers": [
      {
        "name": "string",                      // "Free", "Pro", "Enterprise"
        "price": "number | null",
        "billing_period": "monthly | yearly | one_time | usage_based | null",
        "features_included": ["string"]
      }
    ],
    "free_trial": {
      "available": "boolean",
      "duration_days": "number | null"
    } | null,
    "discounts": ["string"]                    // student / annual / nonprofit
  }
}
```

If there's no pricing page at all, leave `tiers: []` and add
`"pricing"` to `missing_fields[]` (the section root, not each tier).
A freemium / open-source product may have `model: "free"` and zero
tiers — that's still valid.

**Multi-currency / regional pricing.** Some products publish parallel
price tables for different markets (e.g. Portaly: TWD for Asia, USD
for the English market). `currency` and `billing_period` are scalar
fields, not per-tier matrices — the v1 convention is:

- Set top-level `currency` to the product's **primary** currency (the
  one shown to the largest audience or first in the pricing page).
- Append the secondary market's name to its tier names
  (`"Premium (English market) — Monthly"`).
- Use `features_included` on the secondary tiers to capture the
  secondary currency's absolute prices when they don't follow a flat
  conversion from the primary tier (often the case — markets get
  custom pricing, not FX-converted prices).

Downstream skills that need to draft regional copy read the tier
name to decide which market the row belongs to.

## features[]

Product capabilities (what the product DOES). This is **not** a
shipping changelog — the changelog mechanism is explicitly Phase II
per the upstream RFC.

```jsonc
{
  "features": [
    {
      "id": "string",                          // stable slug — "auto-resume", "magic-link-auth"
      "name": "string",
      "category": "string | null",             // "auth", "billing", "analytics", …
      "description": "string | null",          // what it does, plain language
      "benefit": "string | null",              // why it matters to the user
      "keywords": ["string"]                   // for retrieval by SEO / email skills
    }
  ]
}
```

`id` must be stable across refresh runs — slugify from `name` if the
source doesn't carry an explicit id. Refresh mode uses `id` to match
existing entries; rename without changing id when the marketing name
changes.

`keywords` is what SEO + email skills retrieve against — include
synonyms, common misspellings, related industry terms. 5–10 keywords
per feature is the sweet spot.

## cases[]

Customer case studies. **Empty is correct when the source is silent
— see `extraction-discipline.md` §4 for the hard prohibition on
inventing customers.**

```jsonc
{
  "cases": [
    {
      "customer_name": "string",               // exact as published
      "use_case": "string | null",
      "result": "string | null",               // verbatim metric / outcome
      "testimonial": "string | null",          // verbatim pull-quote
      "published": "boolean"                   // public on the creator's site?
    }
  ]
}
```

`published: false` is reserved for cases the creator has shared with
the Builder via `document_set` but hasn't put on their public site
yet. Default to `true` only when the case is already public.

## growth_context

Marketing / growth knobs that downstream growth skills consume.

```jsonc
{
  "growth_context": {
    "icp_persona": "string | null",            // one-sentence ideal customer profile
    "primary_channels": ["string"],            // "Reddit", "ProductHunt", "SEO", …
    "seo_focus_keywords": ["string"],
    "brand_assets": {                          // free-form — logo urls, color hex, ogimage, …
      "key": "value"
    }
  }
}
```

`icp_persona` is fine to INFER at first build (set
`_confidence.growth_context = "medium"`). It improves over time as
the creator's analytics flow in — that refinement loop is Phase II,
not this skill's job.

`brand_assets` is intentionally a free-form `object`. Common keys:
`"logo_url"`, `"color_primary"`, `"color_accent"`, `"og_image"`,
`"favicon"`. Don't make up keys the schema doesn't strictly require
— but anything you find verbatim in source is fair game.

## legal_compliance

Regulatory + brand-safety constraints that downstream skills consult
before drafting.

```jsonc
{
  "legal_compliance": {
    "region": "string | null",                 // "US", "EU", "TW", … or comma-separated (e.g. "TW, EEA, UK")
    "forbidden_claims": ["string"],            // verbatim phrases — see extraction-discipline.md §5
    "gdpr_required": "boolean",
    "can_spam_required": "boolean"
  }
}
```

Region examples — what to write when the source mentions multiple
jurisdictions explicitly:

- Single market: `"TW"`, `"US"`, `"JP"`.
- Multiple jurisdictions named in one privacy policy: `"TW, EEA, UK"`
  (Taiwan HQ + named EEA-resident and UK-resident rights). Use the
  short forms used in the policy itself — don't expand `EEA` to
  `European Economic Area` if the source says `EEA`.
- When the policy is regulation-flavoured rather than territory-named
  (`"GDPR-aligned"`, `"CCPA-compliant"`): still record the territory
  the regulation implies, not the regulation's acronym
  (GDPR → `"EU"` / `"EEA"`; CCPA → `"US-CA"`).

`forbidden_claims` is the field downstream prose-generating skills
hard-reject against. Lift each phrase verbatim from compliance memos
/ legal review notes / footer disclaimers. Common entries:

- `"guaranteed returns"` (financial)
- `"clinically proven"` (medical / FTC)
- `"no risk"` (FTC)
- `"FDA-approved"` (medical, when not literally approved)

`gdpr_required: true` if the creator targets EU users (deducible from
`region: "EU"`, a privacy-policy mentioning Article 6, or a cookie
banner in the codebase). `can_spam_required: true` for US email
campaigns — most US-based creators ship `true` here.

## missing_fields[]

A flat array of dotted paths the Builder couldn't extract.

```json
[
  "company.brand_voice.tone",
  "company.brand_voice.examples",
  "growth_context.icp_persona",
  "pricing.tiers"
]
```

Rules:
- Path syntax mirrors JSON dot-notation. Arrays use the section root
  (`"pricing.tiers"`, not `"pricing.tiers[0]"`).
- **`[*]` wildcard for "every entry has the same gap".** When every
  item in an array carries a null leaf — e.g. eighteen testimonials
  where none of them quote an outcome metric — use a single
  `"cases[*].result"` entry rather than indexing per row. This stays
  cheap to read for downstream skills and keeps the list short.
  Per-index entries (`"cases[3].result"`) are reserved for the rare
  case where one specific row needs follow-up but its siblings are
  complete.
- Include every field the Builder considered and left empty. The
  point of this list is to tell downstream skills "ask the creator
  before drafting against this".
- Don't list fields that are legitimately optional and absent
  (e.g. `"free_trial"` if the product genuinely has no trial — that's
  semantically different from "we don't know if there's a trial").

## change_log[] (refresh mode only)

```jsonc
{
  "change_log": [
    {
      "path": "string",                        // dotted path of the changed field
      "before": "any",                         // previous value (null if newly added)
      "after": "any"                           // new value (null if removed)
    }
  ]
}
```

Build mode writes `change_log: null` or omits the field entirely.
Refresh mode populates it — see `mode-refresh.md` for diff
construction.
