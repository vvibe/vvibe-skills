English | [繁體中文](./ROADMAP.zh-TW.md)

# VVibe Skills — Roadmap

Candidate new skills, mapped from external skill catalogs against VVibe's
architecture. **Status: candidates pending team discussion — nothing here is
committed work yet.**

> Competitive rationale (who VVibe competes with and the niche these skills
> defend) lives in [POSITIONING.md](./POSITIONING.md).

Seed source: Snyk, *"Top 8 Claude skills for entrepreneurs, startup founders &
solopreneurs"*
(<https://snyk.io/articles/top-8-claude-skills-entrepreneurs-startup-founders-solopreneurs>),
reviewed 2026-06-08.

## What makes a good VVibe skill

A skill earns a place in this repo when it:

1. **Reads the Product Brain** — consumes the shared, agent-owned product
   context instead of re-deriving the creator's product on every action
   (see `vvibe-product-brain`).
2. **Writes results back to the dashboard / API** — via the `vibe_*` MCP
   tools or `VVIBE_API_KEY`, so the creator sees outcomes in their VVibe
   dashboard.
3. **Serves the creator / vibe-coder audience** — not enterprise IT, not
   investors.
4. **Complements the existing skills** rather than overlapping them.

## Existing skills (for context)

The shipped set — full descriptions in [README.md](./README.md):
`vvibe-analytics`, `vvibe-member`, `vvibe-sentry`, `vvibe-email`,
`vvibe-product-brain`, `vvibe-blog-writer`, `vvibe-blog-render`.

`vvibe-product-brain` is the upstream feeder; every prose-generating skill
reads it first. Its SKILL.md already names `conversion` as a planned consumer
skill — several candidates below are that seam being filled.

---

## Candidate skills (priority order)

### P1 — `vvibe-conversion` (Landing Page Mastery)

**Maps from:** Snyk #6, *Landing Page Mastery* (high-conversion landing pages +
100-point audit).

**Why it's the strongest fit:** closes a full loop VVibe is already most of the
way to. Reads the Product Brain (brand voice / audience / `forbidden_claims`
all already exist) → generates or audits a conversion page → ties conversion
events into `vvibe-analytics` → reports a conversion score back to the
dashboard. It's the natural extension of `vvibe-email`, which already builds
waitlist landing pages.

**Reads:** Product Brain (voice, audience, FAQ, `forbidden_claims`).
**Writes:** conversion score / audit report to dashboard; pairs with
`vvibe-analytics` events and `vvibe-blog-render` routes.

### P1 — VVibe marketing suite (Corey Haines pattern)

**Maps from:** Snyk #1, *Marketing Skills by Corey Haines* (25 interconnected
marketing skills over a shared "product marketing context" file).

**Why:** his "shared product marketing context file" is exactly the Product
Brain design. A small suite of Brain-reading marketing skills (conversion copy,
email sequences, pricing) is the seam `vvibe-product-brain` was built to feed.
Scope tightly — start with the 2–3 highest-value disciplines, not 25.

**Reads:** Product Brain.
**Writes:** drafts via existing skills (`vvibe-email`, `vvibe-blog-writer`) +
dashboard.

### P2 — `vvibe-financials` (SaaS Financial Projections)

**Maps from:** Snyk #4, *SaaS Financial Projections* (MRR / ARR / LTV / CAC,
valuation multiples).

**Why (and the moat):** generic financial skills run on user-typed assumptions.
VVibe already holds **real** data — `vvibe-member` subscription status +
`vvibe-analytics` traffic — so projections can be seeded from actual MRR/ARR
instead of guesses. That's the differentiator no one can clone without the
data.

**Open question for the team:** this requires exposing dashboard metrics
(member subscription state, analytics) to a skill. That's an architecture
decision — what gets read, through which contract.

### P3 — Positioning / messaging scorer (Wondelai frameworks)

**Maps from:** Snyk #2, *Wondelai Product & Strategy* (JTBD / StoryBrand / Hook
Model + scoring).

**Why:** rather than clone the framework set, use the scoring angle to **grade
and strengthen the Product Brain's positioning section** — effectively a
quality upgrader for `vvibe-product-brain` output.

### P3 — Customer-interview analysis (cherry-pick from nginity)

**Maps from:** Snyk #5, *nginity 48-skill library* (don't clone wholesale).

**Why:** the one piece worth lifting is customer-interview analysis — extract
pain points / feature requests / Jobs patterns and **feed them back into the
Product Brain's `growth_context`**. RICE prioritization is a secondary pick.

### P4 — Pitch-deck generator (niche)

**Maps from:** Snyk #3, *Anthropic PPTX*.

**Why low priority:** investor decks are off-core for the creator audience, and
a generic PPTX skill already exists. Only worth a VVibe version if it's grounded
in **live dashboard metrics + Product Brain** (a deck built from real numbers,
not invented ones).

### Ecosystem — VVibe skill scaffolder (Skill Creator)

**Maps from:** Snyk #7, *Anthropic Skill Creator*.

**Why:** not creator-facing, but VVibe is open source (`npx skills add`). A
scaffolder that emits skills conforming to [PROVIDER.md](./PROVIDER.md) and the
Product Brain contract would help the team and community extend the catalog
consistently.

---

## Already covered

- **Snyk #8, *Snyk Fix*** → shipped as **`vvibe-sentry`** (orchestrates
  gitleaks / osv-scanner / semgrep + reports to the dashboard). The only gap
  vs. Snyk Fix is auto-remediation — `vvibe-sentry` is read-only and never
  modifies code. **Possible enhancement:** an opt-in `fix` mode. (Team
  decision — fits the existing skill rather than a new one.)

## Suggested build order when greenlit

1. `vvibe-conversion`
2. VVibe marketing suite
3. `vvibe-financials` (the data-moat one — gated on the metrics-access decision)
