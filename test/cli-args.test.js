import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractVerbosity, isServerInvocation } from '../src/cli-args.js';

describe('extractVerbosity', () => {
  it('pulls --verbose out from before a subcommand', () => {
    const { verbosity, rest } = extractVerbosity(['--verbose', 'audit', 'https://x.com']);
    assert.equal(verbosity, 'verbose');
    assert.deepEqual(rest, ['audit', 'https://x.com']);
  });

  it('pulls --quiet out from after a subcommand', () => {
    const { verbosity, rest } = extractVerbosity(['audit', '--quiet', 'https://x.com']);
    assert.equal(verbosity, 'quiet');
    assert.deepEqual(rest, ['audit', 'https://x.com']);
  });

  it('leaves args untouched when no global flag is present', () => {
    const { verbosity, rest } = extractVerbosity(['audit', 'https://x.com']);
    assert.equal(verbosity, null);
    assert.deepEqual(rest, ['audit', 'https://x.com']);
  });
});

describe('isServerInvocation', () => {
  it('starts the server for a bare invocation', () => {
    assert.equal(isServerInvocation([]), true);
  });

  it('does NOT start the server when a subcommand is present', () => {
    // This is the regression: `axecap --verbose audit url` must run the audit.
    assert.equal(isServerInvocation(['audit', 'https://x.com']), false);
    assert.equal(isServerInvocation(['rules']), false);
    assert.equal(isServerInvocation(['status']), false);
  });

  it('hands --help / --version to commander, not the server', () => {
    assert.equal(isServerInvocation(['--help']), false);
    assert.equal(isServerInvocation(['--version']), false);
  });
});
