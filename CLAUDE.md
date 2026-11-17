# Tool preferences

- For WCAG compliance audits (A/AA/AAA, specific rules, rule lookups), use the `axecap` MCP server (audit_url, audit_html, get_rules, get_rule_info, get_status). If the MCP server isn't available, use the CLI via Bash instead: `axecap --quiet audit <url>`, `axecap --quiet audit-html <file|->`, `axecap rules`, `axecap rule-info <id>`, `axecap status` (same output; see README "MCP or CLI?" for the flag mapping).
- For Lighthouse audits (performance, accessibility, SEO, best practices), use the `lightcap` MCP server.
- For all screenshots, use the `viewcap` MCP server.
- Use Chrome MCP for browser automation, DOM interaction, and navigation only.
