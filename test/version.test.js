import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import { readPackageVersion, npmBinary } from '../src/version.js';

const require = createRequire(import.meta.url);

describe('readPackageVersion', () => {
  it('resolves an installed dependency version via Node module resolution', () => {
    // Independently resolve the real installed version to prove the function
    // walks node_modules correctly (works under npm hoisting, not just a
    // dev-repo relative path).
    const expected = require('axe-core/package.json').version;
    assert.equal(readPackageVersion('axe-core'), expected);
  });

  it('resolves playwright version too', () => {
    const expected = require('playwright/package.json').version;
    assert.equal(readPackageVersion('playwright'), expected);
  });

  it('returns "unknown" for a package that is not installed', () => {
    assert.equal(readPackageVersion('this-package-definitely-does-not-exist-xyz'), 'unknown');
  });
});

describe('npmBinary', () => {
  it('uses npm.cmd on Windows (execFile has no shell)', () => {
    assert.equal(npmBinary('win32'), 'npm.cmd');
  });

  it('uses npm on macOS and Linux', () => {
    assert.equal(npmBinary('darwin'), 'npm');
    assert.equal(npmBinary('linux'), 'npm');
  });
});
