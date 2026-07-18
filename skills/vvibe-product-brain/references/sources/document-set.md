# Source: document_set

The creator hands the agent files directly — pasted markdown,
uploaded PDFs, screenshots, exported PDFs of slide decks, Notion
exports, the Word doc of a brand-voice style guide. Use this when:

- The repo and the website don't contain the material this skill
  needs (most early-stage projects have great product copy but no
  brand-voice doc; a creator with a years-old company often has the
  brand-voice doc in Notion or Drive, not the repo).
- The creator has explicit "this is how we talk" material they want
  this skill to honour over what it would infer from sent emails.
- Legal / compliance is governed by a private document set
  (NDA-bound disclaimers, internal review notes) that doesn't ship
  on the public site.

This file tells you HOW to read each document type and WHAT each
typically contributes. Field-level extraction discipline is in
`extraction-discipline.md`; schema in `kb-schema.md`.

## Document types and their typical yield

### Brand-voice style guide (highest value)

Usually a markdown / PDF / Notion export titled "Voice & Tone",
"Brand Guidelines", "How We Write", or similar.

Maps directly to `company.brand_voice`:

- "Our tone is …" / "We sound …" → `tone` (verbatim 2–4 word
  descriptor; if the doc says it as a sentence, summarise to the
  descriptor and note the source line).
- "Examples of our voice:" / "How we write:" → `examples[]`. Each
  snippet keeps `source: "creator-approved"` since the creator
  authored the style guide.
- "Avoid:" / "Don't say:" / "Never use:" → `avoid[]`.
- "Our customers are …" → `growth_context.icp_persona` (only if
  phrased as a customer profile, not a feature list).

When a style guide is present, set
`_confidence.company = "high"` even if other company fields are
INFER — the brand-voice signal is what matters most for downstream
prose-generating skills.

### Pitch deck / investor deck (PDF)

The "company story" slides usually contain the cleanest verbatim
`company.one_liner` and `product.core_value_prop` — investor decks
get edited to death, so the wording is usually load-bearing.

- Title slide → `company.name`, often `company.one_liner` as the
  sub-tagline.
- "Problem" / "Why now" slide → fodder for
  `product.target_audience` (who has the problem) and
  `growth_context.icp_persona`.
- "Solution" / "Product" slide → `product.core_value_prop` (lift
  verbatim).
- "Why us" / "Moat" slide → `product.differentiators` (each bullet
  becomes one entry, verbatim).
- "Traction" / "Customers" slide → ONLY usable for `cases[]` if
  the slide lists named customers with attributable quotes;
  numeric metrics on a slide without a quote are NOT case-study
  material (see `extraction-discipline.md` §4).
- Pricing slide → `pricing.tiers[]` if the deck shows tiers.

Skip team / financial / "roadmap" slides — they're not KB material.

### Compliance / legal docs

Memos, attorney-reviewed marketing notes, internal "approved claims"
lists.

- "DO NOT SAY" / "Avoid these phrases:" → `legal_compliance.forbidden_claims`
  (verbatim).
- "We are not regulated by X" / "Not a financial product" →
  signals what category the creator self-identifies as (useful for
  the forbidden-claims detection in
  `extraction-discipline.md` §5).
- Jurisdiction stamps ("US-based", "EU operations", "Canadian
  privacy law applies") → `legal_compliance.region`.
- Cookie policy excerpts mentioning Article 6 / "lawful basis" →
  `gdpr_required: true`.
- Email policy mentioning CAN-SPAM unsubscribe / sender-ID → 
  `can_spam_required: true`.

### Customer case studies (the docs version)

PDFs or markdown exports of case studies the creator authored but
hasn't published yet.

- Extract the same fields as the website-page version (`customer_name`,
  `use_case`, `result`, `testimonial`).
- Set `published: false` — these are private until the creator
  ships them publicly.
- Don't merge with website-extracted cases by `customer_name`
  silently — log both with their `published` flags.

### Screenshots

Useful when the creator can't easily paste the source as text
(e.g. a screenshot of their landing page hero, a Twitter screenshot
of a customer testimonial).

**Consent first.** Screenshots are images — never read one without the
consent gate in `extraction-discipline.md` §8 (list the images, name
the extra token cost, ask, and scan only what the creator approves).
The steps below apply once a given screenshot has been approved.

For each approved screenshot:

- OCR / read the text content via the agent's vision tool.
- Treat the extracted text as if it were a single-page document —
  apply the rules for whatever type of content it shows.
- Mention in your one-paragraph summary that a screenshot was the
  source, so the creator can spot OCR transcription errors.

### Notion / Coda / Drive exports

The creator exports their workspace as markdown / PDF. Treat each
exported file as one document of the appropriate type above.

- Notion's `Untitled.md` files with no clear heading → skip; OCR
  noise.
- Notion database exports (one folder per row) → read the
  highest-signal columns (Title, Description, Tags) and ignore
  metadata columns (Created date, Owner, Last edited).

## What the document set is BAD for

- **Real-time pricing** — pricing decks rot fast. If the website
  shows a different price than the pitch deck, the website wins
  (source-precedence in `extraction-discipline.md` §3).
- **Current customer count** — never fabricated, but also rarely
  worth lifting. The KB doesn't have a "customer count" field for
  good reason — it's a fast-decaying metric that downstream prose
  shouldn't anchor to.
- **Feature lists from outdated PRDs** — if a feature is listed
  in a 2024 PRD but isn't on the website or in the codebase, it's
  not shipped. Skip it.

## Source-precedence within document_set

When the creator hands over multiple documents and they disagree:

1. **Brand-voice style guide wins** over inferred voice from any
   other source.
2. **Recent compliance memos win** over older ones — look for
   "Reviewed: <date>" or "Approved: <date>" headers.
3. **Pitch decks** are mid-quality marketing copy — fine for
   `core_value_prop` and `differentiators`, weaker than website
   for product-detail fields like `features[].description`.
4. **PDFs of slide decks vs. the original deck files**: prefer the
   original; PDFs sometimes lose layout context that matters
   (e.g. footnotes pinned to specific bullets).

## Worked example

The creator pastes three documents:

1. `brand-voice.md` (their internal style guide)
2. `acme-pitch-v9.pdf` (investor deck)
3. `compliance-approved-claims.md` (their attorney's review notes)

Extraction order:

1. **brand-voice.md** — `company.brand_voice.tone`,
   `examples[]` (mark `creator-approved`), `avoid[]`. Bump
   `_confidence.company` to `"high"` even if other company fields
   are still INFER.
2. **acme-pitch-v9.pdf** — `company.one_liner` (verbatim from
   title slide), `product.core_value_prop` (verbatim from
   solution slide), `product.differentiators[]` (each Moat bullet).
3. **compliance-approved-claims.md** —
   `legal_compliance.forbidden_claims[]` (verbatim "DO NOT SAY"
   list), `legal_compliance.region: "US"` (from the header).

Result: high-confidence `company`, `product`, `legal_compliance`;
zero risk of fabrication because every claim points to a quoted
source line.
