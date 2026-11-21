#!/usr/bin/env bash
# The review view's pull request (forge_reviews_dir): what a review session knows of the pull request it reviews, in a
# file named for the herdr terminal it runs in. The review skills write what they find and draft from that session, the
# forgerdr mod what the human picks, edits and stamps in the view beside it; both under the file's lock. The formats and
# the questions the view answers: references/reviews.md.
# From the review session (HC_TERMINAL_ID), each given a JSON file, or - for stdin:
#   open <other|own> <file>   the pull request reviewed (another's or the user's own): starts the review afresh, and
#                             labels the terminal forge.review=<kind>, so the inbox sends its questions to the view.
#   findings <file>           what a review of another's pull request found, in the order the skill reports it.
#   threads <file>            the open threads of the user's own pull request, each with what to do about it.
#   drafts <file>             the comments or replies drafted, and when; any stamp goes, since it was for other drafts.
#   results <file>            what publishing did, a line per thread; the terminal's questions are no longer the view's.
#   drafted                   the drafts as the view holds them now, the human's edits included, as one JSON array:
#                             read them before sending drafts again.
#   stamped                   the drafts as the human stamped them, as one JSON array; nothing before a stamp.
# From the mod, for a terminal:
#   show <terminal>           its review, or null.
#   pick <terminal> <ids> [session]
#                             the findings or threads the human picked, a JSON array of their ids, and the Claude
#                             session that asked for them: the view answers only that session's comment gate.
#   edit <terminal> <id> <body>, drop <terminal> <id>
#                             changes a draft's text, takes a draft away; refused once the drafts are stamped.
#   stamp <terminal> <drafts> freezes the drafts, for the skill to publish exactly those: the drafts the view shows (a
#                             JSON array), which must be the ones the file holds, or it refuses: they changed since.
#   list                      every review, as one JSON array.
# A file a week untouched goes; one that is not a review shows as none.
# shellcheck source-path=SCRIPTDIR/..
# shellcheck disable=SC2016 # jq filters, in single quotes
set -euo pipefail

plugin_root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"

reviews="$(forge_reviews_dir)"
readonly KINDS=(other own)
readonly TERMINAL_PATTERN='^[A-Za-z0-9_-]{1,64}$'
readonly WEEK_MS=604800000

# What each part of a review is, as jq checks it: a filter per part that fails, naming what is wrong, or answers the
# part with the fields it leaves out filled.
readonly SHAPES='
  def text: type == "string";
  def maybe_text: . == null or type == "string";
  def line: . == null or (type == "number" and . >= 0 and floor == .);
  def count: . == null or (type == "number" and . >= 0 and floor == .);
  def need($ok; $what): if $ok then . else error($what) end;
  def unique_ids($what): need(([.[].id] | unique | length) == length; "two \($what)s share an id");
  def each_of($what; check): need(type == "array"; "\($what)s are a JSON array") | map(check) | unique_ids($what);
  def pull_request: need(type == "object" and (.url | text) and (.number | type == "number" or type == "string")
      and (.title | text) and (.source | maybe_text) and (.target | maybe_text) and (.author | maybe_text)
      and (.items == null or ((.items | type) == "array" and all(.items[]; text))) and (.files | count)
      and (.additions | count) and (.deletions | count) and (.checks | maybe_text); "not a pull request")
    | {url, number: (.number | tostring), title, source: (.source // ""), target: (.target // ""),
       author: (.author // ""), items: (.items // []), files: (.files // 0), additions: (.additions // 0),
       deletions: (.deletions // 0), checks: (.checks // "")};
  def context: . == null or (type == "object" and (.start | count) and (.lines | type) == "array"
    and all(.lines[]; text) and (.mark | count));
  def finding: need(type == "object" and (.id | text) and .id != ""; "a finding has no id")
    | need((.severity | IN($severities[])) and (.path | text) and (.line | line) and (.title | text)
      and (.rule | text) and (.happens | text) and (.change | text) and (.refactor | maybe_text)
      and (.context | context) and (.group | maybe_text)
      and (.discarded == null or (.discarded | type) == "boolean"); "finding \(.id) is not one")
    | {id, severity, path, line, title, rule, happens, change, refactor: (.refactor // ""), context,
       group: (.group // ""), discarded: (.discarded // false)};
  def thread: need(type == "object" and (.id | text) and .id != ""; "a thread has no id")
    | need((.author | text) and (.path | text) and (.line | line) and (.request | text)
      and (.proposal | IN($proposals[])) and (.detail | text) and (.commit | maybe_text) and (.subject | maybe_text)
      and (.tests | maybe_text); "thread \(.id) is not one")
    | {id, author, path, line, request, proposal, detail, commit: (.commit // ""), subject: (.subject // ""),
       tests: (.tests // "")};
  def location: type == "object" and (.path | text) and (.line | line);
  def draft: need(type == "object" and (.id | text) and .id != ""; "a draft has no id")
    | need((.locations | type) == "array" and (.locations | length) > 0 and all(.locations[]; location)
      and (.body | text) and (.suggestion | maybe_text) and (.resolve == null or (.resolve | type) == "boolean");
      "draft \(.id) is not one")
    | {id, locations: [.locations[] | {path, line}], body, suggestion: (.suggestion // ""), resolve: (.resolve // false)};
  def result: need(type == "object" and (.id | text) and .id != ""; "a result has no id")
    | need((.path | text) and (.line | line) and (.status | IN($statuses[])) and (.url | maybe_text)
      and (.reason | maybe_text) and (.action | maybe_text) and (.commit | maybe_text); "result \(.id) is not one")
    | {id, path, line, status, url: (.url // ""), reason: (.reason // ""), action: (.action // ""),
       commit: (.commit // "")};
  def results_of: need(type == "array"; "results are a JSON array") | map(result)
    | need(([.[] | [.id, .path, .line]] | unique | length) == length; "two results are for one thread");
  def review: type == "object" and .v == 1 and .terminal == $terminal and (.kind | IN("other", "own"))
    and (.updated | type) == "number" and (.pr | type) == "object" and (.findings | type) == "array"
    and (.threads | type) == "array" and (.picked | type) == "array" and (.drafts | type) == "array"
    and (.results | type) == "array" and (.stamped == null or (.stamped | type) == "object")
    and (.drafted == null or (.drafted | type) == "number") and (.session == null or (.session | type) == "string");'

# The sets the shapes check against, as jq arguments.
readonly SETS=(--argjson severities '["blocker","should","nit","question","info"]'
  --argjson proposals '["fix","reply","ask"]'
  --argjson statuses '["published","duplicate","failed","resolved","open"]')

# The review file of a terminal, checked.
file_of() {
  [[ "$1" =~ $TERMINAL_PATTERN ]] || forge_die "not a herdr terminal id: $1"
  printf '%s/%s.json\n' "$reviews" "$1"
}

# This session's terminal: the skill's commands work for the session they run in, and only inside herdr.
own_terminal() {
  forge_in_herdr || forge_die "not inside the herdr app: the review view is the herdr app's"
  printf '%s\n' "$HC_TERMINAL_ID"
}

# A JSON file the skill gives, or - for stdin, whole; it must be JSON.
given() {
  local path="${1:-}" json
  [ -n "$path" ] || forge_die "no JSON file given"
  if [ "$path" = - ]; then json="$(cat)"; else [ -r "$path" ] || forge_die "no such file: $path"; json="$(cat "$path")"; fi
  jq -se 'length == 1' >/dev/null 2>&1 <<<"$json" || forge_die "not one JSON value: $path"
  printf '%s\n' "$json"
}

# Applies a jq filter to a terminal's review (null when it has none) and keeps the result (forge_json_rewrite).
change() {
  local file="$1" filter="$2"
  shift 2
  forge_json_rewrite "$file" "$SHAPES $filter" "${SETS[@]}" "$@"
}

# The review a filter changes must exist: the skill opens it first.
readonly OPENED='if . == null then error("no review is open in this terminal: forge-pr.sh open first") else . end'

open() {
  local kind="${1:-}" terminal file json
  [[ " ${KINDS[*]} " == *" $kind "* ]] || forge_die "usage: forge-pr.sh open <other|own> <file>"
  terminal="$(own_terminal)"
  file="$(file_of "$terminal")"
  json="$(given "${2:-}")"
  change "$file" '{v: 1, terminal: $terminal, kind: $kind, pr: ($pr | pull_request), findings: [], threads: [],
      picked: [], session: "", drafts: [], drafted: 0, stamped: null, results: []}' --arg kind "$kind" \
    --argjson pr "$json"
  forge_hc label "$terminal" "forge.review=$kind" >/dev/null 2>&1 || true
}

# Sets one part of this session's review from the skill's file, which goes to jq as a file: a long review would not
# fit in an argument.
set_part() {
  local part="$1" check="$2" file json tmp status=0
  file="$(file_of "$(own_terminal)")"
  json="$(given "${3:-}")"
  tmp="$(mktemp)"
  printf '%s\n' "$json" > "$tmp"
  change "$file" "$OPENED | $5 | .$part = (\$given[0] | $check) $4" --slurpfile given "$tmp" \
    || status=$?
  rm -f "$tmp"
  return "$status"
}

# Findings belong to a review of another's pull request, threads to one of the user's own.
readonly OF_OTHER='if .kind != "other" then error("findings are for a review of another'"'"'s pull request: open other") else . end'
readonly OF_OWN='if .kind != "own" then error("threads are for a review of your own pull request: open own") else . end'

drafted() {
  local file
  file="$(file_of "$(own_terminal)")"
  [ -f "$file" ] || { printf '[]\n'; return 0; }
  jq -c '.drafts // []' "$file"
}

stamped() {
  local file
  file="$(file_of "$(own_terminal)")"
  [ -f "$file" ] || return 0
  jq -c 'if (.stamped | type) == "object" then .stamped.drafts else empty end' "$file" 2>/dev/null || true
}

# A review as the mod reads it, from its file: nothing when it is a week untouched, an error when it is not one.
readonly ENTRY_FILTER='if review | not then error("not a review") elif $now - .updated >= $week then empty else . end'

# A terminal's review, checked, on stdout; nothing when it has none or it went.
entry() {
  local file="$1" now entry
  [ -f "$file" ] && [ ! -L "$file" ] || return 0
  now=$(($(date +%s) * 1000))
  if ! entry="$(jq -c --arg terminal "$(basename "$file" .json)" --argjson now "$now" --argjson week "$WEEK_MS" \
    "$SHAPES $ENTRY_FILTER" "$file" 2>/dev/null)"; then
    printf 'forgerdr: skipped %s: not a review\n' "$file" >&2
    return 0
  fi
  if [ -z "$entry" ]; then rm -f "$file"; else printf '%s\n' "$entry"; fi
}

show() {
  local file shown
  file="$(file_of "${1:-}")"
  shown="$(entry "$file" 2>/dev/null)"
  printf '%s\n' "${shown:-null}"
}

list() {
  local file terminal
  [ -d "$reviews" ] || { mkdir -p "$reviews" && chmod 700 "$reviews"; }
  for file in "$reviews"/*.json; do
    terminal="$(basename "$file" .json)"
    [[ "$terminal" =~ $TERMINAL_PATTERN ]] || continue
    entry "$file"
  done | jq -cs 'sort_by(.updated)'
}

pick() {
  local file
  file="$(file_of "${1:-}")"
  jq -e 'type == "array" and all(.[]; type == "string")' <<<"${2:-}" >/dev/null 2>&1 \
    || forge_die "usage: forge-pr.sh pick <terminal> <JSON array of ids>"
  change "$file" "$OPENED | .picked = \$ids | if \$session == \"\" then . else .session = \$session end" \
    --argjson ids "$2" --arg session "${3:-}"
}

# Changes the drafts, unless they are stamped; the draft named must be there.
readonly UNSTAMPED='if .stamped != null then error("the drafts are stamped: they are published as they are") else . end
  | if any(.drafts[]; .id == $id) then . else error("no draft \($id)") end'

edit() {
  local file
  [ $# -eq 3 ] || forge_die "usage: forge-pr.sh edit <terminal> <draft id> <body>"
  file="$(file_of "$1")"
  change "$file" "$OPENED | $UNSTAMPED | .drafts |= map(if .id == \$id then .body = \$body else . end)" \
    --arg id "$2" --arg body "$3"
}

drop() {
  local file
  [ $# -eq 2 ] || forge_die "usage: forge-pr.sh drop <terminal> <draft id>"
  file="$(file_of "$1")"
  change "$file" "$OPENED | $UNSTAMPED | .drafts |= map(select(.id != \$id))" --arg id "$2"
}

stamp() {
  local file
  file="$(file_of "${1:-}")"
  jq -e 'type == "array"' <<<"${2:-}" >/dev/null 2>&1 \
    || forge_die "usage: forge-pr.sh stamp <terminal> <the drafts the view shows, a JSON array>"
  change "$file" "$OPENED | if (.drafts | length) == 0 then error(\"nothing to stamp: no drafts\") else . end
    | if .stamped == null and .drafts != (\$seen | map(draft)) then error(\"the drafts changed since you looked\")
      else . end
    | .stamped = (.stamped // {at: \$now, drafts: .drafts})" --argjson seen "$2"
  jq -c '.stamped' "$file"
}

# What publishing did; the review is over, so the terminal's questions go back to the inbox.
results() {
  set_part results results_of "${1:-}" '' .
  forge_hc label "$(own_terminal)" forge.review= >/dev/null 2>&1 || true
}

command="${1:-}"
[ $# -eq 0 ] || shift
case "$command" in
  open) open "$@" ;;
  findings) set_part findings 'each_of("finding"; finding)' "${1:-}" '| .picked = [] | .drafts = [] | .drafted = 0 | .stamped = null | .results = []' "$OF_OTHER" ;;
  threads) set_part threads 'each_of("thread"; thread)' "${1:-}" '' "$OF_OWN" ;;
  drafts) set_part drafts 'each_of("draft"; draft)' "${1:-}" '| .stamped = null | .drafted = $now' . ;;
  results) results "${1:-}" ;;
  drafted) drafted ;;
  stamped) stamped ;;
  show) show "${1:-}" ;;
  pick) pick "$@" ;;
  edit) edit "$@" ;;
  drop) drop "$@" ;;
  stamp) stamp "$@" ;;
  list) list ;;
  *) forge_die "usage: forge-pr.sh open | findings | threads | drafts | results | drafted | stamped | show | pick | edit | drop | stamp | list" ;;
esac
