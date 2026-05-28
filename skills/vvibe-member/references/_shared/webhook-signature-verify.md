# Shared reference — verify a VVibe webhook signature

Loaded by `inbound-webhook.md`. The same verification logic also applies anywhere a VVibe-signed payload arrives — keep it here so future events that piggyback the envelope reuse one verified pattern.

## Wire format

VVibe sends two headers with every POST:

```http
X-VVibe-Signature: t=1715000000,v1=<lowercase-hex-hmac>
X-VVibe-Timestamp: 1715000000
```

Where `v1=<hex>` is `HMAC-SHA256(webhook_secret, "${timestamp}.${raw_body}")` encoded as lowercase hexadecimal.

## Canonical verification — five steps

Apply these in order. Any failure → return HTTP `401` and do NOT process the body.

1. **Read the raw body as bytes.** Decode as UTF-8 if your framework demands a string. Do NOT call `JSON.parse(body)` before computing the HMAC; even a whitespace-equivalent re-serialise breaks the signature.
2. **Parse `X-VVibe-Signature`.** Tolerate `v1=` and `t=` in either order. Hex must match `/^[a-f0-9]+$/i`.
3. **Check the 5-minute replay window.** `abs(now_seconds - t) > 300` → reject. The window prevents an attacker who got the body + signature from replaying months later.
4. **Recompute the HMAC.** `HMAC-SHA256(secret, "${t}.${raw_body}")`, lowercase hex.
5. **Compare in constant time.** Bytewise — even tiny timing leaks let an attacker iterate the hex. Use your language's `timing_safe_equal` / `hmac.compare_digest` / equivalent.

## Pitfalls

- **Re-serialising the body.** ORM middleware, request loggers, and some auth libraries reserialise JSON bodies before they reach your handler. The signature only validates the bytes VVibe signed, which is the literal request body. If your framework gives you `req.body` as parsed JSON, find the raw-bytes equivalent (Next.js App Router: `req.text()`; Express: `express.raw()`; FastAPI: `await request.body()`).
- **Skipping the replay window.** Without it, a leaked signature works forever — a database breach of historic VVibe deliveries plus the secret = unlimited replay.
- **Non-constant-time compare.** `==` or `===` short-circuits on the first mismatching byte. An attacker measuring the response time can binary-search the signature byte-by-byte.
- **Wrong hash function.** SHA-256, not SHA-1, not SHA-512. Match VVibe exactly.
- **Wrong encoding of the signature.** Lowercase hex, not base64. If your library outputs base64 by default, convert.

## Language-neutral pseudocode

```text
fn verify(secret: bytes, headers: map, raw_body: bytes) -> Result:
  sig = headers.get("X-VVibe-Signature") or fail("missing")
  parts = parse(sig)              # parts.t (int), parts.v1 (hex string)
  if abs(now_seconds() - parts.t) > 300:
      fail("stale")
  signed_payload = bytes("{parts.t}.") + raw_body
  expected_hex = hmac_sha256(secret, signed_payload).hex().lower()
  if not constant_time_eq(expected_hex.bytes, parts.v1.bytes):
      fail("mismatch")
  return ok()
```

## Test vectors

Use these to confirm your implementation matches VVibe byte-for-byte before pointing at production:

```text
secret    = "whsec_live_test-vector-secret-do-not-use-in-prod"
timestamp = 1715000000
raw_body  = '{"event_id":"evt_2026_05_28_aaaaaaaaaaaaaaaaaaaaaa","event_type":"member.created"}'

expected v1 (hex) = compute HMAC-SHA256(secret, "1715000000." + raw_body)
                  = "9a3b…" (compute in your tooling and pin in your test)
```

Run your verify function against the same inputs in isolation. Capturing the expected hex once in a fixture lets your unit tests fail loudly if a future refactor breaks the canonicalisation (e.g. someone "fixes" the missing trailing newline and shifts every signature).
