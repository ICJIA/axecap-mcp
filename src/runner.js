import path from 'path';
import os from 'os';
import fs from 'fs';
import { lookup } from 'dns/promises';
import { chromium } from 'playwright';
import axeCore from 'axe-core';
import { CONFIG, log } from './config.js';

// axe-core source for injection — loaded once at startup
const AXE_SOURCE = axeCore.source;

// ─── Request Serialization ────────────────────────────────────────

let inFlight = 0;
let queue = Promise.resolve();

function enqueue(fn) {
  queue = queue.then(() => fn(), () => fn());
  return queue;
}

// ─── URL Validation ────────────────────────────────────────────────

async function isBlockedIp(hostname) {
  if (CONFIG.LOCALHOST_HOSTS.includes(hostname)) return false;

  try {
    const { address } = await lookup(hostname);
    // Normalize IPv6-mapped IPv4: ::ffff:1.2.3.4 → 1.2.3.4
    const normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
    return CONFIG.BLOCKED_IP_PREFIXES.some(prefix => normalized.startsWith(prefix));
  } catch {
    // DNS resolution failed — fail closed (block the request)
    return true;
  }
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

function validateOutputDir(dir) {
  const resolved = path.resolve(dir);
  const home = os.homedir();
  const realHome = fs.realpathSync(home);
  const realTmp = fs.realpathSync('/tmp');

  // Logical path check (fast reject for obvious violations)
  if (!resolved.startsWith(home) && !resolved.startsWith('/tmp') && !resolved.startsWith('/private/tmp')) {
    throw new Error('Output directory is outside allowed paths');
  }

  // Walk up to the deepest existing ancestor and resolve its real path.
  // This catches symlink escapes BEFORE we create any directories.
  let existing = resolved;
  while (!fs.existsSync(existing)) {
    existing = path.dirname(existing);
  }
  const realExisting = fs.realpathSync(existing);
  if (!realExisting.startsWith(realHome) && !realExisting.startsWith(realTmp)) {
    throw new Error('Output directory is outside allowed paths');
  }

  // Now safe to create — the ancestor is verified
  fs.mkdirSync(resolved, { recursive: true });
  const real = fs.realpathSync(resolved);

  // Final check on the created path (belt and suspenders)
  if (!real.startsWith(realHome) && !real.startsWith(realTmp)) {
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

  if (inFlight >= CONFIG.MAX_CONCURRENT_AUDITS) {
    throw new Error('Audit queue full — try again shortly');
  }
  inFlight++;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: launchArgs(),
    });
  } catch (err) {
    inFlight--;
    throw err;
  }

  try {
    const startTime = Date.now();
    const vp = CONFIG.VIEWPORTS[viewport] || CONFIG.VIEWPORTS.desktop;

    const context = await browser.newContext({
      viewport: vp,
      userAgent: viewport === 'mobile'
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined,
    });
    const page = await context.newPage();

    // Auto-dismiss any dialogs (alert/confirm/prompt) to prevent blocking
    page.on('dialog', dialog => dialog.dismiss());

    // Navigate with timeout
    await page.goto(validatedUrl, {
      waitUntil: 'networkidle',
      timeout: CONFIG.NAV_TIMEOUT,
    });

    // Post-navigation SSRF check (catches redirects and DNS rebinding)
    const finalUrl = page.url();
    if (!finalUrl) {
      throw new Error('Blocked URL');
    }
    try {
      await validateUrl(finalUrl);
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

    // Build axe.run() configuration
    const axeConfig = buildAxeConfig(level, options);

    // Run axe-core with timeout
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('axe-core audit timed out')), CONFIG.AXE_TIMEOUT);
    });

    const results = await Promise.race([
      page.evaluate((config) => window.axe.run(document, config), axeConfig),
      timeoutPromise,
    ]).finally(() => clearTimeout(timeoutId));

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
    inFlight--;
    await killBrowser(browser);
  }
}

// Public entry point — serialized through queue
export function runAxeAudit(url, options) {
  return enqueue(() => _runAxeAudit(url, options));
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

  if (inFlight >= CONFIG.MAX_CONCURRENT_AUDITS) {
    throw new Error('Audit queue full — try again shortly');
  }
  inFlight++;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: launchArgs(),
    });
  } catch (err) {
    inFlight--;
    throw err;
  }

  try {
    const startTime = Date.now();
    const vp = CONFIG.VIEWPORTS[viewport] || CONFIG.VIEWPORTS.desktop;

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

    // Build config and run
    const axeConfig = buildAxeConfig(level, options);

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('axe-core audit timed out')), CONFIG.AXE_TIMEOUT);
    });

    const results = await Promise.race([
      page.evaluate((config) => window.axe.run(document, config), axeConfig),
      timeoutPromise,
    ]).finally(() => clearTimeout(timeoutId));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log('info', `HTML audit completed in ${elapsed}s — ${results.violations.length} violations`);

    return {
      results,
      jsonPath: null,
      meta: { url: 'about:blank', finalUrl: 'about:blank', viewport, level },
    };
  } finally {
    inFlight--;
    await killBrowser(browser);
  }
}

export function runAxeOnHtml(html, options) {
  return enqueue(() => _runAxeOnHtml(html, options));
}

// ─── Test-only exports ─────────────────────────────────────────────

export { sanitizeError };

export const _test = { validateUrl, validateOutputDir, isBlockedIp, validateWaitFor, buildAxeConfig };
