English | [繁體中文](./POSITIONING.zh-TW.md)

# VVibe Skills — Positioning & Competitive Landscape

Where VVibe sits in the 2026 Claude-skills / AI-backend market, and the niche it
should defend. Companion to [ROADMAP.md](./ROADMAP.md) — the roadmap picks *what*
to build; this doc explains *why those and not others*.

**Status: strategy note pending team discussion.** Researched 2026-06-08.
The two-front frame and the kill-shots below were validated by a deep-research
pass (22 sources, 105 claims extracted, 25 adversarially verified → 18 confirmed
/ 7 refuted). Where verification *refuted* an earlier assumption, it's flagged
inline — those corrections are the most important part of this doc.

## The thesis

VVibe isn't fighting a head-on competitor doing the same thing. It's squeezed
from two sides — **pure-prompt skill packs** (marketing intelligence, zero
backend) and **AI-native backends for vibe coders** (backend, zero monetization
intelligence). VVibe's niche is the *intersection* of those two, which is
currently almost unoccupied. **No competitor was found at VVibe's exact
intersection** (agent-native × real first-party data × monetization/marketing
intelligence × persistent memory) — though this is an absence-of-evidence
finding over a fast-moving market, so a stealth/unsurveyed entrant can't be
fully ruled out.

## Two competitive fronts

### Front A — pure-prompt skill packs

Hit VVibe's blog / conversion / marketing surface.

- Corey Haines [`marketingskills`](https://github.com/coreyhaines31/marketingskills)
  (34 skills; 60–106K installs each on skills.sh),
  [OpenClaudia](https://github.com/OpenClaudia/openclaudia-skills) (34 marketing
  skills), [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)
  (337 skills), [kostja94/marketing-skills](https://github.com/kostja94/marketing-skills)
  (160+ SEO), [emotixco/claude-skills-founder](https://dev.to/emotixco/12-claude-code-skills-for-startup-founders-open-source-4lib)
  (12 founder skills), plus Wondelai, nginity, Landing Page Mastery.
- Ecosystem **tripled since Jan 2026; 80K+ combined stars**.
- **Shared weakness — confirmed stateless.** [Composio's 2026 catalog](https://composio.dev/content/best-marketing-skills)
  calls skills "reusable instruction packs in markdown" that are "incomplete if
  they cannot connect to the apps" (they need external MCP for any live data),
  and presents 29 skills across 13 categories as "separate, individual skills…
  not one integrated product." Anthropic's own docs confirm skills are
  filesystem bundles with no native persistence. They re-derive the product
  every run, can't track outcomes, can't act on real numbers — **and the
  landscape is fragmented, not a single integrated rival.**

### Front B — AI-native backends for vibe coders

The closest architectural twins.

- **[Butterbase](https://butterbase.ai/)** — "Backend for Vibe Coders":
  Postgres / auth / REST+GraphQL / realtime / AI-gateway, integrates via MCP
  with Claude Code / Cursor / Codex / Windsurf / Copilot. **Confirmed: no
  marketing / SEO / content / monetization-intelligence layer** — its only
  marketing/monetization touchpoints are app *templates* (an email-sequence
  recipe, a Stripe marketplace recipe); "analytics" is a build-it-yourself KPI
  dashboard.
- **[InsForge](https://insforge.dev)** ([YC launch](https://www.ycombinator.com/launches/QP6-insforge-the-backend-platform-for-ai-native-developers))
  — "the backend platform for AI-native developers," agents as "primary
  operators." Stripe checkout/subscription is framed as payment rails, not
  monetization strategy.
- Supabase / Convex / Firebase — classic BaaS, now bolting on MCP.
- **Shared weakness: horizontal infra plumbing.** They don't understand how a
  creator *monetizes*, and have no marketing-intelligence layer. (Monetization
  here = Stripe plumbing + role/auth access, **not strategy**.)

## Positioning map

```
                  monetization / marketing intelligence HIGH
                              ▲
   prompt skill packs         │        ★ VVibe (alone)
 (Corey Haines, OpenClaudia,  │   Product Brain + real member/traffic data
  Wondelai, nginity, …)       │   + agent-native delivery + creator dashboard
 intelligence, zero backend   │
                              │
 ─────────────────────────────┼─────────────────────────────▶ real backend / data HIGH
                              │
                              │     Butterbase / InsForge
                              │     Supabase / Convex
                              │     backend, zero monetization intelligence
                  monetization / marketing intelligence LOW
```

VVibe is the only player with **real-data backend × monetization/marketing
intelligence × agent-native delivery** at once.

## The moat — corrected

> ⚠️ **Correction from research.** "Persistent memory = moat" was over-claimed.
> Bessemer says context/memory "**may be** the new moats" (hedged); the specific
> claim that *persistent memory creates switching-cost lock-in* was **refuted**
> in verification, and a16z / NFX / v7labs argue memory/data alone is a
> *weakening* moat because LLMs lower switching cost via automated schema
> mapping.

So the moat is **not the format** (commoditized — see kill-shots), **not the
connectors** (commoditized), and **not "memory" by itself** (contested). What's
hard to copy is the **cross-domain fusion**:

> The creator's **content voice × revenue × member behavior, accumulated in one
> Product Brain grounded in their real first-party data.** A single skill pack
> can't (stateless); a single BaaS can't (infra data, no marketing context).
> That accrued cross-domain context — not memory as a feature — is the defensible
> asset.

## Validated kill-shots

1. **Delivery format is now a free open commodity.** On 2025-12-18 Agent Skills
   became an open standard (spec + SDK at agentskills.io); OpenAI adopted a
   structurally identical format in Codex/ChatGPT; 32+ tools support it by
   Mar 2026; first-party vendors incl. **Stripe (monetization)** and Cloudflare
   publish partner skills; Anthropic charges **nothing extra** across plans.
   "Agent-native skill packaging" cannot be the moat.
   [[1]](https://siliconangle.com/2025/12/18/anthropic-makes-agent-skills-open-standard/)
   [[2]](https://venturebeat.com/technology/anthropic-launches-enterprise-agent-skills-and-opens-the-standard)
2. **Connector layer is commoditized.** MCP was donated to the Linux-Foundation
   Agentic AI Foundation (97M+ monthly SDK downloads, 10,000+ servers). An
   Apache-licensed, neutrally-governed protocol can't be a moat.
   [[3]](https://www.pulsemcp.com/posts/openai-agent-skills-anthropic-donates-mcp-gpt-5-2-image-1-5)
3. **BaaS is already growing upward into intelligence.** InsForge ships an
   **"AI Backend Advisor"** (`npx @insforge/cli diagnose advisor`) — *today*
   scoped to security/performance/health (infra), **not** marketing/monetization,
   so VVibe's slice isn't breached yet. But it proves a well-funded BaaS can
   build advisory intelligence on its own data. **VVibe has a head-start window
   to own the monetization/marketing slice before they extend into it — and the
   window is closing.** (Mildly reassuring: a rumored InsForge "Project Memory"
   was **refuted** — the Product Brain is not under direct attack yet.)
   [[4]](https://insforge.dev/blog/insforge-launch)

## Biggest unresolved risk — demand side

**Will creators/vibe-coders actually pay for a "monetization brain," at what
price, with what retention?** This is the single most important open question and
research **could not answer it** — the ChartMogul retention/pricing figures that
would have informed it were **refuted in verification** (0-3), and the
"<5% of MCP servers are monetized" premise was not independently confirmed. There
is no verified benchmark either way. **Recommended next step: answer this with
real users (interviews / a small paid pilot), not more desk research.**

## Recommendation

**Positioning statement:** *VVibe is the growth & monetization brain that layers
on top of your app — it remembers your product, voice, members, and revenue in
one place, and turns that into on-brand content and grounded growth decisions.
Not a backend. Not a prompt pack.*

- **Be complementary, sit on top of the creator's app/data** — whether or not
  they use a third-party backend. **Do not** build a standalone backend that
  collides head-to-head with Butterbase/InsForge/Supabase (you'll lose on
  resources). This also survives Anthropic/OpenAI bundling skills, because the
  moat is the accrued data+memory, not the skill artifact.
- **Beachhead:** solo creators / indie-SaaS founders who **already publish
  content** *and* need monetization decisions grounded in **their own member +
  analytics data**.
- **Three proof points to defend the niche:**
  1. The **closed loop working end-to-end** (Product Brain → on-brand
     SEO/conversion content → published in the creator's own app → real GA4 +
     member/subscription data → grounded revenue/growth insight → Brain
     refinement).
  2. **Cross-domain memory no skill pack or BaaS holds** (content voice ×
     revenue × member behavior in ONE accruing knowledge base).
  3. **Measurable monetization lift** attributable to grounding vs a stateless
     skill pack — get a number.

## Open questions (for the team)

1. **Demand/pricing/retention** for an agent-native creator monetization tool —
   the unanswered core (see risk above).
2. **How durable is the empty intersection?** How fast can InsForge (or another
   BaaS) extend its advisor from infra into marketing/monetization — what's
   VVibe's realistic head-start window?
3. **Does the open Skills standard preserve skill *quality* across non-Claude
   models, or only file-format portability?** (Affects whether VVibe's
   Claude-tuned Brain integration keeps an edge after delivery commoditizes.)
4. **Is there an unsurveyed entrant** (AI-native CMS, creator-monetization
   startup, content add-on to Supabase/Convex/Firebase) already approaching the
   intersection?

## Sources

Primary / high-confidence: [Butterbase](https://butterbase.ai/) ·
[InsForge](https://insforge.dev) ·
[InsForge YC launch](https://www.ycombinator.com/launches/QP6-insforge-the-backend-platform-for-ai-native-developers) ·
[InsForge launch blog (AI Backend Advisor)](https://insforge.dev/blog/insforge-launch) ·
[Agent Skills open standard — SiliconANGLE](https://siliconangle.com/2025/12/18/anthropic-makes-agent-skills-open-standard/) ·
[VentureBeat](https://venturebeat.com/technology/anthropic-launches-enterprise-agent-skills-and-opens-the-standard) ·
[MCP donation — PulseMCP](https://www.pulsemcp.com/posts/openai-agent-skills-anthropic-donates-mcp-gpt-5-2-image-1-5) ·
[Bessemer State of AI 2025](https://www.bvp.com/atlas/the-state-of-ai-2025) ·
[Composio marketing-skills catalog](https://composio.dev/content/best-marketing-skills)

Refuted / unverified (do **not** cite as fact): ChartMogul AI-churn retention &
price-tier figures (refuted 0-3); "memory = switching-cost lock-in" (refuted
1-2); "<5% of MCP servers monetized" (unverified).
