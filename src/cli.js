#!/usr/bin/env node

import { program } from 'commander';
import { readFileSync } from 'fs';
import { execFile } from 'child_process';
import { runAxeAudit } from './runner.js';
import { compressResults, formatRuleList, formatRuleInfo } from './compress.js';
import { getRules, getRuleInfo } from './rules.js';
import { CONFIG, setVerbosity } from './config.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));

program
  .name('axecap')
  .description('axe-core accessibility audit tool — compressed results optimized for Claude\'s context window')
  .version(pkg.version);

// Global options
program
  .option('--verbose', 'Verbose logging')
  .option('--quiet', 'Errors only');

function applyGlobalOptions(opts) {
  if (opts.verbose) setVerbosity('verbose');
  if (opts.quiet) setVerbosity('quiet');
}

function clampInt(val, min, max, fallback) {
  const n = parseInt(val);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

program
  .command('audit <url>')
  .description('Run an axe-core accessibility audit at a specified WCAG level')
  .option('-l, --level <level>', 'WCAG level: a, aa, aaa, best-practice', 'aa')
  .option('--delta', 'Show only AAA-specific violations (use with --level aaa)')
  .option('-r, --rules <list>', 'Comma-separated axe-core rule IDs')
  .option('-n, --max-violations <n>', 'Top N violations per impact group', '10')
  .option('-v, --viewport <type>', 'desktop or mobile', 'desktop')
  .option('--include-incomplete', 'Include needs-review results')
  .option('-w, --wait-for <selector>', 'CSS selector to wait for before auditing')
  .option('-d, --directory <path>', 'Save full JSON results to directory')
  .action(async (url, opts) => {
    applyGlobalOptions(program.opts());
    try {
      const rules = opts.rules ? opts.rules.split(',').map(s => s.trim()).filter(Boolean) : undefined;
      const maxViolations = clampInt(opts.maxViolations, 1, CONFIG.MAX_VIOLATIONS_CAP, CONFIG.MAX_VIOLATIONS_DEFAULT);

      const { results, jsonPath, meta } = await runAxeAudit(url, {
        level: opts.level,
        delta: opts.delta,
        rules,
        maxViolations,
        viewport: opts.viewport,
        includeIncomplete: opts.includeIncomplete,
        waitFor: opts.waitFor,
        directory: opts.directory,
      });

      console.log(compressResults(results, {
        level: opts.level,
        delta: opts.delta,
        maxViolations,
        includeIncomplete: opts.includeIncomplete,
        url: meta.finalUrl || meta.url,
        viewport: opts.viewport,
      }));

      if (jsonPath) {
        console.log(`\nFull JSON results saved: ${jsonPath}`);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
    }
  });

program
  .command('rules')
  .description('List axe-core rules, optionally filtered by level, criterion, or search')
  .option('-l, --level <level>', 'Filter by WCAG level: a, aa, aaa, best-practice')
  .option('-c, --criterion <criterion>', 'Filter by WCAG criterion (e.g., 1.4.3)')
  .option('-s, --search <term>', 'Search rule IDs and descriptions')
  .action(async (opts) => {
    applyGlobalOptions(program.opts());
    try {
      const rules = getRules({
        level: opts.level,
        criterion: opts.criterion,
        search: opts.search,
      });

      const levelLabel = opts.level ? opts.level.toUpperCase() : null;
      console.log(formatRuleList(rules, levelLabel));
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
    }
  });

program
  .command('rule-info <ruleId>')
  .description('Get detailed info about a specific axe-core rule')
  .action(async (ruleId) => {
    applyGlobalOptions(program.opts());
    try {
      const rule = getRuleInfo(ruleId);
      console.log(formatRuleInfo(rule));
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
    }
  });

program
  .command('status')
  .description('Show server version, axe-core version, and update availability')
  .action(async () => {
    applyGlobalOptions(program.opts());

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

    let latestVersion = 'unknown';
    try {
      latestVersion = await new Promise((resolve, reject) => {
        execFile('npm', ['view', 'axe-core', 'version'], { timeout: 5000 }, (err, stdout) => {
          if (err) reject(err);
          else {
            const raw = stdout.trim();
            resolve(/^\d+\.\d+\.\d+/.test(raw) ? raw : 'unknown');
          }
        });
      });
    } catch { /* ignore */ }

    const updateNote = (latestVersion === 'unknown' || latestVersion === axeVersion)
      ? '(latest)'
      : `(latest: v${latestVersion} — update available)`;

    console.log('axecap status');
    console.log(`  Server:     @icjia/axecap v${pkg.version}`);
    console.log(`  axe-core:   v${axeVersion} ${updateNote}`);
    console.log(`  Playwright: v${playwrightVersion}`);
    console.log(`  Node:       v${process.versions.node}`);
    console.log(`  Platform:   ${process.platform} ${process.arch}`);
  });

// Default: start MCP server (when no subcommand given)
const subcommands = ['audit', 'rules', 'rule-info', 'status', 'help'];
const arg2 = process.argv[2];
const isSubcommand = arg2 && (subcommands.includes(arg2) || arg2 === '--help' || arg2 === '-h' || arg2 === '--version' || arg2 === '-V');

if (!arg2 || (!isSubcommand && arg2.startsWith('-'))) {
  await import('./server.js');
} else {
  program.parse();
}
