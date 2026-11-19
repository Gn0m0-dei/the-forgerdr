#!/usr/bin/env bash
# Interactive tab the forgerdr keys of the herdr app open (bin/forge-setup-keys.sh). review: asks for pull request URLs,
# runs forge-review.sh and closes. worktree: asks for items and hands them to /forgerdr:worktree in a claude session,
# which reads the spec mode. Given nothing, it closes. Given the URLs, review asks for nothing: the Start work dialog of
# the herdr app's forgerdr layout opens it so.
# Usage: forge-prompt.sh review|worktree
#        forge-prompt.sh review <pr-url>...
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

mode="${1:-}"
case "$mode" in review|worktree) ;; *) printf 'usage: forge-prompt.sh review|worktree\n' >&2; exit 1 ;; esac
shift

# The herdr app keeps a shell in the tab once this script ends; ending its terminal closes the tab.
close_tab() {
  ! forge_in_herdr || forge_hc kill "$HC_TERMINAL_ID" >/dev/null 2>&1 || true
  exit "${1:-0}"
}

if [ "$mode" = worktree ]; then
  printf 'forgerdr worktree\nItems separated by | (work item URLs, OpenSpec changes or text, as the spec mode says), then an empty line:\n'
  # Lines are read up to the first empty one and joined: a line break never splits an item, and none of them is left
  # in the terminal for claude to submit.
  input=""
  while IFS= read -r line && [ -n "$line" ]; do input="${input:+$input }$line"; done
  [ -n "${input// /}" ] || { printf 'nothing to do\n'; close_tab; }
  exec claude "/forgerdr:worktree $input"
fi

bin="$(cd "$(dirname "$0")" && pwd)"
urls=("$@")
if [ ${#urls[@]} -eq 0 ]; then
  printf 'forgerdr review\nPaste the pull request URLs (one per line, space separated also fine), then an empty line:\n'
  while IFS= read -r line; do
    [ -n "$line" ] || break
    for url in $line; do urls+=("$url"); done
  done
fi
[ ${#urls[@]} -gt 0 ] || { printf 'nothing to do\n'; close_tab; }

status=0
"$bin/forge-review.sh" "${urls[@]}" || status=$?
# Given the URLs, the tab goes once the reviews are open; one that failed stays to say why.
if [ $# -gt 0 ] && [ "$status" -eq 0 ]; then close_tab; fi
printf '\nPress Enter to close this tab.\n'
read -r _ || true
close_tab "$status"
