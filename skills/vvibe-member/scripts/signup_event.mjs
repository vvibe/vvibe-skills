#!/usr/bin/env node

/**
 * VVibe — Signup Event
 *
 * Fire ONCE when someone registers in your app. Not on login, not on profile
 * update, not on deletion — VVibe does not hold a copy of your users.
 *
 * Usage (CLI):
 *   VVIBE_API_KEY=pcs_test_xxx node signup_event.mjs alice@example.com "Alice" EARLY2026
 *
 * Usage (in code):
 *   import { notifyVVibeSignup } from './signup_event.mjs'
 *   notifyVVibeSignup({ email, display_name }).catch(err =>
 *     console.error('[VVibe signup]', err))
 */

const API_KEY = process.env.VVIBE_API_KEY
const API_HOST = process.env.VVIBE_API_HOST || 'https://vvibe.ai'
const API_URL = `${API_HOST}/api/members/signup-event`

/**
 * Tell VVibe about one new registration.
 * Designed to be called as fire-and-forget:
 *   notifyVVibeSignup(data).catch(err => console.error('[VVibe signup]', err))
 */
export async function notifyVVibeSignup(signup) {
  if (!API_KEY) {
    throw new Error('VVIBE_API_KEY not set')
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: signup.email,
      display_name: signup.display_name,
      // Attribution (utm_* / referrer) goes in here — see
      // references/attribution-utm.md.
      metadata: signup.metadata,
      signup_ref_code: signup.signup_ref_code,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`VVibe signup-event failed (${res.status}): ${text}`)
  }

  return res.json()
}

// CLI mode
if (process.argv[1] && process.argv[1].endsWith('signup_event.mjs')) {
  const [, , email, displayName, refCode] = process.argv

  if (!email) {
    console.error(
      'Usage: node signup_event.mjs <email> [display_name] [signup_ref_code]'
    )
    process.exit(1)
  }

  if (!API_KEY) {
    console.error('Error: VVIBE_API_KEY environment variable is required')
    process.exit(1)
  }

  notifyVVibeSignup({
    email,
    display_name: displayName,
    signup_ref_code: refCode,
  })
    .then((result) => {
      console.log('Signup event:', JSON.stringify(result.data, null, 2))
    })
    .catch((err) => {
      console.error('Error:', err.message)
      process.exit(1)
    })
}
