# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Cursor, Copilot, etc.) when working with code in this repository.

## Repository Overview

A collection of skills for AI coding agents to help VVibe creators integrate analytics, member management, invitation email, pre-deploy security scanning, and product-knowledge-base extraction. Skills are packaged instructions, reference docs, and example scripts that extend an agent's capabilities.

**This is not an application project** — no build system, no npm dependencies, no tests. Content is documentation-driven skill definitions, reference materials, and copy-ready example code.

## Directory Structure

```
skills/
  vvibe-analytics/          # GA4 analytics integration
    SKILL.md                  # Skill definition (entry point)
    references/               # GA4 setup guide, event tracking contract
    scripts/                  # gtag.js and event tracking examples (.mjs)
  vvibe-member/             # Member sync and management
    SKILL.md                  # Skill definition (entry point)
    references/               # User sync API contract
    scripts/                  # Migration and sync examples (.mjs)
  vvibe-email/              # Invitation email + waitlist landing
    SKILL.md                  # Skill definition (entry point)
    references/               # Hosted-CTA / self-hosted waitlist / campaign sending
    scripts/                  # (none — agent generates per-stack templates)
  vvibe-sentry/             # Pre-deploy codebase security audit
    SKILL.md                  # Skill definition (entry point)
    references/               # Health-check contract, CI setup, fix explanations, common pitfalls
    scripts/                  # report.mjs (orchestrator) + check_vvibe_integration.mjs + gitleaks-rules.toml
  vvibe-product-brain/         # Product Brain builder (writes via vibe_set_product_kb MCP)
    SKILL.md                  # Skill definition (entry point)
    references/               # Extraction discipline, KB schema, build / refresh modes
    references/sources/       # Per-source guides (github_repo / website_url / document_set)
  vvibe-blog-writer/        # SEO blog drafting from the Product Brain → VVibe blog (native) or WordPress draft
    SKILL.md                  # Skill definition (entry point / router)
    references/               # flow, publishing (VVibe-native + WordPress), api (MCP + REST)
  vvibe-blog-render/        # Frontend for the headless VVibe blog — renders the content API in the creator's own app
    SKILL.md                  # Skill definition (entry point / router)
    references/               # content-api (the read contract), rendering (routes, SEO, revalidation, RSS/sitemap)
  vvibe-changelog/          # Product-change logging + KB staleness / announcement nudges
    SKILL.md                  # Skill definition (entry point / router)
    references/               # logging, kb-sync-flow, announce-flow
```

## Skill Architecture

Each skill follows the same structure:

1. **SKILL.md** — Core skill definition with YAML frontmatter (name, description, triggers), workflow steps, guardrails, and output preferences
2. **references/** — Detailed technical docs (API contracts, setup guides, event definitions)
3. **scripts/** — Copy-ready reference implementations (`.mjs`, `.py`)

SKILL.md is the entry point when an agent loads a skill. References are loaded on-demand — do not read all of them upfront.

## Key Domain Concepts

**Analytics Skill:**
- Supported frameworks: Next.js (App Router / Pages Router), React SPA, vanilla HTML
- GA4 Measurement ID format: `G-XXXXXXX` (not `UA-XXXXX`)
- 5 VVibe custom events + GA4 ecommerce event mapping
- GA4 data has a 24–48 hour processing delay

**Member Skill:**
- API host: `https://vvibe.ai`
- Uses the same Creator Subscription API Key (`pcs_live_*` / `pcs_test_*`)
- Email is the dedup key: `UNIQUE(profile_id, api_key_id, email)`
- Batch limit: max 100 users per sync call
- Sync calls must be fire-and-forget — never block the main business flow
- Deletion: sync with `status: "deleted"` removes the user (no separate DELETE endpoint)

**Product Brain Skill:**
- Writes the merchant's Product Brain via the `vibe_set_product_kb` MCP tool (or REST fallback to `PUT /api/product-brain/kb`)
- Two modes: `build` (first-time, no existing Product Brain) and `refresh` (diff against existing, emit `change_log`)
- Three source types, additive: `github_repo`, `website_url`, `document_set`
- Three-layer extraction discipline: EXTRACT verbatim → INFER with confidence flag → NO FABRICATION (null + `missing_fields[]`)
- Hard prohibitions: never invent customer names / metrics; detect & list forbidden claims (CAN-SPAM / FTC / medical / financial) in `legal_compliance.forbidden_claims`
- Token budget v1: 80k input / 16k output
- Every prose-generating skill (email, SEO, conversion) reads the Product Brain before drafting — this is the upstream feeder

**Blog Writer Skill:**
- Drafts SEO articles from the Product Brain, then publishes to the creator's **VVibe blog** (native, `target:'native'`) or pushes a **WordPress draft** — WordPress never auto-publishes
- MCP tools: `vibe_create_blog_post`, `vibe_update_blog_post`, `vibe_publish_blog_post`, `vibe_list_blog_posts` (lightweight projection — no body), `vibe_get_blog_post` (one post's full content) (REST fallback under `/api/blog/*`)
- Two entry points, one model: agent (MCP) and dashboard form both produce the same post; every prose edit appends a revision tagged `authored_by: 'agent' | 'human'`
- Optimistic concurrency: edits pass `expectedVersion`; a 409 means re-read and re-apply
- State machine: `created → brief_ready → draft_ready → cover_ready → { published_draft (WordPress) | published (VVibe blog) }` (`failed` is recoverable)
- Server-enforced spec: answer-first structure, FAQ + JSON-LD, Taiwan Traditional Chinese writing rules, no fabricated stats / ranking guarantees; KB `forbidden_claims` are hard-rejected
- Gated on an LLM provider (drafting); **WordPress** publishing needs `PUBLISHING_SECRET_KEK` + is public-HTTPS-only with SSRF protection; **VVibe-blog** (native) publishing needs neither
- Downstream consumer of the Product Brain — pairs with vvibe-product-brain (run that first)

**Blog Render Skill:**
- The "head" for the headless VVibe blog: builds the blog frontend in the creator's OWN app from the public content API (`/api/blog/public/{slug}[/{postSlug}]`)
- Read-only + public — no credentials, no MCP write tools, no `PUBLISHING_SECRET_KEK`; just CORS-open `GET`s a reader's browser could also make
- Scaffolds index + post routes, carries through VVibe's `metaTitle`/`metaDescription` + `schemaJsonld` (injected safely; omitted when null), wires ISR revalidation (`ETag`/`Last-Modified`), and emits RSS + `sitemap.xml` at the creator's domain
- RSS / sitemap live HERE, not in VVibe — their links must point at the creator's rendered pages, which only the creator's app knows
- Downstream of vvibe-blog-writer's native publish — pairs with it (publish first, then render)

**Changelog Skill:**
- Two directions, not one flow: **log** a shipped user-visible change via `vibe_log_product_change`, or **act** on a staleness/announcement signal surfaced by another skill
- Three MCP tools, no REST/API-key equivalent: `vibe_log_product_change` (`{summary, change_type, significance, affected_kb_sections?}`, returns `kbStale` / `suggestAnnouncement`), `vibe_get_product_changelog` (`{limit?}` → `entries[]`, `pending`, `kbLastUpdatedAt`, `unannouncedMajorFeatures[]`), `vibe_mark_change_announced` (`{entry_ids}`)
- `vibe_get_product_kb` (always available) now also returns a `staleness: {pendingChanges, entries[]}` field when changelog entries postdate the KB
- Gated like the blog tools: `vibe_report_skill_installed({ skillId: 'changelog', ... })` activates the three tools for a connection that already has core `vibe_*` access
- Pairs both ways: nudges a `vvibe-product-brain` KB sync (`vibe_update_product_kb_section`) before prose, then nudges an announcement via `vvibe-email` or `vvibe-blog-writer` for major features, marking entries announced after the send/publish

**Sentry Skill:**
- Four layers: `SECRETS` (gitleaks), `DEPS` (osv-scanner + npm audit), `SAST` (semgrep w/ OWASP / JS / TS rule packs), `VVIBE` (sentry-internal integration checks)
- Three severity levels: `CRITICAL` (must fix before deploy), `WARNING` (should fix), `INFO` (fix when convenient)
- Static analysis only — read-only audit, never modifies user code
- Gracefully degrades — any missing OSS scanner downgrades its layer to `skipped` and the rest still run
- Reporting (optional, two paths):
  - MCP-connected agent → call `vibe_report_health_check`
  - Standalone → `POST /api/health-scans/reports` with `Authorization: Bearer {VVIBE_API_KEY}`
- Results flow into the creator's Vibe dashboard at `https://vvibe.ai/dashboard/sentry-scans`

## Provider Abstraction

API host defaults to `https://vvibe.ai`, overridable via `VVIBE_API_HOST`. See `PROVIDER.md` for the backend compatibility contract.

When editing skill content:

- **Scripts** (`.mjs` in `scripts/`) must read the host via `process.env.VVIBE_API_HOST || 'https://vvibe.ai'`. Never hardcode it.
- **`SKILL.md` / `references/`** keep the literal `https://vvibe.ai` as the documented default. Example code in these docs should use the env-var pattern.
- **Dashboard URLs and brand strings** are intentionally hardcoded today — forks rebrand via find/replace.

## Onboarding (brand-new users)

Every skill except the read-only `vvibe-blog-render` acts on the creator's
VVibe account, though how the agent authenticates varies by skill: most read a
`VVIBE_API_KEY` (`pcs_live_*` / `pcs_test_*`); `vvibe-blog-writer` is MCP-only
(no `pcs_*` key path); `vvibe-product-brain` accepts either. Whatever the
mechanism, a first-time user may have **neither credentials nor an account**.
The convention, enforced in each gated `SKILL.md`'s auth/prereq section, is:

- When the key / MCP connection is missing, **do not** jump straight to "paste
  your key" — first establish whether the user even has a VVibe account.
- New / unsure → walk them through signing up at `https://vvibe.ai/dashboard`
  (VVibe has no separate signup URL; signed-out visitors land on the login page and use the "Sign up" toggle to create an account),
  then copying the key. Only then proceed.

`ONBOARDING.md` (+ `ONBOARDING.zh-TW.md`) at the repo root is the single
authoritative walkthrough — both the human-facing tutorial and the
agent-facing "detect a brand-new user" rule. Skill auth sections link to it
rather than re-deriving the flow. When you add a new skill that gates on an
account, mirror this branch and point at `ONBOARDING.md`.

## Versioning & Changelog

Skills version independently via `version:` in each `SKILL.md` frontmatter.
Any behavior change to a skill (its `SKILL.md`, `references/`, or `scripts/`)
bumps that skill's version (new capability → minor, fix → patch) **and** adds
an entry to the root `CHANGELOG.md` in the same PR. See the rules at the top
of `CHANGELOG.md`.

## End-User Installation

```bash
npx skills add vvibe/vvibe-skills
```
