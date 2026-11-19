#!/usr/bin/env bash
# The approval inbox's side of Claude Code's permission dialogs, for a session in a herdr terminal (HC_TERMINAL_ID): a
# tool's permission, a question (AskUserQuestion; one headed "Gate ..." is one of forgerdr's gates) or a plan
# (ExitPlanMode) waits in the forgerdr mod's inbox as well as in its pane, and whichever answers first wins.
#   ask     PermissionRequest: puts the request in the inbox (forge_inbox_dir) and waits for the answer the mod writes
#           (bin/forge-inbox.sh answer). An answer the request takes becomes Claude Code's decision; any other is thrown
#           away, since anything running as the user can write there. The decision comes from the request as Claude
#           Code sent it, kept by the hook: its file only shows it, and rewriting the file changes nothing it runs.
#           Answered in the pane, the request is settled (below), or Claude Code ends this hook (Esc, No, the timeout),
#           which takes the request away: either way it leaves with no decision and the pane's answer stands.
#   settle  PostToolUse, PostToolUseFailure: the tool ran, so the pane answered: the oldest request of this session for
#           the same call goes, and its waiting hook leaves with no decision. Claude Code reports a call with what the
#           pane added to it (a question's answers) or without its input (a plan), so the same call is the same tool
#           with the same values in the fields both sides carry.
# Outside herdr it does nothing: the pane's dialog is the only one.
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"

forge_in_herdr || exit 0
inbox="$(forge_inbox_dir)"
readonly PAUSE="${FORGE_INBOX_PAUSE:-0.5}"

# The request the mod reads, from what Claude Code sends: what kind of answer it takes, and where it comes from.
# shellcheck disable=SC2016 # a jq filter
readonly REQUEST_FILTER='{
  id: $id,
  kind: (if .tool_name == "ExitPlanMode" then "plan"
    elif .tool_name == "AskUserQuestion" then
      (if any(.tool_input.questions[]?; (.header // "") | test("^Gate ")) then "gate" else "question" end)
    else "permission" end),
  terminal: $terminal,
  session_id: (.session_id // ""),
  agent_type: (.agent_type // ""),
  cwd: (.cwd // ""),
  tool_name,
  tool_input: (.tool_input // {}),
  created: (now * 1000 | floor)
}'

# Claude Code's decision from an answer the request takes, and only from one: an allow with nothing else for a
# permission, with an answer to each of its questions for a question or a gate, with the mode picked for a plan; a deny
# with an optional reason, which Claude is told comes from the user. Its input is the request, then the answer file,
# which must hold one JSON document. Fails on any other answer.
# shellcheck disable=SC2016 # a jq filter
readonly DECISION_FILTER='
  .[0] as $r
  | if length != 2 then error("one answer") else .[1] end
  | . as $a
  | def only($fields): ($a | type) == "object" and (($a | keys) - $fields | length) == 0;
    def denied: {
      permission: "The user denied this from the forgerdr inbox",
      plan: "The user wants changes to the plan, from the forgerdr inbox",
      question: "The user declined to answer from the forgerdr inbox",
      gate: "The user declined to answer from the forgerdr inbox"
    }[$r.kind];
    def asked: [$r.tool_input.questions[]?.question] | sort;
  if only(["behavior", "message"]) and $a.behavior == "deny" and (($a.message // "") | type) == "string" then
    {behavior: "deny", message: (if ($a.message // "") == "" then denied + "." else denied + ": " + $a.message[:2000] end)}
  elif $r.kind == "permission" and only(["behavior"]) and $a.behavior == "allow" then
    {behavior: "allow"}
  elif ($r.kind == "question" or $r.kind == "gate") and only(["behavior", "answers"]) and $a.behavior == "allow"
    and ($a.answers | type) == "object" and ($a.answers | keys) == asked and all($a.answers[]; type == "string") then
    {behavior: "allow", updatedInput: ($r.tool_input + {answers: $a.answers})}
  elif $r.kind == "plan" and only(["behavior", "mode"]) and $a.behavior == "allow" and ($a.mode == "auto" or $a.mode == "default") then
    {behavior: "allow", updatedInput: $r.tool_input, updatedPermissions: [{type: "setMode", mode: $a.mode, destination: "session"}]}
  else error("not an answer this request takes") end
  | {hookSpecificOutput: {hookEventName: "PermissionRequest", decision: .}}'

# The request and its answer are the script's, not the function's: the trap that takes them away runs at its exit.
request=""
answer=""

ask() {
  local input id kept decision
  input="$(cat)"
  mkdir -p "$inbox"
  chmod 700 "$inbox"
  id="$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
  request="$inbox/$id.json"
  answer="$inbox/$id.answer.json"
  trap 'rm -f "$request" "$request.tmp" "$answer"' EXIT
  trap 'exit 0' TERM INT HUP
  kept="$(printf '%s' "$input" | jq -c --arg id "$id" --arg terminal "$HC_TERMINAL_ID" "$REQUEST_FILTER")"
  printf '%s\n' "$kept" > "$request.tmp"
  mv "$request.tmp" "$request"
  while [ -f "$request" ]; do
    if [ -L "$answer" ]; then
      rm -f "$answer"
    elif [ -f "$answer" ]; then
      if decision="$({ printf '%s\n' "$kept"; cat "$answer"; } | jq -cs "$DECISION_FILTER" 2>/dev/null)"; then
        printf '%s\n' "$decision"
        return 0
      fi
      rm -f "$answer"
    fi
    sleep "$PAUSE"
  done
}

# The request a call settles, from the call and then the inbox's requests: this session's oldest for the same tool,
# agreeing on every field both inputs carry.
# shellcheck disable=SC2016 # a jq filter
readonly SETTLED_FILTER='
  def agree($one; $other): all($one | keys[] | select(. as $key | $other | has($key)); . as $key | $one[$key] == $other[$key]);
  .[0] as $call
  | .[1:]
  | map(select(.session_id == $call.session_id and .tool_name == $call.tool_name
    and agree(.tool_input; $call.tool_input // {})))
  | min_by(.created) | .id // empty'

# The inbox's requests, a line each: only a file that is a request named for its own id; a broken one is skipped.
requests() {
  local file
  for file in "$inbox"/????????????????.json; do
    [ -f "$file" ] && [ ! -L "$file" ] || continue
    jq -c --arg id "$(basename "$file" .json)" \
      'select(type == "object" and .id == $id and (.tool_input | type) == "object")' "$file" 2>/dev/null || true
  done
}

settle() {
  local call oldest
  call="$(jq -c '{session_id, tool_name, tool_input}')"
  # A request is <id>.json, its id 16 hex digits; its answer, <id>.answer.json, does not match.
  compgen -G "$inbox/????????????????.json" >/dev/null || return 0
  oldest="$({ printf '%s\n' "$call"; requests; } | jq -rs "$SETTLED_FILTER" 2>/dev/null)" || return 0
  [[ "$oldest" =~ ^[0-9a-f]{16}$ ]] || return 0
  rm -f "$inbox/$oldest.json"
}

main() {
  case "${1:-}" in
    ask) ask ;;
    settle) settle ;;
    *) forge_die "usage: inbox.sh ask|settle" ;;
  esac
}

# One line, read whole before it runs: a hook waits a long while, and bash reads a script as it goes, so a file replaced
# under a waiting hook (a plugin reinstalled) must not be read on from where it was.
main "$@"; exit
