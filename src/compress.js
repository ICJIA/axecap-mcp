import { CONFIG, log } from './config.js';

// ─── Sanitization ─────────────────────────────────────────────────

// Strip control chars, newlines, and zero-width chars from page-controlled
// strings to prevent prompt injection via crafted selectors or ARIA labels.
function sanitize(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[\x00-\x1f\x7f-\x9f\u200b-\u200f\u2028\u2029\ufeff]/g, '');
}

// Sanitize CSS selector — strip anything that isn't a valid CSS selector char.
// This blocks prompt injection via crafted class names like
// "ignore-all-previous-instructions".
function sanitizeSelector(str) {
  if (!str || typeof str !== 'string') return '';
  // First strip control/zero-width chars
  const clean = sanitize(str);
  // Allow only CSS-safe characters: alphanumeric, selectors, combinators, quotes
  return clean.replace(/[^a-zA-Z0-9\u00C0-\u024F\-_\.#>\+~\[\]=:"'\(\),\s\*\^$|@\/]/g, '');
}

// ─── Helpers ───────────────────────────────────────────────────────

function truncateSelector(selector) {
  if (!selector || typeof selector !== 'string') return null;
  const clean = sanitizeSelector(selector);
  if (!clean) return null;
  return clean.length > CONFIG.SELECTOR_MAX_LENGTH
    ? clean.slice(0, CONFIG.SELECTOR_MAX_LENGTH) + '…'
    : clean;
}

function truncateHelp(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = sanitize(text);
  return clean.length > CONFIG.HELP_TEXT_MAX_LENGTH
    ? clean.slice(0, CONFIG.HELP_TEXT_MAX_LENGTH) + '…'
    : clean;
}

// ─── WCAG Criterion Parsing ───────────────────────────────────────

// axe-core encodes WCAG criteria without dots: wcag111 = 1.1.1, wcag1412 = 1.4.12
function parseWcagCriterion(tag) {
  const match = tag.match(/^wcag(\d+)$/);
  if (!match) return null;

  const digits = match[1];
  if (digits.length < 3) return null;

  const level1 = digits[0];
  const level2 = digits[1];
  const level3 = digits.slice(2);

  return `${level1}.${level2}.${level3}`;
}

function getWcagInfo(tags) {
  let criterion = null;
  let level = null;

  for (const tag of tags) {
    // Criterion tags: wcag111, wcag1412, etc. — NOT level tags like wcag2a, wcag2aa
    if (/^wcag\d{3,}$/.test(tag) && !/^wcag\d+a+$/.test(tag)) {
      criterion = criterion || parseWcagCriterion(tag);
    }
    // Level tags: wcag2a, wcag2aa, wcag2aaa, wcag21a, wcag21aa, wcag22a, wcag22aa
    if (/^wcag\d+a+$/.test(tag)) {
      const thisLevel = tag.endsWith('aaa') ? 'AAA'
        : tag.endsWith('aa') ? 'AA'
        : 'A';
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

// ─── Selector Extraction ──────────────────────────────────────────

// axe-core uses node.target (array of CSS selectors for iframe nesting)
function extractSelector(node) {
  const target = node.target;
  if (!Array.isArray(target) || target.length === 0) return null;

  const selector = target.length === 1
    ? target[0]
    : target.join(' > ');

  return truncateSelector(typeof selector === 'string' ? selector : String(selector));
}

// Deduplicate selectors and count occurrences
function extractElements(nodes) {
  const selectorCounts = new Map();

  for (const node of nodes) {
    const sel = extractSelector(node);
    if (sel) {
      selectorCounts.set(sel, (selectorCounts.get(sel) || 0) + 1);
    }
  }

  const elements = [];
  for (const [sel, count] of selectorCounts) {
    elements.push({ selector: sel, count });
  }
  return elements;
}

// ─── Delta Filter ─────────────────────────────────────────────────

// For AAA delta mode: keep only violations tagged with AAA-specific tags
// that are NOT also tagged with any AA-or-below tag.
function isDeltaViolation(violation) {
  const tags = violation.tags;
  const hasAAATag = tags.includes('wcag2aaa');
  if (!hasAAATag) return false;
  // Exclude if also tagged with any lower-level tag
  const hasLowerTag = CONFIG.AA_AND_BELOW_TAGS.some(t => tags.includes(t));
  return !hasLowerTag;
}

// ─── Output Truncation ───────────────────────────────────────────

function truncateOutput(lines) {
  if (lines.length > CONFIG.MAX_OUTPUT_LINES) {
    lines = lines.slice(0, CONFIG.MAX_OUTPUT_LINES);
    lines.push('(truncated — lower maxViolations for more detail)');
  }

  let result = lines.join('\n');
  if (result.length > CONFIG.MAX_OUTPUT_CHARS) {
    result = result.slice(0, CONFIG.MAX_OUTPUT_CHARS);
    result += '\n(truncated — output exceeded character budget)';
  }

  return result;
}

// Estimate tokens: ~4 chars per token for English text
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// ─── Main Compression ─────────────────────────────────────────────

export function compressResults(results, options = {}) {
  const {
    level = CONFIG.DEFAULT_LEVEL,
    delta = false,
    maxViolations = CONFIG.MAX_VIOLATIONS_DEFAULT,
    includeIncomplete = false,
    url = results.url || 'unknown',
    viewport = 'desktop',
  } = options;

  const lines = [];
  const cleanUrl = sanitize(url);
  const levelDisplay = level.toUpperCase();

  // Get violations
  let violations = results.violations || [];

  // Delta filter: only AAA-specific violations
  if (delta && level === 'aaa') {
    violations = violations.filter(v => isDeltaViolation(v));
  }

  // Group by impact
  const groups = {};
  for (const impact of CONFIG.IMPACT_ORDER) {
    groups[impact] = [];
  }
  for (const violation of violations) {
    const impact = violation.impact || 'moderate';
    if (groups[impact]) {
      groups[impact].push(violation);
    } else {
      groups.moderate.push(violation);
    }
  }

  // Count totals for header
  const impactCounts = {};
  let totalViolations = 0;
  for (const impact of CONFIG.IMPACT_ORDER) {
    impactCounts[impact] = groups[impact].length;
    totalViolations += groups[impact].length;
  }

  // Compact header
  const impactSummary = CONFIG.IMPACT_ORDER
    .filter(i => impactCounts[i] > 0)
    .map(i => `${impactCounts[i]}${i[0]}`)
    .join(' ');

  const deltaNote = (delta && level === 'aaa') ? ' (delta from AA)' : '';
  const summaryPart = totalViolations > 0 ? ` (${impactSummary})` : '';
  lines.push(`axe: ${cleanUrl} [${viewport}] ${levelDisplay}${deltaNote} — ${totalViolations} violations${summaryPart}`);

  // If no violations, return the one-liner
  if (totalViolations === 0 && !includeIncomplete) {
    return truncateOutput(lines);
  }

  // Detail per impact group
  const cap = Math.min(maxViolations, CONFIG.MAX_VIOLATIONS_CAP);

  for (const impact of CONFIG.IMPACT_ORDER) {
    const audits = groups[impact];
    if (audits.length === 0) continue;

    // Sort by node count descending
    audits.sort((a, b) => (b.nodes?.length || 0) - (a.nodes?.length || 0));

    const capped = audits.slice(0, cap);
    const skipped = audits.length - capped.length;

    let groupElements = 0;
    const issueLines = [];

    for (const violation of capped) {
      const { criterion, level: wcagLevel } = getWcagInfo(violation.tags || []);
      const wcagStr = criterion
        ? ` [${criterion}${wcagLevel ? ' ' + wcagLevel : ''}]`
        : '';

      const elements = extractElements(violation.nodes || []);
      const elCount = violation.nodes?.length || 0;
      groupElements += elCount;
      const elStr = elCount > 0 ? ` (${elCount} el)` : '';

      issueLines.push(`  \u2717 ${sanitize(violation.id)}${wcagStr}${elStr}`);

      // Show affected elements — more detail for critical/serious
      const maxEls = (impact === 'critical' || impact === 'serious')
        ? CONFIG.MAX_ELEMENTS_PER_VIOLATION
        : Math.min(3, CONFIG.MAX_ELEMENTS_PER_VIOLATION);

      const shown = elements.slice(0, maxEls);
      const remaining = elements.length - shown.length;

      for (const el of shown) {
        const countStr = el.count > 1 ? ` (\u00d7${el.count})` : '';
        issueLines.push(`    \u2192 ${el.selector}${countStr}`);
      }
      if (remaining > 0) {
        issueLines.push(`    \u2192 (+${remaining})`);
      }

      // Help URL
      if (violation.helpUrl) {
        issueLines.push(`    \u2139 ${sanitize(violation.helpUrl)}`);
      }
    }

    const label = impact[0].toUpperCase() + impact.slice(1);
    const skippedNote = skipped > 0 ? ` +${skipped} more` : '';
    lines.push('');
    lines.push(`\u2500\u2500 ${label} (${capped.length} violations, ${groupElements} el)${skippedNote} \u2500\u2500`);
    lines.push(...issueLines);
  }

  // Incomplete / needs-review section
  if (includeIncomplete && results.incomplete && results.incomplete.length > 0) {
    const incomplete = results.incomplete;
    lines.push('');
    lines.push(`\u2500\u2500 Needs Review (${incomplete.length} items) \u2500\u2500`);

    const cappedIncomplete = incomplete.slice(0, cap);
    for (const item of cappedIncomplete) {
      const { criterion, level: wcagLevel } = getWcagInfo(item.tags || []);
      const wcagStr = criterion
        ? ` [${criterion}${wcagLevel ? ' ' + wcagLevel : ''}]`
        : '';
      const elCount = item.nodes?.length || 0;
      const elStr = elCount > 0 ? ` (${elCount} el)` : '';

      lines.push(`  \u26a0 ${sanitize(item.id)}${wcagStr}${elStr}`);

      const elements = extractElements(item.nodes || []);
      const shown = elements.slice(0, 3);
      for (const el of shown) {
        const countStr = el.count > 1 ? ` (\u00d7${el.count})` : '';
        lines.push(`    \u2192 ${el.selector}${countStr}`);
      }

      if (item.helpUrl) {
        lines.push(`    \u2139 ${sanitize(item.helpUrl)}`);
      }
    }
  }

  return truncateOutput(lines);
}

// ─── Rule Formatting ──────────────────────────────────────────────

export function formatRuleList(rules, levelLabel) {
  const lines = [];
  const label = levelLabel ? `${levelLabel}, ` : '';
  lines.push(`axe-core rules (${label}${rules.length} rules):`);
  lines.push('');

  for (const rule of rules) {
    const { criterion, level } = getWcagInfo(rule.tags || []);
    const wcagStr = criterion
      ? ` [${criterion}${level ? ' ' + level : ''}]`
      : '';
    const impact = rule.metadata?.impact || '';
    const impactStr = impact ? ` ${impact}` : '';
    const help = truncateHelp(rule.help || rule.description || '') || '';

    lines.push(`  ${rule.ruleId}${wcagStr}${impactStr} — ${help}`);
  }

  return truncateOutput(lines);
}

export function formatRuleInfo(rule) {
  if (!rule) return 'Rule not found';

  const { criterion, level } = getWcagInfo(rule.tags || []);
  const wcagStr = criterion
    ? `${criterion}${level ? ` (${level})` : ''}`
    : 'N/A';

  const lines = [
    `axe rule: ${rule.ruleId}`,
    `  Impact:    ${rule.metadata?.impact || 'unknown'}`,
    `  WCAG:      ${wcagStr}`,
    `  Tags:      ${(rule.tags || []).join(', ')}`,
    `  Help:      ${sanitize(rule.help || rule.description || '')}`,
    `  Help URL:  ${sanitize(rule.helpUrl || '')}`,
  ];

  return lines.join('\n');
}

// ─── Test-only exports ─────────────────────────────────────────────

export const _test = {
  sanitize,
  sanitizeSelector,
  truncateSelector,
  truncateHelp,
  parseWcagCriterion,
  getWcagInfo,
  extractSelector,
  extractElements,
  isDeltaViolation,
  estimateTokens,
  truncateOutput,
};
