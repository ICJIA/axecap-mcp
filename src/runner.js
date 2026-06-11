import path from 'path';
import os from 'os';
import fs from 'fs';
import { lookup } from 'dns/promises';
import { chromium } from 'playwright';
import axeCore from 'axe-core';
import { CONFIG, log } from './config.js';

// axe-core source for injection — loaded once at startup
const AXE_SOURCE = axeCore.source;

// ─── Concurrency gate ─────────────────────────────────────────────
// Each audit launches its own headless browser. Allow up to
// MAX_CONCURRENT_AUDITS to run concurrently and fail fast beyond that,
// rather than serializing every request through one promise chain (which
// made the limit unreachable and let latency stack past client timeouts).

let inFlight = 0;

function acquireSlot() {
  if (inFlight >= CONFIG.MAX_CONCURRENT_AUDITS) {
    throw new Error('Audit queue full — try again shortly');
  }
  inFlight++;
}

function releaseSlot() {
  inFlight = Math.max(0, inFlight - 1);
}

// ─── URL Validation ────────────────────────────────────────────────

// Classify a single resolved IP address as private/internal.
function isPrivateAddress(address) {
  // Normalize IPv4-mapped IPv6 (::ffff:1.2.3.4 → 1.2.3.4) and case.
  const normalized = (address.startsWith('::ffff:') ? address.slice(7) : address).toLowerCase();

  if (normalized.includes(':')) {
    // IPv6 — match whole ranges, not fixed prefixes (fc00::/7 spans fc/fd,
    // fe80::/10 spans fe8–feb), which a string prefix cannot express.
    if (normalized === '::' || normalized === '::1') return true; // unspecified / loopback
    if (/^f[cd]/.test(normalized)) return true;                   // fc00::/7 unique-local
    if (/^fe[89ab]/.test(normalized)) return true;                // fe80::/10 link-local
    return false;
  }

  // IPv4 — prefix match for the simply-bounded ranges (IPv6 prefixes in the
  // list never match a dotted-quad).
  if (CONFIG.BLOCKED_IP_PREFIXES.some(prefix => normalized.startsWith(prefix))) {
    return true;
  }
  // CGNAT 100.64.0.0/10 (RFC6598): second octet 64–127. A string prefix
  // can't span it, so check numerically.
  const cgnat = normalized.match(/^100\.(\d{1,3})\./);
  if (cgnat) {
    const octet = Number(cgnat[1]);
    if (octet >= 64 && octet <= 127) return true;
  }
  return false;
}

// True if `host` is an IP literal (IPv4 dotted-quad or any IPv6), not a name.
function isIpLiteral(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

async function isBlockedIp(hostname) {
  if (CONFIG.LOCALHOST_HOSTS.includes(hostname)) return false;

  try {
    // Inspect ALL resolved addresses — a host with mixed public/private
    // records (or DNS rebinding) must be blocked if any answer is internal.
    const addresses = await lookup(hostname, { all: true });
    return addresses.some(({ address }) => isPrivateAddress(address));
  } catch {
    // DNS resolution failed — fail closed (block the request)
    return true;
  }
}

// Decide whether a page sub-resource request (img/script/fetch/etc.) should
// be aborted. Navigation is already validated, but the loaded page's own
// requests could otherwise reach cloud metadata or probe the LAN. Mirrors the
// top-level policy: loopback allowed, private/metadata blocked, public allowed.
function isBlockedRequestUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }
  // Non-network schemes (data:, blob:, about:) are self-contained and safe.
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;

  const host = parsed.hostname;
  if (CONFIG.LOCALHOST_HOSTS.includes(host)) return false;
  if (CONFIG.BLOCKED_HOSTNAMES.includes(host)) return true;

  // Strip brackets from IPv6 literals: [fd00::1] → fd00::1
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (isIpLiteral(bare) && isPrivateAddress(bare)) return true;

  return false;
}

async function validateUrl(url) {
  const parsed = new URL(url);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Blocked URL scheme');
  }

  if (CONFIG.BLOCKED_HOSTNAMES.includes(parsed.hostname)) {
    throw new Error('Blocked URL');
  }

  if (await isBlockedIp(parsed.hostname)) {
    throw new Error('Blocked URL');
  }

  if (!CONFIG.LOCALHOST_HOSTS.includes(parsed.hostname)) {
    log('info', `Navigating to external host: ${parsed.hostname}`);
  }

  return parsed.href;
}

// ─── Directory Validation ──────────────────────────────────────────

// True only if `candidate` is the root itself or a descendant of it.
// A bare startsWith() would wrongly accept siblings like /tmpfoo for /tmp
// or <home>-evil for <home>; requiring the separator closes that escape.
function isWithinRoot(candidate, root) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

function validateOutputDir(dir) {
  const resolved = path.resolve(dir);
  const home = os.homedir();
  const realHome = fs.realpathSync(home);
  const realTmp = fs.realpathSync('/tmp');

  // Logical path check (fast reject for obvious violations)
  if (!isWithinRoot(resolved, home) && !isWithinRoot(resolved, '/tmp') && !isWithinRoot(resolved, '/private/tmp')) {
    throw new Error('Output directory is outside allowed paths');
  }

  // Walk up to the deepest existing ancestor and resolve its real path.
  // This catches symlink escapes BEFORE we create any directories.
  let existing = resolved;
  while (!fs.existsSync(existing)) {
    existing = path.dirname(existing);
  }
  const realExisting = fs.realpathSync(existing);
  if (!isWithinRoot(realExisting, realHome) && !isWithinRoot(realExisting, realTmp)) {
    throw new Error('Output directory is outside allowed paths');
  }

  // Now safe to create — the ancestor is verified
  fs.mkdirSync(resolved, { recursive: true });
  const real = fs.realpathSync(resolved);

  // Final check on the created path (belt and suspenders)
  if (!isWithinRoot(real, realHome) && !isWithinRoot(real, realTmp)) {
    throw new Error('Output directory is outside allowed paths');
  }

  return real;
}

// ─── waitFor Validation ───────────────────────────────────────────

function validateWaitFor(selector) {
  if (!selector || typeof selector !== 'string') return;
  const lower = selector.toLowerCase().trimStart();
  for (const prefix of CONFIG.WAITFOR_BLOCKED_PREFIXES) {
    if (lower.startsWith(prefix)) {
      throw new Error('waitFor must be a CSS selector');
    }
  }
}

// ─── Sanitize error messages ───────────────────────────────────────

const KNOWN_ERRORS = [
  'Blocked URL scheme',
  'Blocked URL',
  'Output directory is outside allowed paths',
  'axe-core audit timed out',
  'Audit queue full',
  'HTML content is required',
  'HTML content exceeds maximum length',
  'waitFor must be a CSS selector',
];

function sanitizeError(err) {
  const msg = err.message || 'Unknown error';
  // Pass through known safe error messages
  if (KNOWN_ERRORS.some(known => msg.startsWith(known))) return msg;
  // Playwright/Chrome errors: strip paths and return generic message
  if (msg.includes('ECONNREFUSED') || msg.includes('ERR_CONNECTION_REFUSED')) {
    return 'Could not connect to URL';
  }
  if (msg.includes('ETIMEOUT') || msg.includes('ERR_TIMED_OUT')) {
    return 'Connection timed out';
  }
  if (msg.includes('ERR_NAME_NOT_RESOLVED')) {
    return 'Could not resolve hostname';
  }
  // Chromium not downloaded — the most common first-run failure. The message
  // names a cache path, so return a fixed, actionable string (no path leak).
  if (msg.includes("Executable doesn't exist") || msg.includes('playwright install')) {
    return 'Browser not installed — run: npx playwright install chromium';
  }
  if (msg.includes('Invalid URL')) {
    return 'Invalid URL';
  }
  if (msg.includes('Timeout') || msg.includes('timeout')) {
    return 'Audit timed out';
  }
  // Generic fallback — never leak internal details
  log('error', `Unhandled error: ${msg}`);
  return 'Audit failed';
}

// ─── Browser lifecycle ────────────────────────────────────────────

async function killBrowser(browser) {
  try {
    await browser.close();
  } catch {
    // Already closed or crashed — ignore
  }
}

function launchArgs() {
  return [
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-background-networking',
    '--no-first-run',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-translate',
    '--no-default-browser-check',
    // Platform-specific sandbox
    ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
  ];
}

// ─── Timeout helper ───────────────────────────────────────────────

// Race a promise against a deadline. Rejects with `message` if the deadline
// fires first; otherwise settles with the promise's own result. Always clears
// the timer so it never keeps the event loop alive.
function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

// ─── axe-core config builder ──────────────────────────────────────

function buildAxeConfig(level, options) {
  const config = {
    resultTypes: options.includeIncomplete
      ? ['violations', 'incomplete']
      : ['violations'],
  };

  // If specific rules requested, use rule-based filtering
  if (options.rules && options.rules.length > 0) {
    config.runOnly = {
      type: 'rule',
      values: options.rules,
    };
  } else {
    // Use tag-based filtering for WCAG level
    const tags = CONFIG.LEVEL_TAGS[level];
    if (!tags) {
      throw new Error(`Invalid WCAG level: ${level}`);
    }
    config.runOnly = {
      type: 'tag',
      values: tags,
    };
  }

  return config;
}

// ─── URL Audit ────────────────────────────────────────────────────

async function _runAxeAudit(url, options = {}) {
  const validatedUrl = await validateUrl(url);
  const level = options.level || CONFIG.DEFAULT_LEVEL;
  const viewport = options.viewport || CONFIG.DEFAULT_VIEWPORT;

  acquireSlot();

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: launchArgs(),
    });
  } catch (err) {
    releaseSlot();
    throw err;
  }

  try {
    const startTime = Date.now();
    const vp = CONFIG.VIEWPORTS[viewport] || CONFIG.VIEWPORTS.desktop;

    // Whole page-interaction phase is bounded by AUDIT_TIMEOUT as an overall
    // cap, on top of the per-stage nav/waitFor/axe timeouts below.
    const { results, finalUrl } = await withTimeout((async () => {
      const context = await browser.newContext({
        viewport: vp,
        userAgent: viewport === 'mobile'
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
          : undefined,
      });
      const page = await context.newPage();

      // Auto-dismiss any dialogs (alert/confirm/prompt) to prevent blocking
      page.on('dialog', dialog => dialog.dismiss());

      // Block sub-resource requests to internal/metadata hosts. Navigation is
      // already validated, but the loaded page's own requests (img/script/fetch)
      // could otherwise reach the cloud metadata endpoint or probe the LAN.
      await page.route('**/*', (route) => {
        if (isBlockedRequestUrl(route.request().url())) return route.abort();
        return route.continue();
      });

      // Navigate with timeout. 'load' (not 'networkidle') because real-world
      // pages with analytics/ads/long-poll never reach network idle and would
      // otherwise always hit the timeout; SPAs can use the waitFor option.
      await page.goto(validatedUrl, {
        waitUntil: 'load',
        timeout: CONFIG.NAV_TIMEOUT,
      });

      // Post-navigation SSRF check (catches redirects and DNS rebinding)
      const navigatedUrl = page.url();
      if (!navigatedUrl) {
        throw new Error('Blocked URL');
      }
      try {
        await validateUrl(navigatedUrl);
      } catch {
        throw new Error('Blocked URL');
      }

      // Optional: wait for SPA element
      if (options.waitFor) {
        validateWaitFor(options.waitFor);
        await page.waitForSelector(options.waitFor, {
          timeout: CONFIG.WAIT_FOR_TIMEOUT,
        });
      }

      // Inject axe-core source into page
      await page.evaluate(AXE_SOURCE);

      // Build axe.run() configuration and run it, bounded by AXE_TIMEOUT
      const axeConfig = buildAxeConfig(level, options);
      const axeResults = await withTimeout(
        page.evaluate((config) => window.axe.run(document, config), axeConfig),
        CONFIG.AXE_TIMEOUT,
        'axe-core audit timed out'
      );

      return { results: axeResults, finalUrl: navigatedUrl };
    })(), CONFIG.AUDIT_TIMEOUT, 'axe-core audit timed out');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log('info', `Audit completed in ${elapsed}s — ${results.violations.length} violations`);

    // Optional: save full JSON to disk
    let jsonPath = null;
    if (options.directory) {
      const dir = validateOutputDir(options.directory);
      const filename = `axe-${Date.now()}.json`;
      const filePath = path.join(dir, filename);
      fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
      log('info', `JSON results saved: ${filePath}`);
      jsonPath = filePath;
    }

    return {
      results,
      jsonPath,
      meta: { url: validatedUrl, finalUrl, viewport, level },
    };
  } finally {
    releaseSlot();
    await killBrowser(browser);
  }
}

// Public entry point — concurrency bounded by the slot gate
export function runAxeAudit(url, options) {
  return _runAxeAudit(url, options);
}

// ─── HTML Audit ───────────────────────────────────────────────────

async function _runAxeOnHtml(html, options = {}) {
  if (!html || typeof html !== 'string') {
    throw new Error('HTML content is required');
  }
  if (html.length > CONFIG.MAX_HTML_LENGTH) {
    throw new Error('HTML content exceeds maximum length');
  }

  const level = options.level || CONFIG.DEFAULT_LEVEL;
  const viewport = options.viewport || CONFIG.DEFAULT_VIEWPORT;

  acquireSlot();

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: launchArgs(),
    });
  } catch (err) {
    releaseSlot();
    throw err;
  }

  try {
    const startTime = Date.now();
    const vp = CONFIG.VIEWPORTS[viewport] || CONFIG.VIEWPORTS.desktop;

    // Whole interaction phase bounded by AUDIT_TIMEOUT, axe.run by AXE_TIMEOUT.
    const results = await withTimeout((async () => {
      const context = await browser.newContext({ viewport: vp });
      const page = await context.newPage();

      // Auto-dismiss dialogs
      page.on('dialog', dialog => dialog.dismiss());

      // Block all network requests — HTML audits are self-contained.
      // Prevents SSRF via embedded resources (e.g., <img src="http://169.254.169.254/...">).
      await page.route('**/*', route => route.abort());

      // Set HTML content directly — no URL navigation
      await page.setContent(html, { waitUntil: 'domcontentloaded' });

      // Inject axe-core
      await page.evaluate(AXE_SOURCE);

      // Build config and run, bounded by AXE_TIMEOUT
      const axeConfig = buildAxeConfig(level, options);
      return withTimeout(
        page.evaluate((config) => window.axe.run(document, config), axeConfig),
        CONFIG.AXE_TIMEOUT,
        'axe-core audit timed out'
      );
    })(), CONFIG.AUDIT_TIMEOUT, 'axe-core audit timed out');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log('info', `HTML audit completed in ${elapsed}s — ${results.violations.length} violations`);

    return {
      results,
      jsonPath: null,
      meta: { url: 'about:blank', finalUrl: 'about:blank', viewport, level },
    };
  } finally {
    releaseSlot();
    await killBrowser(browser);
  }
}

export function runAxeOnHtml(html, options) {
  return _runAxeOnHtml(html, options);
}

// ─── Test-only exports ─────────────────────────────────────────────

export { sanitizeError };

export const _test = { validateUrl, validateOutputDir, isWithinRoot, isBlockedIp, isPrivateAddress, isIpLiteral, isBlockedRequestUrl, validateWaitFor, buildAxeConfig, acquireSlot, releaseSlot, withTimeout };
