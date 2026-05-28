# Direct Register — Land invitation clicks on your existing signup page

## When to use this

Pick this mode when the vibe coder's app already has its own register / signup
flow and you'd rather route invitation-email clicks straight to it than show
recipients a VVibe waitlist page first. This is the most common choice for
any production app with user accounts.

**Prerequisites — both are hard requirements:**

- **Outbound sync must already be wired** via the prerequisite skill
  (vvibe-member). Grep for `syncToVVibe` or `POST /api/members/sync`. If
  absent, set that up first — direct-register cannot stamp campaign
  analytics' `signedUp` without it. Install with `npx skills add vvibe/vvibe-skills --skill vvibe-member` if it's not present.
- **The app must have an existing signup flow** at a known path (e.g.
  `/signup`). This mode configures *where* clicks land; it does not create
  the signup page.

**Trade-off you must call out to the creator.** In this mode, recipients
bypass the VVibe waitlist entirely. To get the new follower into the
creator's user list and stamp the `signedUp` funnel stage, the register
flow **must** call `syncToVVibe` with `signupRefCode` set. Without that
call, the creator never sees the user and the campaign analytics'
`signedUp` and `converted` both stay at 0 — `converted` only stamps for
recipients whose `signedUp` has already been recorded.

## 1. Set `appBaseUrl` and `inviteRedirectPath`

**Vibe MCP (preferred):** call `vibe_update_brand` with both fields:

```
{ "appBaseUrl": "https://your-app.example.com", "inviteRedirectPath": "/signup" }
```

**REST fallback:**

```bash
curl -X PUT https://vvibe.ai/api/store-config \
  -H "Authorization: Bearer ${VVIBE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "appBaseUrl": "https://your-app.example.com", "inviteRedirectPath": "/signup" }'
```

`inviteRedirectPath` constraints:

- Starts with `/`. Allowed chars: letters, digits, `-`, `_`, `/` (no `?` or `#` — VVibe appends its own query string).
- Max 200 chars; trailing slashes stripped.
- Empty string clears it — the merchant falls back to the self-hosted-waitlist mode (or hosted-cta if `appBaseUrl` is also empty).

`appBaseUrl` constraints (same as the waitlist mode):

- Must be HTTPS (no `localhost` — use ngrok / Cloudflare Tunnel for dev).
- Max 255 characters.
- Trailing slashes stripped automatically.

## 2. Read attribution params on the register page

VVibe appends these query params to every redirect:

| Param | Purpose |
|---|---|
| `ref` | Referral code; pass back to `syncToVVibe` so the signup attributes to the campaign |
| `utm_source` | Always `invitation` |
| `utm_campaign` | Campaign id |
| `utm_content` | Outbox id (per-recipient identifier) |

Read these on first hit and stash them (cookie / localStorage / hidden form
field) so they survive multi-step signup.

## 3. Wire `syncToVVibe` after register

After register completes, call `syncToVVibe` (from the prerequisite
vvibe-member skill) with the new user's email + name + `signupRefCode` set
to the URL's `utm_content` (preferred — the per-recipient outbox UUID) or
`ref` as fallback.

```ts
const signupRefCode = utm_content || ref
syncToVVibe([{ email, name, signupRefCode }]).catch((err) =>
  console.error('[VVibe Sync]', err)
)
```

`converted` stamps automatically when the recipient later completes a paid
checkout in the vibe coder's payment integration — VVibe matches the
buyer's checkout email against this campaign's import list.

## 4. Verify

1. Send a test invitation email from the dashboard.
2. Click the CTA. The browser should redirect through `vvibe.ai/r/...` and land on `https://your-app.example.com{inviteRedirectPath}?ref=...&utm_source=invitation&...`.
3. Complete signup. Confirm the new user appears in the VVibe Dashboard's user list (= `syncToVVibe` ran).
4. A few minutes later, call `vibe_get_campaign_analytics` and check `signedUp ≥ 1`.

## Pitfalls

- **Wrong:** `inviteRedirectPath` includes `?` or `#`. VVibe rejects the value — it appends its own query string and the two would collide.
- **Wrong:** forgetting to call `syncToVVibe` with `signupRefCode = utm_content || ref` after register. Campaign analytics' `signedUp` stays at 0, `converted` never stamps, and the new follower never appears in the creator's user list on the dashboard.
- **Wrong:** setting `appBaseUrl` to `localhost` (or any non-HTTPS URL). VVibe enforces HTTPS — use ngrok / Cloudflare Tunnel for local dev.
- **Wrong:** switching modes (direct-register ↔ self-hosted-waitlist ↔ hosted-cta) without informing recipients in flight. The toggle propagates within ~60 seconds (VVibe's per-process cache TTL) and applies to every email already sent — recipients who haven't clicked yet land on the new destination.
