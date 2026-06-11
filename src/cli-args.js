// Pure argv helpers for the CLI entry point. Kept side-effect-free so they
// can be unit-tested without triggering the dispatch in cli.js.

// Pull the global --verbose/--quiet flags out of the args regardless of
// position, returning the chosen verbosity (last wins, or null) and the
// remaining args. Handling them here means their position relative to a
// subcommand no longer matters.
export function extractVerbosity(args) {
  let verbosity = null;
  const rest = [];
  for (const arg of args) {
    if (arg === '--verbose') verbosity = 'verbose';
    else if (arg === '--quiet') verbosity = 'quiet';
    else rest.push(arg);
  }
  return { verbosity, rest };
}

// With the global flags removed, a bare invocation (no remaining args) starts
// the MCP server; anything else — a subcommand, --help, --version, or an
// unknown token — is handed to commander to dispatch or report.
export function isServerInvocation(rest) {
  return rest.length === 0;
}
