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

  // Filter by WCAG criterion (e.g., '1.4.3' → 'wcag143')
  if (criterion) {
    const criterionTag = 'wcag' + criterion.replace(/\./g, '');
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
