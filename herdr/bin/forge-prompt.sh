#!/usr/bin/env bash
# Interactive pane for the herdr actions: asks for URLs, runs the fan-out script, waits before closing.
# Usage: forge-prompt.sh review|work
set -euo pipefail

mode="${1:-}"
case "$mode" in review|worktree) ;; *) printf 'usage: forge-prompt.sh review|worktree\n' >&2; exit 1 ;; esac

bin="$(cd "$(dirname "$0")" && pwd)"
printf 'forgerdr %s\nPaste the URLs (one per line, space separated also fine), then an empty line:\n' "$mode"
urls=()
while IFS= read -r line; do
  [ -n "$line" ] || break
  for url in $line; do urls+=("$url"); done
done
[ ${#urls[@]} -gt 0 ] || { printf 'nothing to do\n'; exit 0; }

"$bin/forge-$mode.sh" "${urls[@]}" || status=$?
printf '\nPress Enter to close.\n'
read -r _ || true
exit "${status:-0}"
