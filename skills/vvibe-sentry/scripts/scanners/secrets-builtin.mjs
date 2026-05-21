/**
 * Built-in SECRETS scanner — tier-0 fallback for the SECRETS layer.
 *
 * Walks the project working tree (no git history) and applies a curated set
 * of regex rules covering the most-likely-to-leak credentials. Designed as
 * a no-install fallback when gitleaks isn't available; gitleaks remains the
 * canonical tool for full coverage (history scan, broader rule set).
 *
 * Rules are intentionally narrow to minimize false positives. Each rule has
 * a known prefix or structural marker (Stripe `sk_live_`, AWS `AKIA`, etc.)
 * — generic "high entropy string" detection is left to gitleaks.
 *
 * Coverage gap vs gitleaks:
 *   - No git-history scan (can only catch secrets currently in the working tree)
 *   - ~20 hand-picked rules vs gitleaks' ~150
 *   - No entropy-based detection
 *
 * What this does NOT do:
 *   - Detect rotated/revoked credentials (no live-checking against issuers)
 *   - Reach into binary files, archives, or encrypted blobs
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

// Files/dirs that virtually never contain real secrets — skip to save time
// and reduce false positives.
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.turbo', '.cache', 'vendor', '__pycache__', '.venv', 'venv',
  '.pytest_cache', 'target', '.gradle', '.idea', '.vscode',
  // Skill / tool installation dirs. They contain example tokens in docs
  // (e.g. `pcs_live_xxxx`) that would generate spurious findings — they're
  // never the user's app code.
  '.agents', '.claude', '.cursor',
])
// Skip binaries, lockfiles, and cert/key files. Cert files specifically would
// trip the PEM private-key rule on sample certificates / test fixtures —
// real leaked keys land in source code, not in .pem next to .crt fixtures.
const SKIP_FILES = /\.(lock|lockb|min\.js|map|svg|png|jpe?g|gif|ico|webp|woff2?|ttf|eot|pdf|zip|tar|gz|wasm|jar|class|so|dylib|dll|pem|crt|cer|key|p12|pfx)$/i
// Cap file size — secrets in 10MB+ files are vanishingly rare and reading
// them dominates runtime.
const MAX_FILE_BYTES = 1_000_000

/**
 * Curated secret rules. `severity` matches the orchestrator's three-tier
 * scheme. `keywords` (when present) speeds up scanning — we only run the
 * regex if at least one keyword appears in the file.
 *
 * IMPORTANT: keep this list in sync with scripts/gitleaks-rules.toml where
 * patterns overlap, so behaviour is consistent across tier-0 and tier-2.
 */
const RULES = [
  // ─ Cloud / IAM ─────────────────────────────────────────────────────────
  {
    id: 'aws-access-key',
    description: 'AWS access key ID',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
    severity: 'CRITICAL',
  },
  {
    id: 'aws-secret-key',
    description: 'AWS secret access key (heuristic — must be next to access key)',
    // Loose: 40-char base64-ish near an `aws_secret` or similar marker.
    regex: /(?:aws[_-]?secret[_-]?access[_-]?key|aws_secret_key)\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/i,
    severity: 'CRITICAL',
    keywords: ['aws_secret', 'aws-secret'],
  },
  {
    id: 'gcp-service-account',
    description: 'GCP service-account JSON private key',
    regex: /"type"\s*:\s*"service_account"[\s\S]{0,500}"private_key"\s*:\s*"-----BEGIN/,
    severity: 'CRITICAL',
    keywords: ['service_account', 'private_key'],
  },

  // ─ Source-host tokens ──────────────────────────────────────────────────
  {
    id: 'github-pat',
    description: 'GitHub personal access token (classic or fine-grained)',
    regex: /\bgh[pousr]_[A-Za-z0-9]{36,251}\b/,
    severity: 'CRITICAL',
    keywords: ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'],
  },
  {
    id: 'gitlab-pat',
    description: 'GitLab personal access token',
    regex: /\bglpat-[A-Za-z0-9_-]{20}\b/,
    severity: 'CRITICAL',
    keywords: ['glpat-'],
  },

  // ─ Payment / commerce ──────────────────────────────────────────────────
  {
    id: 'stripe-live',
    description: 'Stripe live secret key',
    regex: /\bsk_live_[A-Za-z0-9]{20,}\b/,
    severity: 'CRITICAL',
    keywords: ['sk_live_'],
  },
  {
    id: 'stripe-test',
    description: 'Stripe test secret key',
    regex: /\bsk_test_[A-Za-z0-9]{20,}\b/,
    severity: 'WARNING',
    keywords: ['sk_test_'],
  },
  {
    id: 'stripe-publishable-live',
    description: 'Stripe live publishable key (lower risk but still leaked)',
    regex: /\bpk_live_[A-Za-z0-9]{20,}\b/,
    severity: 'WARNING',
    keywords: ['pk_live_'],
  },

  // ─ AI / LLM ────────────────────────────────────────────────────────────
  {
    id: 'openai-key',
    description: 'OpenAI API key',
    // Negative lookahead `(?!ant-)` so Anthropic keys (sk-ant-*) don't double-match.
    regex: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
    severity: 'CRITICAL',
    keywords: ['sk-'],
  },
  {
    id: 'anthropic-key',
    description: 'Anthropic API key',
    regex: /\bsk-ant-(?:api|admin)[0-9]+-[A-Za-z0-9_-]{20,}\b/,
    severity: 'CRITICAL',
    keywords: ['sk-ant-'],
  },
  {
    id: 'google-api-key',
    description: 'Google API key',
    regex: /\bAIza[A-Za-z0-9_-]{35}\b/,
    severity: 'CRITICAL',
    keywords: ['AIza'],
  },

  // ─ Messaging / comms ───────────────────────────────────────────────────
  {
    id: 'slack-token',
    description: 'Slack token',
    regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
    severity: 'CRITICAL',
    keywords: ['xoxb-', 'xoxa-', 'xoxp-', 'xoxr-', 'xoxs-'],
  },
  {
    id: 'sendgrid-key',
    description: 'SendGrid API key',
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/,
    severity: 'CRITICAL',
    keywords: ['SG.'],
  },
  {
    id: 'twilio-key',
    description: 'Twilio API key (SK followed by 32 hex)',
    regex: /\bSK[0-9a-f]{32}\b/,
    severity: 'CRITICAL',
    keywords: ['SK'],
  },

  // ─ Private keys ────────────────────────────────────────────────────────
  {
    id: 'private-key-pem',
    description: 'PEM-encoded private key (RSA/EC/OpenSSH/PGP)',
    regex: /-----BEGIN (RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/,
    severity: 'CRITICAL',
    keywords: ['-----BEGIN'],
  },

  // ─ VVibe-specific (mirror gitleaks-rules.toml) ─────────────────────────
  {
    id: 'vvibe-live-api-key',
    description: 'VVibe live API key',
    regex: /\bpcs_live_[A-Za-z0-9_-]{12,}\b/,
    severity: 'CRITICAL',
    keywords: ['pcs_live_'],
  },
  {
    id: 'vvibe-test-api-key',
    description: 'VVibe test API key',
    regex: /\bpcs_test_[A-Za-z0-9_-]{12,}\b/,
    severity: 'WARNING',
    keywords: ['pcs_test_'],
  },
  {
    id: 'vvibe-env-leak',
    description: 'VVIBE_API_KEY hardcoded into source',
    regex: /VVIBE_API_KEY\s*=\s*['"][A-Za-z0-9_-]{12,}['"]/,
    severity: 'CRITICAL',
    keywords: ['VVIBE_API_KEY'],
  },
]

/**
 * Walk projectDir, scan all text files, return finding objects.
 * Findings shape: { id, severity, description, file, line, masked }
 */
export async function runBuiltinSecretsScan(projectDir) {
  const findings = []
  let scanned = 0

  async function walk(dir) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const path = join(dir, e.name)
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue
        await walk(path)
        continue
      }
      if (!e.isFile()) continue
      if (SKIP_FILES.test(e.name)) continue
      let info
      try {
        info = await stat(path)
      } catch {
        continue
      }
      if (info.size > MAX_FILE_BYTES) continue
      let content
      try {
        content = await readFile(path, 'utf8')
      } catch {
        continue
      }
      // Heuristic: skip binary-ish files (null bytes within the first KB).
      if (content.slice(0, 1024).includes('\0')) continue
      scanned++
      scanFileContent(content, path, projectDir, findings)
    }
  }

  await walk(projectDir)
  return { findings, scanned }
}

function scanFileContent(content, fullPath, projectDir, findings) {
  for (const rule of RULES) {
    // Fast-path: if rule has keywords and none appear, skip the regex.
    if (rule.keywords && !rule.keywords.some((k) => content.includes(k))) continue
    let match
    // Find all matches by repeatedly slicing past the last hit. We use a
    // fresh non-sticky regex copy each time to avoid `lastIndex` confusion.
    const re = new RegExp(rule.regex.source, rule.regex.flags.includes('g') ? rule.regex.flags : rule.regex.flags + 'g')
    while ((match = re.exec(content)) !== null) {
      const idx = match.index
      const line = content.slice(0, idx).split('\n').length
      const masked = mask(match[0])
      findings.push({
        id: rule.id,
        severity: rule.severity,
        description: rule.description,
        file: relative(projectDir, fullPath) || fullPath,
        line,
        masked,
      })
      // Avoid infinite loops on zero-width matches.
      if (match.index === re.lastIndex) re.lastIndex++
    }
  }
}

/** Redact the middle of a secret — keep 4 char head and tail for diagnostics. */
function mask(s) {
  if (s.length <= 12) return `${s.slice(0, 2)}***${s.slice(-2)}`
  return `${s.slice(0, 4)}***${s.slice(-4)}`
}
