#!/usr/bin/env bash
# PreToolUse for Agent: inside herdr, a subagent runs as its own Claude session in a herdr pane instead of inside this
# session, so it can be watched and talked to: one with isolation "worktree" in its herdr worktree's workspace, any
# other in a new pane of the current tab, laid out as an even grid next to this session, or in a new tab of agents once
# no agent pane can be halved without going under 80 x 15.
# It gets the agent's definition (instructions, model, tool list) and this session's permission mode, and sends its
# final report back with SendMessage. Its pane is labelled with its state and task (hooks/agent-state.sh keeps the label
# up to date) and a record of it is kept, so a later SendMessage to its herdr name gives it another task. The Agent call
# is then denied with a reason that says so. Outside herdr, for a fork, for a type it cannot reproduce, or when anything
# here fails, the subagent runs in this session as usual, and inside herdr the reason is logged.
# hooks/agent-message.sh also runs it, with FORGE_RESUME_AGENT set, for a SendMessage to an agent whose pane was closed:
# the agent is reopened the same way, resuming its Claude session, and given the message as its task; when it cannot be,
# the SendMessage is denied with the reason.
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
# No agent pane is made smaller than this; a terminal row is about as tall as two columns are wide.
readonly MIN_COLS=80
readonly MIN_ROWS=15
readonly CELL_ASPECT=2
readonly AGENT_TAB_LABEL="agents ·"
readonly TAB_LABEL_MAX=40
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/forgerdr/worktrees"
resume_agent="${FORGE_RESUME_AGENT:-}"

lock=""
system_file=""
pane=""
agent_tab=""
worktree_path=""
new_worktree=""
dispatched=""
cleanup() {
  if [ -z "$dispatched" ]; then
    [ -z "$system_file" ] || rm -f "$system_file"
  fi
  [ -z "$lock" ] || rmdir "$lock" 2>/dev/null || true
}
trap cleanup EXIT

deny() {
  jq -cn --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
}

# A new agent: no output and exit 0, so the call goes on as an in-process subagent. A reopened one: the SendMessage is
# denied with the reason. Inside herdr the reason is logged, and anything this run opened is closed again.
in_process() {
  if [ "${HERDR_ENV:-}" = 1 ]; then
    printf '%s %s: %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "${resume_agent:-in-process}" "${1:-see the conditions in this hook}" >&2
    if [ -n "$agent_tab" ]; then
      forge_herdr tab close "$agent_tab" >/dev/null || printf 'could not close tab %s\n' "$agent_tab" >&2
    elif [ -n "$pane" ]; then
      forge_herdr pane close "$pane" >/dev/null || printf 'could not close pane %s\n' "$pane" >&2
    fi
    [ -z "$pane" ] || [ ! -f "$state_dir/$session.panes" ] || forge_drop_line "$state_dir/$session.panes" "$pane"
    if [ -n "$new_worktree" ]; then
      jq -cn --arg path "$worktree_path" --arg session "$session" '{session_id:$session,worktree_path:$path}' \
        | "$plugin_root/hooks/worktree.sh" remove || true
    fi
  fi
  [ -z "$resume_agent" ] || deny "$resume_agent's pane is closed and it could not be reopened: ${1:-see the forgerdr dispatch log}. Give the task to a fresh agent with the Agent tool instead."
  exit 0
}

input="$(cat)"
session="$(printf '%s' "$input" | jq -r '.session_id // empty')"
[ "${HERDR_ENV:-}" = 1 ] || in_process "not inside herdr"
mkdir -p "$state_dir"
exec 2>>"$state_dir/dispatch.log"
[ -n "${HERDR_PANE_ID:-}" ] && [ -n "${HERDR_WORKSPACE_ID:-}" ] || in_process "no HERDR_PANE_ID or HERDR_WORKSPACE_ID"
[ -n "${CLAUDE_CODE_MESSAGING_SOCKET:-}" ] || in_process "no CLAUDE_CODE_MESSAGING_SOCKET: this session cannot receive a report"
field() { printf '%s' "$input" | jq -r --arg key "$1" '.tool_input[$key] // empty'; }
permission_mode="$(printf '%s' "$input" | jq -r '.permission_mode // empty')"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty')"
cwd="${cwd:-$PWD}"
[ -n "$session" ] || in_process "no session"
agents_dir="$state_dir/$session.agents"

claude_args=()
claude_session=""
note=""
if [ -n "$resume_agent" ]; then
  record="$agents_dir/$resume_agent.json"
  [ -f "$record" ] || in_process "this session has no record of it"
  type="$(jq -r .type "$record")"
  prompt="$(field message)"
  title="$(printf '%s' "$input" | jq -r '.tool_input.summary // empty | gsub("[[:cntrl:]]+"; " ")')"
  title="${title:-$(jq -r .title "$record")}"
  workdir="$(jq -r .workdir "$record")"
  worktree_path="$(jq -r '.worktree // empty' "$record")"
  note="$(jq -r '.note // empty' "$record")"
  claude_session="$(jq -r '.claude_session // empty' "$record")"
  while IFS= read -r -d '' arg; do claude_args+=("$arg"); done < <(jq -j '.args[] | . + "\u0000"' "$record")
  [ -n "$claude_session" ] || in_process "no Claude session of it was recorded"
  [ -d "$workdir" ] || in_process "its directory $workdir is gone"
  agent="$resume_agent"
else
  type="$(field subagent_type)"
  type="${type:-general-purpose}"
  prompt="$(field prompt)"
  title="$(field description)"
  title="${title:-$type}"
  model="$(field model)"
  effort="$(field effort)"
  isolation="$(field isolation)"
  [ -n "$prompt" ] || in_process "no prompt"
  [ "$type" != fork ] || in_process "a fork inherits this session's context"
  [[ "$type" =~ $TYPE_PATTERN ]] || in_process "unexpected agent type: $type"

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
  agent="$(forge_agent_name agent "$session:$title:$$:$RANDOM")"
  workdir="$cwd"
fi
record="$agents_dir/$agent.json"

# Parallel calls arrive together; one at a time keeps the pane layout predictable.
for _ in $(seq 1 "$LOCK_TRIES"); do
  if mkdir "$state_dir/$session.lock" 2>/dev/null; then lock="$state_dir/$session.lock"; break; fi
  sleep "$LOCK_PAUSE"
done
[ -n "$lock" ] || in_process "other dispatches of this session held the lock too long"

# herdr cannot hand a multi-line argument to every shell, so the agent's instructions travel in a file.
if [ -n "${system:-}" ]; then
  system_file="$(mktemp "$state_dir/$session.prompt.XXXXXX")"
  printf '%s\n' "$system" > "$system_file"
  claude_args+=(--append-system-prompt-file "$system_file")
fi

slot=""
if [ "${isolation:-}" = worktree ]; then
  name="agent-$(printf '%s' "$session:$title:$RANDOM:$$" | cksum | cut -d' ' -f1)"
  worktree_path="$(jq -cn --arg name "$name" --arg cwd "$cwd" --arg session "$session" '{name:$name,cwd:$cwd,session_id:$session}' \
    | "$plugin_root/hooks/worktree.sh" create)" || in_process "the worktree for $type could not be created"
  new_worktree=1
  workdir="$worktree_path"
fi
if [ -n "$worktree_path" ]; then
  [ -d "$worktree_path" ] || in_process "its worktree $worktree_path is gone"
  branch="$(git -C "$worktree_path" branch --show-current)"
  [ -z "$new_worktree" ] || note="You work in $worktree_path, a git worktree on branch $branch. Do not commit: leave your changes in the working tree for the session that dispatched you to integrate. "
  workspace="$(forge_workspace_of_path "$(forge_main_checkout "$worktree_path")" "$worktree_path")" \
    || in_process "herdr could not list the worktrees of $worktree_path"
  [ -n "$workspace" ] || in_process "no herdr workspace for $worktree_path"
  base_pane="$(forge_root_pane "$workspace")" || in_process "no root pane in herdr workspace $workspace"
  direction=right
  where="its herdr worktree $worktree_path (branch $branch, workspace $workspace)"
else
  # The largest agent pane of this session that can still be halved along its longer side is split, so the agents
  # form an even grid; the first one halves this session's own pane, which is never split again. When none can be,
  # the agent opens a new tab of agents.
  sizes=""
  if [ -f "$state_dir/$session.panes" ]; then
    while IFS=$'\t' read -r known _; do
      sizes="$sizes$(forge_pane_size "$known")"$'\n'
    done < "$state_dir/$session.panes"
  fi
  if [ -z "${sizes//[[:space:]]/}" ]; then
    sizes="$(forge_pane_size "$HERDR_PANE_ID")"
    [ -n "$sizes" ] || in_process "herdr could not read the size of $HERDR_PANE_ID"
  fi
  # forge: the lock is per session; a nested agent splitting its own pane while this session splits the same one can
  # both read the old size and go under the minimum once. A lock per tab is the upgrade if that shows up.
  slot="$(printf '%s' "$sizes" | forge_pick_split "$MIN_COLS" "$MIN_ROWS" "$CELL_ASPECT")"
  base_pane="${slot% *}"
  direction="${slot#* }"
  where="a new herdr pane in this session's agent grid"
  [ -n "$slot" ] || where="a new herdr tab of agents"
fi

mkdir -p "$agents_dir"
agent_env=(--env "FORGE_SESSION_TITLE=$title" --env "FORGE_REPORT_TO=uds:$CLAUDE_CODE_MESSAGING_SOCKET"
  --env "FORGE_AGENT_RECORD=$record")
if [ -z "$worktree_path" ] && [ -z "$slot" ]; then
  tab_label="$(printf '%s' "${FORGE_SESSION_TITLE:-$(basename "$cwd")}" | tr -s '[:cntrl:]' ' ' | cut -c1-"$TAB_LABEL_MAX")"
  created="$(forge_herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "$workdir" \
    --label "$AGENT_TAB_LABEL $tab_label" "${agent_env[@]}" --no-focus)" \
    || in_process "herdr could not open a tab of agents"
  agent_tab="$(printf '%s' "$created" | jq -r '.result.tab.tab_id // empty')" || in_process "herdr gave no tab for $type"
  pane="$(printf '%s' "$created" | jq -r '.result.root_pane.pane_id // empty')" || in_process "herdr gave no tab for $type"
  [ -n "$agent_tab" ] || in_process "herdr gave no tab for $type"
else
  pane="$(forge_herdr pane split "$base_pane" --direction "$direction" --ratio "$PANE_RATIO" --cwd "$workdir" \
    "${agent_env[@]}" --no-focus | jq -r '.result.pane.pane_id // empty')" || in_process "herdr could not split a pane for $type"
fi
[ -n "$pane" ] || in_process "herdr gave no pane id for $type"
forge_herdr pane rename "$pane" "$(forge_agent_label working "$title")" >/dev/null || printf 'could not rename pane %s\n' "$pane" >&2
# Recorded before the agent starts, so the sweep finds the pane even if this hook is cut short, and the agent's own
# hooks find the record.
[ -n "$worktree_path" ] || printf '%s\t%s\n' "$pane" "$agent" >> "$state_dir/$session.panes"
printf '%s\0' ${claude_args[@]+"${claude_args[@]}"} | jq -Rs --arg name "$agent" --arg type "$type" --arg title "$title" \
  --arg pane "$pane" --arg workdir "$workdir" --arg worktree "$worktree_path" --arg note "$note" --arg claude_session "$claude_session" \
  '{name: $name, type: $type, title: $title, state: "working", pane: $pane, workdir: $workdir, worktree: $worktree,
    note: $note, claude_session: $claude_session, socket: "", args: (split("\u0000") | map(select(length > 0)))}' > "$record"
message="$(forge_agent_task "$type" "$agent" "$title" "$prompt" "uds:$CLAUDE_CODE_MESSAGING_SOCKET" "$note")"
forge_start_claude "$agent" "$pane" "$message" ${claude_args[@]+"${claude_args[@]}"} ${claude_session:+--resume "$claude_session"} \
  || in_process "the $type agent did not start in pane $pane"
dispatched=1

if [ -n "$resume_agent" ]; then
  reason="Not an error: $agent's pane was closed, so it was reopened in $where (herdr pane $pane), resuming its Claude session with its context, and given this message as its task. Its report will arrive as a message that begins with \"$FORGE_REPORT_PREFIX $agent\". Go on with other work, or end your turn to wait for it."
else
  reason="Not an error: this $type agent now runs as its own Claude session in $where (herdr pane $pane, agent $agent), not inside this session. Its final report will arrive as a message that begins with \"$FORGE_REPORT_PREFIX $agent\"; the sender's session name differs from the herdr agent name, and that is expected. Do not launch it again. Go on with other work, or end your turn to wait for the report. The user can watch and talk to it in its pane. To give it another task later (the next fix pass of its task, a second look at its own findings), SendMessage to \"$agent\" with a summary that names the task: it gets the message in its pane, or is reopened with its context if its pane was closed."
fi
deny "$reason"
