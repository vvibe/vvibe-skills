# Mode: refresh

Incremental update. An existing KB is on file (`vibe_get_product_kb`
returned `data` with a non-null body). The creator's product has
changed — new pricing tier, a feature pivot, an audience shift, a
fresh round of compliance review — and they want the KB to catch up
without wiping what's already correct.

Read this in addition to `extraction-discipline.md` and `kb-schema.md`.

## Workflow

### 1. Fetch the existing KB

```jsonc
// MCP
const existing = await vibe_get_product_kb()
// existing.data → { merchantId, version, kbData, missingFields, changeLog, lastUpdatedAt, createdAt }
```

If `existing.data` is `null`, route to `build` instead. Refresh
requires a prior write.

REST fallback:

```bash
curl -sS "${VVIBE_API_HOST:-https://vvibe.ai}/api/product-brain/kb" \
  -H "Authorization: Bearer ${VVIBE_API_KEY}"
```

Hold on to `existing.data.kbData` (the previous document) and
`existing.data.missingFields` (what the last Builder run left
unfilled).

### 2. Announce the plan

Tell the human briefly:

- the current KB version + when it was last updated;
- which sources you'll re-read;
- which sections you'll **preserve as-is** because you have no fresh
  signal for them (refresh doesn't blindly overwrite — it diffs).

Example:

> Your Product Brain is at version 3, last updated 11 days ago. I'll re-read your repo and your live site. I expect `pricing` and `features[]` to have moved (you mentioned new tiers); I'll preserve `company` and `legal_compliance` unless I find genuinely changed signal. Brand voice examples I'll leave alone — those are creator-curated.

### 3. Re-extract from source

Run the same extraction passes `mode-build.md` describes — read the
sources, build a candidate `kbData` from scratch. Don't try to be
clever and "only re-read the changed parts" at this stage; that's
the diff step's job. Re-reading the full source set is the simplest
path to correctness.

For each section, follow the same EXTRACT → INFER → NO FABRICATION
discipline. Track `meta._confidence` for the new extraction as if
this were a fresh build.

### 4. Diff at the field level

Walk the existing document and the new candidate side by side. For
each leaf field, decide:

| Existing | New | Action |
|---|---|---|
| same value | same value | no-op — don't list in change_log |
| value | new value | `change_log` entry — `before: existing, after: new` |
| value | `null` / `[]` | **don't overwrite blindly.** See "Preserve over silence" below |
| `null` / `[]` | value | `change_log` entry — `before: existing, after: new` |
| `null` / `[]` | `null` / `[]` | no-op |

**Preserve over silence.** If a field WAS populated in the existing
KB and the new extraction comes back null (no source signal this
pass), keep the existing value. Source going silent doesn't mean the
fact is wrong — the source page might just have moved or been
restyled. The exception is `forbidden_claims` and `cases[]`: if a
re-read of the source no longer contains a previously-recorded item,
ask the human ("This case study about X is no longer on your
/customers page — should I drop it from the KB?") rather than
silently keeping or dropping.

**Array fields** (`differentiators`, `features[]`, `cases[]`,
`integrations`, etc.) diff by stable identity:

- `features[]` — match by `id`. Adds, removes, and per-field changes
  inside a matched feature become separate `change_log` entries
  with paths like `"features[id=auto-resume].description"`.
- `cases[]` — match by `customer_name`.
- Plain string arrays (`differentiators`, `integrations`,
  `primary_channels`, `seo_focus_keywords`) diff as sets — added /
  removed entries become `change_log` entries with paths like
  `"product.differentiators"` and the full before/after array.

### 5. Build the `change_log[]`

Each entry has the shape from `kb-schema.md` §change_log:

```json
{
  "path": "pricing.tiers[1].price",
  "before": 29,
  "after": 49
}
```

Keep the array tight — one entry per genuinely changed field. Don't
list noop bumps (e.g. trailing whitespace differences,
re-orderings of the same set).

### 6. Update `missing_fields[]`

Build a fresh `missing_fields[]` from the new candidate document:

- Drop paths that are now filled.
- Add paths that newly became `null`.
- Keep paths that are still `null`.

The output is the new `missing_fields[]` — replace the existing list
entirely, don't merge.

### 7. Show the diff to the human

**Always show the change_log in chat before writing.** This is the
creator's one chance to spot something off (a price typo, a
forbidden-claim that shouldn't have been removed, a feature
description regression). Format like:

> I'm about to push 6 changes:
>
> - `pricing.tiers[1].price`: 29 → 49 (Pro tier price bump from your /pricing page)
> - `pricing.tiers` (new): added "Team" tier at $99/user/mo, billed yearly
> - `features[]`: added "saml-sso", removed "ldap-sync" (no longer on the features page)
> - `growth_context.primary_channels`: added "Reddit r/SaaS"
> - `legal_compliance.forbidden_claims`: removed "guaranteed 10× ROI" (no longer in your marketing copy)
> - `company.brand_voice.tone`: was null, now "calm, direct, encouraging" (inferred from your last 4 sent emails)
>
> 2 fields newly missing: `growth_context.icp_persona` (your /for-developers page was deleted), `pricing.tiers[1].features_included` (the bullet list is gone from /pricing).
>
> Want me to write this?

If the creator says "skip the brand_voice change, I don't agree with
that tone", drop that entry from `change_log[]` and **also** revert
the corresponding field in `kb_data` to its previous value. The
written document and the change_log must stay in sync.

### 8. Call `vibe_set_product_kb`

```jsonc
{
  "kb_data": { /* the merged document — existing values preserved over silence + new values applied */ },
  "missing_fields": [ /* freshly computed */ ],
  "change_log": [ /* the diff */ ]
}
```

The tool returns the persisted row with the new `version` (will be
`existing.data.version + 1`). Echo to chat:

> Done. The Product Brain is now at version 4. The dashboard view at `/dashboard/product-brain` shows the new state; next time another skill drafts something it'll pick up the new pricing automatically.

## Common pitfalls

**Overwriting a field with `null` because the source got restyled.**
The "preserve over silence" rule (§4) catches this. A section is
silent because the source moved, not because the fact disappeared.
Treat null-from-extraction differently from null-from-source-said-no.

**Letting `cases[]` rot.** Cases that were on the public site at the
last refresh but aren't now need human review, not silent deletion.
The creator might have un-published a case temporarily; ask before
removing.

**Diffing whole sections instead of fields.** A change_log entry of
`{"path": "company", "before": {…whole section…}, "after": {…whole
section…}}` is worse than useless — the human can't see what
actually changed. Always diff to the leaf.

**Bumping `_confidence` without source justification.** If you
INFER-ed `growth_context.icp_persona` last time and the source still
hasn't surfaced a clearer signal, confidence stays the same. Only
bump up when a previously-INFER-ed field becomes EXTRACT-able from
new source.

**Re-writing the whole `kb_data` from the new extraction without
applying the preserve-over-silence merge.** This silently erases
fields the creator filled in by hand via the dashboard
PATCH-section route or by talking to a previous skill. Always merge,
never blanket-replace.
