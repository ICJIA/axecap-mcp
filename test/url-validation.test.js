import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _test, sanitizeError } from '../src/runner.js';

const { validateUrl, isBlockedIp, validateWaitFor } = _test;

describe('validateUrl', () => {
  it('allows http localhost', async () => {
    const result = await validateUrl('http://localhost:3000');
    assert.equal(result, 'http://localhost:3000/');
  });

  it('allows http 127.0.0.1', async () => {
    const result = await validateUrl('http://127.0.0.1:8080');
    assert.equal(result, 'http://127.0.0.1:8080/');
  });

  it('allows https external URLs', async () => {
    const result = await validateUrl('https://example.com');
    assert.equal(result, 'https://example.com/');
  });

  it('blocks file:// scheme', async () => {
    await assert.rejects(
      () => validateUrl('file:///etc/passwd'),
      { message: 'Blocked URL scheme' }
    );
  });

  it('blocks data: scheme', async () => {
    await assert.rejects(
      () => validateUrl('data:text/html,<h1>test</h1>'),
      { message: 'Blocked URL scheme' }
    );
  });

  it('blocks javascript: scheme', async () => {
    await assert.rejects(
      () => validateUrl('javascript:alert(1)'),
      { message: 'Blocked URL scheme' }
    );
  });

  it('blocks ftp:// scheme', async () => {
    await assert.rejects(
      () => validateUrl('ftp://example.com'),
      { message: 'Blocked URL scheme' }
    );
  });

  it('blocks AWS metadata endpoint', async () => {
    await assert.rejects(
      () => validateUrl('http://169.254.169.254/latest/meta-data/'),
      { message: 'Blocked URL' }
    );
  });

  it('blocks GCP metadata endpoint', async () => {
    await assert.rejects(
      () => validateUrl('http://metadata.google.internal/'),
      { message: 'Blocked URL' }
    );
  });

  it('blocks Azure metadata endpoint', async () => {
    await assert.rejects(
      () => validateUrl('http://metadata.azure.com/'),
      { message: 'Blocked URL' }
    );
  });

  it('blocks 0.0.0.0', async () => {
    await assert.rejects(
      () => validateUrl('http://0.0.0.0:8080/'),
      { message: 'Blocked URL' }
    );
  });

  it('throws on invalid URL', async () => {
    await assert.rejects(
      () => validateUrl('not-a-url'),
      Error
    );
  });

  it('throws on empty string', async () => {
    await assert.rejects(
      () => validateUrl(''),
      Error
    );
  });

  it('error messages are generic (no internal details)', async () => {
    try {
      await validateUrl('file:///etc/shadow');
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(!err.message.includes('/etc'));
      assert.ok(!err.message.includes('shadow'));
    }
  });
});

describe('isBlockedIp', () => {
  it('allows localhost', async () => {
    assert.equal(await isBlockedIp('localhost'), false);
  });

  it('allows 127.0.0.1', async () => {
    assert.equal(await isBlockedIp('127.0.0.1'), false);
  });

  it('allows ::1', async () => {
    assert.equal(await isBlockedIp('::1'), false);
  });

  it('blocks 0.0.0.0 (unspecified address, not loopback)', async () => {
    assert.equal(await isBlockedIp('0.0.0.0'), true);
  });
});

describe('BLOCKED_IP_PREFIXES coverage', async () => {
  const { CONFIG } = await import('../src/config.js');
  const prefixes = CONFIG.BLOCKED_IP_PREFIXES;

  it('blocks full 127.x.x.x loopback range', () => {
    assert.ok(prefixes.includes('127.'));
  });

  it('blocks 0.x.x.x range', () => {
    assert.ok(prefixes.includes('0.'));
  });

  it('blocks :: (IPv6 unspecified/loopback)', () => {
    assert.ok(prefixes.includes('::'));
  });

  it('blocks all RFC1918 172.16-31.x ranges', () => {
    for (let i = 16; i <= 31; i++) {
      assert.ok(prefixes.includes(`172.${i}.`), `Missing 172.${i}.`);
    }
  });
});

describe('validateWaitFor', () => {
  it('allows CSS selectors', () => {
    assert.doesNotThrow(() => validateWaitFor('#app-loaded'));
    assert.doesNotThrow(() => validateWaitFor('.main-content'));
    assert.doesNotThrow(() => validateWaitFor('div.hero > img'));
  });

  it('blocks text= pseudo-selectors', () => {
    assert.throws(() => validateWaitFor('text=Click me'), { message: 'waitFor must be a CSS selector' });
  });

  it('blocks xpath= pseudo-selectors', () => {
    assert.throws(() => validateWaitFor('xpath=//div'), { message: 'waitFor must be a CSS selector' });
  });

  it('blocks >> chaining', () => {
    assert.throws(() => validateWaitFor('>> div.foo'), { message: 'waitFor must be a CSS selector' });
  });

  it('allows null/undefined (no-op)', () => {
    assert.doesNotThrow(() => validateWaitFor(null));
    assert.doesNotThrow(() => validateWaitFor(undefined));
  });
});

describe('sanitizeError', () => {
  it('passes through known safe errors', () => {
    assert.equal(sanitizeError(new Error('Blocked URL scheme')), 'Blocked URL scheme');
    assert.equal(sanitizeError(new Error('Blocked URL')), 'Blocked URL');
    assert.equal(sanitizeError(new Error('axe-core audit timed out')), 'axe-core audit timed out');
    assert.equal(sanitizeError(new Error('Audit queue full — try again shortly')), 'Audit queue full — try again shortly');
    assert.equal(sanitizeError(new Error('HTML content is required')), 'HTML content is required');
    assert.equal(sanitizeError(new Error('waitFor must be a CSS selector')), 'waitFor must be a CSS selector');
  });

  it('maps connection errors to generic messages', () => {
    assert.equal(sanitizeError(new Error('connect ECONNREFUSED 127.0.0.1:3000')), 'Could not connect to URL');
    assert.equal(sanitizeError(new Error('net::ERR_CONNECTION_REFUSED')), 'Could not connect to URL');
  });

  it('maps timeout errors', () => {
    assert.equal(sanitizeError(new Error('ETIMEOUT on request')), 'Connection timed out');
  });

  it('maps DNS errors', () => {
    assert.equal(sanitizeError(new Error('net::ERR_NAME_NOT_RESOLVED')), 'Could not resolve hostname');
  });

  it('returns generic fallback for unknown errors', () => {
    assert.equal(sanitizeError(new Error('/Users/secret/path/to/file.js:42')), 'Audit failed');
  });

  it('maps a missing-browser error to an actionable, path-free message', () => {
    const msg = "browserType.launch: Executable doesn't exist at /Users/x/Library/Caches/ms-playwright/chromium-1234/chrome-mac/Chromium.app/Contents/MacOS/Chromium\nLooks like Playwright was just installed or updated. Please run the following command to download new browsers:\nnpx playwright install";
    const result = sanitizeError(new Error(msg));
    assert.match(result, /playwright install/);
    assert.ok(!result.includes('/Users/'));
  });

  it('never leaks filesystem paths', () => {
    const result = sanitizeError(new Error('ENOENT: /home/user/.config/chrome'));
    assert.ok(!result.includes('/home'));
    assert.ok(!result.includes('ENOENT'));
  });
});
