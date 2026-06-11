import { createRequire } from 'module';
import { execFile } from 'child_process';

const require = createRequire(import.meta.url);

// Resolve an installed dependency's version via Node module resolution.
// Walks node_modules from this file's location, so it works under npm
// hoisting (npx installs) — not just a dev-repo relative path.
export function readPackageVersion(spec) {
  try {
    return require(`${spec}/package.json`).version;
  } catch {
    return 'unknown';
  }
}

// execFile() spawns without a shell, so on Windows the PATH-resolved shim
// `npm` (a .cmd) is not found — the real executable is `npm.cmd`.
export function npmBinary(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

// Query npm for the latest published version of a package. Resolves to a
// semver string, or 'unknown' on any error/timeout. Never rejects.
export function fetchLatestVersion(pkgName, timeout = 5000) {
  return new Promise((resolve) => {
    execFile(npmBinary(), ['view', pkgName, 'version'], { timeout }, (err, stdout) => {
      const raw = err ? 'unknown' : stdout.trim();
      resolve(/^\d+\.\d+\.\d+/.test(raw) ? raw : 'unknown');
    });
  });
}
