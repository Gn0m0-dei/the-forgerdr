#!/usr/bin/env bash
# Review rounds of an agent's work (forge_rounds_dir): what the worktree of the Claude session in a herdr terminal holds,
# snapshotted when its session starts (its base) and whenever the human asks to review it (a round), as git commits
# pinned under refs/forgerdr/rounds/<terminal>/ that no branch reaches. The user's index, HEAD and stash are never
# touched (forge_snapshot). The state, a file per terminal, keeps the base, the rounds and the human's comments for the
# forgerdr mod, which shows a round's diff and sends the comments back to the agent.
#   base                          SessionStart (reads the hook's JSON): pins the base of a new session, dropping the
#                                 terminal's earlier rounds; a session resumed keeps them. Outside herdr or git, nothing.
#                                 Any terminal's rounds a week untouched go then too: a session ended, or its terminal
#                                 closed, leaves them for a resume until then.
#   snap <terminal> [folder]      a round of what the worktree holds now, from the last round's head (the base for the
#                                 first); prints it. Exits 3, saying so, when nothing changed since, printing the last
#                                 round when there is one. With no base yet
#                                 (a session started before forgerdr kept them), the folder's HEAD is the base.
#   diff <terminal> <n> [all]     round n's diff, from the round before it, or from the base with all; a long one is cut
#                                 at FORGE_ROUND_DIFF_MAX lines (20000), its last line saying so.
#   comment <terminal> <json>     a comment on a round's line: {round, path, side: old|new, line, text, body}; prints
#                                 its id.
#   resolve <terminal> <id>, uncomment <terminal> <id>
#                                 marks a comment resolved, takes it away.
#   viewed <terminal> <n> <path> <on|off>
#                                 marks a file of round n as viewed, or not.
#   request <terminal> <n>        round n's changes were requested: its open comments, and older ones, went to the agent.
#   approve <terminal> <n>        round n is approved: its head is the new base.
#   show <terminal>               its state, or null.
# shellcheck source-path=SCRIPTDIR/..
# shellcheck disable=SC2016 # jq filters, in single quotes
set -euo pipefail

plugin_root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"

rounds="$(forge_rounds_dir)"
readonly TERMINAL_PATTERN='^[A-Za-z0-9_-]{1,64}$'
readonly REF_ROOT=refs/forgerdr/rounds
readonly DIFF_MAX="${FORGE_ROUND_DIFF_MAX:-20000}"
readonly NOTHING_NEW=3
readonly WEEK_DAYS=7

# The state file of a terminal, checked.
file_of() {
  [[ "$1" =~ $TERMINAL_PATTERN ]] || forge_die "not a herdr terminal id: $1"
  printf '%s/%s.json\n' "$rounds" "$1"
}

# A terminal's state, or nothing.
state_of() {
  [ -f "$1" ] || return 0
  jq -c 'select(type == "object" and .v == 1 and (.repo | type) == "string" and (.rounds | type) == "array")' "$1" \
    2>/dev/null || true
}

# Drops a terminal's round refs from a repository.
drop_refs() {
  local repo="$1" terminal="$2" ref
  git -C "$repo" for-each-ref --format='%(refname)' "$REF_ROOT/$terminal/" | while IFS= read -r ref; do
    git -C "$repo" update-ref -d "$ref"
  done
}

# Drops a terminal's rounds: its refs in the repository its state names, then its state.
drop_rounds() {
  local file="$1" repo
  repo="$(state_of "$file" | jq -r '.repo // empty')"
  [ -z "$repo" ] || drop_refs "$repo" "$(basename "$file" .json)" 2>/dev/null || true
  rm -f "$file"
}

# The rounds of terminals a week untouched. Not when a session ends: a resume of it keeps its rounds and comments.
sweep() {
  local file
  [ -d "$rounds" ] || return 0
  find "$rounds" -maxdepth 1 -name '*.json' -type f -mtime "+$WEEK_DAYS" | while IFS= read -r file; do
    if [[ "$(basename "$file" .json)" =~ $TERMINAL_PATTERN ]]; then drop_rounds "$file"; fi
  done
}

# A fresh state for a terminal's session, pinning its base.
start_state() {
  local file="$1" repo="$2" base="$3" session="$4" terminal
  terminal="$(basename "$file" .json)"
  git -C "$repo" update-ref "$REF_ROOT/$terminal/base" "$base"
  forge_json_rewrite "$file" \
    '{v: 1, terminal: $terminal, session_id: $session, repo: $repo, base: $base, rounds: [], comments: []}' \
    --arg session "$session" --arg repo "$repo" --arg base "$base"
}

base() {
  local input session cwd repo file old_repo
  forge_in_herdr || return 0
  file="$(file_of "$HC_TERMINAL_ID")"
  input="$(cat)"
  sweep
  session="$(jq -r '.session_id // ""' <<<"$input" 2>/dev/null || true)"
  cwd="$(jq -r '.cwd // ""' <<<"$input" 2>/dev/null || true)"
  repo="$(git -C "${cwd:-$PWD}" rev-parse --show-toplevel 2>/dev/null)" || return 0
  if [ -n "$session" ] && [ "$(state_of "$file" | jq -r '"\(.session_id) \(.repo)"')" = "$session $repo" ]; then
    return 0
  fi
  old_repo="$(state_of "$file" | jq -r '.repo // empty')"
  [ -z "$old_repo" ] || [ "$old_repo" = "$repo" ] || drop_refs "$old_repo" "$HC_TERMINAL_ID" 2>/dev/null || true
  drop_refs "$repo" "$HC_TERMINAL_ID"
  start_state "$file" "$repo" "$(forge_snapshot "$repo")" "$session"
}

# The commit a folder's HEAD is, or an empty one when it has no commit yet.
head_of() {
  git -C "$1" rev-parse --verify -q 'HEAD^{commit}' && return 0
  GIT_AUTHOR_NAME=forgerdr GIT_AUTHOR_EMAIL=forgerdr@invalid GIT_COMMITTER_NAME=forgerdr \
    GIT_COMMITTER_EMAIL=forgerdr@invalid git -C "$1" commit-tree "$(git -C "$1" hash-object -t tree /dev/null)" -m empty
}

# Runs under the terminal's snap lock: two snaps at once never take the same number.
snap_locked() {
  local file="$1" terminal="$2" folder="$3" state repo from head last
  state="$(state_of "$file")"
  if [ -z "$state" ]; then
    [ -n "$folder" ] || { printf 'forgerdr: no base yet for %s: give the folder its agent works in\n' "$terminal" >&2; return 1; }
    repo="$(git -C "$folder" rev-parse --show-toplevel 2>/dev/null)" \
      || { printf 'forgerdr: %s is not in a git repository\n' "$folder" >&2; return 1; }
    start_state "$file" "$repo" "$(head_of "$repo")" "" || return 1
    state="$(state_of "$file")"
  fi
  repo="$(jq -r '.repo' <<<"$state")"
  from="$(jq -r '.rounds[-1].head // .base' <<<"$state")"
  last="$(jq -r '.rounds[-1].n // 0' <<<"$state")"
  head="$(forge_snapshot "$repo")" || return 1
  if [ "$(git -C "$repo" rev-parse "$head^{tree}")" = "$(git -C "$repo" rev-parse "$from^{tree}")" ]; then
    if [ "$last" -eq 0 ]; then
      printf 'no changes since the base\n' >&2
    else
      printf 'no changes since round %s\n' "$last" >&2
      jq -c '.rounds[-1]' <<<"$state"
    fi
    return "$NOTHING_NEW"
  fi
  git -C "$repo" update-ref "$REF_ROOT/$terminal/$((last + 1))" "$head" || return 1
  forge_json_rewrite "$file" \
    '.rounds += [{n: $n, base: .base, from: $from, head: $head, at: $now, status: "open", viewed: []}]' \
    --argjson n "$((last + 1))" --arg from "$from" --arg head "$head" || return 1
  jq -c '.rounds[-1]' "$file"
}

snap() {
  local terminal="${1:-}" file
  file="$(file_of "$terminal")"
  [ -d "$rounds" ] || { mkdir -p "$rounds" && chmod 700 "$rounds"; }
  forge_locked "$file.snap" snap_locked "$file" "$terminal" "${2:-}"
}

diff_of() {
  local file state round from
  file="$(file_of "${1:-}")"
  [[ "${2:-}" =~ ^[0-9]+$ ]] || forge_die "usage: forge-round.sh diff <terminal> <n> [all]"
  state="$(state_of "$file")"
  [ -n "$state" ] || forge_die "no rounds for $1"
  round="$(jq -c --argjson n "$2" '.rounds[] | select(.n == $n)' <<<"$state")"
  [ -n "$round" ] || forge_die "no round $2 for $1"
  from="$(jq -r --arg all "${3:-}" 'if $all == "all" then .base else .from end' <<<"$round")"
  # forge: git's own errors are lost to the pipe once the cut closes it; the refs were checked above.
  { git -C "$(jq -r '.repo' <<<"$state")" -c core.quotePath=false diff --no-color --no-ext-diff --find-renames \
      --src-prefix=a/ --dst-prefix=b/ "$from" "$(jq -r '.head' <<<"$round")" 2>/dev/null || true; } \
    | awk -v max="$DIFF_MAX" 'NR <= max { print; next } { print "\\ forgerdr: cut at " max " lines"; exit }'
}

# Changes a terminal's state, which must be there; the filter gets the jq arguments after it.
readonly HAS_STATE='if . == null or (.rounds | type) != "array" then error("no rounds for \($terminal)") else . end'
readonly DEFS='
  def round_n($n): if any(.rounds[]; .n == $n) then . else error("no round \($n)") end;
  def comment_id($id): if any(.comments[]; .id == $id) then . else error("no comment \($id)") end;'

change() {
  local file filter="$2"
  file="$(file_of "$1")"
  shift 2
  forge_json_rewrite "$file" "$DEFS $HAS_STATE | $filter" "$@"
}

comment() {
  local terminal="${1:-}" json="${2:-}" file
  file="$(file_of "$terminal")"
  jq -e 'type == "object" and (.round | type) == "number" and (.path | type) == "string" and .path != ""
    and (.side | IN("old", "new")) and (.line | type) == "number" and .line >= 1 and (.text | type) == "string"
    and (.body | type) == "string" and (.body | test("\\S"))' <<<"$json" >/dev/null 2>&1 \
    || forge_die "usage: forge-round.sh comment <terminal> {round, path, side: old|new, line, text, body}"
  change "$terminal" \
    'round_n($c.round) | (.comments | map(.id[1:] | tonumber) | max // 0) as $last
      | .comments += [$c | {round, path, side, line, text, body}
        + {id: ("c" + ($last + 1 | tostring)), resolved: false, sent: false}]' \
    --argjson c "$json"
  jq -r '.comments[-1].id' "$file"
}

on_comment() {
  [ -n "$2" ] || forge_die "usage: forge-round.sh resolve|uncomment <terminal> <comment id>"
  change "$1" "comment_id(\$id) | $3" --arg id "$2"
}

viewed() {
  [[ $# -eq 4 && "${2:-}" =~ ^[0-9]+$ && "${4:-}" =~ ^(on|off)$ ]] \
    || forge_die "usage: forge-round.sh viewed <terminal> <n> <path> <on|off>"
  change "$1" 'round_n($n) | .rounds |= map(if .n != $n then .
      elif $on then .viewed = (.viewed + [$path] | unique) else .viewed -= [$path] end)' \
    --argjson n "$2" --arg path "$3" --argjson on "$([ "$4" = on ] && echo true || echo false)"
}

on_round() {
  [[ $# -ge 2 && "${2:-}" =~ ^[0-9]+$ ]] || forge_die "usage: forge-round.sh request|approve <terminal> <n>"
  change "$1" "round_n(\$n) | $3" --argjson n "$2"
}

approve() {
  local file state repo head
  on_round "$1" "${2:-}" '.rounds |= map(if .n == $n then .status = "approved" else . end)
    | .base = (.rounds[] | select(.n == $n) | .head)'
  file="$(file_of "$1")"
  state="$(state_of "$file")"
  repo="$(jq -r '.repo' <<<"$state")"
  head="$(jq -r '.base' <<<"$state")"
  git -C "$repo" update-ref "$REF_ROOT/$1/base" "$head"
}

show() {
  local file shown
  file="$(file_of "${1:-}")"
  shown="$(state_of "$file")"
  printf '%s\n' "${shown:-null}"
}

command="${1:-}"
[ $# -eq 0 ] || shift
case "$command" in
  base) base ;;
  snap) snap "$@" ;;
  diff) diff_of "$@" ;;
  comment) comment "$@" ;;
  resolve) on_comment "${1:-}" "${2:-}" '.comments |= map(if .id == $id then .resolved = true else . end)' ;;
  uncomment) on_comment "${1:-}" "${2:-}" '.comments |= map(select(.id != $id))' ;;
  viewed) viewed "$@" ;;
  request) on_round "${1:-}" "${2:-}" '.rounds |= map(if .n == $n then .status = "changes" else . end)
    | .comments |= map(if .round <= $n and (.resolved | not) then .sent = true else . end)' ;;
  approve) approve "$@" ;;
  show) show "${1:-}" ;;
  *) forge_die "usage: forge-round.sh base | snap | diff | comment | resolve | uncomment | viewed | request | approve | show" ;;
esac
