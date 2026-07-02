English | [繁體中文](./ONBOARDING.zh-TW.md)

# Getting Started: Connect your agent to VVibe

Every VVibe skill except the read-only **vvibe-blog-render** acts on *your*
VVibe account — syncing members, sending email, reporting scans, writing your
Product Brain or blog. Before any of them can act you need a VVibe account plus
one of two ways to authenticate:

- **Vibe MCP connection (recommended — fastest):** one command + one browser
  login. The agent authenticates with its own token, and your account and a
  default merchant are provisioned automatically. Nothing to copy.
- **API key** in your env: the fallback — needed for member *sync*, and the
  only option on self-hosted / token-only setups.

Both use the same account, so you can start with MCP and add a key later only if
a skill needs it. Already connected, or have `VVIBE_API_KEY` in your env? You're
set — skip this page.

## Fastest: connect over MCP (one command, one login)

Run one command. It writes VVibe's MCP server into your agent's own config — and
the **agent** logs you in through the browser the first time it uses the server.
No token to copy, no dashboard to click through.

```sh
npx @vvibe/cli connect --server=https://mcp.vvibe.ai
```

It detects **Claude Code**, **Cursor**, and **Codex** and wires each one. Then
start a VVibe task in your agent: the first call opens your browser to log in —
and **sign-up is on that same page**, so brand-new users create their account
right here too. Logging in auto-creates your account and a default merchant;
there's nothing else to set up.

Prefer to wire Claude Code by hand:

```sh
claude mcp add --transport http vvibe https://mcp.vvibe.ai
```

> Self-hosting or on a fork? Point `--server` at your own MCP host — see
> [PROVIDER.md](./PROVIDER.md). (MCP OAuth is a cloud feature; a token-only
> self-host uses the API key below.)

**What MCP covers:** product-brain, blog-writer, email campaigns, sentry
reporting, and all read tools work fully over the connection. **Member sync**
still needs the API key below — but it's the same account, so that's just a copy
step when you reach it. Analytics wires GA4 through its own in-dashboard
**Connect** button — no key or MCP needed.

## Fallback: API key

For member sync, self-hosted token-only setups, or if you'd rather not use MCP:

1. Open **`https://vvibe.ai/dashboard`**. Signed out, you land on the login page
   (`/login`); use the **"Sign up" toggle** to create an account (email +
   password, or Google/GitHub).
2. In the dashboard, open the **API key** area and copy your key. The prefix is
   the mode: `pcs_live_*` → production, `pcs_test_*` → sandbox.
3. Add it to your project's env (and confirm `.env` is gitignored):

```bash
# .env  — never commit this
VVIBE_API_KEY=pcs_live_xxxxxxxxxxxxxxxx
```

Treat it like a password — never commit it or paste it into client-side code.
Every key-based skill (member, email, sentry) reads `VVIBE_API_KEY` from here.
(Analytics is not key-based — it connects GA4 via its own in-dashboard OAuth.)

> If you see an "apply for access" screen instead, VVibe is in limited beta —
> submit the short form and you'll be emailed when you're approved.

## For the agent: recommend the fastest path first

When a skill needs VVibe access and finds **neither** an MCP connection (`vibe_*`
tools registered) **nor** `VVIBE_API_KEY` in env, do **not** jump to "paste your
key" — that's the slow path, and a first-time user may have no account at all.
Recommend the fastest path first:

1. **Offer MCP + OAuth first.** Tell the user to run
   `npx @vvibe/cli connect --server=https://mcp.vvibe.ai` (Claude Code / Cursor /
   Codex). It's one command; the first VVibe call opens the browser to log in,
   and sign-up is on that same page — so this single step both **creates the
   account and connects**, with no key to copy and no trip back to the dashboard.
   This is the one-click path — prefer it.
2. **Fall back to the API key only when needed** — the user needs a key-only
   capability (member sync), is self-hosting token-only, or declines MCP. Then
   walk them through the API-key steps above.

Only once the MCP is connected (or a key is in `.env`) should the skill proceed.
