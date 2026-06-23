English | [繁體中文](./ONBOARDING.zh-TW.md)

# Getting Started: Create your VVibe account & get your API key

Every VVibe skill except the read-only **vvibe-blog-render** acts on *your*
VVibe account — syncing members, sending email, reporting scans, writing your
Product Brain or blog. So before any of them can do anything, you need a VVibe
account and either an **API key** or a **Vibe MCP connection**.

If you're brand-new to VVibe (no account yet), do this once. Already have an
account with `VVIBE_API_KEY` in your env (or the Vibe MCP connected)? You're
set — skip this page.

## 1. Create your VVibe account

The dashboard is the entry point. Opening it while signed out sends you to the
**login page**, where you can create an account.

1. Open **`https://vvibe.ai/dashboard`**. If you're not signed in, you'll be
   sent to the login page (`/login`).
2. On the login page, use the **"Sign up" toggle** to switch to account
   creation, then sign up (email + password, or Google/GitHub).
3. You land back on the dashboard.

> Self-hosting or on a fork? Replace `vvibe.ai` with your backend's host. See
> [PROVIDER.md](./PROVIDER.md).

> If you instead see an "apply for access" screen, VVibe is in limited beta — submit the short form and you'll be emailed when you're approved.

## 2. Get your API key

1. In the dashboard, open the **API key** / API settings area.
2. Copy your key. The prefix tells you the mode:
   - `pcs_live_*` → production
   - `pcs_test_*` → sandbox
3. Treat it like a password. Never commit it or paste it into client-side code.

## 3. Make it available to your agent

Add the key to your project's environment (and confirm `.env` is gitignored):

```bash
# .env  — never commit this
VVIBE_API_KEY=pcs_live_xxxxxxxxxxxxxxxx
```

That's it — every API-key-based skill (member, email, sentry, analytics) reads
`VVIBE_API_KEY` from here.

### MCP-based skills

**vvibe-product-brain** and **vvibe-blog-writer** can work over a **Vibe MCP
connection** instead of a raw key — connect the Vibe MCP server / daemon and
the agent authenticates with its own token (no `pcs_…` key needed for the blog;
the Product Brain accepts either MCP or a key). The account in step 1 is still
the prerequisite.

## For the agent: detect a brand-new user before asking for a key

When a skill needs `VVIBE_API_KEY` (or an MCP connection) and finds **neither**,
do **not** jump straight to "paste your key" — a first-time user may not have a
VVibe account at all. Instead:

1. Ask whether they already have a VVibe account.
2. **No / unsure →** they're a brand-new user. Walk them through §1–§3 above:
   create an account first (opening `https://vvibe.ai/dashboard` while signed
   out sends them to the login page, where the "Sign up" toggle switches to
   account creation), then copy the key.
3. **Yes →** point them at the dashboard's API-key settings to copy the
   existing key.

Only once a key is in `.env` (or the MCP is connected) should the skill
proceed.
