import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRules, getRuleInfo } from '../src/rules.js';

describe('getRules', () => {
  it('returns non-empty array with no filters', () => {
    const rules = getRules();
    assert.ok(Array.isArray(rules));
    assert.ok(rules.length > 0);
  });

  it('filters by level aa', () => {
    const rules = getRules({ level: 'aa' });
    assert.ok(rules.length > 0);
    // All returned rules should have at least one AA-or-below tag
    for (const rule of rules) {
      const hasRelevantTag = rule.tags.some(t =>
        ['wcag2a', 'wcag21a', 'wcag22a', 'wcag2aa', 'wcag21aa', 'wcag22aa'].includes(t)
      );
      assert.ok(hasRelevantTag, `Rule ${rule.ruleId} should have an AA-level tag`);
    }
  });

  it('filters by level a — fewer rules than aa', () => {
    const aRules = getRules({ level: 'a' });
    const aaRules = getRules({ level: 'aa' });
    assert.ok(aRules.length <= aaRules.length, 'A rules should be <= AA rules');
  });

  it('filters by criterion 1.4.3', () => {
    const rules = getRules({ criterion: '1.4.3' });
    assert.ok(rules.length > 0);
    for (const rule of rules) {
      assert.ok(rule.tags.includes('wcag143'), `Rule ${rule.ruleId} should have wcag143 tag`);
    }
  });

  it('accepts a criterion already in axe tag form (wcag143)', () => {
    const dotted = getRules({ criterion: '1.4.3' }).map(r => r.ruleId).sort();
    const tagged = getRules({ criterion: 'wcag143' }).map(r => r.ruleId).sort();
    assert.ok(tagged.length > 0);
    assert.deepEqual(tagged, dotted);
  });

  it('searches by keyword', () => {
    const rules = getRules({ search: 'contrast' });
    assert.ok(rules.length > 0);
    for (const rule of rules) {
      const matchesId = rule.ruleId.toLowerCase().includes('contrast');
      const matchesDesc = (rule.description || '').toLowerCase().includes('contrast');
      const matchesHelp = (rule.help || '').toLowerCase().includes('contrast');
      assert.ok(matchesId || matchesDesc || matchesHelp, `Rule ${rule.ruleId} should match "contrast"`);
    }
  });

  it('returns empty array for non-matching search', () => {
    const rules = getRules({ search: 'xyznonexistent123' });
    assert.deepEqual(rules, []);
  });
});

describe('getRuleInfo', () => {
  it('returns rule details for color-contrast', () => {
    const rule = getRuleInfo('color-contrast');
    assert.ok(rule);
    assert.equal(rule.ruleId, 'color-contrast');
    assert.ok(Array.isArray(rule.tags));
    assert.ok(rule.tags.length > 0);
  });

  it('returns null for nonexistent rule', () => {
    const rule = getRuleInfo('nonexistent-rule-that-does-not-exist');
    assert.equal(rule, null);
  });

  it('rule has expected fields', () => {
    const rule = getRuleInfo('image-alt');
    assert.ok(rule);
    assert.ok(rule.ruleId);
    assert.ok(rule.tags);
    assert.ok(rule.description || rule.help);
  });
});
