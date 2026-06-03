# Mode: build

First-time extraction. There's no existing Product Brain — `vibe_get_product_kb`
returned `data: null`, or the creator explicitly said "start from
scratch". The Builder reads the available sources, fills every
section it can confidently extract, leaves the rest in
`missing_fields[]`, and calls `vibe_set_product_kb` once.

Read this in addition to `extraction-discipline.md` and `kb-schema.md`.

## Workflow

### 1. Announce the plan (don't ask permission)

Tell the human briefly:

- which sources you detected (one or more of: github_repo, website_url, document_set);
- which sections you expect to be high-confidence and which will likely land in `missing_fields[]`;
- the rough order of operations (read sources → assemble → validate → write).

Example:

> I see this is a Next.js repo with a README, a `pricing.mdx` page, and a deployed site at `https://acme.app`. I'll pull both. I expect `company`, `product`, and `pricing` to come back high-confidence. `cases[]` will probably be empty unless your `/customers` page has named case studies — I won't invent any. Brand voice and growth context will likely need a follow-up pass once you can paste your style guide or some sent emails.

### 2. Read sources

Load only the source-reference files you'll actually use:

- `sources/github-repo.md` — when extracting from a repo
- `sources/website.md` — when crawling a URL
- `sources/document-set.md` — when the user pasted / uploaded files

For each source, walk it in the order that reference recommends.
Don't try to read everything — most projects have 80% of the Product Brain
signal in 5–10 files / pages.

### 3. Fill the sections

Build the `kb_data` object section-by-section, following
`kb-schema.md`. For each section:

1. Pick the highest-priority source per `extraction-discipline.md` §3.
2. Apply EXTRACT → INFER → NO FABRICATION in order.
3. Set `meta._confidence.<section>` based on the mix.
4. Add unfilled fields to a running `missing_fields[]` list.

Sections to fill in this order (each depends only on what came before):

1. `company` — who the creator is. Easy from website meta tags + README.
2. `product` — what they sell. `core_value_prop` is the most important field in the document; spend extra time getting it verbatim.
3. `pricing` — how it's sold. Often a single page; extract every tier.
4. `features[]` — what the product does. Stable `id` slugs (see schema).
5. `cases[]` — empty by default. Only fill from explicit case-study pages.
6. `growth_context` — `icp_persona` and `reader_pain_points` are the two fields worth INFER-ing on build (both are one-sentence descriptors of who the brand serves and what hurts before adoption). `preferred_terms` is EXTRACT-only (lift from style-guide / repeated terminology). `faq_bank` is EXTRACT-only from real FAQ surfaces. `trusted_facts` is EXTRACT-only from trust / promise / compliance pages. Everything not extractable lands in `missing_fields[]`.
7. `legal_compliance` — `forbidden_claims` from any compliance memo or marketing-disclaimer block; `region` from privacy policy if present.

### 4. Validate the assembled payload locally

Before calling the MCP tool, walk the constructed `kb_data` one more
time and check:

- Every top-level key is one of: `meta`, `company`, `product`,
  `pricing`, `features`, `cases`, `growth_context`,
  `legal_compliance`. No extras — schema validation will reject.
- `meta._confidence` has exactly the seven section keys. Don't ship
  partial confidence maps.
- `features[].id` values are unique across the array.
- `cases[]` is empty OR every entry has a real `customer_name` you
  can quote from source. See `extraction-discipline.md` §4.
- `missing_fields[]` has no dotted paths that you actually filled.
  Cross-check the field at each path is genuinely `null` / `[]` /
  unset.
- No forbidden-claims phrasing slipped into prose fields (the
  `company.long_description` is a common offender). Forbidden-claims
  belongs ONLY in `legal_compliance.forbidden_claims`, where it's
  recorded as something to AVOID downstream.

### 5. Show a one-paragraph summary to the human

Before writing, summarise what's about to land:

> Ready to write. The KB has `company` + `product` + `pricing` filled high-confidence, `features[]` with 6 items, and `cases[]` empty (your /customers page has no named cases). 11 fields stayed in `missing_fields[]` — mostly brand voice and growth context, which you can fill in by pasting your style guide and recent email drafts in a follow-up. Want me to proceed?

If the human says yes, go. If they ask to adjust, adjust.

### 6. Call `vibe_set_product_kb`

```jsonc
// MCP tool input
{
  "kb_data": { /* the full document */ },
  "missing_fields": [ /* dotted paths */ ]
  // change_log is omitted on build
}
```

The tool returns the persisted row including the new `version`
(should be `1`). Echo that back in chat:

> Done. The Product Brain is now at version 1. Every other prose-generating skill (email, SEO, conversion) will read it before drafting. You can review the full document at `/dashboard/product-brain`.

If the MCP tool isn't available, fall back to REST:

```bash
curl -sS -X PUT "${VVIBE_API_HOST:-https://vvibe.ai}/api/product-brain/kb" \
  -H "Authorization: Bearer ${VVIBE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"kb_data": …, "missing_fields": [...]}'
```

### 7. Don't loop

The Builder runs **once per build invocation**. If the human asks for
more sources after the write lands, that's a `refresh` run, not a
second `build`. See `mode-refresh.md`.

## Common pitfalls

**Filling `cases[]` from marketing copy.** "Our customers report …",
"Many founders use Acme to …" — these are marketing claims, not
named cases. `cases[]` stays empty until a real customer is named
with a verbatim quote.

**Writing `growth_context.icp_persona` as a feature list.** ICP
persona is a customer profile ("solo founders building B2B SaaS,
typically pre-seed, juggling sales themselves"), not a list of
features the creator wants to ship.

**Filling `legal_compliance.region` by guessing the creator's
country.** If the privacy policy doesn't state a jurisdiction, the
field is `null` and `"legal_compliance.region"` goes in
`missing_fields[]`. The creator's IP or timezone doesn't count as
source signal.

**Filling `_confidence` based on completeness rather than source
quality.** A section can be `"high"` confidence with most fields
populated, OR `"low"` confidence with most fields populated if you
INFER-ed most of them. Confidence reflects extraction quality, not
fill ratio.

**Skipping `missing_fields[]` because the section "feels complete".**
Always run the cross-check in step 4 — downstream skills depend on
`missing_fields[]` to know what to ask the creator before drafting.
A missing entry there means the next email draft might confidently
make something up.
