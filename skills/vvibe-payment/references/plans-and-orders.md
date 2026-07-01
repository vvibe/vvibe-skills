# Plans & Orders

Manage pricing plans and read resulting orders. Two transports, same result —
use MCP tools when the session is connected, REST otherwise.

## Amounts

**Plan amounts are in MAJOR currency units** — `10` means $10 (USD), `100`
means NT$100. NOT cents. The server converts to the smallest unit for Stripe
(×100 for normal currencies, unchanged for zero-decimal ones like JPY). The
default currency is `USD`.

## Create a plan

Fields: `name`, `billingPeriod` (`monthly` | `yearly` | `one-time`),
`pricingType` (`fixed` default, or `dynamic` = buyer names the price — requires
`one-time`), `amount` (major units; required & > 0 for fixed), `currency`
(ISO 4217, default `USD`), `description?`, `status` (`active` default).

**MCP:** `vibe_create_plan({ name, billingPeriod, amount, currency })`.
**REST:**

```bash
curl -X POST "${VVIBE_API_HOST:-https://vvibe.ai}/api/plans" \
  -H "Authorization: Bearer $VVIBE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Pro Monthly", "billingPeriod": "monthly", "amount": 10, "currency": "USD" }'
```

## Manage plans

- `vibe_list_plans` / `GET /api/plans` — list.
- `vibe_get_plan` / `GET /api/plans/{id}` — one plan.
- `vibe_update_plan` / `PATCH /api/plans/{id}` — edit (same amount rules).
- `vibe_archive_plan` — retire a plan without deleting it. Prefer this over
  leaving stale plans `active`.

## Read orders

- `vibe_list_orders` / `GET /api/orders` — completed purchases. Params:
  `mode` (`live` | `test`), `status?`, `limit?` (1–100), `startAfter?` (cursor).

Orders appear after a buyer completes checkout. The subscription row is written
by the completion webhook (see `checkout-integration.md`), so there can be a
brief gap between the buyer paying and the subscription showing up.

## Test vs live

API keys are mode-scoped (`pcs_test_*` vs `pcs_live_*`). Build and verify with
a test key first; only switch to the live key once a test purchase completes
end-to-end.
