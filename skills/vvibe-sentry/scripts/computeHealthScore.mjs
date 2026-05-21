/**
 * Score model for vvibe-sentry 0.1.0 (OSS-orchestrator rewrite).
 *
 * The score is `max(0, 100 - total)` where total is the sum of per-
 * finding deductions:
 *
 *   - CRITICAL costs 12 (a single one drops below "good")
 *   - WARNING  costs 3
 *   - INFO     costs 1
 *
 * If any CRITICAL exists, the score is additionally capped at 59 so the
 * band can never read higher than "needs attention" while a real exploit
 * is in play.
 *
 * Bands:
 *   90-100 = excellent
 *   75-89  = good
 *   60-74  = needs attention
 *    0-59  = not ready
 */

export const HEALTH_DEDUCTION = {
  critical: 12,
  warning: 3,
  info: 1,
}

const CRITICAL_CAP = 59

export function computeHealthScore({ critical = 0, warning = 0, info = 0 } = {}) {
  const total =
    critical * HEALTH_DEDUCTION.critical +
    warning * HEALTH_DEDUCTION.warning +
    info * HEALTH_DEDUCTION.info
  let score = Math.max(0, 100 - total)
  if (critical > 0 && score > CRITICAL_CAP) score = CRITICAL_CAP
  return score
}

export function healthBand(score) {
  if (score >= 90) return 'excellent'
  if (score >= 75) return 'good'
  if (score >= 60) return 'needs-attention'
  return 'not-ready'
}

export function healthBandLabel(score) {
  const band = typeof score === 'string' ? score : healthBand(score)
  switch (band) {
    case 'excellent': return 'excellent'
    case 'good': return 'good'
    case 'needs-attention': return 'needs attention'
    case 'not-ready': return 'not ready'
    default: return String(band)
  }
}
