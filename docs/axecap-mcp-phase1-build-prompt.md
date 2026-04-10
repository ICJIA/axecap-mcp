# AxeCap — Phase 1 Build Prompt

> **Feed this entire document to Claude Code to build Phase 1.**
> This is a self-contained build prompt. Do not reference external documents.
> **Reference implementation:** Clone https://github.com/ICJIA/lightcap-mcp and study its patterns. AxeCap follows the same architecture, conventions, and security posture.

---

## What You Are Building

AxeCap is a local MCP server for Claude Code that runs axe-core accessibility audits via Playwright and returns compressed, actionable results optimized for Claude's context window. It communicates over stdio (no HTTP, no ports).

**The core problem:** A raw axe-core result object can be 50K-500K tokens — deeply nested JSON with HTML snippets, full DOM node references, related nodes, and verbose check arrays. This server compresses that into ~30-150 lines of structured plain text that Claude can read and act on immediately.

**The core differentiator from lightcap:** AxeCap runs axe-core **directly** (not through Lighthouse), giving full control over WCAG conformance level targeting (A, AA, AAA), individual rule selection, and access to axe-core's `incomplete` (needs-review) category that Lighthouse drops.

**This is an original implementation.** axe-core is used as a library dependency (Mozilla Public License 2.0). Playwright is used for browser automation (Apache 2.0). No code from third-party axe wrapper packages (e.g., @axe-core/cli, @axe-core/playwright, accessibility-checker) is used.

---

## Project Setup

### Initialize

```bash
mkdir axecap-mcp && cd axecap-mcp
git init
npm init -y
```

### `package.json` — set to exactly this:

```json
{
  "name": "@icjia/axecap",
  "version": "0.1.0",
  "description": "MCP axe-core audit server for Claude Code — WCAG A/AA/AAA compliance audits with compressed results optimized for Claude's context window",
  "type": "module",
  "main": "src/server.js",
  "bin": {
    "axecap": "src/cli.js"
  },
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test test/*.test.js",
    "postinstall": "npx playwright install chromium --with-deps 2>/dev/null || true"
  },
  "files": [
    "src/",
    "README.md"
  ],
  "engines": {
    "node": ">=18"
  },
  "keywords": ["mcp", "axe-core", "accessibility", "wcag", "audit", "claude", "a11y"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ICJIA/axecap-mcp.git"
  }
}
```

### Install dependencies:

```bash
npm install @modelcontextprotocol/server zod axe-core playwright commander
npx playwright install chromium
```

**Dependencies:**
- `@modelcontextprotocol/server` — MCP server SDK (same as lightcap)
- `zod` — schema validation for tool parameters (same as lightcap)
- `axe-core` — the accessibility audit engine (injected into page context)
- `playwright` — browser automation (launches Chromium, navigates, runs `page.evaluate`)
- `commander` — CLI subcommand parsing (same as lightcap)

**Not needed (unlike lightcap):**
- No `lighthouse` — axe-core is the engine
- No `chrome-launcher` — Playwright manages Chromium
- No `sharp` — no image processing
- No `@axe-core/playwright` — we inject `axe.source` directly for full control
- No `@cfworker/json-schema` — check if MCP SDK requires it as a peer dep; if so, install it

### Create `.gitignore`:

```
node_modules/
.DS_Store
```

### Create `.nvmrc`:

```
22.22.0
```

### Create `CLAUDE.md`:

```markdown
# Tool preferences

- For WCAG compliance audits (A/AA/AAA, specific rules, rule lookups), use the `axecap` MCP server (audit_url, audit_html, get_rules, get_rule_info, get_status).
- For Lighthouse audits (performance, accessibility, SEO, best practices), use the `lightcap` MCP server.
- For all screenshots, use the `viewcap` MCP server.
- Use Chrome MCP for browser automation, DOM interaction, and navigation only.
```

### Create `LICENSE`:

MIT License, copyright `Illinois Criminal Justice Information Authority (ICJIA)`. Same text as lightcap's LICENSE.

### File structure:

```
axecap-mcp/
├── package.json
├── .gitignore
├── .nvmrc
├── CLAUDE.md
├── LICENSE
├── publish.sh
├── README.md
├── docs/
│   ├── axecap-mcp-design.md
│   └── axecap-mcp-phase1-build-prompt.md
├── src/
│   ├── server.js          # MCP server init + tool handlers + version tracking
│   ├── runner.js          # Playwright launch + axe-core injection + URL validation
│   ├── compress.js        # axe results → compressed text for Claude
│   ├── rules.js           # axe-core rule registry queries
│   ├── cli.js             # Commander-based standalone CLI
│   └── config.js          # Constants + logging helper
└── test/
    ├── url-validation.test.js
    ├── compress.test.js
    ├── rules.test.js
    └── config.test.js
```

### `publish.sh`:

Copy lightcap's `publish.sh` verbatim. Change only:
- `PACKAGE_NAME="@icjia/axecap"`
- Log prefix: `[axecap]` instead of `[lightcap]`
- Error message: `"Run this from the axecap project root."`

Make executable: `chmod +x publish.sh`

---

## Conventions — Match lightcap Exactly

Study lightcap's source code and follow these patterns:

### MCP server setup
- Use `@modelcontextprotocol/server` with the same import pattern as lightcap's `server.js`
- Use `zod` schemas for tool parameter validation (same as lightcap)
- Match lightcap's error handling pattern: try/catch in handlers, return `{ content: [{ type: 'text', text: 'Error: ...' }] }` on error

### Logging
- Use lightcap's `log(level, msg)` helper pattern from `config.js`
- Support `--verbose` and `--quiet` flags (same as lightcap)
- All logging to stderr via `console.error()` — stdout is reserved for MCP stdio transport
- Log prefix: `[axecap]` (not `[lightcap]`)

### URL validation
- Copy lightcap's `validateUrl()` function from `runner.js` — it is async, resolves IPs, checks blocked ranges, and uses generic error messages
- Copy lightcap's `isBlockedIp()` function and all RFC1918 private range checks
- Copy the **post-navigation URL recheck** — after Playwright navigates, check `page.url()` against the same blocklist (catches redirect chains and DNS rebinding)
- Generic error messages only: `"Blocked URL scheme"`, `"Blocked URL"` — never leak internal paths or IPs

### Directory validation
- Copy lightcap's `validateOutputDir()` function with symlink-aware `realpathSync` checks
- Same allowed roots: home directory and `/tmp` (with `/private/tmp` for macOS)
- Generic error: `"Output directory is outside allowed paths"`

### Error sanitization
- Copy lightcap's `sanitizeError()` function with its known-errors allowlist pattern
- Add axecap-specific known errors to the allowlist

### Request serialization
- Copy lightcap's `enqueue()` + `inFlight` counter pattern
- `MAX_CONCURRENT_AUDITS: 2` (same as lightcap)

### Test exports
- Export internal functions for testing via `_test` named export (same pattern as lightcap):

```javascript
// At the bottom of runner.js
export const _test = { validateUrl, validateOutputDir, isBlockedIp };
```

### Test suite
- Use `node:test` and `node:assert/strict` (no test framework dependency — same as lightcap)
- Test file naming: `test/{feature}.test.js`
- Run via `npm test` → `node --test test/*.test.js`

---

## WCAG Conformance Level Targeting

This is the core feature that differentiates axecap from lightcap. axe-core tags every rule with WCAG conformance level tags.

### Level → tag mapping

```javascript
const LEVEL_TAGS = {
  a:   ['wcag2a', 'wcag21a'],
  aa:  ['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
  aaa: ['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'wcag2aaa'],
  'best-practice': ['best-practice'],
};
```

WCAG conformance is **cumulative**: AAA includes all AA rules, which include all A rules. The `level` parameter handles this automatically.

### Delta mode

When `level: 'aaa'` and `delta: true`, return **only** violations from rules tagged `wcag2aaa` that are NOT also tagged with lower-level tags. This is a post-filter on the results, not a separate axe run.

```javascript
function isDeltaViolation(violation, targetLevel) {
  const tags = violation.tags;
  if (targetLevel === 'aaa') {
    return tags.includes('wcag2aaa') && !tags.includes('wcag2a') && !tags.includes('wcag2aa');
  }
  // Only meaningful for AAA delta; return true for all others
  return true;
}
```

---

## File Specifications

### `src/config.js`

Follow lightcap's config.js pattern exactly:

```javascript
export const CONFIG = {
  MAX_VIOLATIONS_DEFAULT: 10,     // Top N violations per impact group
  MAX_VIOLATIONS_CAP: 15,         // Hard cap
  MAX_ELEMENTS_PER_VIOLATION: 5,  // Affected elements shown per violation
  SELECTOR_MAX_LENGTH: 60,        // Truncate CSS selectors
  EXPLANATION_MAX_LENGTH: 120,    // Truncate help text
  MAX_URL_LENGTH: 2048,
  MAX_HTML_LENGTH: 512_000,       // 500KB max for audit_html input
  AUDIT_TIMEOUT: 60_000,          // 60s hard timeout
  NAV_TIMEOUT: 30_000,            // 30s page load timeout
  AXE_TIMEOUT: 30_000,            // 30s axe-core execution timeout
  WAIT_FOR_TIMEOUT: 10_000,       // 10s waitFor selector timeout
  MAX_CONCURRENT_AUDITS: 2,
  DEFAULT_LEVEL: 'aa',
  DEFAULT_VIEWPORT: 'desktop',
  VIEWPORTS: {
    desktop: { width: 1350, height: 940 },
    mobile: { width: 375, height: 812 },
  },
  BLOCKED_HOSTNAMES: [
    '169.254.169.254',
    'metadata.google.internal',
    'metadata.azure.com',
    '0.0.0.0',
  ],
  BLOCKED_IP_PREFIXES: [
    '169.254.',
    '10.',
    '172.16.', '172.17.', '172.18.', '172.19.',
    '172.20.', '172.21.', '172.22.', '172.23.',
    '172.24.', '172.25.', '172.26.', '172.27.',
    '172.28.', '172.29.', '172.30.', '172.31.',
    '192.168.',
    '127.',
    '0.',
    'fd00:',
    'fe80:',
    '::',
  ],
  LOCALHOST_HOSTS: ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', '[::]'],
  MAX_OUTPUT_LINES: 200,
  MAX_OUTPUT_CHARS: 50_000,
  LEVEL_TAGS: {
    a:   ['wcag2a', 'wcag21a'],
    aa:  ['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
    aaa: ['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'wcag2aaa'],
    'best-practice': ['best-practice'],
  },
  // Tags that indicate AAA-only (for delta mode)
  AAA_ONLY_TAGS: ['wcag2aaa'],
  IMPACT_ORDER: ['critical', 'serious', 'moderate', 'minor'],
};

// Logging — same pattern as lightcap
let verbosity = 'normal';

export function setVerbosity(level) { verbosity = level; }

export function log(level, msg) {
  if (verbosity === 'quiet' && level !== 'error') return;
  if (verbosity === 'normal' && level === 'debug') return;
  console.error(`[axecap] ${msg}`);
}
```

---

### `src/runner.js`

Playwright launch, axe-core injection, URL validation, directory validation.

**Exports:**
- `runAxeAudit(url, options)` — validates URL, launches Playwright, injects axe-core, returns results
- `runAxeOnHtml(html, options)` — sets content in blank page, injects axe-core, returns results
- `validateUrl(url)` — async, same as lightcap
- `validateOutputDir(dir)` — same as lightcap
- `sanitizeError(err)` — same pattern as lightcap
- `_test` — exports for unit testing

#### URL validation

**Copy from lightcap's `runner.js`:**
- `validateUrl()` — async function with scheme whitelist, hostname blocklist, IP resolution via `isBlockedIp()`, fail-closed DNS, generic error messages
- `isBlockedIp()` — RFC1918 range checks, link-local, metadata endpoints, IPv6-mapped IPv4 normalization
- All supporting helper functions

Change only the log prefix from `[lightcap]` to `[axecap]`.

#### Directory validation

**Copy from lightcap's `runner.js`:**
- `validateOutputDir()` — symlink-aware with `realpathSync`, home + `/tmp` + `/private/tmp` allowed roots

#### Request serialization

**Copy from lightcap's `runner.js`:**
- `enqueue()` function and `inFlight` counter
- `MAX_CONCURRENT_AUDITS` check with `'Audit queue full'` error

#### `runAxeAudit(url, options)`

Parameters: `{ level, delta, rules, maxViolations, viewport, includeIncomplete, waitFor, directory }`

```javascript
import { chromium } from 'playwright';
import axeSource from 'axe-core/axe.min.js';  // See note below on importing axe source
import { readFileSync } from 'fs';
import { CONFIG, log } from './config.js';

// axe-core source for injection — loaded once on startup
// axe-core exports its source as a string via require('axe-core').source
// but with ESM we need to read the file directly
import axeCore from 'axe-core';
const AXE_SOURCE = axeCore.source;

async function _runAxeAudit(url, options = {}) {
  const validatedUrl = await validateUrl(url);
  const level = options.level || CONFIG.DEFAULT_LEVEL;
  const viewport = options.viewport || CONFIG.DEFAULT_VIEWPORT;

  if (inFlight >= CONFIG.MAX_CONCURRENT_AUDITS) {
    throw new Error('Audit queue full — try again shortly');
  }
  inFlight++;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-background-networking',
        '--no-first-run',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--no-default-browser-check',
        // Platform-specific sandbox (same as lightcap)
        ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
      ],
    });
  } catch (err) {
    inFlight--;
    throw err;
  }

  try {
    const startTime = Date.now();
    const vp = CONFIG.VIEWPORTS[viewport] || CONFIG.VIEWPORTS.desktop;

    const context = await browser.newContext({
      viewport: vp,
      userAgent: viewport === 'mobile'
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined,
    });
    const page = await context.newPage();

    // Navigate with timeout
    await page.goto(validatedUrl, {
      waitUntil: 'networkidle',
      timeout: CONFIG.NAV_TIMEOUT,
    });

    // Post-navigation SSRF check (catches redirects and DNS rebinding)
    const finalUrl = page.url();
    try {
      await validateUrl(finalUrl);
    } catch {
      throw new Error('Blocked URL');
    }

    // Optional: wait for SPA element
    if (options.waitFor) {
      await page.waitForSelector(options.waitFor, {
        timeout: CONFIG.WAIT_FOR_TIMEOUT,
      });
    }

    // Inject axe-core source into page
    await page.evaluate(AXE_SOURCE);

    // Build axe.run() configuration
    const axeConfig = buildAxeConfig(level, options);

    // Run axe-core with timeout
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('axe-core audit timed out')), CONFIG.AXE_TIMEOUT);
    });

    const results = await Promise.race([
      page.evaluate((config) => window.axe.run(document, config), axeConfig),
      timeoutPromise,
    ]).finally(() => clearTimeout(timeoutId));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log('info', `Audit completed in ${elapsed}s — ${results.violations.length} violations`);

    // Optional: save full JSON to disk
    let jsonPath = null;
    if (options.directory) {
      const dir = validateOutputDir(options.directory);
      const filename = `axe-${Date.now()}.json`;
      const filePath = path.join(dir, filename);
      fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
      log('info', `JSON results saved: ${filePath}`);
      jsonPath = filePath;
    }

    return { results, jsonPath };
  } finally {
    inFlight--;
    await killBrowser(browser);
  }
}

function buildAxeConfig(level, options) {
  const config = {
    resultTypes: options.includeIncomplete
      ? ['violations', 'incomplete']
      : ['violations'],
  };

  // If specific rules requested, use rule-based filtering
  if (options.rules && options.rules.length > 0) {
    config.runOnly = {
      type: 'rule',
      values: options.rules,
    };
  } else {
    // Use tag-based filtering for WCAG level
    const tags = CONFIG.LEVEL_TAGS[level];
    if (!tags) {
      throw new Error(`Invalid WCAG level: ${level}`);
    }
    config.runOnly = {
      type: 'tag',
      values: tags,
    };
  }

  return config;
}

async function killBrowser(browser) {
  try {
    await browser.close();
  } catch {
    // Already closed or crashed — ignore
  }
}

// Public entry point — serialized through queue
export function runAxeAudit(url, options) {
  return enqueue(() => _runAxeAudit(url, options));
}
```

#### `runAxeOnHtml(html, options)`

Same as `runAxeAudit` but navigates to `about:blank` and uses `page.setContent(html)`:

```javascript
async function _runAxeOnHtml(html, options = {}) {
  if (!html || typeof html !== 'string') {
    throw new Error('HTML content is required');
  }
  if (html.length > CONFIG.MAX_HTML_LENGTH) {
    throw new Error('HTML content exceeds maximum length');
  }

  const level = options.level || CONFIG.DEFAULT_LEVEL;

  if (inFlight >= CONFIG.MAX_CONCURRENT_AUDITS) {
    throw new Error('Audit queue full — try again shortly');
  }
  inFlight++;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
      ],
    });
  } catch (err) {
    inFlight--;
    throw err;
  }

  try {
    const startTime = Date.now();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Set HTML content directly — no URL navigation
    await page.setContent(html, { waitUntil: 'networkidle' });

    // Inject axe-core
    await page.evaluate(AXE_SOURCE);

    // Build config and run
    const axeConfig = buildAxeConfig(level, options);

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('axe-core audit timed out')), CONFIG.AXE_TIMEOUT);
    });

    const results = await Promise.race([
      page.evaluate((config) => window.axe.run(document, config), axeConfig),
      timeoutPromise,
    ]).finally(() => clearTimeout(timeoutId));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log('info', `HTML audit completed in ${elapsed}s — ${results.violations.length} violations`);

    return { results, jsonPath: null };
  } finally {
    inFlight--;
    await killBrowser(browser);
  }
}

export function runAxeOnHtml(html, options) {
  return enqueue(() => _runAxeOnHtml(html, options));
}
```

**Important:** `audit_html` does NOT navigate to any URL. No SSRF risk. The HTML is injected via `page.setContent()`, which loads from a data context — no network requests for the page itself (though embedded resources like images/scripts may trigger network requests in the Playwright sandbox).

---

### `src/compress.js`

**This is the most important file.** It transforms axe-core's deeply nested JSON into ~30-150 lines of structured plain text.

**Exports:**
- `compressResults(results, options)` — main compression function
- `_test` — internal functions for testing

#### Sanitization

Copy lightcap's `sanitize()` function exactly — strip control characters, newlines, zero-width chars from all page-controlled strings.

#### WCAG criterion extraction

Reuse lightcap's `parseWcagCriterion()` logic. Additionally extract the conformance level:

```javascript
function getWcagInfo(tags) {
  let criterion = null;
  let level = null;

  for (const tag of tags) {
    // Criterion tags: wcag111, wcag1412, etc.
    if (/^wcag\d{3,}$/.test(tag) && !/^wcag\d+a+$/.test(tag)) {
      criterion = criterion || parseWcagCriterion(tag);
    }
    // Level tags: wcag2a, wcag2aa, wcag2aaa, wcag21a, wcag21aa, wcag22aa
    if (/^wcag\d+a+$/.test(tag)) {
      const thisLevel = tag.endsWith('aaa') ? 'AAA'
        : tag.endsWith('aa') ? 'AA'
        : 'A';
      // Keep the highest level found
      if (!level || levelRank(thisLevel) > levelRank(level)) {
        level = thisLevel;
      }
    }
  }

  return { criterion, level };
}

function levelRank(l) {
  return l === 'AAA' ? 3 : l === 'AA' ? 2 : 1;
}
```

#### Selector extraction from axe-core nodes

axe-core uses `node.target` (an array) instead of Lighthouse's `node.selector`:

```javascript
function extractSelector(node) {
  // node.target is an array of CSS selectors
  // For top-level: ['div.hero > img']
  // For iframed: ['iframe#content', 'div.hero > img']
  const target = node.target;
  if (!Array.isArray(target) || target.length === 0) return null;

  // Join with ' > ' for iframe nesting, use last for simple case
  const selector = target.length === 1
    ? target[0]
    : target.join(' > ');

  return truncateSelector(typeof selector === 'string' ? selector : String(selector));
}
```

#### `compressResults(results, options)`

Options: `{ level, delta, maxViolations, includeIncomplete }`

Build output in this format:

```
axe: {url} [{viewport}] {LEVEL} — {N} violations ({impact shorthand})

── Critical ({N} violations, {M} el) ──
  ✗ {rule-id} [{criterion} {LEVEL}] ({N} el)
    → {selector}
    → {selector} (×{count})
    → (+{remaining})
    ℹ {helpUrl}

── Serious ──
  ...

── Moderate ──
  ...

── Minor ──
  ...
```

If `includeIncomplete`, add a separate section:

```
── Needs Review ({N} items) ──
  ⚠ {rule-id} [{criterion} {LEVEL}] ({N} el)
    → {selector}
    ℹ {helpUrl}
```

Steps:

1. **Get violations** from `results.violations`
2. **Delta filter** — if `options.delta`, keep only violations where `tags` includes a tag from `CONFIG.AAA_ONLY_TAGS`
3. **Group by impact** — `results.violations` each have an `impact` field directly (unlike Lighthouse where it's buried in axe internals)
4. **Per violation:**
   - `violation.id` = rule ID
   - `violation.impact` = critical/serious/moderate/minor
   - `violation.tags` = array of tags (extract WCAG info)
   - `violation.helpUrl` = Deque University link
   - `violation.nodes` = array of affected elements
   - Each `node.target` = CSS selector array
   - Deduplicate selectors, count occurrences
   - Show up to `MAX_ELEMENTS_PER_VIOLATION` (5 for critical/serious, 3 for moderate/minor)
5. **Compact header** — URL, viewport, level, violation count, impact shorthand: `3c 5s 4m 2n`
6. **Cap** at `maxViolations` per impact group, sorted by node count descending
7. **Truncate** at `MAX_OUTPUT_LINES` / `MAX_OUTPUT_CHARS`

**Clean page output (0 violations):**

```
axe: http://localhost:3000 [desktop] AA — 0 violations
```

One line. ~20 tokens.

**Delta mode header:**

```
axe: http://localhost:3000 [desktop] AAA (delta from AA) — 6 violations (0c 2s 3m 1n)
```

---

### `src/rules.js`

Queries axe-core's rule registry without launching a browser.

**Exports:**
- `getRules(options)` — list rules with optional filters
- `getRuleInfo(ruleId)` — detailed info for a single rule
- `_test` — internal functions

```javascript
import axe from 'axe-core';
import { CONFIG } from './config.js';

export function getRules(options = {}) {
  const { level, criterion, search } = options;

  // Get rules, optionally filtered by level tags
  let rules;
  if (level && CONFIG.LEVEL_TAGS[level]) {
    rules = axe.getRules(CONFIG.LEVEL_TAGS[level]);
  } else {
    rules = axe.getRules();
  }

  // Filter by WCAG criterion
  if (criterion) {
    // Convert criterion string (e.g., '1.4.3') to tag format (e.g., 'wcag143')
    const criterionTag = 'wcag' + criterion.replace(/\./g, '');
    rules = rules.filter(r => r.tags.includes(criterionTag));
  }

  // Search by ID or description
  if (search) {
    const lower = search.toLowerCase();
    rules = rules.filter(r =>
      r.ruleId.toLowerCase().includes(lower) ||
      (r.description || '').toLowerCase().includes(lower) ||
      (r.help || '').toLowerCase().includes(lower)
    );
  }

  return rules;
}

export function getRuleInfo(ruleId) {
  const rules = axe.getRules();
  const rule = rules.find(r => r.ruleId === ruleId);
  if (!rule) return null;
  return rule;
}
```

#### Formatting in compress.js (or a helper)

`formatRuleList(rules)`:

```
axe-core rules ({level}, {count} rules):

  {ruleId} [{criterion} {LEVEL}] {impact} — {help}
  {ruleId} [{criterion} {LEVEL}] {impact} — {help}
  ...
```

`formatRuleInfo(rule)`:

```
axe rule: {ruleId}
  Impact:    {impact}
  WCAG:      {criterion} ({LEVEL})
  Tags:      {tags joined}
  Help:      {help}
  Help URL:  {helpUrl}
```

---

### `src/server.js`

Entry point. MCP server init, tool registration, version tracking.

**Shebang:** `#!/usr/bin/env node` — goes on `cli.js`, NOT on `server.js` (same as lightcap pattern where `cli.js` is the bin entry point).

**Follow lightcap's `server.js` patterns exactly for:**
- MCP server initialization
- Zod schema definitions
- Error handling in tool handlers
- Startup logging

#### Version tracking (loaded once on startup):

```javascript
import { readFileSync } from 'fs';
import { execFile } from 'child_process';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const serverVersion = pkg.version;

let axeVersion = 'unknown';
try {
  const axePkg = JSON.parse(readFileSync(new URL('../node_modules/axe-core/package.json', import.meta.url)));
  axeVersion = axePkg.version;
} catch { /* ignore */ }

let playwrightVersion = 'unknown';
try {
  const pwPkg = JSON.parse(readFileSync(new URL('../node_modules/playwright/package.json', import.meta.url)));
  playwrightVersion = pwPkg.version;
} catch { /* ignore */ }

// Non-blocking npm check for latest axe-core
let _latestAxeVersion = null;
const _latestAxePromise = new Promise((resolve) => {
  execFile('npm', ['view', 'axe-core', 'version'], { timeout: 5000 }, (err, stdout) => {
    const raw = err ? 'unknown' : stdout.trim();
    _latestAxeVersion = /^\d+\.\d+\.\d+/.test(raw) ? raw : 'unknown';
    resolve(_latestAxeVersion);
  });
});

async function getLatestAxeVersion() {
  if (_latestAxeVersion) return _latestAxeVersion;
  return _latestAxePromise;
}
```

#### Five tools:

**`audit_url`**
- Description: `"Run an axe-core accessibility audit on a web page at a specified WCAG conformance level (A, AA, AAA). Returns violations grouped by impact with WCAG criteria, CSS selectors, and help URLs."`
- Zod schema:
```javascript
z.object({
  url: z.url().max(CONFIG.MAX_URL_LENGTH).describe('HTTP or HTTPS URL to audit'),
  level: z.enum(['a', 'aa', 'aaa', 'best-practice']).optional().describe('WCAG conformance level (default: aa)'),
  delta: z.boolean().optional().describe('If true with level aaa, show only AAA-specific violations'),
  rules: z.array(z.string()).optional().describe('Run only these specific axe-core rule IDs'),
  maxViolations: z.number().int().min(1).max(15).optional().describe('Top N violations per impact group (default 10, max 15)'),
  viewport: z.enum(['desktop', 'mobile']).optional().describe('Viewport emulation (default: desktop)'),
  includeIncomplete: z.boolean().optional().describe('Include needs-review results'),
  waitFor: z.string().max(200).optional().describe('CSS selector to wait for before auditing (for SPAs)'),
  directory: z.string().max(500).optional().describe('Save full JSON results to this directory'),
})
```
- Handler: `runAxeAudit()` → `compressResults()` → return text content

**`audit_html`**
- Description: `"Run an axe-core audit on raw HTML content. Useful for testing components or generated markup without a running server."`
- Zod schema:
```javascript
z.object({
  html: z.string().max(CONFIG.MAX_HTML_LENGTH).describe('HTML content to audit'),
  level: z.enum(['a', 'aa', 'aaa', 'best-practice']).optional().describe('WCAG conformance level (default: aa)'),
  rules: z.array(z.string()).optional().describe('Specific axe-core rule IDs to run'),
  maxViolations: z.number().int().min(1).max(15).optional().describe('Top N per impact group (default 10)'),
})
```
- Handler: `runAxeOnHtml()` → `compressResults()` → return text content

**`get_rules`**
- Description: `"List axe-core accessibility rules, optionally filtered by WCAG level, criterion, or search term. Does not require a browser — instant response."`
- Zod schema:
```javascript
z.object({
  level: z.enum(['a', 'aa', 'aaa', 'best-practice']).optional().describe('Filter to rules at this WCAG level'),
  criterion: z.string().max(10).optional().describe('Filter to rules for a WCAG criterion (e.g., "1.4.3")'),
  search: z.string().max(100).optional().describe('Search rule IDs and descriptions'),
})
```
- Handler: `getRules()` → format as text → return

**`get_rule_info`**
- Description: `"Get detailed information about a specific axe-core rule including WCAG criteria, impact, tags, and help URL."`
- Zod schema:
```javascript
z.object({
  ruleId: z.string().max(100).describe('axe-core rule ID (e.g., "color-contrast")'),
})
```
- Handler: `getRuleInfo()` → format as text → return

**`get_status`**
- Description: `"Returns axecap server version, installed axe-core version, Playwright version, and whether a newer axe-core version is available on npm."`
- Zod schema: `z.object({})` (no parameters)
- Handler: build status string:

```
axecap status
  Server:     @icjia/axecap v{serverVersion}
  axe-core:   v{axeVersion} {(latest) | (latest: vX.Y.Z — update available)}
  Playwright: v{playwrightVersion}
  Node:       v{process.versions.node}
  Platform:   {process.platform} {process.arch}
```

#### Error handling (same as lightcap):

```javascript
try {
  const result = await handler(params);
  return { content: [{ type: 'text', text: result }] };
} catch (err) {
  log('error', err.message);
  return { content: [{ type: 'text', text: `Error: ${sanitizeError(err)}` }] };
}
```

---

### `src/cli.js`

Follow lightcap's `cli.js` pattern. Shebang: `#!/usr/bin/env node`

Subcommands:
- `axecap audit <url>` — options: `--level`, `--delta`, `--rules`, `--max-violations`, `--viewport`, `--include-incomplete`, `--wait-for`, `--directory`
- `axecap rules` — options: `--level`, `--criterion`, `--search`
- `axecap rule-info <ruleId>`
- `axecap status`
- No subcommand → start MCP server mode (same as lightcap)

Global options: `--verbose`, `--quiet`

---

## Tests

### `test/url-validation.test.js`

Copy lightcap's test file. Import from `runner.js` instead. Same test cases:
- Allows http localhost, 127.0.0.1, ::1, https external
- Blocks file://, data:, javascript:, ftp://
- Blocks AWS/GCP/Azure metadata endpoints, 0.0.0.0
- Full 127.x loopback range in BLOCKED_IP_PREFIXES
- All 172.16-31.x ranges
- :: prefix for IPv6
- Error messages are generic
- sanitizeError allowlist passthrough
- Connection/timeout/DNS error mapping

### `test/compress.test.js`

Test compression with mock axe-core result objects:

```javascript
function makeAxeResults({ violations = [], incomplete = [] } = {}) {
  return {
    violations,
    incomplete,
    passes: [],
    inapplicable: [],
    url: 'http://localhost:3000',
  };
}

function makeViolation(id, {
  impact = 'moderate',
  tags = ['wcag2aa', 'wcag143'],
  nodes = [],
  helpUrl = `https://dequeuniversity.com/rules/axe/4.10/${id}`,
  help = `Audit ${id}`,
} = {}) {
  return {
    id,
    impact,
    tags,
    nodes: nodes.map(sel => ({
      target: [sel],
      html: '<div>mock</div>',  // Should never appear in output
    })),
    helpUrl,
    help,
    description: `Description for ${id}`,
  };
}
```

Test cases:
- `compressResults` returns correct violation count
- Groups by impact level correctly
- Includes WCAG criterion + level in output (e.g., `[1.4.3 AA]`)
- Includes help URL per violation
- Delta mode filters to AAA-only violations
- `includeIncomplete` adds "Needs Review" section
- Deduplicates selectors with `×` count
- Truncates long selectors
- Tiered element detail: critical/serious show 5, moderate/minor show 3
- Clean page produces one line
- Output never exceeds MAX_OUTPUT_LINES
- Output never exceeds MAX_OUTPUT_CHARS
- HTML snippets (`node.html`) never appear in output
- Sanitizes control characters in selectors

### `test/rules.test.js`

Test the rule registry queries:
- `getRules()` returns non-empty array
- `getRules({ level: 'aa' })` returns only AA-tagged rules
- `getRules({ criterion: '1.4.3' })` filters correctly
- `getRules({ search: 'contrast' })` matches by ID and description
- `getRuleInfo('color-contrast')` returns rule details
- `getRuleInfo('nonexistent-rule')` returns null
- Formatted rule list does not exceed output limits

### `test/config.test.js`

Copy lightcap's config test pattern:
- All numeric limits positive
- LEVEL_TAGS has entries for a, aa, aaa, best-practice
- AA tags include all A tags (cumulative)
- AAA tags include all AA tags (cumulative)
- BLOCKED_HOSTNAMES includes expected entries
- BLOCKED_IP_PREFIXES covers RFC1918, loopback, etc.
- IMPACT_ORDER has 4 entries
- MAX_OUTPUT_CHARS is bounded

---

## What NOT To Do

- **No TypeScript.** Plain `.js` with ES modules.
- **No build step.** Source files ship as-is.
- **No extra dependencies** beyond the install list.
- **No HTTP server.** stdio only.
- **Never return raw axe-core JSON to Claude.** Always compress. JSON goes to disk only.
- **Never include `node.html` in output.** HTML snippets from axe-core could be megabytes and contain adversarial content. Use CSS selectors only (`node.target`).
- **No `@axe-core/playwright`.** We inject `axe.source` directly.
- **No Lighthouse.** axe-core is the engine.
- **Do not exceed ~200 lines** in any tool response.
- **Error messages to Claude must be generic** — no internal paths, IPs, or stack traces. Details go to stderr only.
- **Follow lightcap's patterns** for everything not axe-specific (MCP setup, Zod schemas, logging, URL validation, directory validation, test structure, publish.sh, error sanitization).
- **Do not copy code from @axe-core/cli or @axe-core/playwright.** This is an original implementation.

---

## Testing Locally

### Playwright browser install

After `npm install`, ensure Chromium is downloaded:

```bash
npx playwright install chromium
```

This is a one-time setup. The `postinstall` script in package.json attempts this automatically.

### There is no build step

Plain JS. `node src/server.js` runs directly.

### Workflow

```bash
# 1. Register with Claude Code (once)
claude mcp add axecap -s user -- node /absolute/path/to/axecap-mcp/src/server.js

# 2. Restart Claude Code

# 3. Spin up a test target
npx serve -l 3000 .

# 4. Test from Claude Code:
#    "Use axecap to audit http://localhost:3000 for WCAG AA"
#    "Audit localhost:3000 for AAA and show only the delta from AA"
#    "What axe-core rules cover WCAG criterion 1.4.3?"
#    "Get info on the color-contrast rule"
#    "What version of axecap is running?"
#    "Audit file:///etc/passwd" (should fail)
```

### Run tests

```bash
npm test
```

---

## Done Criteria

Phase 1 is complete when:

- [ ] `npm install` succeeds (including Playwright Chromium download)
- [ ] Server starts via `node src/server.js` without errors
- [ ] `audit_url` returns compressed violations grouped by impact with WCAG criteria and help URLs
- [ ] `audit_url` with `level: 'aaa'` returns AAA-level violations
- [ ] `audit_url` with `level: 'aaa', delta: true` returns only AAA-specific violations
- [ ] `audit_url` with `rules: ['color-contrast']` audits only that rule
- [ ] `audit_url` with `includeIncomplete: true` includes "needs review" section
- [ ] `audit_url` with `waitFor` waits for a selector before auditing
- [ ] `audit_html` accepts raw HTML and returns violations
- [ ] `get_rules` lists rules, filterable by level, criterion, and search
- [ ] `get_rule_info` returns detailed rule metadata
- [ ] `get_status` returns server version, axe-core version, Playwright version, update check
- [ ] Compressed output never exceeds ~200 lines / 50,000 chars
- [ ] Raw axe JSON is never returned to Claude
- [ ] HTML snippets (`node.html`) never appear in output
- [ ] `file://` and metadata URLs are rejected with generic error messages
- [ ] Post-navigation URL recheck catches redirects to blocked URLs
- [ ] Directory parameter saves full JSON to disk
- [ ] Browser is killed after every audit (`finally` block)
- [ ] Concurrency limited to 2 audits (queue + counter)
- [ ] 60s total timeout, 30s navigation timeout, 30s axe timeout
- [ ] CLI works: `axecap audit`, `axecap rules`, `axecap rule-info`, `axecap status`
- [ ] All tests pass (`npm test`) — target 60+ tests
- [ ] Registered and working in Claude Code via `claude mcp add`
- [ ] Audit → fix → re-audit loop works in a Claude Code session
- [ ] Error messages returned to Claude contain no internal paths or IPs
- [ ] `publish.sh` works for npm publish
