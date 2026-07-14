/**
 * ga4-mp-purchase-example.mjs
 *
 * Reference implementation for sending a server-side GA4 `purchase` event via
 * the Measurement Protocol (MP). Use this from a payment webhook /
 * `vvibe_checkout_complete` server callback when you cannot rely on the browser
 * to fire the purchase (e.g. the buyer closed the tab on the success page).
 *
 * Canonical contract: references/event-tracking-contract.md
 *   - `vvibe_checkout_complete` → GA4 `purchase`
 *   - Deduplication: GA4 has NO generic per-event dedup field, so `purchase`
 *     dedups on `transaction_id`. The client-side purchase and THIS server-side
 *     purchase MUST send the SAME `transaction_id` (= the VVibe `session_id`),
 *     or GA4 will double-count the sale.
 *
 * Prerequisites:
 *   - GA4 Measurement ID (G-XXXXXXX)
 *   - Measurement Protocol API secret:
 *       GA4 Admin → Data Streams → (your stream) → Measurement Protocol API
 *       secrets → Create. Keep it server-side; never expose it to the browser.
 *
 * Env:
 *   GA4_MEASUREMENT_ID=G-XXXXXXX
 *   GA4_MP_API_SECRET=xxxxxxxxxxxxxxxxxxxx
 */

const GA4_MEASUREMENT_ID = process.env.GA4_MEASUREMENT_ID;
const GA4_MP_API_SECRET = process.env.GA4_MP_API_SECRET;

// ---------------------------------------------------------------------------
// client_id — the hard part of server-side GA4
// ---------------------------------------------------------------------------

/**
 * GA4 stitches server-side hits to the same user/session ONLY if they carry the
 * SAME `client_id` the browser used. The browser's client_id lives in the `_ga`
 * cookie, formatted `GA1.1.<client_id_part1>.<client_id_part2>` — the client_id
 * GA4 wants is the last two dot-separated segments joined by a dot:
 * `<part1>.<part2>` (e.g. `_ga=GA1.1.1234567890.1680000000` → `1234567890.1680000000`).
 *
 * Capture the `_ga` cookie on the checkout request (it is sent with same-site
 * requests to your own domain) and pass it through to your payment webhook —
 * e.g. stash it in the checkout session metadata — so this server call can reuse
 * it. Parse it with the helper below.
 *
 * @param {string | undefined} gaCookie - raw `_ga` cookie value
 * @returns {string | null} GA4 client_id, or null if it can't be parsed
 */
export function clientIdFromGaCookie(gaCookie) {
  if (!gaCookie) return null;
  // `_ga` = GA1.1.1234567890.1680000000  →  1234567890.1680000000
  const parts = gaCookie.split('.');
  if (parts.length < 4) return null;
  return `${parts[2]}.${parts[3]}`;
}

/**
 * Fallback when the `_ga` cookie is missing (buyer blocked cookies, checkout
 * happened out-of-band, etc.).
 *
 * DECISION — pick ONE, deliberately:
 *   (a) Derive a STABLE synthetic client_id from the user id, so repeat purchases
 *       from the same user land on one pseudo-client. This keeps revenue counted
 *       but the session will NOT stitch to the user's real web session (attribution
 *       / source data will be missing for this hit).
 *   (b) SKIP the MP send entirely and rely on the client-side purchase only.
 *       Choose this if attribution integrity matters more than catching the
 *       tab-closed edge case.
 *
 * This reference uses (a). Document whichever you choose so the dedup story stays
 * honest: the synthetic id must be STABLE per user or you will double-count.
 *
 * @param {string} userId
 * @returns {string} synthetic client_id
 */
export function fallbackClientId(userId) {
  // Stable, deterministic pseudo-client_id namespaced so it can't collide with a
  // real `_ga` client_id. Same userId → same value → dedup + revenue stay correct.
  return `vvibe.${userId}`;
}

// ---------------------------------------------------------------------------
// Send a purchase
// ---------------------------------------------------------------------------

/**
 * Send a GA4 `purchase` via the Measurement Protocol.
 *
 * @param {object} opts
 * @param {string} [opts.gaCookie]   - raw `_ga` cookie forwarded from checkout
 * @param {string} opts.userId       - VVibe user id (for user_id + fallback client_id)
 * @param {string} opts.sessionId    - VVibe checkout session id → transaction_id (dedup key)
 * @param {number} opts.value        - purchase amount
 * @param {string} opts.currency     - ISO 4217 currency code
 * @param {string} opts.planId       - VVibe plan id
 * @param {string} [opts.planName]   - human-readable plan name
 */
export async function sendGa4Purchase({
  gaCookie,
  userId,
  sessionId,
  value,
  currency,
  planId,
  planName,
}) {
  if (!GA4_MEASUREMENT_ID || !GA4_MP_API_SECRET) {
    throw new Error(
      'GA4_MEASUREMENT_ID and GA4_MP_API_SECRET must be set for server-side GA4.',
    );
  }

  const clientId = clientIdFromGaCookie(gaCookie) ?? fallbackClientId(userId);

  const endpoint =
    `https://www.google-analytics.com/mp/collect` +
    `?measurement_id=${GA4_MEASUREMENT_ID}` +
    `&api_secret=${GA4_MP_API_SECRET}`;

  const body = {
    client_id: clientId,
    user_id: userId, // login-time user id (see Identity in the contract)
    events: [
      {
        name: 'purchase',
        params: {
          // transaction_id is the GA4 dedup key for purchases — MUST match the
          // client-side purchase's transaction_id (= VVibe session_id).
          transaction_id: sessionId,
          currency,
          value,
          items: [
            {
              item_id: planId,
              item_name: planName,
              price: value,
              quantity: 1,
            },
          ],
        },
      },
    ],
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // MP returns 204 on success and does NOT validate the payload. Use the
  // Measurement Protocol Validation Server during development:
  //   https://www.google-analytics.com/debug/mp/collect?...
  if (!res.ok) {
    throw new Error(`GA4 MP send failed: HTTP ${res.status}`);
  }
}
