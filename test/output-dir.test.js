import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { _test } from '../src/runner.js';

const { isWithinRoot, validateOutputDir } = _test;

describe('isWithinRoot', () => {
  it('accepts the root itself', () => {
    assert.equal(isWithinRoot('/Users/alice', '/Users/alice'), true);
  });

  it('accepts a path nested under the root', () => {
    assert.equal(isWithinRoot('/Users/alice/out', '/Users/alice'), true);
  });

  it('rejects a sibling whose name merely shares the root as a prefix', () => {
    // /Users/alice-evil must NOT be treated as inside /Users/alice
    assert.equal(isWithinRoot('/Users/alice-evil/out', '/Users/alice'), false);
  });

  it('rejects /tmpfoo for root /tmp', () => {
    assert.equal(isWithinRoot('/tmpfoo', '/tmp'), false);
  });

  it('accepts a real child of /tmp', () => {
    assert.equal(isWithinRoot('/tmp/axe-123', '/tmp'), true);
  });
});

describe('validateOutputDir', () => {
  it('accepts and returns the realpath of a dir created under /tmp', () => {
    const dir = path.join('/tmp', `axecap-test-${process.pid}`);
    try {
      const real = validateOutputDir(dir);
      assert.ok(real.length > 0);
      assert.ok(fs.existsSync(real));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a path outside home and /tmp', () => {
    assert.throws(
      () => validateOutputDir('/etc/axecap-should-not-write'),
      { message: /outside allowed paths/ }
    );
  });
});
