# Outbound Sync — Push users from the creator's app to VVibe

## When to use this

Use this reference when the creator's system is the source of truth for users and you need to **push** that data into VVibe so it surfaces in the Dashboard at `https://vvibe.ai/dashboard/members`. Covers initial backfill plus incremental hooks on registration, login, profile update, and deletion. If you are reading users back out of VVibe, or receiving events from VVibe, you are in the wrong mode — return to the routing SKILL.md. For exact wire shapes (request/response fields, status codes, errors) see [./api-contract.md](./api-contract.md).

## 1. Consent

Before anything else, the AI agent **must ask the human user** for explicit consent. Present the following and **wait for the user's response** before moving to Step 2:

> This skill will sync your system's users to VVibe, so creators can see their users and subscription status in the VVibe Dashboard.
>
> This involves modifying your codebase:
> 1. Reading your user model to map fields to VVibe's schema
> 2. Adding automatic sync hooks to your registration, login, update, and deletion flows
> 3. Running a one-time backfill of your existing users — done either by me directly or via a one-off script you run after deploy, no UI button needed
>
> Would you like to proceed?

**Do NOT continue until the user explicitly agrees.** If they decline, stop here — do not proceed to any subsequent step.

## 2. Map user schema

**Read the user model first** (DB schema, ORM model, or type definition), then build a mapping table: their field → VVibe field. Ask if any fields are missing.

| VVibe field | Type | Req | Description |
|---|---|---|---|
| `email` | string | Yes | Dedup key (unique per profile + api_key) |
| `external_user_id` | string | No | Vibe coder's internal user ID |
| `display_name` | string | No | User display name |
| `status` | enum | No | `active` (default), `deleted` (removes the user) |
| `role` | string | No | User role (e.g. `admin`, `member`, `viewer`) |
| `plan_name` | string | No | Vibe coder's own plan label (not VVibe subscription) |
| `last_login_at` | ISO 8601 | No | Last login timestamp (e.g. `2026-04-15T08:30:00.000Z`) |
| `created_at` | ISO 8601 | No | Registration timestamp in the vibe coder's system |
| `metadata` | object | No | Arbitrary key-value data (max 10KB) |
| `signup_ref_code` | string | No | Discount/referral code captured at registration (e.g. `?ref=EARLY2026`). Checkout application depends on the payment integration. **First-write-wins** — subsequent syncs cannot overwrite. |

**How to map:** Only map fields that exist. `email` is the only required field. Fields that don't fit core schema → `metadata`. To delete a user, sync `status: "deleted"`.

## 3. Confirm API key & pick initial sync approach

Settle two things before writing code. Do not proceed to Step 4 until both are resolved.

### 3a — Confirm `VVIBE_API_KEY` is available

Both Step 4 (incremental hooks) and Step 5 (initial backfill) depend on `VVIBE_API_KEY`. Check local env files (`.env`, `.env.local`, `.env.development`, framework env config) for an existing key. If found, confirm with the user it's the right key for the target environment (`pcs_test_*` → test, `pcs_live_*` → production). If not found, ask the user to grab it from `https://vvibe.ai/dashboard` and paste it; save to the appropriate local env file.

**Stop here if the key isn't available.** Tell the user to re-run once they have one.

### 3b — Pick the initial sync path

Ask the user where their real users live. Use this prompt verbatim (translate to the conversation's language):

> The initial sync needs to push every existing user to VVibe once. I can do this in one of two ways:
>
> - **Option A — I run it now from your local environment.** I read users from the database your local code is connected to and call the VVibe API directly. Pick this if your local DB has the users you want synced (e.g. you develop directly against production, or you've already loaded prod data locally).
> - **Option B — I generate a one-time script you run on production after deploy.** I create `scripts/sync-vvibe-once.mjs` (or `.ts`). After you deploy with `VVIBE_API_KEY` set, you run the script once on the production environment. Pick this if your dev DB and prod DB are separate.
>
> Which one fits your setup?

**Wait for the user's choice before continuing.** Step 5 branches on this answer.

## 4. Add sync helper & incremental hooks

Add `syncToVVibe`, then wire it into the framework's user lifecycle hooks. Same helper is reused by the Step 5 initial sync.

### Batch sync helper

Generate based on the Step 2 mapping — only include fields the system actually has:

```typescript
const VVIBE_API_KEY = process.env.VVIBE_API_KEY
const VVIBE_API_HOST = process.env.VVIBE_API_HOST || 'https://vvibe.ai'

async function syncToVVibe(users: Array<{
  email: string;
  id?: string | number;       // → external_user_id
  name?: string;              // → display_name
  role?: string;              // → role
  planName?: string;          // → plan_name
  lastLoginAt?: Date | null;  // → last_login_at (ISO 8601)
  createdAt?: Date | null;    // → created_at (ISO 8601)
  status?: string;            // → status ('active' or 'deleted')
  metadata?: Record<string, unknown>;
  signupRefCode?: string;     // → signup_ref_code (only on initial registration sync)
}>) {
  const BATCH_SIZE = 100
  const results = { synced: 0, created: 0, updated: 0, errors: [] as any[] }

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE)
    const payload = batch.map(user => ({
      email: user.email,
      external_user_id: user.id != null ? String(user.id) : undefined,
      display_name: user.name,
      role: user.role,
      plan_name: user.planName,
      last_login_at: user.lastLoginAt?.toISOString(),
      created_at: user.createdAt?.toISOString(),
      status: user.status || 'active',
      metadata: user.metadata,
      signup_ref_code: user.signupRefCode,
    }))

    try {
      const res = await fetch(
        `${VVIBE_API_HOST}/api/members/sync`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${VVIBE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ users: payload }),
        }
      )

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10)
        await new Promise(r => setTimeout(r, retryAfter * 1000))
        i -= BATCH_SIZE // retry this batch
        continue
      }

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`API error ${res.status}: ${text}`)
      }

      const { data } = await res.json()
      results.synced += data.synced
      results.created += data.created
      results.updated += data.updated
      results.errors.push(...data.errors)
    } catch (err) {
      results.errors.push({ batch: i / BATCH_SIZE + 1, reason: String(err) })
    }
  }

  return results
}
```

**Place in a shared module** — e.g. `lib/vvibe-member-sync.ts`. Both incremental hooks below and the Step 5 initial sync import from here. Handles single-user (array of one) and bulk batches the same way.

### Insert incremental hooks

Use the framework's **hooks / event system** (Payload `afterChange`, Prisma middleware, Mongoose post-save, etc.). The helper only calls the **VVibe external API** — never the app's own API. **Critical: all sync calls MUST be fire-and-forget.** A VVibe outage must never break the creator's signup/login.

```typescript
// ✅ Correct — main flow owns its own error path; sync runs detached, errors only logged
try {
  await createUser(userData) // main business logic — may fail, return 500
} catch (err) {
  return res.status(500).json({ error: 'Registration failed' })
}
syncToVVibe([userData]).catch(err => console.error('[VVibe Sync]', err))

// ❌ Wrong — a VVibe outage would cascade into registration failure
await createUser(userData)
await syncToVVibe([userData])
```

**Where to insert sync calls — pass all mapped fields at each hook point:**

- **User registration** — after successful signup, sync the new user. **If the form or URL carried a referral / promo parameter (e.g. `?ref=EARLY2026`, `?code=`, `?promo=`, `?coupon=`), pass it as `signup_ref_code`.** Recorded regardless of whether a matching discount exists — checkout application is the payment integration's job. **First-write-wins**: later syncs with a different code are dropped with `errors: [{ reason: 'signup_ref_code_already_recorded' }]`.
- **Profile update** — after successful save, sync updated fields.
- **Login** — call sync in the framework's auth hook (Payload `afterLogin`, NextAuth `events.signIn`, Supabase auth webhooks, Django/Flask-Login `user_logged_in`) with `last_login_at: new Date().toISOString()` — no need to persist in the creator's DB.
- **Account deletion** — sync with `status: "deleted"` to remove from VVibe.
- **Waitlist signup** — if the merchant uses `vvibe-email` in self-hosted mode (Mode B), after POST to `/api/waitlist` succeeds call `syncToVVibe([{ email, name, status: 'active' }])` fire-and-forget.

## 5. Run initial sync

> **Heads up — VVibe may auto-send welcome emails on this sync.** When `syncToVVibe` upserts a user, VVibe fires a `welcome_free` (or `welcome_paid` if the user has an active subscription) email by default. If the vibe coder's app already sends its own welcome flow, **disable the matching template before running the initial sync**, or the backfill will explode into one duplicate email per existing user. To disable: `GET /api/email/templates/welcome_free` to fetch the current template, then `PUT` the same payload back with `enabled: false` (the endpoint validates `subject`, `greeting`, and `body` as required non-empty strings — you cannot send `{ enabled: false }` alone). Same flow for `welcome_paid`. See the `vvibe-email` skill for details.

Branch on the path picked in Step 3b.

### Option A — Run from local now

Agent does the backfill directly — no UI, no extra route.

1. Read all users via the framework's Local API or ORM (Payload `payload.find({ collection: 'users', limit: 10000 })`, Prisma `prisma.user.findMany()`, Supabase `supabase.from('users').select()`, Mongoose `User.find()`, Drizzle `db.select().from(users)`). **Do NOT** call the app's own HTTP API or install raw DB drivers.
2. Map per Step 2; import `syncToVVibe` from the shared module (Step 4) and call it — the helper handles batching, 429 backoff, and errors.
3. Print `{ synced, created, updated, errors }`. If `errors` is non-empty, surface and offer to retry.

Run via `node`, `tsx`, or whatever ad-hoc runner the project uses. For tens of thousands of users, warn it may take a while (see Guardrails for pacing).

### Option B — Generate a one-time script

Create `scripts/sync-vvibe-once.mjs` (or `.ts` if TypeScript-first). The script must:

- Import `syncToVVibe` from the shared module — do not duplicate the helper inline
- Read all users via the same framework ORM/Local API as Option A
- Map per Step 2, call `syncToVVibe(users)`, print `{ synced, created, updated, errors }`, exit non-zero if `errors` is non-empty
- Read `VVIBE_API_KEY` and `VVIBE_API_HOST` from the environment (do not hardcode)

Then tell the user, verbatim (translate to the conversation's language):

> The script is at `scripts/sync-vvibe-once.mjs`. After you set `VVIBE_API_KEY` in production and deploy, run it once on the production environment:
>
>     VVIBE_API_KEY=pcs_live_xxx node scripts/sync-vvibe-once.mjs
>
> You only need to run it once. After that, the incremental hooks added in Step 4 keep VVibe in sync automatically. Re-run only if data drifts (e.g. a previous sync failed, or the DB was modified outside the app).

## 6. Verify & done

### 6a — Endpoint checklist

Review the codebase and present this per-lifecycle-event checklist:

```
## VVibe Sync Endpoint Checklist
✅ / ❌ User registration — {file:line} | Reason: {why}
✅ / ❌ User login (update last_login_at) — {file:line} | Reason: {why}
✅ / ❌ User profile update — {file:line} | Reason: {why}
✅ / ❌ User deletion (status: "deleted") — {file:line} | Reason: {why}
```

Use ✅ if a fire-and-forget `syncToVVibe` call exists; ❌ otherwise (explain why — e.g. "system has no deletion feature" or "endpoint is missing sync, needs to be added"). If a hook is missing and should exist, **add it** before continuing.

### 6b — Next steps & done

Tell the user the integration is complete, then present these action items. Item 3 only applies for Step 3b Option B — omit for Option A.

1. **Set environment variables** in production/staging (API key at `https://vvibe.ai/dashboard`; `pcs_test_*` → test, `pcs_live_*` → production):
   ```
   VVIBE_API_HOST=https://vvibe.ai
   VVIBE_API_KEY=pcs_live_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
2. **Deploy your application** — incremental sync hooks only fire after deployment.
3. **Run the one-time backfill** on production after deploy:
   ```
   VVIBE_API_KEY=pcs_live_xxx node scripts/sync-vvibe-once.mjs
   ```

Then explain: after the initial sync, **no manual action is needed for daily use.** Re-run only if data drifts (a previous sync failed, or the DB was modified outside the app). Verify at `https://vvibe.ai/dashboard/members`.

## Guardrails

- **Fire-and-forget**: Sync calls MUST be non-blocking — never let a VVibe failure break core business flow.
- **Batch limit**: Max 100 users per call; split larger batches.
- **Dedup key**: `UNIQUE(profile_id, api_key_id, email)` — duplicate pushes safely upsert.
- **Metadata limit**: 10KB per user.
- **Pacing**: No rate limit in v1, but recommend 200ms delay between batches for bulk migration.
- **Mode isolation**: `pcs_test_*` and `pcs_live_*` data are completely separate.
- **Sync logs**: Every call is logged VVibe-side; creators view history and errors in the Dashboard.

## Pitfalls

- **Fire-and-forget violations.** `await syncToVVibe(...)` in the main request path lets a VVibe outage break signup/login. Detach with `.catch(...)`.
- **Forgot to disable VVibe welcome email before backfill.** Running initial sync with `welcome_free` / `welcome_paid` enabled spams every existing user. Disable both first (Step 5 heads-up), then backfill.
- **Hardcoded host URL.** Always read `process.env.VVIBE_API_HOST` with default `https://vvibe.ai` — never hardcode the full sync URL.
- **Calling the app's own HTTP API from the backfill.** Use the framework's Local API / ORM, not `fetch('/api/users')`.
- **Two copies of the sync helper.** Keep one shared module; import from both registration handler and one-time script.
- **Mixing `signup_ref_code` with later syncs.** First-write-wins. Pass on registration only; later syncs leave it `undefined`.
