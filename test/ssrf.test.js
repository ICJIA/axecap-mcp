import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _test } from '../src/runner.js';

const { isPrivateAddress, isIpLiteral, isBlockedRequestUrl } = _test;

describe('isPrivateAddress', () => {
  it('blocks RFC1918 ranges', () => {
    assert.equal(isPrivateAddress('10.0.0.5'), true);
    assert.equal(isPrivateAddress('192.168.1.1'), true);
    assert.equal(isPrivateAddress('172.16.0.1'), true);
    assert.equal(isPrivateAddress('172.31.255.255'), true);
  });

  it('allows public IPv4 just outside RFC1918', () => {
    assert.equal(isPrivateAddress('172.32.0.1'), false);
    assert.equal(isPrivateAddress('8.8.8.8'), false);
    assert.equal(isPrivateAddress('1.2.3.4'), false);
  });

  it('blocks loopback, link-local and metadata', () => {
    assert.equal(isPrivateAddress('127.0.0.1'), true);
    assert.equal(isPrivateAddress('169.254.169.254'), true);
  });

  it('blocks CGNAT shared address space 100.64.0.0/10', () => {
    assert.equal(isPrivateAddress('100.64.0.1'), true);
    assert.equal(isPrivateAddress('100.127.255.255'), true);
  });

  it('allows public 100.x outside the CGNAT /10', () => {
    assert.equal(isPrivateAddress('100.63.0.1'), false);
    assert.equal(isPrivateAddress('100.128.0.1'), false);
    assert.equal(isPrivateAddress('100.200.1.1'), false);
  });

  it('blocks IPv6 ULA (both halves of fc00::/7) and link-local', () => {
    assert.equal(isPrivateAddress('fc00::1'), true);
    assert.equal(isPrivateAddress('fd12::1'), true);
    assert.equal(isPrivateAddress('fe80::1'), true);
  });

  it('unwraps IPv4-mapped IPv6 before classifying', () => {
    assert.equal(isPrivateAddress('::ffff:10.0.0.1'), true);
    assert.equal(isPrivateAddress('::ffff:8.8.8.8'), false);
  });
});

describe('isIpLiteral', () => {
  it('recognises IPv4 and IPv6 literals', () => {
    assert.equal(isIpLiteral('10.0.0.1'), true);
    assert.equal(isIpLiteral('8.8.8.8'), true);
    assert.equal(isIpLiteral('fc00::1'), true);
    assert.equal(isIpLiteral('::1'), true);
  });

  it('rejects DNS hostnames', () => {
    assert.equal(isIpLiteral('example.com'), false);
    assert.equal(isIpLiteral('localhost'), false);
  });
});

describe('isBlockedRequestUrl (sub-resource SSRF filter)', () => {
  it('blocks the cloud metadata endpoint', () => {
    assert.equal(isBlockedRequestUrl('http://169.254.169.254/latest/meta-data/'), true);
    assert.equal(isBlockedRequestUrl('http://metadata.google.internal/'), true);
  });

  it('blocks private IP literals', () => {
    assert.equal(isBlockedRequestUrl('http://10.0.0.1/x'), true);
    assert.equal(isBlockedRequestUrl('http://192.168.1.1/'), true);
    assert.equal(isBlockedRequestUrl('http://[fd00::1]/x'), true);
  });

  it('blocks the unspecified address', () => {
    assert.equal(isBlockedRequestUrl('http://0.0.0.0/'), true);
  });

  it('allows public resources (CDNs, public IPs)', () => {
    assert.equal(isBlockedRequestUrl('https://cdn.jsdelivr.net/x.js'), false);
    assert.equal(isBlockedRequestUrl('https://example.com/app.js'), false);
    assert.equal(isBlockedRequestUrl('http://8.8.8.8/x'), false);
  });

  it('allows loopback sub-resources (matches top-level localhost policy)', () => {
    assert.equal(isBlockedRequestUrl('http://localhost:3000/style.css'), false);
    assert.equal(isBlockedRequestUrl('http://127.0.0.1:3000/x'), false);
    assert.equal(isBlockedRequestUrl('http://[::1]/x'), false);
  });

  it('does not block non-network schemes (data:, blob:)', () => {
    assert.equal(isBlockedRequestUrl('data:image/png;base64,iVBORw0KGgo='), false);
    assert.equal(isBlockedRequestUrl('blob:https://example.com/abc'), false);
  });
});
