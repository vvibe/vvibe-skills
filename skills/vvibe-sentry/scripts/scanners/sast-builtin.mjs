/**
 * Built-in SAST scanner — tier-0 fallback for the SAST layer.
 *
 * Pattern-matches a curated set of high-impact dangerous patterns across
 * JS/TS/Python/Go/PHP/Ruby. Designed as a no-install fallback when semgrep
 * isn't available (especially relevant on Windows where semgrep has no
 * native build).
 *
 * Coverage gap vs semgrep:
 *   - Regex-based, not AST-based — more false positives, more false negatives
 *   - ~15 patterns vs semgrep's thousands of rules
 *   - No taint tracking, no dataflow analysis
 *
 * What this catches (the high-value subset):
 *   - eval() / new Function() with user input
 *   - dangerouslySetInnerHTML usage
 *   - document.write
 *   - String-interpolated SQL queries
 *   - Hardcoded crypto secrets / weak crypto
 *   - child_process.exec with string interpolation
 *   - res.redirect to user-controlled URL (open redirect)
 *   - Math.random() in security-sensitive contexts (best effort)
 *
 * What this is NOT designed to catch — defer those to semgrep tier-2:
 *   - Cross-file taint flows
 *   - Framework-specific issues (Next.js, Django, Rails patterns)
 *   - Complex logic bugs
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.turbo', '.cache', 'vendor', '__pycache__', '.venv', 'venv',
  '.pytest_cache', 'target', '.gradle', '.idea', '.vscode',
  // Skill / tool installation dirs. These contain detection patterns that
  // would self-match (e.g. `eval(` in this very file). They're never the
  // user's app code, so skipping is always correct.
  '.agents', '.claude', '.cursor',
])
const SKIP_FILE = /\.(test|spec)\.(m?[jt]sx?|py|go|rb)$|__tests__|\.min\.js$|\.map$|\.(svg|png|jpe?g|gif|ico|webp|woff2?|ttf|eot|pdf|zip|tar|gz|wasm)$/i
const SOURCE_FILE = /\.(m?[jt]sx?|cjs|cts|py|go|rb|php|java)$/i
const MAX_FILE_BYTES = 500_000

/**
 * Each rule is a regex + language scope. `langs` lists which extensions
 * it applies to (matched against the source extension). `severity` is the
 * normalized severity. Keep rules narrow — false positives erode trust
 * faster than missed findings.
 */
const RULES = [
  // ─ JS/TS dangerous patterns ────────────────────────────────────────────
  {
    id: 'js-eval',
    description: 'eval() with non-literal input — arbitrary code execution risk',
    // Match eval(...) where the argument is not a string literal. Capture
    // enough context to filter on a second pass.
    regex: /\beval\s*\(\s*([^)'"`][^)]*)\)/,
    langs: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'],
    severity: 'CRITICAL',
    keywords: ['eval('],
  },
  {
    id: 'js-new-function',
    description: 'new Function() with dynamic body — equivalent to eval',
    regex: /\bnew\s+Function\s*\(/,
    langs: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'],
    severity: 'CRITICAL',
    keywords: ['new Function'],
  },
  {
    id: 'react-dangerous-html',
    description: 'dangerouslySetInnerHTML — XSS risk if input isn\'t sanitized',
    regex: /dangerouslySetInnerHTML/,
    langs: ['jsx', 'tsx', 'js', 'ts'],
    severity: 'WARNING',
    keywords: ['dangerouslySetInnerHTML'],
  },
  {
    id: 'dom-document-write',
    description: 'document.write — legacy XSS vector, almost never safe',
    regex: /document\.write(?:ln)?\s*\(/,
    langs: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'html'],
    severity: 'WARNING',
    keywords: ['document.write'],
  },
  {
    id: 'dom-inner-html',
    description: 'innerHTML assignment with non-literal value — XSS risk',
    regex: /\.innerHTML\s*=\s*[^'"`]/,
    langs: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'],
    severity: 'INFO',
    keywords: ['.innerHTML'],
  },

  // ─ Command injection ───────────────────────────────────────────────────
  {
    id: 'node-exec-interp',
    description: 'child_process.exec / execSync with string interpolation — command injection',
    // Match exec(`...${...}...`) or exec("..." + var) patterns.
    regex: /\b(?:exec|execSync|spawn|spawnSync)\s*\(\s*[`][^`]*\$\{/,
    langs: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'],
    severity: 'CRITICAL',
    keywords: ['exec', 'spawn'],
  },
  {
    id: 'py-shell-true',
    description: 'subprocess call with shell=True and user input — command injection',
    regex: /\bsubprocess\.\w+\([^)]*shell\s*=\s*True/,
    langs: ['py'],
    severity: 'CRITICAL',
    keywords: ['shell=True'],
  },
  {
    id: 'py-os-system',
    description: 'os.system with string interpolation — command injection',
    regex: /\bos\.system\s*\(\s*[fF]?["']/,
    langs: ['py'],
    severity: 'WARNING',
    keywords: ['os.system'],
  },

  // ─ SQL injection ───────────────────────────────────────────────────────
  {
    id: 'sql-template-interp',
    description: 'SQL string built from template literal — SQL injection risk',
    // Require a SQL verb in uppercase AND a structural keyword (FROM/INTO/SET
    // /WHERE) on the same template literal. Without the second keyword we
    // catch URL query strings like `select=...` (the lowercase /i version
    // produced too many false positives).
    regex: /`[^`]*\b(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b[^`]*\b(?:FROM|INTO|SET|WHERE|VALUES)\b[^`]*\$\{[^`]*`/,
    langs: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'],
    severity: 'CRITICAL',
    keywords: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },
  {
    id: 'sql-py-fstring',
    description: 'SQL query built via f-string — SQL injection risk',
    regex: /[fF]["'][^"']*\b(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b[^"']*\{/i,
    langs: ['py'],
    severity: 'CRITICAL',
    keywords: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  },

  // ─ Weak crypto / RNG ───────────────────────────────────────────────────
  {
    id: 'weak-crypto-md5',
    description: 'MD5 used for crypto purposes — broken algorithm',
    regex: /createHash\s*\(\s*['"]md5['"]/,
    langs: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'],
    severity: 'WARNING',
    keywords: ["'md5'", '"md5"'],
  },
  {
    id: 'weak-crypto-sha1',
    description: 'SHA-1 used for crypto purposes — collision vulnerable',
    regex: /createHash\s*\(\s*['"]sha1['"]/,
    langs: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'],
    severity: 'INFO',
    keywords: ["'sha1'", '"sha1"'],
  },
  {
    id: 'math-random-secret',
    description: 'Math.random() near "token"/"secret"/"password" — weak RNG for security context',
    // Heuristic: Math.random() within 3 lines of a security-relevant identifier.
    regex: /Math\.random\(\)/,
    langs: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'],
    severity: 'INFO',
    keywords: ['Math.random'],
    contextRequired: /\b(?:token|secret|password|session|nonce|api[_-]?key)\b/i,
  },

  // ─ Open redirect ───────────────────────────────────────────────────────
  {
    id: 'open-redirect-express',
    description: 'res.redirect with user-controlled URL — open redirect',
    regex: /res\.redirect\s*\(\s*(?:req\.(?:query|params|body)|`[^`]*\$\{)/,
    langs: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'],
    severity: 'WARNING',
    keywords: ['res.redirect'],
  },

  // ─ SSRF heuristic ──────────────────────────────────────────────────────
  {
    id: 'ssrf-fetch-userinput',
    description: 'fetch/axios called with user-controlled URL — SSRF risk',
    // Only flag when the URL source is clearly user-controlled (req.query/
    // params/body). Loose template-literal matching produced too many false
    // positives on legitimate env-var-based URL construction.
    regex: /\b(?:fetch|axios\.get|axios\.post)\s*\(\s*req\.(?:query|params|body)/,
    langs: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'],
    severity: 'WARNING',
    keywords: ['fetch', 'axios'],
  },
]

/**
 * Walk projectDir, scan source files, return findings.
 * Shape: { id, severity, description, file, line, snippet }
 */
export async function runBuiltinSastScan(projectDir) {
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
      if (!SOURCE_FILE.test(e.name)) continue
      if (SKIP_FILE.test(path)) continue
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
      scanned++
      scanFile(content, path, projectDir, findings)
    }
  }

  await walk(projectDir)
  return { findings, scanned }
}

function scanFile(content, fullPath, projectDir, findings) {
  const ext = fullPath.split('.').pop().toLowerCase()
  for (const rule of RULES) {
    if (rule.langs && !rule.langs.includes(ext)) continue
    if (rule.keywords && !rule.keywords.some((k) => content.includes(k))) continue
    const re = new RegExp(rule.regex.source, rule.regex.flags.includes('g') ? rule.regex.flags : rule.regex.flags + 'g')
    let match
    while ((match = re.exec(content)) !== null) {
      // contextRequired: only flag if the surrounding ±3 lines contain the
      // context keyword. Used to suppress Math.random() outside security ctx.
      if (rule.contextRequired) {
        // Tight context: only check the same line as the match. Wider windows
        // catch too many false positives — e.g. `Math.random()` for a UI dice
        // roll, ten lines after an unrelated `const token = ...`.
        const lineStart = content.lastIndexOf('\n', match.index - 1) + 1
        const lineEnd = content.indexOf('\n', match.index)
        const lineText = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd)
        if (!rule.contextRequired.test(lineText)) {
          if (match.index === re.lastIndex) re.lastIndex++
          continue
        }
      }
      const line = content.slice(0, match.index).split('\n').length
      const lineStart = content.lastIndexOf('\n', match.index - 1) + 1
      const lineEnd = content.indexOf('\n', match.index)
      const snippet = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd).trim().slice(0, 120)
      findings.push({
        id: rule.id,
        severity: rule.severity,
        description: rule.description,
        file: relative(projectDir, fullPath) || fullPath,
        line,
        snippet,
      })
      if (match.index === re.lastIndex) re.lastIndex++
    }
  }
}
