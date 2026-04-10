#!/usr/bin/env node

import { readFileSync } from 'fs';
import { execFile } from 'child_process';
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { runAxeAudit, runAxeOnHtml, sanitizeError } from './runner.js';
import { compressResults, formatRuleList, formatRuleInfo } from './compress.js';
import { getRules, getRuleInfo } from './rules.js';
import { CONFIG, setVerbosity, log } from './config.js';

if (process.argv.includes('--verbose')) setVerbosity('verbose');
if (process.argv.includes('--quiet')) setVerbosity('quiet');

// ─── Version tracking (loaded once on startup) ────────────────────

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

// Non-blocking npm registry check at startup
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

log('info', `Server v${serverVersion} | axe-core v${axeVersion} | Playwright v${playwrightVersion}`);

// ─── MCP Server ────────────────────────────────────────────────────

const server = new McpServer({
  name: 'axecap',
  version: serverVersion,
});

// ─── audit_url ─────────────────────────────────────────────────────

server.registerTool(
  'audit_url',
  {
    description: 'Run an axe-core accessibility audit on a web page at a specified WCAG conformance level. Default audits A + AA rules (cumulative). Returns violations grouped by impact with WCAG criteria, CSS selectors, and help URLs.',
    inputSchema: z.object({
      url: z.url().max(CONFIG.MAX_URL_LENGTH).describe('HTTP or HTTPS URL to audit'),
      level: z.enum(['a', 'aa', 'aaa', 'best-practice']).optional().describe('WCAG conformance level — aa (default) audits A + AA rules; aaa audits A + AA + AAA'),
      delta: z.boolean().optional().describe('If true with level aaa, show only AAA-specific violations (the gap from AA to AAA)'),
      rules: z.array(z.string()).optional().describe('Run only these specific axe-core rule IDs (e.g., ["color-contrast", "image-alt"])'),
      maxViolations: z.number().int().min(1).max(15).optional().describe('Top N violations per impact group (default 10, max 15)'),
      viewport: z.enum(['desktop', 'mobile']).optional().describe('Viewport emulation (default: desktop)'),
      includeIncomplete: z.boolean().optional().describe('Include needs-review results in addition to violations'),
      waitFor: z.string().max(200).optional().describe('CSS selector to wait for before auditing (for SPAs)'),
      directory: z.string().max(500).optional().describe('Save full JSON results to this directory'),
    }),
  },
  async (params) => {
    try {
      const { results, jsonPath, meta } = await runAxeAudit(params.url, {
        level: params.level,
        delta: params.delta,
        rules: params.rules,
        maxViolations: params.maxViolations,
        viewport: params.viewport,
        includeIncomplete: params.includeIncomplete,
        waitFor: params.waitFor,
        directory: params.directory,
      });

      let text = compressResults(results, {
        level: params.level || CONFIG.DEFAULT_LEVEL,
        delta: params.delta,
        maxViolations: params.maxViolations,
        includeIncomplete: params.includeIncomplete,
        url: meta.finalUrl || meta.url,
        viewport: params.viewport || CONFIG.DEFAULT_VIEWPORT,
      });

      if (jsonPath) {
        text += `\n\nFull JSON results saved: ${jsonPath}`;
      }

      return { content: [{ type: 'text', text }] };
    } catch (err) {
      log('error', err.message);
      return { content: [{ type: 'text', text: `Error: ${sanitizeError(err)}` }] };
    }
  }
);

// ─── audit_html ────────────────────────────────────────────────────

server.registerTool(
  'audit_html',
  {
    description: 'Run an axe-core audit on raw HTML content. Useful for testing components or generated markup without a running server. Network requests from embedded resources are blocked.',
    inputSchema: z.object({
      html: z.string().max(CONFIG.MAX_HTML_LENGTH).describe('HTML content to audit'),
      level: z.enum(['a', 'aa', 'aaa', 'best-practice']).optional().describe('WCAG conformance level (default: aa)'),
      rules: z.array(z.string()).optional().describe('Specific axe-core rule IDs to run'),
      maxViolations: z.number().int().min(1).max(15).optional().describe('Top N per impact group (default 10)'),
      viewport: z.enum(['desktop', 'mobile']).optional().describe('Viewport emulation (default: desktop)'),
      includeIncomplete: z.boolean().optional().describe('Include needs-review results'),
    }),
  },
  async (params) => {
    try {
      const { results, meta } = await runAxeOnHtml(params.html, {
        level: params.level,
        rules: params.rules,
        maxViolations: params.maxViolations,
        viewport: params.viewport,
        includeIncomplete: params.includeIncomplete,
      });

      const text = compressResults(results, {
        level: params.level || CONFIG.DEFAULT_LEVEL,
        maxViolations: params.maxViolations,
        includeIncomplete: params.includeIncomplete,
        url: 'html-input',
        viewport: params.viewport || CONFIG.DEFAULT_VIEWPORT,
      });

      return { content: [{ type: 'text', text }] };
    } catch (err) {
      log('error', err.message);
      return { content: [{ type: 'text', text: `Error: ${sanitizeError(err)}` }] };
    }
  }
);

// ─── get_rules ─────────────────────────────────────────────────────

server.registerTool(
  'get_rules',
  {
    description: 'List axe-core accessibility rules, optionally filtered by WCAG level, criterion, or search term. Does not require a browser — instant response.',
    inputSchema: z.object({
      level: z.enum(['a', 'aa', 'aaa', 'best-practice']).optional().describe('Filter to rules at this WCAG level'),
      criterion: z.string().max(10).optional().describe('Filter to rules for a WCAG criterion (e.g., "1.4.3")'),
      search: z.string().max(100).optional().describe('Search rule IDs and descriptions'),
    }),
  },
  async (params) => {
    try {
      const rules = getRules({
        level: params.level,
        criterion: params.criterion,
        search: params.search,
      });

      const levelLabel = params.level ? params.level.toUpperCase() : null;
      const text = formatRuleList(rules, levelLabel);

      return { content: [{ type: 'text', text }] };
    } catch (err) {
      log('error', err.message);
      return { content: [{ type: 'text', text: `Error: ${sanitizeError(err)}` }] };
    }
  }
);

// ─── get_rule_info ─────────────────────────────────────────────────

server.registerTool(
  'get_rule_info',
  {
    description: 'Get detailed information about a specific axe-core rule including WCAG criteria, impact, tags, and help URL.',
    inputSchema: z.object({
      ruleId: z.string().max(100).describe('axe-core rule ID (e.g., "color-contrast")'),
    }),
  },
  async (params) => {
    try {
      const rule = getRuleInfo(params.ruleId);
      const text = formatRuleInfo(rule);

      return { content: [{ type: 'text', text }] };
    } catch (err) {
      log('error', err.message);
      return { content: [{ type: 'text', text: `Error: ${sanitizeError(err)}` }] };
    }
  }
);

// ─── get_status ────────────────────────────────────────────────────

server.registerTool(
  'get_status',
  {
    description: 'Returns axecap server version, installed axe-core version, Playwright version, and whether a newer axe-core version is available on npm.',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const latest = await getLatestAxeVersion();
      const updateNote = (latest === 'unknown' || latest === axeVersion)
        ? '(latest)'
        : `(latest: v${latest} — update available)`;

      const text = [
        'axecap status',
        `  Server:     @icjia/axecap v${serverVersion}`,
        `  axe-core:   v${axeVersion} ${updateNote}`,
        `  Playwright: v${playwrightVersion}`,
        `  Node:       v${process.versions.node}`,
        `  Platform:   ${process.platform} ${process.arch}`,
      ].join('\n');

      return { content: [{ type: 'text', text }] };
    } catch (err) {
      log('error', err.message);
      return { content: [{ type: 'text', text: `Error: ${sanitizeError(err)}` }] };
    }
  }
);

// ─── Start ─────────────────────────────────────────────────────────

console.error('[axecap] Server started — tools: audit_url, audit_html, get_rules, get_rule_info, get_status');
const transport = new StdioServerTransport();
await server.connect(transport);
