import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../src/runner.js';
import { CONFIG } from '../src/config.js';

const { acquireSlot, releaseSlot } = _test;

describe('audit concurrency gate', () => {
  it('allows up to MAX_CONCURRENT_AUDITS slots to be held at once', () => {
    assert.doesNotThrow(() => {
      for (let i = 0; i < CONFIG.MAX_CONCURRENT_AUDITS; i++) acquireSlot();
    });
    for (let i = 0; i < CONFIG.MAX_CONCURRENT_AUDITS; i++) releaseSlot();
  });

  it('rejects acquisition beyond the limit with "Audit queue full"', () => {
    for (let i = 0; i < CONFIG.MAX_CONCURRENT_AUDITS; i++) acquireSlot();
    assert.throws(() => acquireSlot(), { message: /Audit queue full/ });
    for (let i = 0; i < CONFIG.MAX_CONCURRENT_AUDITS; i++) releaseSlot();
  });

  it('releaseSlot frees capacity for a subsequent audit', () => {
    for (let i = 0; i < CONFIG.MAX_CONCURRENT_AUDITS; i++) acquireSlot();
    releaseSlot();
    assert.doesNotThrow(() => acquireSlot());
    for (let i = 0; i < CONFIG.MAX_CONCURRENT_AUDITS; i++) releaseSlot();
  });

  it('releaseSlot never drives the counter negative', () => {
    // Over-releasing must not create phantom capacity.
    releaseSlot();
    releaseSlot();
    for (let i = 0; i < CONFIG.MAX_CONCURRENT_AUDITS; i++) acquireSlot();
    assert.throws(() => acquireSlot(), { message: /Audit queue full/ });
    for (let i = 0; i < CONFIG.MAX_CONCURRENT_AUDITS; i++) releaseSlot();
  });
});
