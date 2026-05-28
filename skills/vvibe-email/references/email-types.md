# Email Types Reference

VVibe ships two distinct email categories: built-in system emails fired on subscription-lifecycle events, and follower-flow emails tied to the invitation / waitlist loop. This file is the catalog. Load it when the user asks about disabling templates, customizing welcome / cancellation emails, or avoiding double-sends when their own app also emails users.

## 1. Built-in system emails (3)

Auto-fired on subscription-lifecycle events. One shared template per merchant — the creator edits subject/body or toggles `enabled` via `vibe_update_template`.

| Template type | Triggered by | Common reason to disable |
|---|---|---|
| `welcome_free` | `POST /members/sync` upserts a user with no active subscription | The vibe coder's app already sends its own welcome email |
| `welcome_paid` | Payment callback (status `completed`), or sync that adds an active subscription | The vibe coder customizes the upgrade email in their own product |
| `subscription_canceled` | `POST /subscriptions/{id}/cancel`, or self-service portal cancel | The vibe coder wants control over cancellation timing/copy |

Disable from the dashboard, via the Vibe MCP `vibe_update_template` tool (preferred — handles read-modify-write), or via REST. **The REST PUT handler requires `subject`, `greeting`, and `body` as non-empty strings**, so you cannot send `{ "enabled": false }` alone — you must GET the current template, mutate `enabled`, and PUT the full payload back:

```bash
# 1. GET current template
curl -s "${VVIBE_API_HOST:-https://vvibe.ai}/api/email/templates/welcome_free" \
  -H "Authorization: Bearer ${VVIBE_API_KEY}" > /tmp/welcome_free.json

# 2. Set enabled=false (using jq), then PUT the full payload
jq '.data | .enabled = false' /tmp/welcome_free.json | curl -X PUT \
  "${VVIBE_API_HOST:-https://vvibe.ai}/api/email/templates/welcome_free" \
  -H "Authorization: Bearer ${VVIBE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @-
```

Disabling takes effect immediately for new triggers; already-enqueued outbox rows still send. See §4 below for the validation contract.

## 2. Follower-flow emails (2)

Tied to the invitation / waitlist loop. Body source differs:

| Template type | When it sends | Where the body comes from | Mode |
|---|---|---|---|
| `follower_invitation` | When `vibe_send_campaign` dispatches a campaign | **Per-campaign** — saved on the campaign record by `vibe_create_campaign` / `vibe_update_campaign`. A `follower_invitation` template also exists in `vibe_list_templates`, but it's only used to seed the very first "Invitation" campaign at brand onboarding — editing it later has no effect on subsequent campaigns. | A / B / C |
| `waitlist_onboarding` | When a follower POSTs to `/api/waitlist/{slug}` after clicking an invitation | Per-merchant template (editable via `vibe_update_template`, like the system emails above) | A / B only — Mode C skips this endpoint |

## 3. Avoiding double emails

If the vibe coder has their own welcome / upgrade / cancellation flow, disable the matching VVibe template *before* wiring the trigger that would fire it. The two common pitfalls:

- **Before backfilling members.** Disable `welcome_free` before the first `syncToVVibe` bulk sync. Otherwise that sync sends a VVibe `welcome_free` to every existing user the creator already onboarded — usually duplicating an email those users received months ago.
- **Before wiring the payment callback.** Disable `welcome_paid` and/or `subscription_canceled` before the creator's checkout-completion or cancellation handler calls into VVibe. Otherwise every successful checkout sends a `welcome_paid` on top of the vibe coder's own upgrade message, and every cancel fires a duplicate cancellation notice.

Order matters: toggle the template first, *then* wire the trigger. Disabling after the fact doesn't claw back already-enqueued emails.

## 4. Where templates are edited

Three equivalent surfaces, same underlying record:

- **Vibe Dashboard (UI).** `vvibe.ai/dashboard` → Emails. Best for editing copy interactively.
- **REST endpoint.** `GET /api/email/templates/{name}` to read, `PUT /api/email/templates/{name}` to update. The PUT handler validates `subject`, `greeting`, and `body` as required non-empty strings — you cannot send `{ "enabled": false }` alone. To toggle `enabled`, include the current subject/greeting/body in the same payload (GET first, mutate, PUT back).
- **Vibe MCP tool.** `vibe_update_template` — same validation rules, but the tool composes the read-modify-write for you. Preferred when an agent is driving.

The `{name}` path segment is the template type exactly as listed in §1 / §2 (`welcome_free`, `welcome_paid`, `subscription_canceled`, `follower_invitation`, `waitlist_onboarding`).
