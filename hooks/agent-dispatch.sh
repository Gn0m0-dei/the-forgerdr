#!/usr/bin/env bash
# PreToolUse for Agent: inside herdr, a subagent runs as its own Claude session in a herdr pane instead of inside this
# session, so it can be watched and talked to: one with isolation "worktree" in its herdr worktree's workspace, any
# other in a new pane of the current tab (the first to the right of this session, the next ones stacked in that column).
# It gets the agent's definition (instructions, model, tool list) and this session's permission mode, and sends its
# final report back with SendMessage. The Agent call is then denied with a reason that says so. Outside herdr, for a
# fork, for a type it cannot reproduce, or when anything here fails, the subagent runs in this session as usual, and
# inside herdr the reason is logged.
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=herdr/bin/forge-lib.sh
. "$plugin_root/herdr/bin/forge-lib.sh"

readonly WRITE_TOOLS="Edit Write NotebookEdit MultiEdit"
readonly READ_ONLY_BUILTINS="Explore Plan"
# On top of an agent's own tool list: SendMessage to report, ToolSearch to load it.
readonly REPORT_TOOLS="SendMessage,ToolSearch"
readonly TYPE_PATTERN='^[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)?$'
# Dispatches queue on a lock; this many tries of LOCK_PAUSE seconds is two minutes, inside the hook's timeout.
readonly LOCK_TRIES=600
readonly LOCK_PAUSE=0.2
readonly TRANSCRIPT_TAIL=400
readonly PANE_RATIO=0.5
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/forgerdr/worktrees"

lock=""
system_file=""
pane=""
worktree_path=""
dispatched=""
cleanup() {
  if [ -z "$dispatched" ]; then
    [ -z "$system_file" ] || rm -f "$system_file"
  fi
  [ -z "$lock" ] || rmdir "$lock" 2>/dev/null || true
}
trap cleanup EXIT

# No output and exit 0: the call goes on as an in-process subagent. Inside herdr the reason is logged, and anything this
# dispatch opened is closed again.
in_process() {
  if [ "${HERDR_ENV:-}" = 1 ]; then
    printf '%s in-process: %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "${1:-see the conditions in this hook}" >&2
    if [ -n "$pane" ]; then
      forge_herdr pane close "$pane" >/dev/null || printf 'could not close pane %s\n' "$pane" >&2
      [ ! -f "$state_dir/$session.panes" ] || forge_drop_line "$state_dir/$session.panes" "$pane"
    fi
    if [ -n "$worktree_path" ]; then
      jq -cn --arg path "$worktree_path" --arg session "$session" '{session_id:$session,worktree_path:$path}' \
        | "$plugin_root/hooks/worktree.sh" remove || true
    fi
  fi
  exit 0
}

input="$(cat)"
session="$(printf '%s' "$input" | jq -r '.session_id // empty')"
[ "${HERDR_ENV:-}" = 1 ] || in_process "not inside herdr"
mkdir -p "$state_dir"
exec 2>>"$state_dir/dispatch.log"
[ -n "${HERDR_PANE_ID:-}" ] || in_process "no HERDR_PANE_ID"
[ -n "${CLAUDE_CODE_MESSAGING_SOCKET:-}" ] || in_process "no CLAUDE_CODE_MESSAGING_SOCKET: this session cannot receive a report"
field() { printf '%s' "$input" | jq -r --arg key "$1" '.tool_input[$key] // empty'; }
type="$(field subagent_type)"
type="${type:-general-purpose}"
prompt="$(field prompt)"
description="$(field description)"
model="$(field model)"
effort="$(field effort)"
isolation="$(field isolation)"
permission_mode="$(printf '%s' "$input" | jq -r '.permission_mode // empty')"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty')"
cwd="${cwd:-$PWD}"
[ -n "$prompt" ] && [ -n "$session" ] || in_process "no prompt or no session"
[ "$type" != fork ] || in_process "a fork inherits this session's context"
[[ "$type" =~ $TYPE_PATTERN ]] || in_process "unexpected agent type: $type"

claude_args=()
system=""
disallowed=()
case " general-purpose claude $READ_ONLY_BUILTINS " in
  *" $type "*)
    case " $READ_ONLY_BUILTINS " in
      *" $type "*)
        system="You are a read-only $type agent: search, read and report; never change a file."
        read -r -a disallowed <<<"$WRITE_TOOLS" ;;
    esac ;;
  *)
    definition="$(forge_agent_definition "$type" "$cwd")" || in_process "looking up the definition of $type failed"
    [ -n "$definition" ] || in_process "$type has no definition this hook can reproduce"
    system="$(forge_frontmatter_body "$definition")"
    tools="$(forge_frontmatter_list "$definition" tools)"
    agent_model="$(forge_frontmatter_field "$definition" model)"
    [ "$agent_model" != inherit ] || agent_model=""
    model="${model:-$agent_model}"
    # The agent's tool list is kept as it is, plus what reporting needs; MCP servers only when the list names them.
    if [ -n "$tools" ]; then
      claude_args+=(--tools "$tools,$REPORT_TOOLS")
      case ",$tools," in *",mcp__"*) ;; *) claude_args+=(--strict-mcp-config) ;; esac
    fi ;;
esac
# A subagent runs on the model of the session that starts it unless told otherwise; so does this one.
if [ -z "$model" ] && [ -f "$transcript" ]; then
  model="$(tail -n "$TRANSCRIPT_TAIL" "$transcript" \
    | jq -r 'select(.type == "assistant") | .message.model // empty | select(startswith("<") | not)' 2>/dev/null \
    | tail -n 1)" || model=""
fi
[ -z "$model" ] || claude_args+=(--model "$model")
[ -z "$effort" ] || claude_args+=(--effort "$effort")
case "$permission_mode" in ""|default|manual) ;; *) claude_args+=(--permission-mode "$permission_mode") ;; esac
[ ${#disallowed[@]} -eq 0 ] || claude_args+=(--disallowedTools "$(IFS=,; printf '%s' "${disallowed[*]}")")

title="${description:-$type}"
# Parallel calls arrive together; one at a time keeps the pane layout predictable.
for _ in $(seq 1 "$LOCK_TRIES"); do
  if mkdir "$state_dir/$session.lock" 2>/dev/null; then lock="$state_dir/$session.lock"; break; fi
  sleep "$LOCK_PAUSE"
done
[ -n "$lock" ] || in_process "other dispatches of this session held the lock too long"

# herdr cannot hand a multi-line argument to every shell, so the agent's instructions travel in a file.
if [ -n "$system" ]; then
  system_file="$(mktemp "$state_dir/$session.prompt.XXXXXX")"
  printf '%s\n' "$system" > "$system_file"
  claude_args+=(--append-system-prompt-file "$system_file")
fi

worktree_note=""
if [ "$isolation" = worktree ]; then
  name="agent-$(printf '%s' "$session:$title:$RANDOM:$$" | cksum | cut -d' ' -f1)"
  worktree_path="$(jq -cn --arg name "$name" --arg cwd "$cwd" --arg session "$session" '{name:$name,cwd:$cwd,session_id:$session}' \
    | "$plugin_root/hooks/worktree.sh" create)" || in_process "the worktree for $type could not be created"
  workspace="$(forge_workspace_of_path "$(forge_main_checkout "$worktree_path")" "$worktree_path")" \
    || in_process "herdr could not list the worktrees of $worktree_path"
  [ -n "$workspace" ] || in_process "no herdr workspace for $worktree_path"
  base_pane="$(forge_root_pane "$workspace")" || in_process "no root pane in herdr workspace $workspace"
  direction=right
  workdir="$worktree_path"
  branch="$(git -C "$worktree_path" branch --show-current)"
  where="its herdr worktree $worktree_path (branch $branch, workspace $workspace)"
  worktree_note="You work in $worktree_path, a git worktree on branch $branch. Do not commit: leave your changes in the working tree for the session that dispatched you to integrate. "
else
  # The tallest agent pane this session already has in its tab is split, so the column stays even.
  tallest=""
  if [ -f "$state_dir/$session.panes" ]; then
    tallest="$(forge_herdr pane layout --pane "$HERDR_PANE_ID" \
      | jq -r --rawfile mine "$state_dir/$session.panes" '
          ($mine | split("\n") | map(split("\t")[0])) as $ids
          | [.result.layout.panes[] | select(.pane_id as $id | $ids | index($id))]
          | max_by(.rect.height) | .pane_id // empty')" || in_process "herdr could not read the pane layout"
  fi
  if [ -n "$tallest" ]; then
    base_pane="$tallest"
    direction=down
  else
    base_pane="$HERDR_PANE_ID"
    direction=right
  fi
  workdir="$cwd"
  where="a new herdr pane next to this session"
fi

pane="$(forge_herdr pane split "$base_pane" --direction "$direction" --ratio "$PANE_RATIO" --cwd "$workdir" \
  --env "FORGE_SESSION_TITLE=$title" --env "FORGE_REPORT_TO=uds:$CLAUDE_CODE_MESSAGING_SOCKET" --no-focus \
  | jq -r '.result.pane.pane_id // empty')" || in_process "herdr could not split a pane for $type"
[ -n "$pane" ] || in_process "herdr gave no pane id for $type"
forge_herdr pane rename "$pane" "$title" >/dev/null || printf 'could not rename pane %s\n' "$pane" >&2
agent="$(forge_agent_name agent "$session:$title:$pane")"
# Recorded before the agent starts, so the sweep finds the pane even if this hook is cut short.
[ -n "$worktree_path" ] || printf '%s\t%s\n' "$pane" "$agent" >> "$state_dir/$session.panes"
message="Task from the Claude session that dispatched you ($type agent $agent, \"$title\"):

$prompt

---
You are running in your own herdr pane. ${worktree_note}When you finish, even after waiting for agents of your own, send your complete final report with SendMessage to \"uds:$CLAUDE_CODE_MESSAGING_SOCKET\", beginning with the line \"Report from $agent ($title)\". That session sees nothing else of your work: a reply typed in this pane reaches nobody. Ask it the same way if you need a decision."
forge_start_claude "$agent" "$pane" "$message" ${claude_args[@]+"${claude_args[@]}"} \
  || in_process "the $type agent did not start in pane $pane"
dispatched=1

reason="Not an error: this $type agent now runs as its own Claude session in $where (herdr pane $pane, agent $agent), not inside this session. Its final report will arrive as a message that begins with \"Report from $agent\"; the sender's session name differs from the herdr agent name, and that is expected. Do not launch it again. Go on with other work, or end your turn to wait for the report. The user can watch and talk to it in its pane."
jq -cn --arg reason "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
