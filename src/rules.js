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

  // Filter by WCAG criterion. Accept dotted ('1.4.3') or axe tag form
  // ('wcag143') — strip any existing prefix/dots, then normalise to the tag.
  if (criterion) {
    const digits = criterion.toLowerCase().replace(/^wcag/, '').replace(/\./g, '');
    const criterionTag = 'wcag' + digits;
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
  return rule || null;
}
