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
  vvibe-kb-builder/         # Product Knowledge Base builder (writes via vibe_set_product_kb MCP)
    SKILL.md                  # Skill definition (entry point)
    references/               # Extraction discipline, KB schema, build / refresh modes
    references/sources/       # Per-source guides (github_repo / website_url / document_set)
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

**KB Builder Skill:**
- Writes the merchant's Product Knowledge Base via the `vibe_set_product_kb` MCP tool (or REST fallback to `PUT /api/product-brain/kb`)
- Two modes: `build` (first-time, no existing KB) and `refresh` (diff against existing, emit `change_log`)
- Three source types, additive: `github_repo`, `website_url`, `document_set`
- Three-layer extraction discipline: EXTRACT verbatim → INFER with confidence flag → NO FABRICATION (null + `missing_fields[]`)
- Hard prohibitions: never invent customer names / metrics; detect & list forbidden claims (CAN-SPAM / FTC / medical / financial) in `legal_compliance.forbidden_claims`
- Token budget v1: 80k input / 16k output
- Every prose-generating skill (email, SEO, conversion) reads the KB before drafting — this is the upstream feeder

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

## End-User Installation

```bash
npx skills add vvibe/vvibe-skills
```
