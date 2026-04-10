# axecap-mcp — Doc 00: Master Design Document

> **Project name:** `axecap`
> **npm package:** `@icjia/axecap`
> **GitHub repo:** `https://github.com/ICJIA/axecap-mcp`
> **Platforms:** macOS, Linux (Ubuntu)
> **Node:** >= 18

---

## Purpose

A lightweight local MCP server for Claude Code that runs axe-core accessibility audits via Playwright and returns compressed, actionable results optimized for Claude's context window. Where lightcap wraps Lighthouse (which embeds axe-core behind several layers of abstraction), axecap runs axe-core **directly** — giving full control over WCAG conformance level targeting (A, AA, AAA), rule selection, and element-level detail that Lighthouse filters or aggregates away.

## Why Not Just Use lightcap?

lightcap is the right tool when you want a holistic Lighthouse audit (performance + a11y + SEO + best practices). But lightcap's accessibility results come from Lighthouse's interpretation of axe-core, which:

1. **Filters rules** — Lighthouse includes ~40 of axe-core's ~90+ rules, dropping many AAA and best-practice rules
2. **Loses granularity** — Lighthouse aggregates axe results into its own scoring system; individual rule metadata (tags, impact, help URLs) is partially stripped
3. **Cannot target conformance levels** — you can't ask Lighthouse for "AAA only" or "just the delta between AA and AAA"
4. **Merges axe-core's `incomplete` category into passes** — axe-core distinguishes "passed," "failed," and "needs review" (incomplete); Lighthouse collapses the third

axecap solves all four. It's the precision tool for WCAG compliance work; lightcap is the broad-spectrum audit tool.

### When to use which

| Scenario | Tool |
|----------|------|
| Pre-deploy check (perf + a11y + SEO) | lightcap `run_audit` |
| Quick a11y score with impact grouping | lightcap `run_a11y` |
| Targeted WCAG AA compliance audit | **axecap** `audit_url` |
| AAA gap analysis (what would it take?) | **axecap** `audit_url` with `level: 'aaa'` |
| Audit specific rules (e.g., color-contrast only) | **axecap** `audit_url` with `rules` filter |
| Get detailed rule documentation mid-fix | **axecap** `get_rule_info` |
| Look up which rules map to a WCAG criterion | **axecap** `get_rules` |
| Multi-site performance + a11y sweep | lightcap `run_audit` |

---

## Use Case

From Claude Code: *"Audit localhost:3000 for WCAG AAA compliance"* — this server launches Playwright, injects axe-core, runs the audit at the specified conformance level, and returns structured violations that Claude can immediately fix in your code.

**The workflow that matters:**

```
You: "Audit localhost:3000 for WCAG AA"
Claude: [calls audit_url] 14 violations (3 critical, 5 serious, 4 moderate, 2 minor)
Claude: "I see 3 critical violations. Let me fix them now."
Claude: [edits your source files]
You: "Run it again"
Claude: [calls audit_url] 6 violations (0 critical, 2 serious, 3 moderate, 1 minor)
```

Same audit → fix → re-audit loop as lightcap, but with axe-core's full rule set and conformance-level targeting.

---

## Reference & Clean-Room Disclaimer

This design is informed by axe-core's public documentation, API, and rule registry. **This is an original implementation.** axe-core is used as a library dependency (Mozilla Public License 2.0). No code from third-party axe wrapper packages (e.g., @axe-core/cli, accessibility-checker) is used. Playwright is used for browser automation (Apache 2.0).

---

## Context Window Impact

Same central design constraint as lightcap: every tool response must fit Claude's working memory.

| Response type | Estimated size | Tokens (~) |
|---------------|---------------|------------|
| Clean page (0 violations) | 1-2 lines | ~30 |
| Page with 5 violations | ~20-30 lines | ~500 |
| Heavy violation page (30+ rules) | ~80-150 lines | ~2,000 |
| Rule info lookup | ~10-15 lines | ~200 |
| Rule list (filtered) | ~20-40 lines | ~600 |
| Raw axe-core JSON (NEVER returned) | ~5,000-50,000 lines | ~50,000-500,000 |

### Compression strategy

axe-core returns deeply nested JSON with HTML snippets, full DOM node references, related nodes, and verbose `any`/`all`/`none` check arrays. The compression engine applies:

1. **Violations only by default** — passes and inapplicable rules skipped entirely (zero tokens)
2. **Incomplete (needs-review) as opt-in** — returned only when `includeIncomplete: true`
3. **Compact header** — URL, conformance level, violation count, impact summary on one line
4. **Impact grouping** — critical/serious/moderate/minor with shorthand notation (same as lightcap)
5. **CSS selectors only** — no HTML snippets, no full DOM node trees
6. **Selector deduplication** — `img.card (×8)` not eight separate entries
7. **Selector truncation** — capped at 60 chars (same as lightcap)
8. **WCAG tags extracted** — `wcag111` → `1.1.1`, with conformance level shown: `[1.1.1 A]`
9. **Top N violations per impact group** — configurable, default 10
10. **Tiered element detail** — critical/serious show 5 elements, moderate/minor show 3 (same as lightcap)
11. **Help URL included per rule** — one-line Deque reference link for each violation (Claude can fetch if needed)
12. **Hard cap** — 200 lines / 50,000 chars (same as lightcap)

**What is never returned:** raw axe JSON, full HTML snippets, DOM node trees, related node arrays, `any`/`all`/`none` check detail, inapplicable rules.

### Why plain text, not JSON?

Same rationale as lightcap: ~30% fewer tokens, easier for Claude to scan, still structured enough to act on.

---

## Architecture

```
Claude Code
    ├── Chrome MCP ──► browser automation, DOM, navigation
    ├── @icjia/viewcap ──► screenshots
    ├── @icjia/lightcap ──► Lighthouse audits (broad spectrum)
    └── @icjia/axecap ──► axe-core audits (precision WCAG compliance)
            │
            src/
            ├── server.js ........... MCP server init + tool handlers + version tracking
            ├── runner.js ........... Playwright launch + axe-core injection + URL/directory validation
            ├── compress.js ......... axe results → compressed plain text
            ├── rules.js ............ axe-core rule registry queries (metadata, tags, filtering)
            ├── cli.js .............. Commander-based standalone CLI
            └── config.js ........... Constants, logging helper
```

| File | Lines (est.) | Role |
|------|-------------|------|
| `server.js` | ~160 | MCP init, 4 tool registrations, request routing |
| `runner.js` | ~150 | Playwright lifecycle, axe-core injection + execution, URL validation |
| `compress.js` | ~200 | Filter violations, group by impact, format output |
| `rules.js` | ~80 | Query axe-core's rule registry by tag, criterion, or ID |
| `cli.js` | ~120 | `audit`, `rules`, `rule-info`, `status` subcommands |
| `config.js` | ~50 | Constants, metric thresholds, logging |

**Total: ~760 lines estimated.**

### Why Playwright, not chrome-launcher?

lightcap uses `chrome-launcher` because Lighthouse manages its own Chrome connection internally. axecap needs to:

1. Navigate to the page
2. Wait for load
3. Inject and execute `axe.run()` in the page context
4. Retrieve results

Playwright handles all of this natively with `page.evaluate()`. Using `chrome-launcher` + manual CDP commands would be reinventing Playwright poorly. Playwright also gives us Firefox and WebKit testing for free in Phase 2 if needed.

---

## WCAG Conformance Level Targeting

This is the core differentiator from lightcap. axe-core tags every rule with its WCAG conformance level:

| axe-core tag | WCAG Level | Meaning |
|-------------|------------|---------|
| `wcag2a` | A | Minimum accessibility |
| `wcag2aa` | AA | Standard target (ADA Title II) |
| `wcag2aaa` | AAA | Highest conformance |
| `wcag21a` | A (2.1) | WCAG 2.1 additions at Level A |
| `wcag21aa` | AA (2.1) | WCAG 2.1 additions at Level AA |
| `wcag22aa` | AA (2.2) | WCAG 2.2 additions at Level AA |
| `best-practice` | — | Not WCAG-mapped |

### Level filtering logic

| `level` param | axe-core `runOnly.values` | What it audits |
|---------------|--------------------------|----------------|
| `'a'` | `['wcag2a', 'wcag21a']` | Level A only |
| `'aa'` (default) | `['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa', 'wcag22aa']` | A + AA (cumulative) |
| `'aaa'` | `['wcag2a', 'wcag21a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'wcag2aaa']` | A + AA + AAA (cumulative) |
| `'best-practice'` | `['best-practice']` | Best practices only (not WCAG) |

WCAG conformance is cumulative: AAA includes all AA rules, which include all A rules. The `level` parameter handles this automatically — the user doesn't need to think about tag composition.

### Delta mode

For "what would it take to go from AA to AAA?", the user can pass `level: 'aaa'` and `delta: true`, which returns **only AAA-specific violations** (rules tagged `wcag2aaa` that aren't also tagged `wcag2a` or `wcag2aa`). This is implemented as a post-filter, not a separate axe-core run.

---

## MCP Tools

### 1. `audit_url`

Run an axe-core accessibility audit on a URL at a specified WCAG conformance level.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | *(required)* | HTTP/HTTPS URL to audit |
| `level` | string | `'aa'` | WCAG conformance level: `'a'`, `'aa'`, `'aaa'`, `'best-practice'` |
| `delta` | boolean | `false` | If true with `level: 'aaa'`, show only AAA-specific violations |
| `rules` | string[] | — | Run only these specific rule IDs (e.g., `['color-contrast', 'image-alt']`) |
| `maxViolations` | number | 10 | Top N violations per impact group (max 15) |
| `viewport` | string | `'desktop'` | `'desktop'` or `'mobile'` |
| `includeIncomplete` | boolean | `false` | Include "needs review" results |
| `waitFor` | string | — | CSS selector to wait for before auditing (for SPAs) |
| `directory` | string | — | Save full JSON results to this directory |

**Returns:** Compressed plain text with violation count, impact grouping, WCAG criteria, CSS selectors, and help URLs.

**Example output (page with violations at AA):**

```
axe: http://localhost:3000 [desktop] AA — 14 violations (3c 5s 4m 2n)

── Critical (3 violations, 18 el) ──
  ✗ image-alt [1.1.1 A] (12 el)
    → img.hero-image
    → img.card-thumb (×8)
    → img.logo
    → img.partner-logo (×2)
    → (+7)
    ℹ https://dequeuniversity.com/rules/axe/4.10/image-alt
  ✗ color-contrast [1.4.3 AA] (4 el)
    → p.subtitle
    → span.caption
    → a.nav-link
    → (+1)
    ℹ https://dequeuniversity.com/rules/axe/4.10/color-contrast
  ✗ label [1.3.1 A] (2 el)
    → input#search
    → input#email
    ℹ https://dequeuniversity.com/rules/axe/4.10/label

── Serious (5 violations, 11 el) ──
  ✗ heading-order [1.3.1 A] (1 el)
    → section.content > h4
    ℹ https://dequeuniversity.com/rules/axe/4.10/heading-order
  ✗ link-name [2.4.4 A] (3 el)
    → a.icon-link, a.social-fb, a.social-tw
    ℹ https://dequeuniversity.com/rules/axe/4.10/link-name
  ...

── Moderate (4 violations, 8 el) ──
  ...

── Minor (2 violations, 3 el) ──
  ...
```

**Example output (clean page):**

```
axe: http://localhost:3000 [desktop] AA — 0 violations
```

One line. ~20 tokens.

**Example output (AAA delta):**

```
axe: http://localhost:3000 [desktop] AAA (delta from AA) — 6 violations (0c 2s 3m 1n)

── Serious (2 violations, 5 el) ──
  ✗ link-in-text-block [1.4.1 A] (3 el)
    → a.inline-link (×3)
    ℹ https://dequeuniversity.com/rules/axe/4.10/link-in-text-block
  ✗ meta-viewport-large [1.4.4 AA] (2 el)
    ...
```

### 2. `audit_html`

Run an axe-core audit on a raw HTML string. Useful for testing components or generated markup without a running server.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `html` | string | *(required)* | HTML content to audit |
| `level` | string | `'aa'` | WCAG conformance level |
| `rules` | string[] | — | Specific rule IDs to run |
| `maxViolations` | number | 10 | Top N per impact group |

**Implementation:** Playwright navigates to `about:blank`, sets `page.setContent(html)`, then runs axe. Same compression as `audit_url`.

**Context cost:** Same as `audit_url` — depends on violation count.

### 3. `get_rules`

List axe-core rules, optionally filtered by WCAG level or tag.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `level` | string | — | Filter to rules at this WCAG level (`'a'`, `'aa'`, `'aaa'`) |
| `criterion` | string | — | Filter to rules for a specific WCAG criterion (e.g., `'1.4.3'`) |
| `search` | string | — | Search rule IDs and descriptions (substring match) |

**Returns:** Compact list of matching rules with ID, description, WCAG criterion, impact, and tags.

**Example output:**

```
axe-core rules (AA, 47 rules):

  color-contrast [1.4.3 AA] serious — Elements must meet minimum color contrast ratio thresholds
  image-alt [1.1.1 A] critical — Images must have alternate text
  label [1.3.1 A] critical — Form elements must have labels
  link-name [2.4.4 A] serious — Links must have discernible text
  ...
```

**Example (criterion filter):**

```
axe-core rules for WCAG 1.4.3 (2 rules):

  color-contrast [1.4.3 AA] serious — Elements must meet minimum color contrast ratio thresholds
  link-in-text-block [1.4.1 A] serious — Links must be distinguishable without relying on color
```

### 4. `get_rule_info`

Get detailed information about a specific axe-core rule.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ruleId` | string | *(required)* | axe-core rule ID (e.g., `'color-contrast'`) |

**Returns:** Rule metadata including description, help text, WCAG criteria, impact, tags, and help URL.

**Example output:**

```
axe rule: color-contrast
  Impact:    serious
  WCAG:      1.4.3 (AA)
  Tags:      wcag2aa, wcag143, cat.color
  Help:      Elements must meet minimum color contrast ratio thresholds
  Help URL:  https://dequeuniversity.com/rules/axe/4.10/color-contrast
  Checks:    color-contrast-enhanced, color-contrast
```

### 5. `get_status`

Returns server version, axe-core version, Playwright version, and update availability.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| *(none)* | — | — | No parameters |

**Example output:**

```
axecap status
  Server:     @icjia/axecap v0.1.0
  axe-core:   v4.10.2 (latest: v4.10.2)
  Playwright: v1.49.1
  Node:       v22.22.0
  Platform:   darwin arm64
```

---

## axe-core Injection Strategy

### How axe-core is executed

```javascript
import { chromium } from 'playwright';
import axe from 'axe-core';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle' });

// Optional: wait for SPA rendering
if (waitFor) {
  await page.waitForSelector(waitFor, { timeout: 10_000 });
}

// Inject axe-core source into the page
await page.evaluate(axe.source);

// Run axe with configuration
const results = await page.evaluate((config) => {
  return window.axe.run(document, config);
}, {
  runOnly: {
    type: 'tag',
    values: levelTags,  // e.g., ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']
  },
  // Or, if specific rules requested:
  // runOnly: { type: 'rule', values: ['color-contrast', 'image-alt'] },
  resultTypes: includeIncomplete
    ? ['violations', 'incomplete']
    : ['violations'],
});

await browser.close();
```

### Why inject source, not use @axe-core/playwright?

`@axe-core/playwright` is a convenience wrapper. Injecting `axe.source` directly:
- Gives full control over `axe.run()` configuration
- Avoids an extra dependency
- Makes the injection/execution pattern transparent and auditable
- Matches the pattern used in `a11yscan` (Chris's existing tool)

### SPA support via `waitFor`

Single-page apps (Vue, React, Nuxt) render asynchronously. The `waitFor` parameter accepts a CSS selector — the audit waits for that element to appear before running axe-core. Without it, `networkidle` is usually sufficient, but for heavily dynamic pages this provides a safety valve.

---

## Compression Logic (`compress.js`)

### `compressViolations(results, maxViolations, delta)`

Input: axe-core results object (`{ violations, incomplete, passes, inapplicable }`)

Steps:

1. **Extract violations** — each violation has `id`, `impact`, `description`, `help`, `helpUrl`, `tags`, and `nodes[]`
2. **Optional delta filter** — if `delta` is true, remove violations whose tags don't include the target-level-specific tag (e.g., keep only `wcag2aaa`-tagged rules)
3. **Group by impact** — `critical`, `serious`, `moderate`, `minor` (same ordering as lightcap)
4. **Per violation:**
   - Extract rule ID, WCAG criterion + level from tags (e.g., `[1.4.3 AA]`)
   - Count affected elements from `nodes.length`
   - Extract CSS selectors from `node.target[]` (axe-core uses `target` not `selector`)
   - Deduplicate selectors, truncate to 60 chars
   - Include help URL (one line, Deque University link)
5. **Cap** at `maxViolations` per impact group, sorted by node count descending
6. **Compact header** with URL, level, violation count, impact shorthand
7. **Optional incomplete section** — same format, prefixed with `⚠` instead of `✗`
8. **Truncate** at 200 lines / 50,000 chars

### axe-core `target` vs Lighthouse `selector`

axe-core uses `node.target` which is an array of CSS selectors (for iframe nesting). For top-level elements, `target[0]` is the selector string. For iframed elements, the array has multiple entries. The compression engine joins with ` > ` for nested cases and uses `target[0]` for simple cases.

### WCAG criterion extraction from tags

axe-core tags use the same format as Lighthouse internally: `wcag111` = 1.1.1, `wcag1412` = 1.4.12. Reuse lightcap's `parseWcagCriterion()` logic. Additionally extract the level tag (`wcag2a`, `wcag2aa`, `wcag2aaa`) to display as `[1.4.3 AA]`.

---

## Rule Registry (`rules.js`)

axe-core exposes its full rule registry via `axe.getRules()`. This returns metadata for every rule without running an audit.

```javascript
import axe from 'axe-core';

const allRules = axe.getRules();
// Returns: [{ ruleId, description, help, helpUrl, tags }, ...]

const aaRules = axe.getRules(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
// Returns only rules tagged with any of these tags
```

This powers `get_rules` and `get_rule_info` without launching a browser — fast, zero-cost queries.

---

## Security

Same threat model as lightcap — local stdio server, no network listener.

### Mitigations

| Risk | Mitigation |
|------|-----------:|
| SSRF via URL parameter | Same validation as lightcap: scheme whitelist, metadata blocklist, IP resolution, fail-closed DNS |
| SSRF via redirects | Post-navigation URL check: `page.url()` validated against blocklist after load |
| Resource exhaustion | 60s hard timeout on page load + axe execution; browser killed in `finally` block |
| Concurrent audits | Max 2 concurrent (same as lightcap); serialization queue |
| Directory traversal | Same as lightcap: symlink-aware validation, home + `/tmp` only |
| Prompt injection via page content | All page-controlled content (selectors, descriptions) sanitized: control chars, newlines, zero-width chars stripped |
| Raw results exposure | Full axe JSON never returned to Claude; JSON saved to disk only |
| HTML snippet injection | axe-core's `node.html` field (contains raw page HTML) is **never included** in output |
| No network listener | stdio transport only |
| Playwright sandbox | Chromium launched with sandbox flags matching lightcap's Chrome flags |

### HTML input sanitization (`audit_html`)

The `audit_html` tool accepts raw HTML — this could contain malicious scripts. Playwright runs in a sandboxed browser context, so scripts execute in the browser sandbox, not in Node. The HTML is injected via `page.setContent()`, never via filesystem writes. No `file://` URLs are ever used.

### Resource limits

| Resource | Limit | Enforced By |
|----------|-------|-------------|
| Concurrent audits | 2 max | runner.js |
| Page load timeout | 30s | Playwright `goto` options |
| axe-core execution timeout | 30s | `page.evaluate` timeout |
| Total audit timeout | 60s | Promise.race in runner.js |
| URL length | 2048 chars | Zod schema |
| HTML input length | 500KB | Zod schema |
| Directory path length | 500 chars | Zod schema |
| Violations per impact group | 15 max | Zod schema + compress.js |
| Elements per violation | 5 shown | compress.js |
| Selector length | 60 chars | compress.js |
| Output lines | 200 max | compress.js |
| Output characters | 50,000 max | compress.js |
| Browser process | killed in finally | runner.js |

---

## Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/server": "^2.0.0-alpha.2",
    "axe-core": "^4.10.0",
    "playwright": "^1.49.0",
    "commander": "^14.0.3",
    "zod": "^4.3.6"
  }
}
```

**Comparison to lightcap:**
- `playwright` replaces `lighthouse` + `chrome-launcher` — Playwright handles both browser lifecycle and page interaction
- `axe-core` is the audit engine (used as a library, injected into page context)
- Same MCP SDK, Zod, Commander pattern

**Not needed:**
- No `chrome-launcher` — Playwright manages Chromium
- No `lighthouse` — axe-core is the engine
- No `sharp` — no image processing
- No `@axe-core/playwright` — we inject `axe.source` directly for full control

**Note:** `playwright` is a large dependency (~150MB installed, includes Chromium binary). First install runs `npx playwright install chromium`. The runtime overhead is Playwright + Chromium, comparable to lightcap's Lighthouse + Chrome.

---

## Project Structure

```
axecap-mcp/
├── package.json
├── .gitignore
├── .nvmrc
├── CLAUDE.md
├── CHANGELOG.md
├── LICENSE
├── publish.sh
├── README.md
├── docs/
│   ├── axecap-mcp-design.md          # This document
│   └── axecap-mcp-phase1-build-prompt.md
├── src/
│   ├── server.js
│   ├── runner.js
│   ├── compress.js
│   ├── rules.js
│   └── config.js
└── test/
    ├── url-validation.test.js
    ├── compress.test.js
    ├── rules.test.js
    └── config.test.js
```

No build step. Plain JS with ES modules. Same pattern as lightcap.

---

## Distribution & Configuration

### Claude Code Registration

```bash
# User-level (recommended)
claude mcp add axecap -s user -- npx -y @icjia/axecap

# Local development
claude mcp add axecap -s user -- node /absolute/path/to/axecap-mcp/src/server.js
```

### Manual config

```json
{
  "mcpServers": {
    "axecap": {
      "command": "npx",
      "args": ["-y", "@icjia/axecap"]
    }
  }
}
```

### Using alongside lightcap, viewcap, and Chrome MCP

Add to your project's `CLAUDE.md`:

```markdown
# Tool preferences
- For WCAG compliance audits (A/AA/AAA, specific rules, rule lookups), use the `axecap` MCP server.
- For Lighthouse audits (performance, accessibility, SEO, best practices), use the `lightcap` MCP server.
- For all screenshots, use the `viewcap` MCP server.
- For version info on MCP tools, use the relevant server's `get_status` tool.
- Use Chrome MCP for browser automation, DOM interaction, and navigation only.
```

---

## CLI (standalone usage)

```bash
# Install globally (or use npx)
npm install -g @icjia/axecap

# WCAG AA audit (default)
axecap audit http://localhost:3000

# WCAG AAA audit
axecap audit http://localhost:3000 --level aaa

# AAA delta (only AAA-specific violations)
axecap audit http://localhost:3000 --level aaa --delta

# Specific rules only
axecap audit http://localhost:3000 --rules color-contrast,image-alt

# Include "needs review" results
axecap audit http://localhost:3000 --include-incomplete

# Mobile viewport
axecap audit http://localhost:3000 --viewport mobile

# Wait for SPA element before auditing
axecap audit http://localhost:3000 --wait-for "#app-loaded"

# Save full JSON to directory
axecap audit http://localhost:3000 --directory ~/reports

# List AA rules
axecap rules --level aa

# Rules for a specific WCAG criterion
axecap rules --criterion 1.4.3

# Search rules
axecap rules --search contrast

# Rule detail
axecap rule-info color-contrast

# Check versions
axecap status

# Verbose logging
axecap-mcp --verbose audit http://localhost:3000
```

When run without a subcommand, `axecap` starts in MCP server mode (stdio transport).

---

## Build Phases

### Phase 1 — Core audit + compression (~4 hours)

- `config.js` + `runner.js` + `compress.js` + `rules.js` + `server.js`
- `audit_url` tool working end-to-end with WCAG level targeting
- `audit_html` tool for raw HTML auditing
- `get_rules` tool with level/criterion/search filtering
- `get_rule_info` tool for single-rule lookup
- `get_status` tool
- URL validation (SSRF prevention — copy from lightcap)
- Compression producing ~30-150 line summaries
- Test from Claude Code: audit → see violations → Claude fixes code → re-audit

**Testable deliverable:** "Audit localhost:3000 for WCAG AAA" returns compressed, actionable violations grouped by impact with WCAG criteria and help URLs.

### Phase 2 — Polish + CLI (~2 hours)

- CLI with `audit`, `rules`, `rule-info`, `status` subcommands
- `publish.sh`
- Delta mode for AAA gap analysis
- `includeIncomplete` support
- `waitFor` parameter for SPA support
- Directory save mode (full JSON to disk)
- README with install/config/usage
- npm publish as `@icjia/axecap`

**Testable deliverable:** `npx -y @icjia/axecap` works in Claude Code config. Delta mode shows only AAA-specific violations.

### Phase 3 — Hardening (~2 hours)

- Red/blue team adversarial audit (same pattern as lightcap v0.1.4)
- Post-navigation URL recheck
- Concurrency queue
- Error message sanitization
- Prompt injection via crafted selectors/ARIA labels
- CHANGELOG with security audit results
- Comprehensive test suite (target: 80+ tests)

**Testable deliverable:** All security mitigations from lightcap v0.1.4 ported and tested.

### Phase 4 — Advanced features (future)

- Page-level scope (`audit_url` with `selector` param to audit a subtree)
- Multi-page batch audit
- Diff between two audit runs
- Custom axe-core rule injection
- Firefox/WebKit browser support (Playwright makes this trivial)

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| axe-core directly, not via Lighthouse | Full rule set, conformance level targeting, `incomplete` category, no Lighthouse filtering |
| Playwright, not chrome-launcher | Need `page.evaluate()` for axe injection; Playwright handles browser lifecycle + navigation |
| Inject `axe.source`, not `@axe-core/playwright` | Full control, one fewer dependency, matches `a11yscan` pattern |
| WCAG level as cumulative | Users think "audit for AA" meaning "everything AA requires" — that's A + AA combined |
| Delta mode as post-filter | One axe run, filter results — simpler than two runs and diffing |
| `audit_html` tool | Component-level testing without a running server; unique capability vs lightcap |
| `get_rules` / `get_rule_info` | Mid-fix reference — Claude can look up rule details without leaving the conversation |
| Help URLs in violation output | One-click Deque University reference; Claude can `web_fetch` for detailed remediation if needed |
| Same security posture as lightcap | Proven mitigations; same threat model; copy-paste URL validation |
| HTML snippets never returned | axe-core's `node.html` could contain megabytes of DOM; selectors are sufficient for locating elements |
| 5 tools (not 3 like lightcap) | `audit_html` and `get_rules` are genuinely new capabilities that justify the tool count |

---

## ICJIA-Specific Usage

### ADA Title II compliance (April 24, 2026 deadline)

The primary workflow is identical to lightcap's, but with precision targeting:

```
You: "Audit localhost:3000 for WCAG AA with axecap-mcp"
You: "Fix all critical and serious violations"
You: "Run it again — how many violations remain?"
You: "Now show me what AAA violations exist (delta mode)"
You: "Which of those are feasible to fix?"
```

### The sia-r110 problem

The ~1,860 pages flagged with "All roles are invalid" (sia-r110) from Vuetify's auto-generated `role` attributes — axecap-mcp can target this specifically:

```
You: "Audit localhost:3000 with axecap-mcp, rules: aria-allowed-role"
```

This runs only the relevant rule, returning exactly the elements with invalid roles. lightcap can't do this — it runs Lighthouse's full accessibility category.

### Pre-deploy checks

Add to your `CLAUDE.md`:

```markdown
# Deploy checklist
Before any deploy to production:
1. Run `axecap audit_url` against localhost with level AA
2. Verify 0 critical violations and 0 serious violations
3. Run `lightcap run_audit` for performance + SEO baseline
```

---

## Resolved Questions

1. **Package name:** `axecap`. Repo: `ICJIA/axecap-mcp`. npm: `@icjia/axecap`.

2. **Shared URL validation:** Copy from lightcap's `runner.js` (~60 lines). Extract to `@icjia/mcp-utils` only if/when a fourth server needs it.

3. **axe-core version:** Pin to `^4.10.0`. The `get_status` tool reports installed version and checks npm for latest.

4. **Playwright browser:** Chromium only in Phase 1. Playwright downloads it on first install. Firefox/WebKit are Phase 4.

5. **Relationship to `a11yscan`:** `a11yscan` is a CLI-only batch auditor for generating reports. `axecap` is an MCP server for real-time Claude Code integration. Different tools for different workflows. They share the same axe-core + Playwright pattern but are separate projects.

6. **Why not merge into lightcap?** Different engines (Lighthouse vs axe-core), different dependencies (chrome-launcher vs Playwright), different capabilities (broad audit vs precision WCAG). Keeping them separate follows the Unix philosophy: each tool does one thing well. The `CLAUDE.md` tool preferences guide Claude to the right tool for each query.
