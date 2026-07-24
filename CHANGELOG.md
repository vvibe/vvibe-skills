# Changelog

Skills in this repo version independently via the `version:` field in each
skill's `SKILL.md` frontmatter. This file is the single changelog for the
whole catalog, newest first, grouped by date.

## Maintenance rules

- Any behavior change to a skill (its `SKILL.md`, `references/`, or `scripts/`)
  bumps that skill's `version:` **and** adds an entry here, in the same PR.
  New capability → minor bump; fix / correction → patch bump.
- Typo-level edits and repo-level docs (README, ONBOARDING, AGENTS.md) need no
  version bump; add an entry only if the guidance itself changed.
- Entry format: `- **skill x.y.z** — what changed (#PR)`. One commit touching
  several skills gets one line per bumped skill.

## 2026-07-24

- **vvibe-changelog 0.1.0** — new skill: log user-visible product changes
  (`vibe_log_product_change`) after they ship so VVibe can detect a stale
  Product Knowledge Base, then act on that signal — nudge a KB sync before
  drafting prose (`references/kb-sync-flow.md`) and suggest announcing
  shipped major features via email or blog
  (`references/announce-flow.md`), marking entries announced afterward
  (`vibe_mark_change_announced`) (VV-81) (#PR)

## 2026-07-18

- **vvibe-product-brain 0.4.0** — capture missed fields in the build
  conversation instead of one-way-dumping them into `missing_fields[]`:
  - **VV-73** build-mode closing interview + expectation management: after
    extraction, before the write, ask up to 5 questions about the
    high/medium-impact fields the creator can only answer from memory
    (persona, pain points, brand voice, channels, keywords, pricing, one FAQ),
    with an explicit skip; answers fold into the KB, skips stay in
    `missing_fields[]`; the closing summary reports blocks-filled +
    captured-vs-skipped (`mode-build.md` §5, §7; `SKILL.md` §7).
  - **VV-74** starter-template fake-data guard + capability-gate-first: detect
    uncustomised demo / seed / placeholder source and ask before treating it as
    product fact (`extraction-discipline.md` §2.5); make the write-path
    capability check build's first step so a full extraction never strands at
    the write (`mode-build.md` §1).
  - **VV-75** image-scan consent: list candidate images and ask before reading
    any — token cost named, partial approval allowed, refusals recorded via
    `missing_fields[]` / `change_log` without schema changes
    (`extraction-discipline.md` §8; `sources/document-set.md` screenshots defer
    to it). (#PR)

## 2026-07-15

- **vvibe-analytics 0.4.1** — add vvibe_subscription_past_due to the event contract (#PR)

## 2026-07-14

- **vvibe-analytics 0.4.0** — provider-neutral rewrite: canonical event contract
  (platform lifecycle events, GA4/PostHog/Mixpanel mapping, identity & dedup
  rules), PostHog + Mixpanel setup guides, GA4 MP server-side reference; plus
  VV-66 dogfood fixes to the GA4 guide (Next 15/16 `instrumentation-client.ts`
  route-change variant + `useSearchParams` Suspense note, vanilla DOM-inject
  gtag loader, client/server `value` ownership + `purchase` dedup cross-link) (#PR)

## 2026-07-10

- **vvibe-email 0.5.1** — require resolving the live CTA landing URL before
  every send (landed 2026-07-07 without a bump; version backfilled).

## 2026-07-08

- **vvibe-blog-writer 0.9.0** — document the `vibe_list_blog_posts` lightweight
  projection (no body) + `vibe_get_blog_post` for one post's full content (#30)
- **vvibe-blog-writer 0.8.0** / **vvibe-blog-render 0.3.0** — mandatory
  existing-blog detection + honest publish handoff (VV-45) (#29)

## 2026-07-04

- docs: onboarding gains a "set your product basics" step after connecting (#28)

## 2026-07-02

- docs: onboarding now leads with one-command MCP + OAuth connect (#27)

## 2026-06-23

- docs: correct the signup flow across skills — signed-out visitors land on the
  login page and use the "Sign up" toggle (#25)

## 2026-06-22

- **vvibe-analytics 0.3.0** / **vvibe-blog-writer 0.7.0** /
  **vvibe-email 0.5.0** / **vvibe-member 0.5.0** /
  **vvibe-product-brain 0.3.0** / **vvibe-sentry 0.4.0** — every gated skill
  now guides brand-new users to register before applying for an API key;
  `ONBOARDING.md` becomes the single authoritative walkthrough (#24)

## 2026-06-08

- **vvibe-sentry 0.3.1** — align the response contract + MCP payload example
  with reality (#22)
- **vvibe-blog-writer 0.6.0** — AI cover generation, WordPress categories/tags,
  reference source (#21)

## 2026-06-05

- **vvibe-blog-writer 0.5.1** / **vvibe-blog-render 0.2.0** — cover-image
  attribution (credit the photographer) (#20)
- **vvibe-blog-writer 0.5.0** — cover-image step: search the stock library, set
  the cover (#19)
- **vvibe-blog-writer 0.4.0** — publish to the creator's configured
  destination, not per post (#18)
- **vvibe-blog-writer 0.3.1** — point the capability check at self-activation,
  not "connect VVibe" (#17)
- **vvibe-blog-writer 0.3.0** — the MCP tools are real; correct the auth
  story (#16)
- **vvibe-email 0.4.0** — read the Product Brain when drafting campaigns (#15)

## 2026-06-04

- **vvibe-blog-render 0.1.0** — new skill: the "head" for the headless VVibe
  blog, renders the public content API in the creator's own app (#14)
- **vvibe-blog-writer 0.2.0** — native VVibe-blog publish path (#13)

## 2026-06-03

- **vvibe-product-brain 0.2.0** — refresh mode honours `meta._human_edits[]`;
  never overwrites human-touched fields (#12)
- rename: `vvibe-kb-builder` → `vvibe-product-brain` (#10)

## 2026-06-02

- **vvibe-blog-writer 0.1.0** — new skill: SEO blog drafting from the Product
  Brain (Slice 3) (#9)
- docs(product-brain): KB v2 extraction guidance for 5 new fields (#8)

## 2026-05-29

- **vvibe-product-brain 0.1.0** — new skill (as `vvibe-kb-builder`): Product
  Knowledge Base extraction (VV-18) (#6)
- docs(product-brain): close 4 doc gaps surfaced by the Portaly dogfood (#7)

## 2026-05-28

- **vvibe-member 0.4.0** — split the monolithic SKILL.md into routing + mode
  references; inbound-webhook handler template flips that mode to available
- **vvibe-email 0.3.0** — split the monolithic SKILL.md into routing + mode
  references
- **vvibe-sentry 0.3.0** — split the monolithic SKILL.md into routing + mode
  references

## 2026-05-27

- **vvibe-member 0.3.0** / **vvibe-email 0.2.0** / **vvibe-sentry 0.2.0** —
  align API paths with the vvibe path refactor
- **vvibe-member 0.2.0** / **vvibe-analytics 0.2.0** — document first-touch
  attribution

## 2026-05-21

- **vvibe-analytics 0.1.0** / **vvibe-email 0.1.0** / **vvibe-member 0.1.0** /
  **vvibe-sentry 0.1.0** — initial release of the catalog
- **vvibe-sentry** — tier model, zero-install fallbacks, GitHub augmentation,
  coverage gate
