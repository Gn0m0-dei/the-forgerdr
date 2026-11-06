#!/usr/bin/env bash
# PreToolUse for Agent: inside herdr, a subagent runs as its own Claude session in a herdr pane instead of inside this
# session, so it can be watched and talked to: one with isolation "worktree" in its herdr worktree's workspace, any
# other in a new pane of the current tab (the first to the right of this session, the next ones stacked below). It
# gets the agent's definition (instructions, model, no write tools when the agent has none) and sends its final report
# back with SendMessage. The Agent call is then denied with a reason that says so. Outside herdr, for a fork, for a
# built-in type it cannot reproduce, or when anything here fails, the subagent runs in this session as usual.
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=herdr/bin/forge-lib.sh
. "$plugin_root/herdr/bin/forge-lib.sh"

readonly WRITE_TOOLS="Edit Write NotebookEdit MultiEdit"
readonly READ_ONLY_BUILTINS="Explore Plan"
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/forgerdr/worktrees"

# No output and exit 0: the call goes on as an in-process subagent. Inside herdr the reason is logged.
in_process() {
  if [ "${HERDR_ENV:-}" = 1 ]; then
    mkdir -p "$state_dir"
    printf '%s in-process: %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "${1:-see the conditions in this hook}" >> "$state_dir/dispatch.log"
  fi
  exit 0
}

input="$(cat)"
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
session="$(printf '%s' "$input" | jq -r '.session_id // empty')"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty')"
cwd="${cwd:-$PWD}"
[ -n "$prompt" ] && [ -n "$session" ] && [ "$type" != fork ] || in_process "no prompt or session, or a fork"

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
    definition="$(forge_agent_definition "$type" "$cwd")"
    [ -n "$definition" ] || in_process "$type has no definition this hook can reproduce"
    system="$(forge_frontmatter_body "$definition")"
    tools="$(forge_frontmatter_field "$definition" tools)"
    agent_model="$(forge_frontmatter_field "$definition" model)"
    [ "$agent_model" != inherit ] || agent_model=""
    model="${model:-$agent_model}"
    if [ -n "$tools" ]; then
      for tool in $WRITE_TOOLS; do
        case ",${tools// /}," in *",$tool,"*) ;; *) disallowed+=("$tool") ;; esac
      done
    fi ;;
esac
# A subagent runs on the model of the session that starts it unless told otherwise; so does this one.
if [ -z "$model" ] && [ -f "$transcript" ]; then
  model="$(tail -n 400 "$transcript" | jq -r 'select(.type == "assistant") | .message.model // empty' 2>/dev/null | tail -n 1)"
fi
claude_args=()
[ -z "$model" ] || claude_args+=(--model "$model")
[ -z "$effort" ] || claude_args+=(--effort "$effort")
[ ${#disallowed[@]} -eq 0 ] || claude_args+=(--disallowedTools "$(IFS=,; printf '%s' "${disallowed[*]}")")
# herdr cannot hand a multi-line argument to every shell, so the agent's instructions travel in a file.
if [ -n "$system" ]; then
  system_file="$(mktemp "$state_dir/$session.prompt.XXXXXX")"
  printf '%s\n' "$system" > "$system_file"
  claude_args+=(--append-system-prompt-file "$system_file")
fi

title="${description:-$type}"
# Parallel calls arrive together; one at a time keeps the pane layout predictable.
lock="$state_dir/$session.lock"
for _ in $(seq 1 100); do mkdir "$lock" 2>/dev/null && break; sleep 0.2; done
trap 'rmdir "$lock" 2>/dev/null || true' EXIT

worktree_note=""
if [ "$isolation" = worktree ]; then
  name="agent-$(printf '%s' "$session:$title:$RANDOM:$$" | cksum | cut -d' ' -f1)"
  path="$(jq -cn --arg name "$name" --arg cwd "$cwd" --arg session "$session" '{name:$name,cwd:$cwd,session_id:$session}' \
    | "$plugin_root/hooks/worktree.sh" create)" || in_process "the worktree for $type could not be created"
  workspace="$(forge_workspace_of_path "$(forge_main_checkout "$path")" "$path")"
  [ -n "$workspace" ] || in_process "no herdr workspace for $path"
  base_pane="$(forge_root_pane "$workspace")"
  direction=right
  workdir="$path"
  branch="$(git -C "$path" branch --show-current)"
  where="its herdr worktree $path (branch $branch, workspace $workspace)"
  worktree_note="You work in $path, a git worktree on branch $branch. Do not commit: leave your changes in the working tree for the session that dispatched you to integrate. "
else
  # The tallest agent pane this session already has in its tab is split, so the column stays even.
  tallest=""
  if [ -f "$state_dir/$session.panes" ]; then
    tallest="$(forge_herdr pane layout --pane "$HERDR_PANE_ID" 2>/dev/null \
      | jq -r --rawfile mine "$state_dir/$session.panes" '
          ($mine | split("\n") | map(split("\t")[0])) as $ids
          | [.result.layout.panes[] | select(.pane_id as $id | $ids | index($id))]
          | max_by(.rect.height) | .pane_id // empty')"
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

pane="$(forge_herdr pane split "$base_pane" --direction "$direction" --ratio 0.5 --cwd "$workdir" \
  --env "FORGE_SESSION_TITLE=$title" --env "FORGE_REPORT_TO=uds:$CLAUDE_CODE_MESSAGING_SOCKET" --no-focus | jq -r '.result.pane.pane_id // empty')" || in_process "herdr could not split a pane for $type"
[ -n "$pane" ] || in_process "herdr gave no pane id for $type"
forge_herdr pane rename "$pane" "$title" >/dev/null 2>&1 || true
agent="$(forge_agent_name agent "$session:$title:$pane")"
message="$prompt

---
You are a $type agent ($agent, \"$title\") dispatched by another Claude session, running in your own herdr pane. ${worktree_note}When you finish, even after waiting for agents of your own, send your complete final report with SendMessage to \"uds:$CLAUDE_CODE_MESSAGING_SOCKET\", beginning with the line \"Report from $agent ($title)\". That session sees nothing else of your work: a reply typed in this pane reaches nobody. Ask it the same way if you need a decision."
if ! forge_start_claude "$agent" "$pane" "$message" ${claude_args[@]+"${claude_args[@]}"}; then
  forge_herdr pane close "$pane" >/dev/null 2>&1 || true
  in_process "the $type agent did not start in pane $pane"
fi
[ "$isolation" = worktree ] || printf '%s\t%s\n' "$pane" "$agent" >> "$state_dir/$session.panes"

reason="Not an error: this $type agent now runs as its own Claude session in $where (herdr pane $pane, agent $agent), not inside this session. Its final report will arrive as a message that begins with \"Report from $agent\"; the sender's session name differs from the herdr agent name, and that is expected. Do not launch it again. Go on with other work, or end your turn to wait for the report. The user can watch and talk to it in its pane."
jq -cn --arg reason "$reason" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
