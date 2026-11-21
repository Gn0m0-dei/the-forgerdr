#!/usr/bin/env bash
# The forge floor's flows, from what the hooks see (bin/forge-flow.sh keeps them; references/flows.md).
#   prompt  UserPromptSubmit: a forgerdr command typed in the session launches its cell. A /forgerdr:workitem does only
#           in the session that works the item, one titled for it (FORGE_SESSION_TITLE, holding the item's #id when it
#           has one) and given one item: any other only opens the items' own sessions (skills/workitem, step 0).
# It never fails the prompt, and says nothing to the model: what goes wrong goes to stderr.
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"

# On the prompt's first line; its arguments run to the prompt's end.
readonly COMMAND_PATTERN='^/forgerdr:([a-z-]+)([[:space:]]|$)'

# Whether a /forgerdr:workitem with these arguments works its item in this session: the session is titled for it, by
# its #id (a work item), by its name (an OpenSpec change, one word), or at all (free text); any other only opens tabs.
works_here() {
  local given="$1" title="${FORGE_SESSION_TITLE:-}" item id
  [ -n "$title" ] || return 1
  case "$given" in *"|"*) return 1 ;; esac
  item="$(printf ' %s ' "$given" | sed 's/ --auto / /g; s/^[[:space:]]*//; s/[[:space:]]*$//')"
  id="$(forge_item_id "$item")"
  if [ -n "$id" ]; then
    [[ "$title" =~ \#${id}([^0-9]|$) ]]
  elif [[ "$item" != *[[:space:]]* ]]; then
    # A whole word of the title, not a part of one: "auth" is not "add-auth-sso".
    [[ " ${title//[^[:alnum:]_.-]/ } " == *" $item "* ]]
  fi
}

prompt() {
  local input prompt cwd command given
  forge_in_herdr || return 0
  input="$(cat)"
  prompt="$(printf '%s' "$input" | jq -r '.prompt // empty')"
  cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
  [[ "${prompt%%$'\n'*}" =~ $COMMAND_PATTERN ]] || return 0
  command="${BASH_REMATCH[1]}"
  given="${prompt#"/forgerdr:$command"}"
  given="${given#"${given%%[![:space:]]*}"}"
  [ "$command" != workitem ] || works_here "$given" || return 0
  # The flow keeps the repository it works in, which is the session's folder.
  [ -z "$cwd" ] || cd "$cwd" 2>/dev/null || true
  "$plugin_root/bin/forge-flow.sh" launch "$command" "$given" >&2
}

case "${1:-}" in
  prompt) prompt || printf 'forgerdr flow: the prompt was not recorded\n' >&2 ;;
  *) forge_die "usage: flow.sh prompt" ;;
esac
exit 0
