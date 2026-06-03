---
name: vvibe-product-brain
version: 0.1.0
manifest_version: 1
description: Build or refresh a creator's Product Brain on VVibe — extract structured product facts from a github repo, public website, or document set, then write the result via the `vibe_set_product_kb` MCP tool. The Product Brain is read by every prose-generating skill (email, SEO, conversion) before drafting, so this skill is the upstream feeder for everything else. Trigger when the user mentions building / refreshing the product brain, knowledge base, "teach VVibe about my product", or asks the agent to set up the brain so other skills have context.
---

# VVibe Product Brain Skill — Routing

This file is a router. It decides **which** workflow the human user
needs, then directs you to a single deep-dive in `references/`. Do not put
extraction detail here — keep it in the referenced files.

When you load this skill: read this whole file, run the capability checks in
§2, pick a mode using §3 and a source using §4, then **Read the matching
references/*.md files**. Do not read every reference file upfront.

## 1. What this skill does

Populate the creator's Product Brain on VVibe — a structured,
agent-owned document covering eight sections: `company`, `product`,
`pricing`, `features`, `cases`, `growth_context`, `legal_compliance`,
plus a `meta` envelope with per-section confidence. Every other
prose-generating skill (email, SEO, conversion, future social) reads the
Product Brain at task start so they don't re-derive the creator's product
on every action.

Two modes — pick exactly one:

- **build** — there's no Product Brain yet (first-time creators). Extract
  from scratch, fill what you can, leave the rest in `missing_fields[]`.
  No `change_log` on this path.
- **refresh** — Product Brain already exists. Fetch via
  `vibe_get_product_kb`, re-extract from current source, diff against
  the existing document, and produce a `change_log[]`. Only update
  fields where source signal has actually changed.

Three source types, orthogonal to mode — pick one (or more) of:

- **github_repo** — the creator's codebase (preferred when the agent
  is already operating inside a project).
- **website_url** — the creator's public marketing site
  (`sitemap.xml` → `robots.txt` → fallback crawl).
- **document_set** — files the creator pasted in or uploaded
  (PDFs, markdown, screenshots).

Out of scope:
- Rewriting prose **from** the Brain (that's the consumer skills' job).
- Editing the Brain section-by-section through chat — the dashboard
  view at `/dashboard/product-brain` is the audit + monitor surface;
  this skill is the primary write path. (Creators can inline-edit a
  small allowlist of prose-shaped fields from the dashboard; those
  paths are tracked in `meta._human_edits[]` so refresh mode skips
  overwriting them. See `references/mode-refresh.md`.)
- Inventing customer names, metrics, or testimonials — see §6
  Extraction discipline.

## 2. Capability checklist (run BEFORE asking the user anything)

Detect from the project. Don't ask the human what you can verify
yourself.

| Capability | How to detect | Used by |
|---|---|---|
| `vibe_mcp_connected` | `vibe_*` tools registered on this session — specifically `vibe_get_product_kb` and `vibe_set_product_kb`. | all modes |
| `has_api_key_local` | `VVIBE_API_KEY` present in `.env*` or framework env. | REST fallback when MCP is unavailable |
| `has_github_repo` | `.git/` exists at project root AND there's a tree of source files. | source = github_repo |
| `has_website_url` | The user pointed at a public URL, OR the project's `package.json` / docs / `next.config.*` reveals a deployed domain. | source = website_url |
| `has_document_set` | The user provided files (PDFs, markdown, screenshots) for extraction. | source = document_set |
| `kb_exists` | `vibe_get_product_kb` returns `{ data: <row> }` with `data !== null`. | distinguishes build vs refresh |

After detection, briefly tell the human what you found and what's
missing. If `vibe_mcp_connected` is false AND `has_api_key_local` is
also false, stop — the skill cannot write the result without one of
the two. Ask the user to either install the Vibe MCP server or paste
their `VVIBE_API_KEY`.

## 3. Modes

```yaml
modes:
  build:
    status: available
    when: >
      `kb_exists` is false — no Product Brain has been written yet.
      This is the default for first-time creators. The skill extracts
      everything it can from source, populates `missing_fields[]` for
      anything it can't confidently extract, and calls
      `vibe_set_product_kb` once.
    triggers:
      - "set up product brain"
      - "build product brain"
      - "build product KB"
      - "teach VVibe about my product"
      - "create the knowledge base"
      - "first-time KB setup"
    requires: [vibe_mcp_connected OR has_api_key_local, has_source]
    load: references/mode-build.md

  refresh:
    status: available
    when: >
      `kb_exists` is true. The skill fetches the existing Product
      Brain, re-extracts from current source, diffs at the field level,
      and writes the merged full `kb_data` plus a `change_log[]`
      listing only the changed fields. Triggered after meaningful
      product changes — new pricing, new feature, audience pivot,
      brand voice update.
    triggers:
      - "refresh product brain"
      - "update product brain"
      - "update product KB"
      - "re-run KB builder"
      - "re-run product brain"
      - "product changed, sync the KB"
      - "product changed, sync the brain"
    requires: [vibe_mcp_connected OR has_api_key_local, has_source, kb_exists]
    load: references/mode-refresh.md
```

`has_source` resolves to `has_github_repo OR has_website_url OR
has_document_set`. At least one must be true; the more the better
(see §4).

## 4. Sources

Pick one or more — sources are additive. This skill fans extraction
across them and merges per the section-precedence rules in
`references/extraction-discipline.md` §3.

```yaml
sources:
  github_repo:
    when: agent is already operating inside a repo, OR user explicitly points at one.
    strengths: features, integrations, brand voice (from existing emails / docs).
    load: references/sources/github-repo.md

  website_url:
    when: the creator has a public marketing site.
    strengths: company one-liner, value proposition, pricing tiers, customer cases.
    crawl_order: sitemap.xml → robots.txt → fallback (homepage + obvious nav links).
    load: references/sources/website.md

  document_set:
    when: the user pastes / uploads docs (PDFs, markdown, screenshots).
    strengths: legal_compliance (terms / privacy / disclaimers), brand_voice (style guide), forbidden_claims (compliance memos).
    load: references/sources/document-set.md
```

If multiple sources are available, read them all. Source-precedence
when sections conflict is in `references/extraction-discipline.md` §3.

## 5. Disambiguators

Use these only when the human's phrase genuinely maps to >1 mode AND
capability detection didn't narrow it down.

**Tiebreaker rule.** If `kb_exists` is false, route to `build` and
skip the disambiguator — `refresh` requires an existing Product Brain.

```yaml
disambiguators:
  - signal: ["update KB", "rebuild brain", "redo product brain"]
    ask: >
      Do you want to wipe the existing brain and start over (build), or
      keep what's there and only update what's changed (refresh)?
    map:
      "wipe|start over|from scratch|reset": build
      "update|incremental|what's changed|diff": refresh
```

## 6. Cross-cutting facts (apply to ALL modes — read before extracting)

**Extraction discipline.** This skill operates in three layers — in
strict priority order:

1. **EXTRACT** — lift wording verbatim from source whenever possible.
   `company.one_liner`, `product.core_value_prop`,
   `product.differentiators`, `legal_compliance.forbidden_claims`
   should almost always be verbatim quotes.
2. **INFER** — when source is fuzzy (e.g. tone from email drafts,
   target audience from blog topics), synthesise a best-guess and set
   `meta._confidence.<section> = "medium"`.
3. **NO FABRICATION** — when there's no source signal, set the field
   to `null` and add the dotted path to `missing_fields[]` (e.g.
   `"company.brand_voice.tone"`, `"pricing.tiers"`). Never invent.

Full rules + worked examples per section: `references/extraction-discipline.md`.

**Hard prohibitions** (these are not negotiable; the skill must fail
loudly rather than ship a document that violates them):

- **Never fabricate customers.** `cases[]` is empty until the source
  explicitly names a customer + result. No "imagined customers", no
  "examples", no "for illustration".
- **Never fabricate metrics.** No invented percentages, growth rates,
  customer counts, or ROI numbers — these go in `missing_fields[]`.
- **Detect forbidden claims** (CAN-SPAM / FTC / medical / financial)
  in any marketing copy you read, and lift them verbatim into
  `legal_compliance.forbidden_claims`. List in
  `references/extraction-discipline.md` §5.
- **Do not exceed the schema.** No extra top-level keys, no
  section-internal keys outside what the schema declares. The MCP
  tool will reject malformed payloads — that's intentional.
- **Output strict JSON.** The final write to `vibe_set_product_kb`
  must parse cleanly; no trailing commas, no comments, no inline
  computation.

**Token budget v1.** Plan extraction work within `80,000` input
tokens and `16,000` output tokens. When a source exceeds the input
budget, summarise sections you've already read into structured notes
before reading the next file rather than re-loading them.

**Confidence is per-section, not per-field.** The `_confidence` map
stamps a single high/medium/low against each section as a whole. Set
based on how much of the section came verbatim from source vs.
inferred.

**The MCP write is the contract.** Once extraction is done, the
ONLY write path is `vibe_set_product_kb` with the full document
shape from `references/kb-schema.md`. No partial writes from this
skill — section-level writes exist on the API
(`PATCH /api/product-brain/kb/sections/[section]`) but are reserved
for hand-edits the creator might run from the dashboard later, not
for this skill.

## 7. Output preferences

- Tell the human upfront how many sections you expect to fill vs.
  leave in `missing_fields[]`, based on what you've seen in source.
- When you write, **echo a one-paragraph summary** of what landed in
  the Product Brain and what stayed missing — the creator reads this
  in chat; the structured data lives in the dashboard.
- For `refresh` mode, **show the change_log** in chat before writing
  so the creator can spot anything that looks off.
- Sync calls are fire-and-forget for the MCP tool itself; the agent
  should still report write failures to the human in plain language.

## 8. Reference documents

| File | Contains | Load when |
|---|---|---|
| `references/extraction-discipline.md` | EXTRACT / INFER / no-FABRICATION rules with per-section examples; source-precedence rules; forbidden-claims taxonomy. | every run, before extracting anything |
| `references/kb-schema.md` | Authoritative shape of the eight Product Brain sections — field names, nullability, what good extraction looks like per field. | every run, as you fill each section |
| `references/mode-build.md` | First-time build workflow: walk sources, fill sections, finalise `missing_fields[]`, call `vibe_set_product_kb`. | mode = build |
| `references/mode-refresh.md` | Refresh workflow: fetch existing Product Brain, re-extract, field-level diff, construct `change_log[]`, then write the merged full `kb_data` while preserving unchanged fields. | mode = refresh |
| `references/sources/github-repo.md` | Where to look in a codebase — `README.md`, `package.json`, route handlers, env example, marketing copy in components, existing email drafts. | source = github_repo |
| `references/sources/website.md` | Crawl order (sitemap → robots → fallback), what each page type usually yields, parsing tips. | source = website_url |
| `references/sources/document-set.md` | Reading PDFs / markdown / screenshots — what each typical document type contributes to which Product Brain section. | source = document_set |
