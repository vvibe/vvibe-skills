English | [繁體中文](./README.zh-TW.md)

# VVibe Skills

AI agent skills for [VVibe](https://vvibe.ai) creators. Integrate VVibe services — analytics, member sync, invitation email, pre-deploy security scanning, product-knowledge-base extraction — into any project with your AI coding agent.

## Installation

```bash
# All skills
npx skills add vvibe/vvibe-skills

# Specific skill
npx skills add vvibe/vvibe-skills --skill vvibe-analytics
```

## Updating

```bash
# Update all installed skills to latest
npx skills update

# Update a specific skill
npx skills update vvibe-analytics
```

## Connect to VVibe (fastest: one command)

These skills act on **your** VVibe account. The fastest way in is to connect
your agent to VVibe's MCP — one command, and the agent opens your browser to log
in the first time it's used (**sign-up is on that same page**). No key to copy,
no trip back to the dashboard:

```bash
npx @vvibe/cli connect --server=https://mcp.vvibe.ai
```

Prefer an API key (needed for member sync, or on token-only self-hosts)? Open
[`https://vvibe.ai/dashboard`](https://vvibe.ai/dashboard) to sign up, copy your
key (`pcs_live_*` / `pcs_test_*`), and add it to your project as `VVIBE_API_KEY`.

Full walkthrough: **[ONBOARDING.md](./ONBOARDING.md)**. (The read-only
`vvibe-blog-render` skill needs no account.) When the agent detects neither an
MCP connection nor a key, it steers you to the one-command connect above first.

## Skills

| Skill | Description | Triggers |
|-------|-------------|----------|
| **vvibe-analytics** | GA4 analytics setup, VVibe event tracking, and dashboard connection | `GA4`, `Google Analytics`, `event tracking` |
| **vvibe-member** | User sync to VVibe — migration, incremental sync, and dashboard viewing | `user sync`, `member sync`, `user management` |
| **vvibe-sentry** | Pre-deploy codebase security audit — orchestrates gitleaks, osv-scanner, semgrep, plus VVibe-integration checks. Reports back to the dashboard. | `VVibe sentry scan`, `security audit`, `pre-deploy check`, `secret leak`, `dependency CVE` |
| **vvibe-email** | Wire invitation-email registration links to either a VVibe-hosted CTA (zero setup) or a self-hosted waitlist landing page on the vibe coder's own domain | `invitation email`, `waitlist landing page`, `app base URL` |
| **vvibe-product-brain** | Build or refresh the creator's Product Brain on VVibe — extract structured product facts from a repo, public site, or document set, then write via `vibe_set_product_kb`. Every prose-generating skill (email, SEO, conversion) reads this Product Brain before drafting. | `product brain`, `Product Brain`, `knowledge base builder`, `teach VVibe about my product` |
| **vvibe-blog-writer** | Draft SEO blog articles from the creator's Product Brain, then publish to the creator's own VVibe headless blog (no setup) or as a WordPress draft. Reads brand voice, FAQ, audience, and forbidden claims so articles are on-brand and legally safe. | `write a blog`, `draft an article`, `SEO article`, `publish my blog`, `publish to WordPress` |
| **vvibe-blog-render** | Build the blog frontend in the creator's OWN app from the VVibe content API — index + post pages, the SEO VVibe already generated (meta + JSON-LD), revalidation, plus RSS + sitemap. The "head" for the headless VVibe blog. | `show my vvibe blog`, `render my articles`, `blog frontend`, `connect my site to vvibe` |

## VVibe Analytics Integration

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-analytics
```

Helps creators install Google Analytics 4 on their websites and connect analytics to the VVibe dashboard.

- GA4 installation for Next.js (App Router / Pages Router), React SPA, and vanilla HTML
- 5 VVibe standard events + GA4 ecommerce event mapping
- VVibe dashboard authorization flow

**Prerequisites:** Google Analytics 4 account with a Measurement ID (`G-XXXXXXX`) and a VVibe account ([new to VVibe?](./ONBOARDING.md)).

**Skill triggers:**
- "Help me install Google Analytics on my website"
- "I want to track VVibe checkout events"
- "Set up GA4 for my Next.js project"
- "I want to see website analytics in my VVibe dashboard"
- "Connect Google Analytics to VVibe"

## VVibe User Management

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-member
```

Helps vibe coders sync their application users to VVibe, so creators can view users and subscription status in the Dashboard.

- Bulk migration with batching and backoff
- Incremental sync with fire-and-forget pattern
- Dashboard viewing at `https://vvibe.ai/dashboard/users`
- Sync log tracking

**Prerequisites:** A VVibe account and API Key (`pcs_live_*` or `pcs_test_*`). New to VVibe? [Create an account and get your key](./ONBOARDING.md).

**Skill triggers:**
- "Sync my users to VVibe"
- "Help me migrate existing users to VVibe"
- "Set up incremental user sync with VVibe"

## VVibe Sentry Codebase Audit

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-sentry
```

Runs a pre-deploy security and reliability audit on the creator's codebase. Sentry **orchestrates established open-source scanners** — it doesn't re-invent them. The agent's value is in driving the tools, normalising their output into a single severity-graded report, and walking the creator through fixes in plain language.

Four layers:

- 🔐 **Secrets** — [gitleaks](https://github.com/gitleaks/gitleaks) scans git history + working tree for committed API keys (AWS, GCP, GitHub, OpenAI, `VVIBE_API_KEY` patterns, etc.)
- 📦 **Dependencies** — [osv-scanner](https://github.com/google/osv-scanner) + `npm audit` for known CVEs
- 🛡️ **Static analysis** — [semgrep](https://semgrep.dev/) with OWASP Top 10 + JS/TS rule packs (SQL injection, XSS, SSRF, hardcoded secrets, missing auth, unsafe `eval`, weak crypto)
- 🪢 **VVibe integration** — sentry-internal checks for VVibe-specific patterns (API key hygiene, member sync idempotency, email opt-out respect, analytics PII)

Every finding is graded CRITICAL / WARNING / INFO. Read-only — never modifies user code. Optionally reports the summary to the dashboard at `https://vvibe.ai/dashboard/sentry-scans`, or via the `vibe_report_health_check` MCP tool when an agent is connected.

**Prerequisites:** [gitleaks](https://github.com/gitleaks/gitleaks), [osv-scanner](https://github.com/google/osv-scanner), and [semgrep](https://semgrep.dev/) installed (sentry gracefully skips any missing tool). Optional: a VVibe account ([new to VVibe?](./ONBOARDING.md)) and API Key (`pcs_live_*` or `pcs_test_*`) to report results to the dashboard.

**Skill triggers:**
- "Run a VVibe sentry scan before I deploy"
- "Audit my codebase for security issues"
- "Scan for committed secrets / leaked API keys"
- "Check my dependencies for CVEs"
- "Is my project safe to go live?"

## VVibe Invitation Email Integration

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-email
```

Helps vibe coders wire the registration link inside VVibe invitation emails to the right destination — either VVibe's hosted waitlist page (zero setup) or the vibe coder's own `/waitlist/[creatorSlug]` landing page (full UX control).

- Mode A — embed `https://vvibe.ai/waitlist/{creatorSlug}` as a CTA, no backend code
- Mode B — register `appBaseUrl` and host the page yourself; click tracking still goes through VVibe
- Templates for Next.js, React SPA, and plain HTML in Mode B
- Cross-links to `vvibe-member` for syncing the new signup back to the dashboard

**Prerequisites:** A VVibe account and API Key (`pcs_live_*` or `pcs_test_*`) — [new to VVibe?](./ONBOARDING.md). For Mode B, an HTTPS-reachable domain for the waitlist page.

**Skill triggers:**
- "Where does the registration email link land?"
- "Set up a VVibe waitlist landing page on my own site"
- "Embed a VVibe waitlist CTA in my hero section"
- "Configure the app base URL for invitation emails"

## VVibe Product Brain Builder

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-product-brain
```

Builds or refreshes the creator's Product Brain on VVibe — the structured agent-owned document that every prose-generating skill (email, SEO, conversion) reads before drafting. Stops downstream skills from re-deriving the creator's product on every action.

- Three source types (additive): github repo, public website, document set (PDFs / markdown / screenshots)
- Two modes: `build` (first-time, no existing Product Brain) and `refresh` (diff against existing, emit `change_log`)
- Hard discipline: EXTRACT verbatim → INFER with confidence flag → NO FABRICATION (null + `missing_fields[]`)
- Never invents customer names or metrics; detects forbidden claims (CAN-SPAM / FTC / medical / financial) and records them for downstream skills to avoid

**Prerequisites:** A VVibe account ([new to VVibe?](./ONBOARDING.md)) reached via a VVibe MCP connection OR a `VVIBE_API_KEY` (`pcs_live_*` / `pcs_test_*`); at least one source (repo / URL / document set).

**Skill triggers:**
- "Set up my product brain on VVibe"
- "Build the product knowledge base"
- "Teach VVibe about my product"
- "Refresh the Product Brain"
- "Product changed, sync the Product Brain"

## VVibe Blog Writer

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-blog-writer
```

Drafts SEO blog articles from the creator's Product Brain, then publishes them to one of two destinations: the creator's own **VVibe headless blog** (no external CMS, no setup) or a **WordPress draft** (the creator reviews and publishes from their own CMS). VVibe is the headless brain + content API; the server enforces the generation spec and writing rules while the agent orchestrates.

- Reads the Product Brain for brand voice, audience, FAQ, and `forbidden_claims` so articles are on-brand and avoid legal landmines (never re-derives the product)
- Four fixed article directions: product philosophy, product features, related-audience inflow, tutorial & problem-solving
- Brief → 3 SEO-title candidates + outline → full draft (answer-first structure, FAQ, JSON-LD), all editable; every edit is a tracked revision
- **VVibe blog** publish (`target: native`): goes live on the content API instantly, no credentials; pair with **vvibe-blog-render** to display it. **WordPress** publish: **draft only**, never auto-publishes; public-HTTPS-only with SSRF protection

**Prerequisites:** A VVibe account ([new to VVibe?](./ONBOARDING.md)) reached via a VVibe MCP connection OR a `VVIBE_API_KEY` (`pcs_live_*` / `pcs_test_*`); a Product Brain (run **vvibe-product-brain** first); the deployment's operator must have an LLM provider configured for drafting. WordPress publishing additionally needs an application password (the VVibe-blog path needs none).

**Skill triggers:**
- "Write a blog post about X"
- "Draft an SEO article"
- "The product changed, redo this post"
- "Publish to my VVibe blog / connect my WordPress / publish this post"

## VVibe Blog Render

```bash
npx skills add vvibe/vvibe-skills --skill vvibe-blog-render
```

Builds the **blog frontend in the creator's own app** so their VVibe-published articles are actually displayed to readers. VVibe is headless — it serves content through a public API but renders nothing itself; this skill is the "head".

- Generates a typed client for the public content API + scaffolds blog **index** and **post** routes (Next.js App Router primary; Astro / Nuxt / SvelteKit / static notes included)
- Carries through the SEO VVibe already generated — `metaTitle` / `metaDescription` and the `schemaJsonld` graph (injected safely; omitted when null)
- Wires **revalidation** (ISR / timed rebuild via the API's `ETag` / `Last-Modified`) and emits an **RSS feed + `sitemap.xml`** at the creator's own domain, where the links resolve
- **Read-only**: no credentials, no write tools — it only `GET`s the public, CORS-open content API

**Prerequisites:** The creator's own app/site repo (any framework); the VVibe deployment host + their merchant slug; at least one post published to the VVibe blog (run **vvibe-blog-writer** with `target: native` first — that also enables the public blog).

**Skill triggers:**
- "Show my VVibe blog on my site"
- "Render my articles / set up the blog frontend"
- "Add a blog page that reads my VVibe posts"
- "New posts aren't showing on my site"

## Using a Different Backend

These skills default to `https://vvibe.ai` — direct installers need no setup. To run a fork against a self-hosted or compatible backend, set `VVIBE_API_HOST`; both the bundled scripts and agent-generated code honor it:

```bash
VVIBE_API_HOST=https://your-backend.example.com
```

See [PROVIDER.md](./PROVIDER.md) for the backend compatibility contract.

## License

Apache 2.0
