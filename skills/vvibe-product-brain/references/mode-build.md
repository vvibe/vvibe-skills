# Mode: build

First-time extraction. There's no existing Product Brain — `vibe_get_product_kb`
returned `data: null`, or the creator explicitly said "start from
scratch". The Builder reads the available sources, fills every
section it can confidently extract, leaves the rest in
`missing_fields[]`, and calls `vibe_set_product_kb` once.

Read this in addition to `extraction-discipline.md` and `kb-schema.md`.

## Workflow

### 1. Confirm you can write before you extract (capability gate)

**This is the first thing build mode does — before announcing a plan,
before reading a single source file.** Run the SKILL.md §2 capability
checklist and treat it as a hard gate:

- If `vibe_mcp_connected` is true, OR `has_api_key_local` is true →
  the write path exists. Continue to step 2.
- If BOTH are false → **stop here.** Do not read sources, do not
  extract. A full extraction that can't be written wastes the token
  budget and strands the creator with nothing to show. Follow
  SKILL.md §2's guidance to get connected first — for a brand-new user
  that's a single `npx @vvibe/cli connect --server=https://mcp.vvibe.ai`
  (the first call opens a browser login, and sign-up is on that same
  page). Only once the connection — or a `VVIBE_API_KEY` — is in place
  do you return to step 2.

Detecting the write path up front is cheaper than discovering at the
write step that there's nowhere to write. See also
`extraction-discipline.md` §7 (when to fail loudly).

### 2. Announce the plan (don't ask permission)

Tell the human briefly:

- which sources you detected (one or more of: github_repo, website_url, document_set);
- which sections you expect to be high-confidence and which will likely land in `missing_fields[]`;
- the rough order of operations (read sources → assemble → validate → write).

Example:

> I see this is a Next.js repo with a README, a `pricing.mdx` page, and a deployed site at `https://acme.app`. I'll pull both. I expect `company`, `product`, and `pricing` to come back high-confidence. `cases[]` will probably be empty unless your `/customers` page has named case studies — I won't invent any. Brand voice and growth context will likely need a follow-up pass once you can paste your style guide or some sent emails.

### 3. Read sources

**Before you trust anything you read as product fact**, apply two
gates from `extraction-discipline.md`:

- **Starter-template guard (§2.5)** — if the source still looks like
  unmodified template / demo / seed / placeholder content, stop and
  ask the creator before building the KB from it. Don't write demo
  values into `pricing` / `company` / `growth_context.icp_persona`.
- **Image consent (§8)** — if the source set includes images that may
  carry product info, list them and ask before scanning; never read an
  image unprompted, and name the extra token cost.

Load only the source-reference files you'll actually use:

- `sources/github-repo.md` — when extracting from a repo
- `sources/website.md` — when crawling a URL
- `sources/document-set.md` — when the user pasted / uploaded files

For each source, walk it in the order that reference recommends.
Don't try to read everything — most projects have 80% of the Product Brain
signal in 5–10 files / pages.

### 4. Fill the sections

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

### 5. Closing interview — fill the high-value gaps the creator can answer

Extraction is done; you now have a candidate `kb_data` and a running
`missing_fields[]`. Some of those gaps aren't in any source **because
they only live in the creator's head** — who they serve, what hurts
before adoption, how they sound, where they market. This is the
cheapest moment to capture them: the creator is already in the
conversation. Do NOT skip straight to the write and dump everything
into `missing_fields[]` — that strands the creator with a dashboard
full of blanks and no prompt to fill them.

**When to run.** Always, on build, whenever at least one
interview-eligible field (below) is currently in `missing_fields[]`.
If none are, skip the interview and go to step 6.

**What to ask about — eligible fields, in ask-priority order.** Pull
only the paths that are actually in `missing_fields[]`, highest impact
first (tiers mirror the host's `productBrain/fieldImpact.ts`):

_High impact — ask these first:_
1. `growth_context.icp_persona` — who is this for? (one-sentence
   customer profile)
2. `growth_context.reader_pain_points` — what frustrates that person
   before they find you?
3. `company.brand_voice.tone` — how should the brand sound? (2–4 word
   descriptor; if they engage, also capture `company.brand_voice.avoid`)

_Medium impact — ask only if you still have question budget:_
4. `growth_context.primary_channels` — where do you reach customers?
5. `growth_context.seo_focus_keywords` — what terms should you rank
   for?
6. `pricing` — how is it priced? (only when the whole `pricing`
   section landed in `missing_fields[]` — no pricing page anywhere)
7. `growth_context.faq_bank` — the top question customers ask + your
   answer (verbatim Q&A only; one pair is fine)

**Hard cap: 5 questions.** If more than five eligible fields are
missing, ask the top five by the order above (every High before any
Medium). Never exceed five — this is a quick top-up, not an intake
form.

**Ask them as one batched, numbered message** so the creator can
answer any subset in a single reply. Make skipping a first-class
option, explicitly:

> A few things I couldn't pull from your repo/site — answer whatever's
> quick, and just say "skip" for the rest (you can always add these
> later from the dashboard):
>
> 1. **Who's this for?** One line on your ideal customer.
> 2. **What's their pain** before they find you?
> 3. **How should the brand sound?** A few words (e.g. "warm, plain,
>    direct").
> 4. **Where do you reach people?** (channels — Reddit, SEO, newsletter…)
> 5. **Any keywords** you want to rank for?

**Recording answers.** A creator's own answer is first-party source
signal — the highest-authority source for these descriptor fields.
Treat it as EXTRACT: lift their wording, fill the field, and set
`meta._confidence.<section>` to `"high"` when the answer is concrete
(`"medium"` when it's vague and you had to tighten it). For a
`brand_voice` answer, add the snippet to `brand_voice.examples[]` with
`source: "creator-approved"` and `captured_at` = this run's timestamp.
Remove every field the creator answered from `missing_fields[]`.

**Skipped and off-limits fields stay missing.** Any field the creator
skips stays in `missing_fields[]` — a valid outcome, not a failure.
**Do not** interview for `cases[]` or
`legal_compliance.forbidden_claims`: those require a verbatim, named,
checkable source (a real customer quote, a real disclaimer), and
soliciting them from memory invites exactly the fabrication
`extraction-discipline.md` §4 prohibits. Leave them in
`missing_fields[]` and let the source — not recall — fill them.

### 6. Validate the assembled payload locally

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

### 7. Show a one-paragraph summary to the human

Before writing, summarise what's about to land — and manage
expectations explicitly. Report, in plain language:

- how many of the **8 blocks** (the 7 sections + `meta`) came back
  filled;
- which fields **weren't in your sources** and, of those, which you
  **filled via the closing interview** (step 5) vs. which the creator
  **skipped** — and that skipped ones can be topped up later from the
  dashboard.

> Ready to write. 6 of the 8 blocks are filled: `company`, `product`,
> `pricing`, and `features[]` (6 items) came high-confidence from your
> repo and site; `cases[]` is empty (no named case studies — I won't
> invent any). Four fields weren't anywhere in your sources, so I asked
> you just now: you gave me `icp_persona`, `reader_pain_points`, and
> `brand_voice.tone` (folded in), and skipped `seo_focus_keywords` —
> that one stays in `missing_fields[]` for you to add from
> `/dashboard/product-brain` whenever. Want me to write?

If the human says yes, go. If they ask to adjust, adjust.

### 8. Call `vibe_set_product_kb`

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

### 9. Don't loop

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
Always run the cross-check in step 6 — downstream skills depend on
`missing_fields[]` to know what to ask the creator before drafting.
A missing entry there means the next email draft might confidently
make something up.

**Turning the closing interview into an intake form.** Step 5 is
capped at five questions and only covers fields the creator can answer
from their head (persona, pain, voice, channels, keywords, pricing,
one FAQ). Don't use it to fish for testimonials or compliance
language — those stay source-driven, or they don't go in the KB.
