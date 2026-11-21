#!/usr/bin/env bash
# The approval inbox's side of Claude Code's permission dialogs, and of a turn that ends asking, for a session in a
# herdr terminal (HC_TERMINAL_ID): a tool's permission, a question (AskUserQuestion; one headed "Gate ..." is one of
# forgerdr's gates) or a plan (ExitPlanMode) waits in the forgerdr mod's inbox as well as in its pane, and whichever
# answers first wins; a question typed in the chat instead reaches no inbox, so the turn goes back to ask it.
#   ask     PermissionRequest: puts the request in the inbox (forge_inbox_dir) and waits for the answer the mod writes
#           (bin/forge-inbox.sh answer). An answer the request takes becomes Claude Code's decision; any other is thrown
#           away, since anything running as the user can write there. The decision comes from the request as Claude
#           Code sent it, kept by the hook: its file only shows it, and rewriting the file changes nothing it runs.
#           Answered in the pane, the request is settled (below), Claude Code ends this hook (Esc, No, the timeout),
#           which takes the request away, or the session's next stop sweeps it (Chat about this, which does neither):
#           in every case it leaves with no decision and the pane's answer stands.
#   settle  PostToolUse, PostToolUseFailure: the tool ran, so the pane answered: the oldest request of this session for
#           the same call goes, and its waiting hook leaves with no decision. Claude Code reports a call with what the
#           pane added to it (a question's answers) or without its input (a plan), so the same call is the same tool
#           with the same values in the fields both sides carry.
#   stop    Stop: first the session's main thread waits on no dialog, so what it still asks goes, and the waiting hook
#           with it. Then a turn that ends on a question typed in the chat, which the inbox never sees, goes back once
#           to ask it with AskUserQuestion. Only the final message is read, never the transcript. An agent forgerdr
#           dispatched (FORGE_REPORT_TO) asks the session that dispatched it instead: hooks/agent-state.sh.
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
  agent_id: (.agent_id // ""),
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

# What a turn that ends asking is told, sent back: Claude Code shows it to Claude as the reason it goes on.
readonly ASK_IT_REASON="Your turn ended on a question typed in the chat. In the herdr app only a question asked with \
AskUserQuestion reaches the user's inbox; one typed here leaves this session waiting on them unseen. Ask it now with \
AskUserQuestion: the likely answers as options, your recommendation first (the user can still type an answer of their \
own, or discuss it in this pane). If nothing in your message needs the user's answer, end your turn again."

# Stop's decision from what Claude Code sends, which must be one JSON document: a turn whose final message ends asking
# goes back, unless a stop hook already sent it back. A message ends asking when one of its lines, out of fenced code
# blocks and with its inline code and links taken out, ends in a question mark, spaces and closing marks after it aside.
# A fence opens on three or more backticks (with no backtick after them: that is inline code) or tildes, and closes on
# a line of only as many of the same or more; a link ends before the punctuation after it, as a GitHub autolink does.
# A CR left by a CRLF counts as a space. Only a line's end can ask, and jq's gsub takes time quadratic in its matches on
# one line, so the removals see a line's last 2000 characters, room for a long signed link after a question, from the
# end of the inline code span the cut falls in: from the left, a run of backticks opens a span and the next closes it.
# forge: a question with over 2000 characters of inline code and links after it passes. Upgrade: peel them off the end.
# forge: a trailing question mark is the signal; a request typed without one passes. Upgrade: a prompt-based Stop hook.
# shellcheck disable=SC2016 # a jq filter
readonly ASKING_FILTER='
  def asks: "?\uff1f";
  def closes: "*_)\\]\"\u0027\u00bb\u201d\u2019\uff09\u300d\u300f\u00a0";
  def unfenced: foreach .[] as $line ({fence: null};
    (($line | capture("^\\s*(?<mark>`{3,}(?=[^`]*$)|~{3,})(?<rest>.*)")) // null) as $f
    | if .fence == null then (if $f == null then .line = $line else .fence = $f.mark | .line = null end)
      elif $f != null and $f.mark[:1] == .fence[:1] and ($f.mark | length) >= (.fence | length)
        and ($f.rest | test("^\\s*$")) then .fence = null | .line = null
      else .line = null end;
    select(.line != null) | .line);
  def runs: split("`") | if length < 2 then 0 else [.[1:-1][] | select(. != "")] | length + 1 end;
  def tail: if length <= 2000 then . else
      (.[-2000:] | capture("^(?<ticks>`*)(?<rest>.*)")) as $cut
      | if (.[:-2000] + $cut.ticks | runs) % 2 == 1 then $cut.rest | sub("^[^`]*`+"; "") else $cut.rest end
    end;
  select(length == 1) | .[0]
  | select(type == "object" and .stop_hook_active != true and (.last_assistant_message | type) == "string")
  | select(.last_assistant_message | split("\n")
    | any(unfenced | tail | gsub("`+[^`]*`+"; "") | gsub("https?://\\S*[^\\s!.,:;~" + asks + closes + "]"; "");
      test("[" + asks + "][\\s" + closes + "]*$")))
  | {decision: "block", reason: $reason}'

# The requests a stop sweeps, of the inbox's requests: this session's in this terminal, asked by its main thread (a
# subagent's carry its agent_id, and one may still be asking).
# shellcheck disable=SC2016 # a jq filter
readonly SWEPT_FILTER='select(.session_id == $session and .terminal == $terminal and (.agent_id // "") == "") | .id'

# Stop's input must be one JSON object naming its session; anything else sweeps nothing.
sweep() {
  local session swept id
  compgen -G "$inbox/????????????????.json" >/dev/null || return 0
  session="$(jq -rs 'select(length == 1) | .[0] | select(type == "object") | .session_id | select(type == "string")' \
    <<<"$1" 2>/dev/null)" || return 0
  [ -n "$session" ] || return 0
  swept="$(requests | jq -r --arg session "$session" --arg terminal "$HC_TERMINAL_ID" "$SWEPT_FILTER")" || return 0
  while IFS= read -r id; do
    [[ "$id" =~ ^[0-9a-f]{16}$ ]] || continue
    rm -f "$inbox/$id.json"
  done <<<"$swept"
}

stop() {
  local input decision
  input="$(cat)"
  sweep "$input"
  [ -z "${FORGE_REPORT_TO:-}" ] || return 0
  decision="$(printf '%s' "$input" | jq -cs --arg reason "$ASK_IT_REASON" "$ASKING_FILTER")" || return 0
  [ -z "$decision" ] || printf '%s\n' "$decision"
}

main() {
  case "${1:-}" in
    ask) ask ;;
    settle) settle ;;
    stop) stop ;;
    *) forge_die "usage: inbox.sh ask|settle|stop" ;;
  esac
}

# One line, read whole before it runs: a hook waits a long while, and bash reads a script as it goes, so a file replaced
# under a waiting hook (a plugin reinstalled) must not be read on from where it was.
main "$@"; exit
