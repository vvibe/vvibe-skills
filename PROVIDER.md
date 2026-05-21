# Provider Configuration

These skills target [VVibe](https://vvibe.ai)'s hosted backend by default. If you installed them from `vvibe/vvibe-skills`, no setup is needed.

This doc is for forks running against a self-hosted or compatible backend, and for contributors editing the skill content.

## TL;DR

The API host is overridable via a single environment variable:

```bash
VVIBE_API_HOST=https://your-backend.example.com
```

When unset, all scripts and generated code fall back to `https://vvibe.ai`. Direct installers see no change.

## What's overridable today

Only the **API host**. Everything else (brand name, dashboard URLs, etc.) is still hardcoded `vvibe.ai` strings in `SKILL.md` and reference docs — forks adapting to a different domain will need a `find/replace` pass.

| Concern | Override |
|---|---|
| REST API host (scripts and generated code) | `VVIBE_API_HOST` env var, default `https://vvibe.ai` |
| Hosted UI URLs (`/checkout`, `/waitlist/{slug}`, `/r/{code}`, `/dashboard/*`) | None — hardcoded in `SKILL.md` and refs as `vvibe.ai` strings |
| Brand name ("VVibe", "VVibe") | None — hardcoded in `SKILL.md` and refs |
| API key prefix (`pcs_live_`, `pcs_test_`) | None — wire-format compatibility required |

## Backend compatibility contract

To work unmodified, a fork's backend must be wire-compatible with the VVibe REST API:

- **Auth**: `Authorization: Bearer ${VVIBE_API_KEY}` on all admin endpoints.
- **Endpoints** referenced by the skills (relative to `VVIBE_API_HOST`):
  - Member sync: `/api/creator-subscription/admin/users/sync`
  - Email: `/api/creator-email/templates/{name}`, `/api/creator-email/campaigns/*`, `/api/waitlist/{slug}`
  - Click tracking: `/r/{code}` (HTTP 302 to the resolved landing page)
  - Sentry reporting: `/api/creator-subscription/health-check-reports`
- **Response shapes**: The skills assume `{ data: ... }`-wrapped responses. See `skills/vvibe-member/references/api-contract.md` for the user-sync contract.

If your backend diverges from any of the above, `VVIBE_API_HOST` alone won't be enough — you'll need to fork the skills.

## Setting `VVIBE_API_HOST`

In your shell or `.env` file:

```bash
VVIBE_API_HOST=https://your-backend.example.com
VVIBE_API_KEY=...        # the same auth token used by the default backend
```

The reference scripts that already read these vars:

- `skills/vvibe-member/scripts/sync_user.mjs`
- `skills/vvibe-sentry/scripts/report.mjs`

When generating new code, the agent should follow the same pattern:

```ts
const VVIBE_API_HOST = process.env.VVIBE_API_HOST || 'https://vvibe.ai'
```

The literal `https://vvibe.ai` strings in `SKILL.md` and reference docs are kept as the documented default — that's how the agent learns the canonical host. Forks should swap them when adapting to a different backend.

## Roadmap

Possible future work to deepen the abstraction:

- Pull brand name and dashboard URL into a single `provider.json` so a fork can rebrand without editing every `SKILL.md`.
- Split the repo into a generic upstream (`creator-commerce-skills`) and a `vvibe` profile.
