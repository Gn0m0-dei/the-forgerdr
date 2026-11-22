#!/usr/bin/env bash
# Interactive tab the forgerdr keys of the herdr app open (bin/forge-setup-keys.sh). review: asks for pull request URLs,
# runs forge-review.sh and closes. worktree: asks for items and hands them to /forgerdr:worktree in a claude session,
# which reads the spec mode. Given nothing, it closes. Given the URLs, review asks for nothing: the Start work dialog of
# the herdr app's forgerdr layout opens it so. security: asks for nothing, launches the security session of a folder
# parked behind its view (forge-security.sh launch, reporting to nobody) and closes, unless launch failed or its claude
# did not come up; Start work opens it too.
# Usage: forge-prompt.sh review|worktree
#        forge-prompt.sh review [--mod NAME] <pr-url>...   (--mod: the copy of the forgerdr mod the review views run in)
#        forge-prompt.sh security [--mod NAME] [--cwd PATH] [--item ID]
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

mode="${1:-}"
case "$mode" in review|worktree|security) ;; *) printf 'usage: forge-prompt.sh review|worktree|security\n' >&2; exit 1 ;; esac
shift

# The herdr app keeps a shell in the tab once this script ends; ending its terminal closes the tab.
close_tab() {
  ! forge_in_herdr || forge_hc kill "$HC_TERMINAL_ID" >/dev/null 2>&1 || true
  exit "${1:-0}"
}

# A tab that has something to say stays until Enter.
close_on_enter() {
  printf '\nPress Enter to close this tab.\n'
  read -r _ || true
  close_tab "$1"
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
# The tab goes once the security session is open and its claude came up; otherwise it stays to say why.
if [ "$mode" = security ]; then
  status=0
  launched="$("$bin/forge-security.sh" launch "$@")" || status=$?
  printf '%s\n' "$launched"
  if [ "$status" -eq 0 ] && jq -e '.agent_started == true' <<<"$launched" >/dev/null 2>&1; then close_tab; fi
  close_on_enter "$status"
fi

mod_args=()
if [ "${1:-}" = --mod ]; then
  mod_args=(--mod "${2:-}")
  shift 2
fi
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
"$bin/forge-review.sh" ${mod_args[@]+"${mod_args[@]}"} "${urls[@]}" || status=$?
# Given the URLs, the tab goes once the reviews are open; one that failed stays to say why.
if [ $# -gt 0 ] && [ "$status" -eq 0 ]; then close_tab; fi
close_on_enter "$status"
