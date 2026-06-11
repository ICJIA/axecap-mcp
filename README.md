# @icjia/axecap

A lightweight local MCP server that runs axe-core accessibility audits via Playwright and returns compressed, actionable results optimized for Claude's context window. Where lightcap wraps Lighthouse (which embeds axe-core behind several layers of abstraction), axecap runs axe-core **directly** — giving full control over WCAG conformance level targeting (A, AA, AAA), rule selection, and element-level detail that Lighthouse filters or aggregates away.

## Why?

A raw axe-core result object can be 50K-500K tokens — deeply nested JSON with HTML snippets, full DOM node references, related nodes, and verbose check arrays. AxeCap compresses that into ~30-150 lines of structured plain text that Claude can read and act on immediately.

The workflow that matters:

```
You: "Audit localhost:3000 for WCAG AA"
Claude: [calls audit_url] 14 violations (3 critical, 5 serious, 4 moderate, 2 minor)
Claude: "I see 3 critical violations. Let me fix them now."
Claude: [edits your source files]
You: "Run it again"
Claude: [calls audit_url] 6 violations (0 critical, 2 serious, 3 moderate, 1 minor)
```

This audit → fix → re-audit loop is what makes an MCP server more valuable than the axe-core CLI.

## Why not just use lightcap?

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
| AAA gap analysis (what would it take?) | **axecap** `audit_url` with `level: 'aaa', delta: true` |
| Audit specific rules (e.g., color-contrast only) | **axecap** `audit_url` with `rules` filter |
| Get detailed rule documentation mid-fix | **axecap** `get_rule_info` |
| Look up which rules map to a WCAG criterion | **axecap** `get_rules` |
| Multi-site performance + a11y sweep | lightcap `run_audit` |
| Test a component's HTML without a server | **axecap** `audit_html` |

## What it does

- Runs axe-core audits directly (not through Lighthouse) for full rule-set access
- Targets WCAG conformance levels: A, AA (default), AAA, or best-practice
- AAA delta mode shows only the gap from AA to AAA ("what would it take?")
- Audits specific axe-core rules by ID (e.g., `color-contrast`, `image-alt`)
- Audits raw HTML content without a running server (component testing)
- Compresses ~50K-500K token axe-core JSON into ~30-150 lines of structured plain text
- Groups violations by impact: critical, serious, moderate, minor
- Includes WCAG criteria + conformance level per violation (e.g., `[1.4.3 AA]`)
- Includes Deque University help URLs per violation
- Includes "needs review" (incomplete) results as opt-in
- Queries axe-core's rule registry without launching a browser (instant response)
- Waits for SPA elements before auditing (`waitFor` parameter)
- Optionally saves full JSON results to disk for manual review
- Reports server, axe-core, and Playwright version info with npm update availability
- Standalone CLI for use outside of MCP clients
- Runs as a local MCP server over stdio (no HTTP, no ports, no remote attack surface)

## Installation

### Prerequisites

- **Node.js >= 18** (check with `node --version`)
- **Claude Code**, **Cursor**, or any MCP-compatible client (for MCP mode)

Playwright downloads Chromium automatically on first install — no separate browser install needed.

### Option 1: npx (recommended, no install needed)

npx downloads and runs the package automatically. Nothing to install globally.

```bash
# Test that it works
npx -y @icjia/axecap --help
```

### Option 2: Global install

```bash
npm install -g @icjia/axecap
```

### Option 3: Clone for development

```bash
git clone https://github.com/ICJIA/axecap-mcp.git
cd axecap-mcp
npm install
npx playwright install chromium
```

## Setup with Claude Code

Claude Code manages MCP server lifecycle automatically — you register the server once, and Claude Code starts/stops it with each session.

### Using npx (recommended)

```bash
# Register for all projects (user-level)
claude mcp add axecap -s user -- npx -y @icjia/axecap

# Or register for current project only
claude mcp add axecap -s project -- npx -y @icjia/axecap
```

### Using a local clone

```bash
# Point directly at the source (for development)
claude mcp add axecap -s user -- node /absolute/path/to/axecap-mcp/src/server.js
```

### Manual config (edit settings.json directly)

If you prefer, edit `~/.claude/settings.json`:

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

### Verify it's registered

Restart Claude Code after registering. You should see axecap listed when you run `/mcp` in Claude Code. Then test:

> "Use axecap to audit http://localhost:3000 for WCAG AA"

### Tool routing with lightcap, viewcap, and Chrome MCP

If you have lightcap, viewcap, and Chrome MCP registered alongside axecap, add this to your project's `CLAUDE.md` to ensure Claude uses the right tool for each task:

```markdown
# Tool preferences
- For WCAG compliance audits (A/AA/AAA, specific rules, rule lookups), use the `axecap` MCP server (audit_url, audit_html, get_rules, get_rule_info, get_status).
- For Lighthouse audits (performance, accessibility, SEO, best practices), use the `lightcap` MCP server (run_audit, run_a11y, get_status).
- For all screenshots, use the `viewcap` MCP server (take_screenshot, capture_selector, take_screencast).
- For version info on MCP tools, use the relevant server's `get_status` tool.
- Use Chrome MCP for browser automation, DOM interaction, and navigation only.
```

## Setup with Cursor

Cursor supports MCP servers through its settings. Add axecap to your Cursor MCP configuration.

### Global configuration

Edit `~/.cursor/mcp.json` (create it if it doesn't exist):

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

### Project-level configuration

Create `.cursor/mcp.json` in your project root:

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

After adding the configuration, restart Cursor. AxeCap's tools will be available to the AI assistant.

## Setup with other MCP clients

AxeCap works with any MCP client that supports stdio transport. The server communicates over stdin/stdout using JSON-RPC (the MCP protocol). Configure your client to spawn:

```bash
npx -y @icjia/axecap
```

No HTTP ports, no environment variables, no API keys required.

## MCP Tools

### `audit_url`

Run an axe-core accessibility audit on a web page at a specified WCAG conformance level. Default audits A + AA rules (cumulative).

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

One line. ~20 tokens. No wasted context on a page that doesn't need fixing.

**Example output (AAA delta):**

```
axe: http://localhost:3000 [desktop] AAA (delta from AA) — 6 violations (0c 2s 3m 1n)

── Serious (2 violations, 5 el) ──
  ✗ link-in-text-block [1.4.1 A] (3 el)
    → a.inline-link (×3)
    ℹ https://dequeuniversity.com/rules/axe/4.10/link-in-text-block
  ...
```

### `audit_html`

Run an axe-core audit on raw HTML content. Useful for testing components or generated markup without a running server. All network requests from embedded resources are blocked (SSRF-safe).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `html` | string | *(required)* | HTML content to audit |
| `level` | string | `'aa'` | WCAG conformance level |
| `rules` | string[] | — | Specific rule IDs to run |
| `maxViolations` | number | 10 | Top N per impact group |
| `viewport` | string | `'desktop'` | `'desktop'` or `'mobile'` |
| `includeIncomplete` | boolean | `false` | Include needs-review results |

**Returns:** Same compressed format as `audit_url`.

### `get_rules`

List axe-core rules, optionally filtered by WCAG level or tag. Does not require a browser — instant response.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `level` | string | — | Filter to rules at this WCAG level (`'a'`, `'aa'`, `'aaa'`) |
| `criterion` | string | — | Filter to rules for a specific WCAG criterion (e.g., `'1.4.3'`) |
| `search` | string | — | Search rule IDs and descriptions (substring match) |

**Example output:**

```
axe-core rules (AA, 47 rules):

  color-contrast [1.4.3 AA] serious — Elements must meet minimum color contrast ratio thresholds
  image-alt [1.1.1 A] critical — Images must have alternate text
  label [1.3.1 A] critical — Form elements must have labels
  link-name [2.4.4 A] serious — Links must have discernible text
  ...
```

### `get_rule_info`

Get detailed information about a specific axe-core rule.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ruleId` | string | *(required)* | axe-core rule ID (e.g., `'color-contrast'`) |

**Example output:**

```
axe rule: color-contrast
  Impact:    serious
  WCAG:      1.4.3 (AA)
  Tags:      wcag2aa, wcag143, cat.color
  Help:      Elements must meet minimum color contrast ratio thresholds
  Help URL:  https://dequeuniversity.com/rules/axe/4.10/color-contrast
```

### `get_status`

Returns server version, axe-core version, Playwright version, and update availability.

> The "update available" check runs `npm view axe-core version`, a one-time network call at server startup (5s timeout, non-blocking). Offline or behind a firewall it simply reports `(latest)` — no audit functionality depends on it.

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

## WCAG Conformance Level Targeting

This is the core differentiator from lightcap. WCAG conformance is cumulative: AAA includes all AA rules, which include all A rules. The `level` parameter handles this automatically — you don't need to think about tag composition.

| `level` param | What it audits |
|---------------|----------------|
| `'a'` | Level A only |
| `'aa'` (default) | A + AA (everything AA compliance requires) |
| `'aaa'` | A + AA + AAA (full conformance) |
| `'best-practice'` | Best practices only (not WCAG-mapped) |

### Delta mode

For "what would it take to go from AA to AAA?", pass `level: 'aaa'` and `delta: true`. This returns **only AAA-specific violations** — the gap between your current AA compliance and full AAA conformance.

## CLI (standalone usage)

AxeCap includes a standalone CLI for use outside of MCP clients:

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
axecap --verbose audit http://localhost:3000
```

When run without a subcommand, `axecap` starts in MCP server mode (stdio transport).

## Usage examples

From Claude Code or Cursor, just ask naturally:

```
"Audit localhost:3000 for WCAG AA"
"Audit localhost:3000 for AAA and show only the delta from AA"
"Audit localhost:3000 with axecap, rules: aria-allowed-role"
"What axe-core rules cover WCAG criterion 1.4.3?"
"Get info on the color-contrast rule"
"Audit this HTML for accessibility: <img src='photo.jpg'>"
"What version of axecap is running?"
"Fix all critical and serious violations, then re-audit"
```

## Compression strategy

The central design principle: **zero tokens on passes, maximum detail on failures.**

Every tool response must be small enough that Claude retains room to reason and act. A raw axe-core result object can be 50K-500K tokens. AxeCap compresses that to ~20-2,000 tokens depending on the number of violations.

### Context window impact

| Scenario | Lines | Tokens (~) | vs. Raw JSON |
|----------|-------|------------|-------------|
| Clean page (0 violations) | 1 | ~20 | 99.99% smaller |
| Page with 5 violations | ~20-30 | ~500 | 99.90% smaller |
| Heavy violation page (30+ rules) | ~80-150 | ~2,000 | 99.60% smaller |
| Rule info lookup | ~10-15 | ~200 | — |
| Rule list (filtered) | ~20-40 | ~600 | — |
| Raw axe-core JSON (NEVER returned) | ~5K-50K | ~50K-500K | — |

### How compression works

axe-core returns deeply nested JSON with HTML snippets, full DOM node references, related nodes, and verbose `any`/`all`/`none` check arrays. The compression engine applies:

1. **Violations only by default** — passes and inapplicable rules skipped entirely (zero tokens)
2. **Incomplete (needs-review) as opt-in** — returned only when `includeIncomplete: true`
3. **Compact header** — URL, conformance level, violation count, impact summary on one line
4. **Impact grouping** — critical/serious/moderate/minor with shorthand: `3c 5s 4m 2n`
5. **CSS selectors only** — no HTML snippets, no full DOM node trees
6. **Selector deduplication** — `img.card (x8)` not eight separate entries
7. **Selector truncation** — capped at 60 chars
8. **Selector sanitization** — non-CSS characters stripped to prevent prompt injection
9. **WCAG tags extracted** — `wcag111` -> `1.1.1`, with conformance level: `[1.1.1 A]`
10. **Top N violations per impact group** — configurable, default 10
11. **Tiered element detail** — critical/serious show 5 elements, moderate/minor show 3
12. **Help URL included per rule** — one-line Deque University reference link
13. **Hard cap** — 200 lines / 50,000 chars

**What is never returned:** raw axe JSON, full HTML snippets, DOM node trees, related node arrays, `any`/`all`/`none` check detail, inapplicable rules.

### Why plain text, not JSON?

JSON wastes tokens on syntax (`{`, `}`, `"key":`, quotes). Plain structured text is ~30% fewer tokens than equivalent JSON, easier for Claude to scan, and still structured enough to act on.

## Testing

```bash
# Run all tests
npm test

# Run a specific test file
node --test test/compress.test.js
```

The test suite covers:
- **URL validation** — scheme whitelist, blocking of file:/data:/javascript:/ftp: schemes
- **Metadata endpoint blocking** — AWS, GCP, Azure cloud metadata endpoints
- **IP blocking** — localhost bypass, full 127.x loopback range, all RFC1918 172.16-31.x ranges
- **waitFor validation** — CSS-only enforcement, blocking of text=/xpath=/>> pseudo-selectors
- **Sanitization** — control char stripping, newline removal, zero-width char removal, CSS-safe selector filtering
- **Compression** — impact grouping, WCAG criterion extraction, selector deduplication, tiered element detail, delta mode filtering, output line + char limits
- **Rule queries** — level filtering, criterion filtering, search, rule info lookup
- **Error sanitization** — known-safe passthrough, connection/timeout/DNS mapping, path leakage prevention
- **Config sanity** — all numeric limits positive, WCAG level tag cumulation, security constants

## Local development

There is no build step. AxeCap is plain JavaScript with ES modules. The source files are what ships to npm.

```
Edit source files
      |
      v
Restart Claude Code (re-spawns the server from source)
      |
      v
Test by talking to Claude Code ("audit localhost:3000 for WCAG AA")
      |
      v
See a bug? Edit the file, restart Claude Code, repeat.
```

### Quick development setup

```bash
# 1. Clone and install
git clone https://github.com/ICJIA/axecap-mcp.git
cd axecap-mcp
npm install
npx playwright install chromium

# 2. Register your local copy with Claude Code
claude mcp add axecap -s user -- node $(pwd)/src/server.js

# 3. Restart Claude Code

# 4. Spin up a test target in another terminal
npx serve -l 3000 .

# 5. Test from Claude Code:
#    "Use axecap to audit http://localhost:3000 for WCAG AA"
#    "Audit localhost:3000 for AAA and show only the delta from AA"
#    "What axe-core rules cover WCAG criterion 1.4.3?"
```

After editing source files, restart Claude Code to pick up changes (the server is re-spawned fresh each startup).

## Architecture

```
src/
├── server.js ........... MCP server init + 5 tool registrations + version tracking
├── runner.js ........... Playwright launch + axe-core injection + URL/directory validation
├── compress.js ......... axe results → compressed plain text (the core of the server)
├── rules.js ............ axe-core rule registry queries (metadata, tags, filtering)
├── cli.js .............. Commander-based standalone CLI
└── config.js ........... Constants, WCAG level tags, logging helper
```

| File | Role |
|------|------|
| `server.js` | MCP init, Zod schemas for 5 tools, request routing, error handling |
| `runner.js` | Playwright lifecycle, axe-core injection via `page.evaluate()`, URL validation (scheme whitelist, IP resolution, metadata blocklist), directory validation (symlink-aware), waitFor validation |
| `compress.js` | `compressResults()` — impact grouping + WCAG refs + element dedup + help URLs; `formatRuleList()` / `formatRuleInfo()` — rule registry formatting |
| `rules.js` | `getRules()` and `getRuleInfo()` — queries axe-core's built-in rule registry without launching a browser |
| `cli.js` | `audit`, `rules`, `rule-info`, `status` subcommands; falls back to MCP server mode when no subcommand given |
| `config.js` | `CONFIG` object with all limits/thresholds/WCAG tags, `log(level, msg)` helper, `setVerbosity()` |

### Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/server` | MCP server SDK (stdio transport, tool registration) |
| `axe-core` | Deque axe-core accessibility engine (MPL 2.0) — injected into page context |
| `playwright` | Browser automation (launches Chromium, navigates, runs `page.evaluate`) |
| `commander` | CLI subcommand parsing |
| `zod` | Schema validation for MCP tool parameters |
| `@cfworker/json-schema` | Peer dependency of `@modelcontextprotocol/server` |

**Not needed (unlike lightcap):**
- No `lighthouse` — axe-core is the engine
- No `chrome-launcher` — Playwright manages Chromium
- No `sharp` — no image processing
- No `@axe-core/playwright` — we inject `axe.source` directly for full control

## Security

AxeCap runs locally over stdio — no network listener, no ports, no remote attack surface. Security mitigations focus on preventing SSRF, prompt injection, and resource exhaustion.

### SSRF prevention

- **Scheme whitelist:** Only `http:` and `https:` URLs are allowed. `file://`, `data:`, `javascript:`, `ftp://`, and all other schemes are blocked.
- **Metadata / unspecified-address blocklist:** AWS (`169.254.169.254`), GCP (`metadata.google.internal`), Azure (`metadata.azure.com`), and the unspecified addresses `0.0.0.0` and `[::]` are blocked by hostname. Genuine loopback (`localhost`, `127.0.0.1`, `::1`) remains allowed so local dev servers can be audited; the "all interfaces" addresses are treated as blocked, not as loopback.
- **Private IP range blocklist:** All RFC1918 ranges (`10.x`, `172.16–31.x`, `192.168.x`), full loopback (`127.x`), "this network" (`0.x`), CGNAT shared space (`100.64.0.0/10`, RFC6598), IPv4 link-local (`169.254.x`), IPv6 link-local (`fe80::/10`), IPv6 unique-local (full `fc00::/7` — both the `fc` and `fd` halves), and IPv6 unspecified/loopback (`::`, `::1`) are blocked.
- **IPv6-mapped IPv4 normalization:** Addresses like `::ffff:169.254.169.254` are normalized before classification.
- **Multi-address DNS check:** Hostnames are resolved with `{ all: true }` and blocked if **any** returned address is private — defends against hosts that publish a mix of public and internal records.
- **Fail-closed DNS:** If hostname resolution fails, the request is blocked (not allowed).
- **Post-navigation URL recheck:** After Playwright navigates, `page.url()` is validated against the same blocklist — catches HTTP redirect chains and DNS rebinding attacks.
- **Sub-resource filtering (`audit_url`):** The loaded page's own requests (images, scripts, `fetch`) are intercepted; any request to a metadata endpoint or private IP literal is aborted, so an audited page cannot reach the cloud metadata service or probe the LAN. Public resources (CDNs) and loopback are allowed, matching the navigation policy.
- **HTML audit network blocking:** `audit_html` blocks **all** network requests via `page.route('**/*', route => route.abort())`, preventing SSRF via embedded resources like `<img src="http://169.254.169.254/...">`.

> **Known limitation:** DNS for hostnames is resolved once at validation time, not re-checked at connection time, and sub-resource hostnames are not re-resolved. A determined DNS-rebinding attacker controlling a domain could still target their *own* internal network; the metadata/private-IP-literal blocks above are the primary defense.

### Prompt injection prevention

- **Output sanitization:** All page-controlled content (CSS selectors, rule IDs) is stripped of control characters (C0/C1), newlines, zero-width chars, and BOM before being included in output.
- **CSS-safe selector sanitization:** Selectors are additionally stripped of non-CSS characters, blocking crafted class names designed to inject instructions.
- **Selector truncation:** CSS selectors are capped at 60 characters.
- **Help text truncation:** Help text capped at 120 characters.
- **Character budget:** Total output is capped at 50,000 characters (in addition to the 200-line cap).
- **HTML snippets never returned:** axe-core's `node.html` field (contains raw page HTML) is never included in output — CSS selectors only.
- **Dialog auto-dismiss:** `page.on('dialog', ...)` dismisses alert/confirm/prompt dialogs that could block execution.

### waitFor selector validation

The `waitFor` parameter is restricted to CSS selectors only. Playwright pseudo-selectors (`text=`, `xpath=`, `>>`, `css=`, `_react=`, `_vue=`) are blocked.

### Directory traversal prevention

- Output paths are validated against the user's home directory and `/tmp` only.
- The deepest existing ancestor directory is resolved via `realpathSync` **before** any new directories are created, preventing TOCTOU symlink swap attacks.
- After creation, the final path is re-verified against allowed roots (belt and suspenders).

### Error message safety

- Error messages returned to the AI are sanitized through an allowlist. Known safe messages pass through; common error types (connection refused, timeout, DNS failure) are mapped to generic messages; unknown errors return `'Audit failed'` with details logged to stderr only.

### Resource limits

| Resource | Limit | Enforced By |
|----------|-------|-------------|
| Concurrent audits | 2 max | runner.js (slot gate, fail-fast beyond) |
| Page load timeout | 30s | Playwright `goto` options |
| axe-core execution timeout | 30s | `page.evaluate` timeout |
| Total audit timeout | 60s | Promise.race in runner.js |
| URL length | 2048 chars | Zod schema |
| HTML input length | 500KB | Zod schema |
| Directory path length | 500 chars | Zod schema |
| Violations per impact group | 15 max | Zod schema + compress.js |
| Elements per violation | 5 shown | compress.js |
| Selector length | 60 chars | compress.js |
| Help text length | 120 chars | compress.js |
| Output lines | 200 max | compress.js |
| Output characters | 50,000 max | compress.js |
| Browser process | killed in finally | runner.js |

### No raw data exposure

Full axe-core JSON is **never** returned to Claude. JSON can only be saved to disk (for human review) via the `directory` parameter. The compression engine is the only path from axe-core results to Claude's context.

## Configuration flags

| Flag | Description |
|------|-------------|
| `--verbose` | Log audit timing, browser lifecycle, compression details |
| `--quiet` | Log errors only |

## ICJIA-specific usage

### ADA Title II compliance (April 24, 2026 deadline)

The audit → fix → re-audit loop is the primary workflow:

```
You: "Audit localhost:3000 for WCAG AA with axecap"
You: "Fix all critical and serious violations"
You: "Run it again — how many violations remain?"
You: "Now show me what AAA violations exist (delta mode)"
You: "Which of those are feasible to fix?"
```

### The sia-r110 problem

For pages flagged with "All roles are invalid" from Vuetify's auto-generated `role` attributes:

```
You: "Audit localhost:3000 with axecap, rules: aria-allowed-role"
```

This runs only the relevant rule, returning exactly the elements with invalid roles. lightcap can't do this.

### Pre-deploy checks

Add to your project's `CLAUDE.md`:

```markdown
# Deploy checklist
Before any deploy to production:
1. Run `axecap audit_url` against localhost with level AA
2. Verify 0 critical violations and 0 serious violations
3. Run `lightcap run_audit` for performance + SEO baseline
```

## Clean-room notice

This project's design is informed by axe-core's public documentation, API, and rule registry. **This is an original implementation.** axe-core is used as a library dependency (Mozilla Public License 2.0). Playwright is used for browser automation (Apache 2.0). No code from third-party axe wrapper packages (e.g., @axe-core/cli, @axe-core/playwright, accessibility-checker) is used.

## License

MIT. See [LICENSE](LICENSE).
