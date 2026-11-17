#!/usr/bin/env bash
# Adds the forgerdr keys to the herdr app's keys.json, replacing earlier forgerdr keys and keeping every other one: each
# opens a tab running bin/forge-prompt.sh, which asks for pull request URLs (review) or for items (worktree).
# Refuses a key the user already uses for something else. Once edited, the herdr app treats keys.json as the user's
# and stops adding its new default keys to it.
# Usage: forge-setup-keys.sh [--review KEY] [--worktree KEY] [--remove]
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

case "$(uname -s)" in Darwin) modifier=cmd-alt ;; *) modifier=ctrl-alt ;; esac
review_key="$modifier-p"
worktree_key="$modifier-t"
remove=""
while [ $# -gt 0 ]; do
  case "$1" in
    --review) review_key="$2"; shift 2 ;;
    --worktree) worktree_key="$2"; shift 2 ;;
    --remove) remove=1; shift ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) forge_die "unknown argument $1" ;;
  esac
done

keys="$(forge_app_home)/keys.json"
[ -f "$keys" ] || forge_die "no herdr app keys at $keys; open the herdr app once first"
jq -e . "$keys" >/dev/null || forge_die "$keys is not valid JSON; fix it first"

# The plugin root the keys run from: an installed plugin is found at run time, so a plugin update keeps them working;
# a local checkout is used where it is.
root="$(cd "$(dirname "$0")/.." && pwd -P)"
case "$root" in
  "$HOME"/.claude/plugins/cache/*|"$(cd "$HOME" && pwd -P)"/.claude/plugins/cache/*)
    # shellcheck disable=SC2016 # expanded when the key runs
    locate='root="$(ls -td "$HOME"/.claude/plugins/cache/*/forgerdr/*/ 2>/dev/null | head -n 1)"; exec "${root%/}/bin/forge-prompt.sh" "$1"' ;;
  *) locate="exec $(printf '%q' "$root/bin/forge-prompt.sh") \"\$1\"" ;;
esac

# shellcheck disable=SC2016 # a jq filter
filter='
  def forgerdr: type == "object" and ((.args.name? // "") | startswith("forgerdr "));
  def binding($mode): {command: "tab.new", args: {name: ("forgerdr " + $mode), argv: ["sh", "-c", $locate, "sh", $mode]}};
  .global = ((.global // {}) | with_entries(select(.value | forgerdr | not)))
  | if $remove == "1" then . else
      .global[$review] = binding("review") | .global[$worktree] = binding("worktree")
    end'
taken="$(jq -r --arg review "$review_key" --arg worktree "$worktree_key" '
  [.global // {} | to_entries[] | select(.key == $review or .key == $worktree)
   | select((.value | type == "object" and ((.args.name? // "") | startswith("forgerdr "))) | not) | .key] | join(" ")' "$keys")"
[ -n "$remove" ] || [ -z "$taken" ] || forge_die "already bound in $keys: $taken; pick other keys with --review and --worktree"

tmp="$(mktemp "$keys.XXXXXX")"
jq --indent 2 --arg review "$review_key" --arg worktree "$worktree_key" --arg locate "$locate" --arg remove "$remove" \
  "$filter" "$keys" > "$tmp" && mv "$tmp" "$keys"
if [ -n "$remove" ]; then
  printf 'forgerdr keys removed from %s\n' "$keys"
else
  printf 'forgerdr keys in %s: %s review pull requests, %s items in worktrees\n' "$keys" "$review_key" "$worktree_key"
fi
