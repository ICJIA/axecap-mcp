# Changelog

All notable changes to this project will be documented in this file.

## [0.1.3] — 2026-07-17

### Changed

- **Upgraded `@modelcontextprotocol/server` from `2.0.0-alpha.2` to `2.0.0-beta.4`** (exact pin — the alpha line no longer receives fixes; npm `latest` now points at the beta line). The only code change required: `StdioServerTransport` is now imported from the `@modelcontextprotocol/server/stdio` subpath. Verified equivalent to alpha.2 via full MCP handshake, `tools/list` schema comparison, tool calls, invalid-input rejection, and an end-to-end browser audit.
- **Removed the direct `@cfworker/json-schema` dependency** — it existed only to satisfy the alpha SDK's peer requirement, which beta.4 no longer declares (schema validation engines are now pluggable SDK subpaths; zod-based tool validation needs no configuration).

## [0.1.2] — 2026-06-11

### Security

- **Sub-resource SSRF filtering on `audit_url`** — the audited page's own requests (img/script/`fetch`) are now intercepted and aborted if they target a cloud-metadata endpoint or private IP literal. Previously only top-level navigation was checked, so a loaded page could still reach `169.254.169.254` or probe the LAN.
- **Multi-address DNS check** — hostnames are resolved with `{ all: true }` and blocked if *any* returned address is private (defends against mixed public/private DNS records); previously only the first address was checked.
- **Expanded private-range coverage** — full IPv6 unique-local `fc00::/7` (the `fc` half was previously missed), full link-local `fe80::/10`, and CGNAT `100.64.0.0/10` (RFC6598) are now blocked.
- **Unspecified addresses** `0.0.0.0` and `[::]` are now consistently blocked (and no longer mislabeled as loopback in `LOCALHOST_HOSTS`); `[::]` was previously allowed.
- **Output-directory boundary** — path checks now require a path separator, closing a sibling-prefix escape (e.g. `<home>-evil` was accepted as inside `<home>`).

### Fixed

- **Concurrency limit is now enforced.** The previous promise-chain serialization made the `MAX_CONCURRENT_AUDITS` guard unreachable (effectively max-1, with an unbounded queue that could stack latency past client timeouts). Replaced with a real slot gate that allows 2 concurrent audits and fails fast beyond that.
- **Version detection works under npx.** `axe-core`/`playwright` versions were read via a relative `node_modules` path that only resolved in the dev repo; hoisted installs reported `unknown` and `get_status` falsely showed "update available". Now resolved via Node module resolution.
- **CLI global flags no longer hang.** `axecap --verbose audit <url>` (and other global-flag-before-subcommand forms) silently started the MCP server instead of running the command. Flags are now handled position-independently before dispatch.
- **`get_rules` accepts a criterion already in axe tag form** (`wcag143`) in addition to dotted form (`1.4.3`).
- **Missing-browser errors are actionable** — a missing Chromium download now returns `Browser not installed — run: npx playwright install chromium` instead of a generic `Audit failed`.
- **`AUDIT_TIMEOUT` is now actually enforced** as an overall per-audit cap (it was previously unused dead config).
- **Truncated "Needs Review" output** is now marked with a `(+N more)` note, matching the violation groups.
- **Windows update check** uses `npm.cmd` (execFile has no shell), so `get_status` update detection works on Windows.

### Changed

- Navigation uses `waitUntil: 'load'` instead of `'networkidle'` — real-world pages with analytics/ads/long-poll never reach network idle and previously always hit the timeout. SPAs can still use the `waitFor` option.
- Pinned `@modelcontextprotocol/server` to the exact `2.0.0-alpha.2` (was a caret range on an alpha, which would auto-adopt breaking pre-releases).
- `postinstall` no longer suppresses Chromium download errors, so first-run install failures are visible.
- `publish.sh` reverts `package-lock.json` (not just `package.json`) on dry-run/abort, and now requires a matching `CHANGELOG.md` entry before publishing.
- Internal: extracted shared `version.js` and `cli-args.js`; removed dead `estimateTokens`.

## [0.1.1] — 2026-04-10

### Fixed

- `sanitizeSelector` now allows Latin Extended characters (`\u00C0-\u024F`) and forward slash — selectors like `.étiquette` and `a[href="/login"]` no longer get garbled
- Added shebang (`#!/usr/bin/env node`) to `server.js` for consistency with lightcap

### Changed

- `publish.sh` now always bumps version (including first-time publish)

## [0.1.0] — 2026-04-10

### Added

- Initial release — Phase 1 build
- **`audit_url` tool** — axe-core accessibility audit at specified WCAG conformance level (A, AA, AAA, best-practice)
- **`audit_html` tool** — audit raw HTML content without a running server; all network requests blocked (SSRF-safe)
- **`get_rules` tool** — list axe-core rules filtered by level, WCAG criterion, or search term (no browser needed)
- **`get_rule_info` tool** — detailed metadata for a specific axe-core rule
- **`get_status` tool** — server, axe-core, and Playwright version info with npm update check
- **WCAG conformance level targeting** — cumulative: AA audits A + AA; AAA audits A + AA + AAA
- **Delta mode** — `level: 'aaa', delta: true` shows only AAA-specific violations (the gap from AA to AAA)
- **Specific rule auditing** — `rules: ['color-contrast', 'image-alt']` runs only selected rules
- **SPA support** — `waitFor` parameter accepts CSS selector; restricted to CSS-only (no text=/xpath=)
- **Compression engine** — axe-core JSON (50K-500K tokens) compressed to ~30-150 lines plain text
  - Impact grouping: critical, serious, moderate, minor with shorthand notation
  - WCAG criterion + level per violation (e.g., `[1.4.3 AA]`)
  - Deque University help URLs per violation
  - Selector deduplication with occurrence counts
  - Tiered element detail: critical/serious show 5, moderate/minor show 3
  - Needs-review (incomplete) section as opt-in
  - Hard cap: 200 lines / 50,000 chars
- **CLI** — `axecap audit`, `axecap rules`, `axecap rule-info`, `axecap status` subcommands
- **Standalone CLI and MCP server** — starts MCP mode when no subcommand given

### Security

- SSRF prevention: scheme whitelist, metadata endpoint blocklist, private IP range blocklist, IPv6-mapped IPv4 normalization, fail-closed DNS, post-navigation URL recheck
- HTML audit network blocking: `page.route('**/*', route => route.abort())` prevents SSRF via embedded resources
- Prompt injection prevention: CSS-safe selector sanitization, control char stripping, zero-width char removal, selector/help text truncation
- waitFor validation: blocks Playwright pseudo-selectors (text=, xpath=, >>, css=, _react=, _vue=)
- Dialog auto-dismiss: `page.on('dialog', dialog => dialog.dismiss())` prevents execution blocking
- Directory traversal prevention: symlink-aware validation, home + /tmp only, pre-creation ancestor check
- Error sanitization: allowlist-based, generic fallback, no path/IP leakage
- Raw axe JSON never returned to Claude; HTML snippets (`node.html`) never included in output
- Concurrent audit limit: 2 max with serialization queue
- Timeouts: 30s navigation, 30s axe execution, 60s total
- Browser killed in `finally` block after every audit
