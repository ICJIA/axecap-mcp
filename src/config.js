export const CONFIG = {
  MAX_VIOLATIONS_DEFAULT: 10,
  MAX_VIOLATIONS_CAP: 15,
  MAX_ELEMENTS_PER_VIOLATION: 5,
  SELECTOR_MAX_LENGTH: 60,
  HELP_TEXT_MAX_LENGTH: 120,
  MAX_URL_LENGTH: 2048,
  MAX_HTML_LENGTH: 512_000,
  AUDIT_TIMEOUT: 60_000,
  NAV_TIMEOUT: 30_000,
  AXE_TIMEOUT: 30_000,
  WAIT_FOR_TIMEOUT: 10_000,
  MAX_CONCURRENT_AUDITS: 2,
  DEFAULT_LEVEL: 'aa',
  DEFAULT_VIEWPORT: 'desktop',
  VIEWPORTS: {
    desktop: { width: 1350, height: 940 },
    mobile: { width: 375, height: 812 },
  },
  BLOCKED_HOSTNAMES: [
    '169.254.169.254',
    'metadata.google.internal',
    'metadata.azure.com',
    '0.0.0.0',                  // IPv4 unspecified / all-interfaces
    '[::]',                     // IPv6 unspecified / all-interfaces
  ],
  BLOCKED_IP_PREFIXES: [
    '169.254.',                // IPv4 link-local (AWS metadata)
    '10.',                     // RFC1918 Class A private
    '172.16.', '172.17.', '172.18.', '172.19.',  // RFC1918 Class B private
    '172.20.', '172.21.', '172.22.', '172.23.',
    '172.24.', '172.25.', '172.26.', '172.27.',
    '172.28.', '172.29.', '172.30.', '172.31.',
    '192.168.',                // RFC1918 Class C private
    '127.',                    // Full loopback range (127.0.0.0/8)
    '0.',                      // 0.0.0.0/8 "this network"
    'fc00:',                   // IPv6 unique-local (lower half of fc00::/7)
    'fd00:',                   // IPv6 unique-local (upper half of fc00::/7)
    'fe80:',                   // IPv6 link-local
    '::',                      // IPv6 unspecified / loopback
  ],
  // CGNAT shared address space (RFC6598): 100.64.0.0/10 — checked
  // numerically in isPrivateAddress since a string prefix can't span it.
  // Genuine loopback only. The unspecified addresses 0.0.0.0 / [::] are
  // "all interfaces", not loopback — they live in BLOCKED_HOSTNAMES instead.
  LOCALHOST_HOSTS: ['localhost', '127.0.0.1', '::1', '[::1]'],
  // WCAG conformance is cumulative: AAA includes AA includes A.
  // Includes wcag22a for WCAG 2.2 Level A additions.
  LEVEL_TAGS: {
    a:   ['wcag2a', 'wcag21a', 'wcag22a'],
    aa:  ['wcag2a', 'wcag21a', 'wcag22a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
    aaa: ['wcag2a', 'wcag21a', 'wcag22a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'wcag2aaa'],
    'best-practice': ['best-practice'],
  },
  // All tags at AA level and below — used for delta filtering
  AA_AND_BELOW_TAGS: ['wcag2a', 'wcag21a', 'wcag22a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
  IMPACT_ORDER: ['critical', 'serious', 'moderate', 'minor'],
  MAX_OUTPUT_LINES: 200,
  MAX_OUTPUT_CHARS: 50_000,
  // CSS-safe characters for waitFor validation
  WAITFOR_BLOCKED_PREFIXES: ['text=', 'xpath=', '>>', 'css=', '_react=', '_vue='],
};

// Logging — levels: error, info, debug
// Verbosity: 'quiet' = error only, 'normal' = error+info, 'verbose' = all
let verbosity = 'normal';

export function setVerbosity(level) { verbosity = level; }

export function log(level, msg) {
  if (verbosity === 'quiet' && level !== 'error') return;
  if (verbosity === 'normal' && level === 'debug') return;
  console.error(`[axecap] ${msg}`);
}
