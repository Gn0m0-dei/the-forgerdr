#!/usr/bin/env bash
# Interactive pane for the herdr actions. review: asks for pull request URLs and runs forge-review.sh.
# worktree: asks for items and hands them to /forgerdr:worktree in a claude session, which reads the spec mode.
# Usage: forge-prompt.sh review|worktree
set -euo pipefail

mode="${1:-}"
case "$mode" in review|worktree) ;; *) printf 'usage: forge-prompt.sh review|worktree\n' >&2; exit 1 ;; esac

if [ "$mode" = worktree ]; then
  printf 'forgerdr worktree\nItems separated by | (work item URLs, OpenSpec changes or text, as the spec mode says), then an empty line:\n'
  # Lines are read up to the first empty one and joined: a line break never splits an item, and none of them is left
  # in the terminal for claude to submit.
  input=""
  while IFS= read -r line && [ -n "$line" ]; do input="${input:+$input }$line"; done
  [ -n "${input// /}" ] || { printf 'nothing to do\n'; exit 0; }
  exec claude "/forgerdr:worktree $input"
fi

bin="$(cd "$(dirname "$0")" && pwd)"
printf 'forgerdr review\nPaste the pull request URLs (one per line, space separated also fine), then an empty line:\n'
urls=()
while IFS= read -r line; do
  [ -n "$line" ] || break
  for url in $line; do urls+=("$url"); done
done
[ ${#urls[@]} -gt 0 ] || { printf 'nothing to do\n'; exit 0; }

"$bin/forge-review.sh" "${urls[@]}" || status=$?
printf '\nPress Enter to close.\n'
read -r _ || true
exit "${status:-0}"
