import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../src/runner.js';
import { CONFIG } from '../src/config.js';

const { buildAxeConfig } = _test;

describe('buildAxeConfig tag options', () => {
  it('defaults to the level tags alone', () => {
    const config = buildAxeConfig('aa', {});
    assert.equal(config.runOnly.type, 'tag');
    assert.deepEqual(config.runOnly.values, CONFIG.LEVEL_TAGS.aa);
  });

  it('bestPractices appends the best-practice tag', () => {
    const config = buildAxeConfig('aa', { bestPractices: true });
    assert.ok(config.runOnly.values.includes('best-practice'));
    for (const tag of CONFIG.LEVEL_TAGS.aa) {
      assert.ok(config.runOnly.values.includes(tag));
    }
  });

  it('experimental appends the experimental tag (lifts axe tagExclude)', () => {
    const config = buildAxeConfig('aa', { experimental: true });
    assert.ok(config.runOnly.values.includes('experimental'));
  });

  it('both flags compose with the level tags', () => {
    const config = buildAxeConfig('aaa', { bestPractices: true, experimental: true });
    assert.ok(config.runOnly.values.includes('best-practice'));
    assert.ok(config.runOnly.values.includes('experimental'));
    for (const tag of CONFIG.LEVEL_TAGS.aaa) {
      assert.ok(config.runOnly.values.includes(tag));
    }
  });

  it('does not duplicate best-practice when the level already is best-practice', () => {
    const config = buildAxeConfig('best-practice', { bestPractices: true });
    const count = config.runOnly.values.filter(t => t === 'best-practice').length;
    assert.equal(count, 1);
  });

  it('explicit rules take precedence over the tag flags', () => {
    const config = buildAxeConfig('aa', {
      rules: ['p-as-heading'],
      bestPractices: true,
      experimental: true,
    });
    assert.equal(config.runOnly.type, 'rule');
    assert.deepEqual(config.runOnly.values, ['p-as-heading']);
  });

  it('flags do not mutate the shared LEVEL_TAGS config', () => {
    const before = [...CONFIG.LEVEL_TAGS.aa];
    buildAxeConfig('aa', { bestPractices: true, experimental: true });
    assert.deepEqual(CONFIG.LEVEL_TAGS.aa, before);
  });
});
