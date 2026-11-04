#!/bin/sh
# Connect a git repo to Bytepet from the terminal.
# Usage:  sh scripts/connect-repo.sh /path/to/your/project
# (You can also do this from the menu bar: Connect a Git repo…)

REPO="${1:-.}"
HOOKS_DIR="$(git -C "$REPO" rev-parse --git-path hooks 2>/dev/null)" || {
  echo "Not a git repository: $REPO"; exit 1;
}
case "$HOOKS_DIR" in /*) ;; *) HOOKS_DIR="$REPO/$HOOKS_DIR" ;; esac
mkdir -p "$HOOKS_DIR"
HOOK="$HOOKS_DIR/post-commit"
MARKER="# bytepet: feed the pet on every commit"

if [ -f "$HOOK" ] && grep -q "$MARKER" "$HOOK"; then
  echo "Already connected."; exit 0
fi
[ -f "$HOOK" ] || echo '#!/bin/sh' > "$HOOK"
printf '\n%s\n%s\n' "$MARKER" 'curl -s -m 2 "http://127.0.0.1:47777/feed?type=commit" >/dev/null 2>&1 &' >> "$HOOK"
chmod +x "$HOOK"
echo "Connected! Every commit in $REPO now feeds your pet."
