#!/usr/bin/env node

import { program } from 'commander';
import { readFileSync } from 'fs';
import { runAxeAudit } from './runner.js';
import { compressResults, formatRuleList, formatRuleInfo } from './compress.js';
import { getRules, getRuleInfo } from './rules.js';
import { readPackageVersion, fetchLatestVersion } from './version.js';
import { extractVerbosity, isServerInvocation } from './cli-args.js';
import { CONFIG, setVerbosity } from './config.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));

program
  .name('axecap')
  .description('axe-core accessibility audit tool — compressed results optimized for Claude\'s context window')
  .version(pkg.version);

// --verbose / --quiet are handled before commander (see dispatch at the
// bottom), so their position relative to a subcommand does not matter.

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

    const axeVersion = readPackageVersion('axe-core');
    const playwrightVersion = readPackageVersion('playwright');
    const latestVersion = await fetchLatestVersion('axe-core');

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

// Handle global flags first (position-independent), then dispatch: a bare
// invocation starts the MCP server, anything else goes to commander.
const { verbosity, rest } = extractVerbosity(process.argv.slice(2));
if (verbosity) setVerbosity(verbosity);

if (isServerInvocation(rest)) {
  await import('./server.js');
} else {
  program.parse(rest, { from: 'user' });
}
