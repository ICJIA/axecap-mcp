import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../src/runner.js';

const { withTimeout } = _test;

describe('withTimeout', () => {
  it('rejects with the given message when the promise exceeds the deadline', async () => {
    await assert.rejects(
      () => withTimeout(new Promise(() => {}), 20, 'too slow'),
      { message: 'too slow' }
    );
  });

  it('resolves with the value when the promise settles in time', async () => {
    const value = await withTimeout(Promise.resolve(42), 1000, 'too slow');
    assert.equal(value, 42);
  });

  it('propagates the underlying rejection if it loses the race to the timeout', async () => {
    await assert.rejects(
      () => withTimeout(Promise.reject(new Error('boom')), 1000, 'too slow'),
      { message: 'boom' }
    );
  });
});
