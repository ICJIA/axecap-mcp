# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] — 2026-04-10

### Fixed

- `sanitizeSelector` now allows Latin Extended characters (`\u00C0-\u024F`) and forward slash — selectors like `.étiquette` and `a[href="/login"]` no longer get garbled
- Added shebang (`#!/usr/bin/env node`) to `server.js` for consistency with lightcap

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
