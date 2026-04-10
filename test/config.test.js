import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';

describe('CONFIG', () => {
  it('has positive numeric limits', () => {
    assert.ok(CONFIG.MAX_VIOLATIONS_DEFAULT > 0);
    assert.ok(CONFIG.MAX_VIOLATIONS_CAP > 0);
    assert.ok(CONFIG.MAX_ELEMENTS_PER_VIOLATION > 0);
    assert.ok(CONFIG.SELECTOR_MAX_LENGTH > 0);
    assert.ok(CONFIG.HELP_TEXT_MAX_LENGTH > 0);
    assert.ok(CONFIG.MAX_URL_LENGTH > 0);
    assert.ok(CONFIG.MAX_HTML_LENGTH > 0);
    assert.ok(CONFIG.AUDIT_TIMEOUT > 0);
    assert.ok(CONFIG.NAV_TIMEOUT > 0);
    assert.ok(CONFIG.AXE_TIMEOUT > 0);
    assert.ok(CONFIG.WAIT_FOR_TIMEOUT > 0);
    assert.ok(CONFIG.MAX_CONCURRENT_AUDITS > 0);
    assert.ok(CONFIG.MAX_OUTPUT_LINES > 0);
    assert.ok(CONFIG.MAX_OUTPUT_CHARS > 0);
  });

  it('MAX_VIOLATIONS_CAP >= MAX_VIOLATIONS_DEFAULT', () => {
    assert.ok(CONFIG.MAX_VIOLATIONS_CAP >= CONFIG.MAX_VIOLATIONS_DEFAULT);
  });

  it('LEVEL_TAGS has entries for a, aa, aaa, best-practice', () => {
    assert.ok(Array.isArray(CONFIG.LEVEL_TAGS.a));
    assert.ok(Array.isArray(CONFIG.LEVEL_TAGS.aa));
    assert.ok(Array.isArray(CONFIG.LEVEL_TAGS.aaa));
    assert.ok(Array.isArray(CONFIG.LEVEL_TAGS['best-practice']));
  });

  it('AA tags include all A tags (cumulative)', () => {
    for (const tag of CONFIG.LEVEL_TAGS.a) {
      assert.ok(CONFIG.LEVEL_TAGS.aa.includes(tag), `AA should include A tag: ${tag}`);
    }
  });

  it('AAA tags include all AA tags (cumulative)', () => {
    for (const tag of CONFIG.LEVEL_TAGS.aa) {
      assert.ok(CONFIG.LEVEL_TAGS.aaa.includes(tag), `AAA should include AA tag: ${tag}`);
    }
  });

  it('LEVEL_TAGS include wcag22a for WCAG 2.2 Level A', () => {
    assert.ok(CONFIG.LEVEL_TAGS.a.includes('wcag22a'));
    assert.ok(CONFIG.LEVEL_TAGS.aa.includes('wcag22a'));
    assert.ok(CONFIG.LEVEL_TAGS.aaa.includes('wcag22a'));
  });

  it('AA_AND_BELOW_TAGS matches LEVEL_TAGS.aa', () => {
    for (const tag of CONFIG.AA_AND_BELOW_TAGS) {
      assert.ok(CONFIG.LEVEL_TAGS.aa.includes(tag), `AA_AND_BELOW_TAGS entry ${tag} should be in LEVEL_TAGS.aa`);
    }
    for (const tag of CONFIG.LEVEL_TAGS.aa) {
      assert.ok(CONFIG.AA_AND_BELOW_TAGS.includes(tag), `LEVEL_TAGS.aa entry ${tag} should be in AA_AND_BELOW_TAGS`);
    }
  });

  it('has blocked hostnames including cloud metadata endpoints', () => {
    assert.ok(CONFIG.BLOCKED_HOSTNAMES.length > 0);
    assert.ok(CONFIG.BLOCKED_HOSTNAMES.includes('169.254.169.254'));
    assert.ok(CONFIG.BLOCKED_HOSTNAMES.includes('metadata.google.internal'));
    assert.ok(CONFIG.BLOCKED_HOSTNAMES.includes('metadata.azure.com'));
    assert.ok(CONFIG.BLOCKED_HOSTNAMES.includes('0.0.0.0'));
  });

  it('has blocked IP prefixes covering RFC1918 + loopback ranges', () => {
    const prefixes = CONFIG.BLOCKED_IP_PREFIXES;
    assert.ok(prefixes.includes('10.'));
    assert.ok(prefixes.includes('192.168.'));
    assert.ok(prefixes.includes('172.16.'));
    assert.ok(prefixes.includes('172.31.'));
    assert.ok(prefixes.includes('127.'));
    assert.ok(prefixes.includes('0.'));
    assert.ok(prefixes.includes('fe80:'));
    assert.ok(prefixes.includes('fd00:'));
    assert.ok(prefixes.includes('::'));
  });

  it('has localhost hosts including 0.0.0.0 and [::]', () => {
    assert.ok(CONFIG.LOCALHOST_HOSTS.includes('localhost'));
    assert.ok(CONFIG.LOCALHOST_HOSTS.includes('127.0.0.1'));
    assert.ok(CONFIG.LOCALHOST_HOSTS.includes('::1'));
    assert.ok(CONFIG.LOCALHOST_HOSTS.includes('0.0.0.0'));
    assert.ok(CONFIG.LOCALHOST_HOSTS.includes('[::]'));
  });

  it('IMPACT_ORDER has 4 entries in correct order', () => {
    assert.equal(CONFIG.IMPACT_ORDER.length, 4);
    assert.deepEqual(CONFIG.IMPACT_ORDER, ['critical', 'serious', 'moderate', 'minor']);
  });

  it('MAX_OUTPUT_CHARS is large enough but bounded', () => {
    assert.ok(CONFIG.MAX_OUTPUT_CHARS >= 10_000);
    assert.ok(CONFIG.MAX_OUTPUT_CHARS <= 100_000);
  });

  it('VIEWPORTS has desktop and mobile entries', () => {
    assert.ok(CONFIG.VIEWPORTS.desktop);
    assert.ok(CONFIG.VIEWPORTS.mobile);
    assert.ok(CONFIG.VIEWPORTS.desktop.width > 0);
    assert.ok(CONFIG.VIEWPORTS.mobile.width > 0);
  });

  it('has waitFor blocked prefixes', () => {
    assert.ok(CONFIG.WAITFOR_BLOCKED_PREFIXES.includes('text='));
    assert.ok(CONFIG.WAITFOR_BLOCKED_PREFIXES.includes('xpath='));
  });
});
