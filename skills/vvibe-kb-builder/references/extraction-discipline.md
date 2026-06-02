# Extraction discipline

Behavioural contract for the Builder. **Read this before extracting
anything.** Every section of the KB has to obey these rules — they're
what stops the Builder from producing a confident-looking document
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
  drafts the Builder can lift from
- `legal_compliance.region` if no jurisdiction is mentioned

Setting `_confidence.<section> = "low"` is allowed when the Builder
managed to fill **some** fields by INFER but most went to
`missing_fields[]` — useful for downstream skills to know they should
ask the creator before drafting against this section.

## 2. The Builder's mantra

> **No source signal → null + `missing_fields[]`. Never invent.**

If you find yourself writing a sentence and you can't quote the
source that backs it, stop. That sentence is fabrication. Set the
field to `null`, log the path, move on.

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
(common — most early-stage marketing has at least one), the Builder
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
