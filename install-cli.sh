#!/usr/bin/env bash
set -euo pipefail

# AxeCap CLI installer (macOS + Linux) — makes `axecap ...` available in your
# shell without the MCP server being registered anywhere.
#
# Usage:
#   ./install-cli.sh              — install (safe to re-run; updates paths in place)
#   ./install-cli.sh --uninstall  — remove the alias and the symlink
#
# What it does:
#   1. npm install (if node_modules is missing) + download Playwright Chromium
#   2. Adds an `axecap` alias to ~/.zshrc (and ~/.bashrc if present, or if
#      bash is your login shell), inside a marked block — re-runs replace the
#      block rather than appending a duplicate
#   4. Runs a smoke-test audit to prove the browser actually launches
#   3. Symlinks ~/.local/bin/axecap -> src/cli.js, so `axecap` also works in
#      non-interactive shells that don't read ~/.zshrc aliases (e.g. Claude
#      Code's Bash tool, scripts, cron)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[axecap]${NC} $1"; }
warn()  { echo -e "${YELLOW}[axecap]${NC} $1"; }
error() { echo -e "${RED}[axecap]${NC} $1" >&2; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="$REPO_DIR/src/cli.js"
OS="$(uname -s)"
BIN_DIR="$HOME/.local/bin"
LINK="$BIN_DIR/axecap"
MARK_START="# >>> axecap cli >>>"
MARK_END="# <<< axecap cli <<<"

# Shell rc files to manage: ~/.zshrc always (created if missing), plus
# ~/.bashrc when it exists or bash is the login shell (typical on Linux).
rc_files() {
  echo "${ZDOTDIR:-$HOME}/.zshrc"
  if [[ -f "$HOME/.bashrc" || "$(basename "${SHELL:-}")" == "bash" ]]; then
    echo "$HOME/.bashrc"
  fi
}

# Remove the marked block from an rc file (returns 1 if there was none).
remove_block() {
  local rc="$1"
  [[ -f "$rc" ]] || return 1
  if grep -qxF "$MARK_START" "$rc"; then
    local tmp
    tmp="$(mktemp)"
    awk -v s="$MARK_START" -v e="$MARK_END" '
      $0 == s { skip = 1; next }
      $0 == e { skip = 0; next }
      !skip
    ' "$rc" > "$tmp"
    cat "$tmp" > "$rc"   # preserve the original file's permissions/inode
    rm -f "$tmp"
    return 0
  fi
  return 1
}

add_block() {
  local rc="$1"
  touch "$rc"
  # If the file doesn't end in a newline, add one so the marker starts its
  # own line (otherwise it would be glued onto the user's last line).
  if [[ -s "$rc" && "$(tail -c 1 "$rc")" != "" ]]; then
    echo "" >> "$rc"
  fi
  {
    echo "$MARK_START"
    echo "# Managed by $REPO_DIR/install-cli.sh — remove with: install-cli.sh --uninstall"
    echo "alias axecap='node \"$CLI\"'"
    echo "$MARK_END"
  } >> "$rc"
}

# Remove the symlink only if it is ours (points at an axecap cli.js).
remove_link() {
  if [[ -L "$LINK" ]]; then
    local target
    target="$(readlink "$LINK")"
    if [[ "$target" == */src/cli.js ]]; then
      rm -f "$LINK"
      return 0
    fi
    warn "$LINK points at $target — not ours, leaving it alone."
  fi
  return 1
}

# ─── Uninstall ──────────────────────────────────────────────────────

if [[ "${1:-}" == "--uninstall" ]]; then
  for rc in "${ZDOTDIR:-$HOME}/.zshrc" "$HOME/.bashrc"; do
    if remove_block "$rc"; then info "Removed alias block from $rc"; fi
  done
  if remove_link;  then info "Removed $LINK"; else info "No axecap symlink at $LINK"; fi
  info "Done. Open a new shell (or run: unalias axecap) to drop the alias from this session."
  exit 0
fi

if [[ -n "${1:-}" ]]; then
  error "Unknown argument: $1 (use --uninstall or no argument)"
  exit 1
fi

# ─── Preflight ──────────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
  error "Node.js not found. Install Node 18+ first."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 18 )); then
  error "Node $(node -v) is too old — axecap needs Node 18+."
  exit 1
fi

if [[ ! -f "$CLI" ]]; then
  error "Can't find $CLI — run this script from the axecap repo."
  exit 1
fi

# ─── Dependencies ───────────────────────────────────────────────────

cd "$REPO_DIR"
# Always run: it's fast when up to date, and catches a stale node_modules
# (e.g. an older axe-core than package.json asks for) after a git pull.
info "Installing npm dependencies..."
npm install --no-fund --no-audit

info "Ensuring Playwright Chromium is downloaded (no-op if already present)..."
npx playwright install chromium

chmod +x "$CLI"

# ─── ~/.zshrc alias ─────────────────────────────────────────────────

RC_FILES=()
while IFS= read -r rc; do RC_FILES+=("$rc"); done < <(rc_files)
for rc in "${RC_FILES[@]}"; do
  if remove_block "$rc"; then
    info "Updating alias in $rc"
  else
    info "Adding alias to $rc"
  fi
  add_block "$rc"
done

# ─── ~/.local/bin symlink ───────────────────────────────────────────

mkdir -p "$BIN_DIR"
if [[ -e "$LINK" && ! -L "$LINK" ]]; then
  warn "$LINK exists and is not a symlink — skipping (alias still works in interactive zsh)."
elif [[ -L "$LINK" && "$(readlink "$LINK")" != */src/cli.js ]]; then
  warn "$LINK points at $(readlink "$LINK") — not ours, skipping."
else
  ln -sfn "$CLI" "$LINK"
  info "Symlinked $LINK -> $CLI"
fi

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) warn "$BIN_DIR is not on your PATH — add it so non-interactive shells (and Claude) can find axecap:"
     warn "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ${RC_FILES[0]}" ;;
esac

# ─── Verify ─────────────────────────────────────────────────────────

echo ""
node "$CLI" status
echo ""

info "Smoke test: auditing a tiny HTML snippet..."
if echo '<html lang="en"><head><title>t</title></head><body><main><h1>ok</h1></main></body></html>' \
    | node "$CLI" --quiet audit-html - >/dev/null; then
  info "Browser launches and audits run."
else
  error "Smoke-test audit failed — the browser could not run."
  if [[ "$OS" == "Linux" ]]; then
    error "On Linux, Chromium usually needs system libraries. Install them with:"
    error "  sudo npx --prefix \"$REPO_DIR\" playwright install-deps chromium"
  fi
  exit 1
fi

echo ""
info "Installed. Run: source ${RC_FILES[0]}   (or open a new terminal)"
info "Try:  axecap audit https://example.com"
echo ""
info "To let Claude use the CLI when the MCP server isn't registered, add this to ~/.claude/CLAUDE.md:"
echo ""
echo "  - For WCAG audits, if the \`axecap\` MCP tools aren't available, use the \`axecap\` CLI via Bash"
echo "    (\`axecap audit <url>\`, \`axecap audit-html <file>\`, \`axecap rules\`, \`axecap rule-info <id>\`)."
echo "    Output is the same compressed text the MCP tools return. Run \`axecap --help\` for options."
echo ""
