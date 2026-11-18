#!/usr/bin/env bash
# PreToolUse for Agent: inside the herdr app (a herdr-core terminal), a subagent runs as its own Claude session in a
# terminal of its own instead of inside this session, so it can be watched and talked to: in a tab of agents of this
# session, next to its tab, as many panes as fit laid out as an even grid, then another tab once no agent pane can be
# halved without going under 80 x 15 (place_pane); this session's own pane is never split. One with isolation "worktree" works in its worktree, as a pane of the worktree's space when the
# app opened one. A session with no pane of its own (a sub-agent) starts its agents as sub-agents of its terminal,
# which the app lists under it in its Agents sidebar.
# It gets the agent's definition (instructions, model, tool list) and this session's permission mode, and sends its
# final report back with SendMessage. A record of it is kept (hooks/agent-state.sh keeps it up to date), so a later
# SendMessage to its name gives it another task. The Agent call is then denied with a reason that says so. Outside the
# herdr app, for a fork, for a type it cannot reproduce, or when anything here fails, the subagent runs in this session as
# usual, and inside the app the reason is logged.
# hooks/agent-message.sh also runs it, with FORGE_RESUME_AGENT set, for a SendMessage to an agent whose terminal ended:
# the agent is reopened the same way, resuming its Claude session, and given the message as its task; when it cannot be,
# the SendMessage is denied with the reason.
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"

readonly WRITE_TOOLS="Edit Write NotebookEdit MultiEdit"
readonly READ_ONLY_BUILTINS="Explore Plan"
# On top of an agent's own tool list: SendMessage to report, ToolSearch to load it.
readonly REPORT_TOOLS="SendMessage,ToolSearch"
readonly TYPE_PATTERN='^[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)?$'
readonly TRANSCRIPT_TAIL=400
readonly AGENT_TAB_NAME_MAX=40
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/forgerdr/worktrees"
resume_agent="${FORGE_RESUME_AGENT:-}"

system_file=""
terminal=""
worktree_path=""
new_worktree=""
dispatched=""
cleanup() {
  if [ -z "$dispatched" ]; then
    [ -z "$system_file" ] || rm -f "$system_file"
  fi
}
trap cleanup EXIT

deny() {
  jq -cn --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
}

# A new agent: no output and exit 0, so the call goes on as an in-process subagent. A reopened one: the SendMessage is
# denied with the reason. Inside the herdr app the reason is logged, and anything this run started is ended again.
in_process() {
  if forge_in_herdr; then
    printf '%s %s: %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "${resume_agent:-in-process}" "${1:-see the conditions in this hook}" >&2
    if [ -n "$terminal" ]; then
      if ! forge_end_terminal "$terminal"; then
        printf 'could not end terminal %s\n' "$terminal" >&2
        # Running it here too would put two agents on the same task.
        deny "The ${type:-dispatched} agent may still be running in herdr terminal $terminal, which could not be ended: ${1:-see the forgerdr dispatch log}. End it (hc kill $terminal) before giving the task to an agent again."
        exit 0
      fi
      [ ! -f "$state_dir/$session.terminals" ] || forge_drop_line "$state_dir/$session.terminals" "$terminal"
    fi
    if [ -n "$new_worktree" ]; then
      jq -cn --arg path "$worktree_path" --arg session "$session" '{session_id:$session,worktree_path:$path}' \
        | "$plugin_root/hooks/worktree.sh" remove || true
    fi
  fi
  [ -z "$resume_agent" ] || deny "$resume_agent's terminal ended and it could not be reopened: ${1:-see the forgerdr dispatch log}. Give the task to a fresh agent with the Agent tool instead."
  exit 0
}

# Opens the agent's pane next to this session, as the herdr TUI laid agents out: the largest of this session's agent
# panes that a split leaves at least FORGE_MIN_COLS x FORGE_MIN_ROWS on both halves is split, so they form an even grid
# (the first agent halves this session's own pane, which is not split again while it has live agent panes); when none
# can be, the agent opens a new tab of agents in this session's space, in the background, which the next ones fill the
# same way. The app sizes the panes of the shown tab only, so a pane in another tab is taken at the size this hook gave
# it, kept in $session.grid ("terminal pane tab cols rows" lines). Run holding the grid's lock. Argument: the agent's
# argv (JSON). Sets placed (its terminal) and where; on failure sets placing and returns 1.
# The size of a whole tab, from this session's own, as "cols rows": a tab of agents opens in the background, where the
# app gives its panes no real size to measure. Panes of the same height sit side by side and add their columns (one
# between them); panes of the same width are stacked and add their rows; the larger of the two is the tab, side by side
# unless stacked is clearly larger, since panes of the same size could be either and windows are wide. Empty when the
# app lists nothing.
tab_area() {
  local tab="$1" terminal size sizes=""
  while IFS= read -r terminal; do
    size="$(forge_terminal_size "$terminal")"
    [ -z "$size" ] || sizes+="$size"$'\n'
  done < <(forge_app ls 2>/dev/null | jq -r --arg tab "$tab" '.. | objects | select(.id? == $tab) | .terminals[]?.terminal' 2>/dev/null)
  [ -n "$sizes" ] || return 0
  printf '%s' "$sizes" | awk '
    { c[NR] = $1; r[NR] = $2 }
    END {
      for (i = 1; i <= NR; i++) {
        wide = -1; tall = -1
        for (j = 1; j <= NR; j++) { if (r[j] == r[i]) wide += c[j] + 1; if (c[j] == c[i]) tall += r[j] + 1 }
        if (wide * r[i] > best) { best = wide * r[i]; out = wide " " r[i] }
        if (c[i] * tall > best * 1.05) { best = c[i] * tall; out = c[i] " " tall }
      }
      print out
    }'
}

place_pane() {
  local argv="$1" grid="$state_dir/$session.grid" area_file="$state_dir/$session.area" status shown focused
  local t p tb c r info size kept="" cands="" slot target tpane ttab tcols trows made new_pane nc nr name holder hpane area
  status="$(forge_app status 2>/dev/null || true)"
  shown="$(printf '%s' "$status" | jq -r '.tab // empty' 2>/dev/null || true)"
  focused="$(printf '%s' "$status" | jq -r '.focused_pane // empty' 2>/dev/null || true)"
  if [ -f "$grid" ]; then
    while IFS=$'\t' read -r t p tb c r; do
      # An agent pane in this session's own tab (an older forgerdr put agents there) is not split either.
      [ "$tb" != "$own_tab" ] || continue
      info="$(forge_hc get "$t" --json 2>/dev/null)" || continue
      [ "$(printf '%s' "$info" | jq -r '.state // empty')" = live ] || continue
      if [ "$tb" = "$shown" ]; then
        size="$(printf '%s' "$info" | jq -r 'select((.cols | type) == "number" and (.rows | type) == "number") | "\(.cols) \(.rows)"')"
        [ -z "$size" ] || { c="${size% *}"; r="${size#* }"; }
      fi
      kept+="$t"$'\t'"$p"$'\t'"$tb"$'\t'"$c"$'\t'"$r"$'\n'
    done < "$grid"
  fi
  # Agents never split this session's own pane: the first opens a tab of agents, the next ones split the agent panes there.
  cands="$kept"
  if [ -z "$cands" ]; then
    size="$(tab_area "$own_tab")"
    [ -n "$size" ] || size="$(forge_terminal_size "$HC_TERMINAL_ID")"
    [ -n "$size" ] || { placing="hc could not tell the size of this session's terminal $HC_TERMINAL_ID"; return 1; }
    # A tab of agents is taken at the size of this session's whole tab.
    printf '%s\n' "$size" > "$area_file"
  fi
  slot="$(printf '%s' "$cands" | awk -F'\t' 'NF == 5 { print $1, $4, $5 }' | forge_pick_split)"
  if [ -n "$slot" ]; then
    target="${slot% *}"
    IFS=$'\t' read -r _ tpane ttab tcols trows < <(printf '%s' "$cands" | awk -F'\t' -v t="$target" '$1 == t')
    made="$(forge_do pane.split --direction "${slot#* }" --pane "$tpane" --argv "$argv")" \
      || { placing="the herdr app could not split pane $tpane"; return 1; }
    # The app gives the new pane the keyboard when it splits the shown tab; the user keeps the pane they were in.
    [ -z "$focused" ] || [ "$ttab" != "$shown" ] || forge_do pane.focus --pane "$focused" >/dev/null 2>&1 || true
    nc="$tcols" nr="$trows"
    if [ "${slot#* }" = right ]; then nc=$(((tcols - FORGE_SPLIT_COLS) / 2)); else nr=$(((trows - FORGE_SPLIT_ROWS) / 2)); fi
    kept="$(printf '%s' "$kept" | awk -F'\t' -v OFS='\t' -v t="$target" -v c="$nc" -v r="$nr" '$1 == t { $4 = c; $5 = r } { print }')"
    [ -z "$kept" ] || kept+=$'\n'
    where="a new pane of this session's tab of agents"
    # A dispatch queued behind this one measures the split once the app has laid it out.
    [ "$ttab" != "$shown" ] || forge_wait_resized "$target" "$tcols $trows" || true
  else
    name="agents · $(printf '%s' "${FORGE_SESSION_TITLE:-$(basename "$cwd")}" | tr -s '[:cntrl:]' ' ' | cut -c1-"$AGENT_TAB_NAME_MAX")"
    # A new tab runs its argv in an interactive shell that outlives it, so the tab opens on a shell that gives its place
    # to the agent's pane: the agent's terminal ends with the agent, as every agent's does.
    made="$(forge_do tab.new ${own_space:+--space "$own_space"} --name "$name" --folder "$workdir" --focus false)" \
      || { placing="the herdr app could not open a tab of agents"; return 1; }
    holder="$(printf '%s' "$made" | jq -r '.terminal // empty')"
    ttab="$(printf '%s' "$made" | jq -r '.tab // empty')"
    hpane="$(forge_pane_of "$holder")"
    [ -n "$hpane" ] && [ -n "$ttab" ] || { [ -z "$holder" ] || forge_end_terminal "$holder" || true; placing="the herdr app gave no pane for its tab of agents"; return 1; }
    made="$(forge_do pane.split --direction right --pane "$hpane" --argv "$argv")" \
      || { forge_end_terminal "$holder" || true; placing="the herdr app could not open the agent's pane in its tab of agents"; return 1; }
    forge_end_terminal "$holder" || printf 'could not end terminal %s, the shell of a new tab of agents\n' "$holder" >&2
    # The app takes the shell's pane away a moment later; a split of the tab before that leaves its panes uneven.
    for _ in $(seq 1 "$FORGE_LAYOUT_TRIES"); do
      [ -n "$(forge_pane_of "$holder")" ] || break
      sleep "$FORGE_WAIT_PAUSE"
    done
    area="$(cat "$area_file" 2>/dev/null || true)"
    [ -n "$area" ] || area="$(forge_terminal_size "$HC_TERMINAL_ID")"
    nc="${area% *}" nr="${area#* }"
    where="a new herdr app tab of agents, \"$name\", next to this session's tab"
  fi
  placed="$(printf '%s' "$made" | jq -r '.terminal // empty')"
  new_pane="$(printf '%s' "$made" | jq -r '.pane // empty')"
  [ -n "$placed" ] || { placing="the herdr app gave no terminal for the agent's pane"; return 1; }
  printf '%s%s\t%s\t%s\t%s\t%s\n' "$kept" "$placed" "$new_pane" "$ttab" "$nc" "$nr" > "$grid"
}

input="$(cat)"
session="$(printf '%s' "$input" | jq -r '.session_id // empty')"
forge_in_herdr || in_process "not inside the herdr app"
mkdir -p "$state_dir"
exec 2>>"$state_dir/dispatch.log"
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
  # Its ended terminal still holds its name until it is removed.
  ended="$(jq -r '.terminal // empty' "$record")"
  [ -z "$ended" ] || forge_hc rm "$ended" >/dev/null 2>&1 || true
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
  agent="$(forge_agent_name agent "$session:$title:$$:$RANDOM" "$title")"
  workdir="$cwd"
fi
record="$agents_dir/$agent.json"

# A long multi-line argument travels badly through a shell, so the agent's instructions go in a file.
if [ -n "${system:-}" ]; then
  system_file="$(mktemp "$state_dir/$session.prompt.XXXXXX")"
  printf '%s\n' "$system" > "$system_file"
  claude_args+=(--append-system-prompt-file "$system_file")
fi

if [ "${isolation:-}" = worktree ]; then
  name="agent-$(printf '%s' "$session:$title:$RANDOM:$$" | cksum | cut -d' ' -f1)"
  worktree_path="$(jq -cn --arg name "$name" --arg cwd "$cwd" --arg session "$session" '{name:$name,cwd:$cwd,session_id:$session}' \
    | "$plugin_root/hooks/worktree.sh" create)" || in_process "the worktree for $type could not be created"
  new_worktree=1
  workdir="$worktree_path"
fi
space=""
tab=""
# An agent without a worktree gets a pane in this session's tab of agents, when this session has a pane (place_pane).
own_tab=""
own_space=""
if [ -z "$worktree_path" ]; then
  own_tab="$(forge_terminal_label herdr.tab)"
  own_space="$(forge_terminal_label herdr.space)"
fi
where="a sub-agent of this session, listed under it in the herdr app's Agents sidebar"
if [ -n "$worktree_path" ]; then
  [ -d "$worktree_path" ] || in_process "its worktree $worktree_path is gone"
  branch="$(git -C "$worktree_path" branch --show-current)"
  [ -z "$new_worktree" ] || note="You work in $worktree_path, a git worktree on branch $branch. Do not commit: leave your changes in the working tree for the session that dispatched you to integrate. "
  # A pane of the worktree's space when the app opened one; a sub-agent working in the worktree otherwise.
  space="$(forge_spaces_of "$worktree_path" | head -n 1)"
  [ -z "$space" ] || tab="$(forge_app ls 2>/dev/null | jq -r --arg id "$space" '[.spaces[]? | select(.id == $id) | .tabs[0].id] | first // empty' 2>/dev/null)" || tab=""
  [ -n "$tab" ] || space=""
  where="$where, working in its worktree $worktree_path (branch $branch)"
  [ -z "$space" ] || where="a pane of the herdr app space of its worktree $worktree_path (branch $branch)"
fi

mkdir -p "$agents_dir"
printf '%s\0' ${claude_args[@]+"${claude_args[@]}"} | jq -Rs --arg name "$agent" --arg type "$type" --arg title "$title" \
  --arg workdir "$workdir" --arg worktree "$worktree_path" --arg note "$note" --arg claude_session "$claude_session" \
  '{name: $name, type: $type, title: $title, state: "working", terminal: "", workdir: $workdir, worktree: $worktree,
    note: $note, claude_session: $claude_session, socket: "", args: (split("\u0000") | map(select(length > 0)))}' > "$record"
message="$(forge_agent_task "$type" "$agent" "$title" "$prompt" "uds:$CLAUDE_CODE_MESSAGING_SOCKET" "$note")"
extra=()
read -r -a extra <<<"${FORGE_CLAUDE_ARGS:-}"
# FORGE_PARENT_TERMINAL ties the agent's golem to this session (hooks/golem-state.sh born labels its terminal).
command=(env "FORGE_SESSION_TITLE=$title" "FORGE_REPORT_TO=uds:$CLAUDE_CODE_MESSAGING_SOCKET" "FORGE_AGENT_RECORD=$record"
  "FORGE_PARENT_TERMINAL=${HC_TERMINAL_ID:-}"
  claude ${extra[@]+"${extra[@]}"} ${claude_args[@]+"${claude_args[@]}"} ${claude_session:+--resume "$claude_session"} "$message")
if [ -n "$own_tab" ]; then
  placed=""
  placing=""
  forge_locked "$state_dir/$session.grid" place_pane "$(forge_login_argv "$workdir" "${command[@]}")" \
    || in_process "${placing:-the pane of the agent could not be placed}"
  terminal="$placed"
else
  launched=0
  terminal="$(forge_launch --name "$agent" --cwd "$workdir" --space "$space" --tab "$tab" -- "${command[@]}")" || launched=$?
  # 2: hc started a terminal but did not say which; it is ended by the agent's name.
  [ "$launched" != 2 ] || { terminal="$agent"; in_process "hc started the $type agent without printing its terminal"; }
  [ "$launched" = 0 ] || in_process "hc could not start a terminal for the $type agent"
fi
# Recorded before the agent comes up, so the sweep finds its terminal even if this hook is cut short.
printf '%s\t%s\n' "$terminal" "$agent" >> "$state_dir/$session.terminals"
# shellcheck disable=SC2016 # a jq filter
forge_json_update "$record" --arg terminal "$terminal" '.terminal = $terminal'
ready=0
forge_claude_ready "$terminal" || ready=$?
[ "$ready" != 1 ] || in_process "the $type agent ended in terminal $terminal before it started"
[ "$ready" = 0 ] || in_process "the $type agent in terminal $terminal reported nothing while it was awaited (claude not found, a bad argument, a slow start)"
dispatched=1

if [ -n "$resume_agent" ]; then
  reason="Not an error: $agent's terminal had ended, so it was reopened as $where (herdr terminal $terminal), resuming its Claude session with its context, and given this message as its task. Its report will arrive as a message that begins with \"$FORGE_REPORT_PREFIX $agent\". Go on with other work, or end your turn to wait for it."
else
  reason="Not an error: this $type agent now runs as its own Claude session, $where (herdr terminal $terminal, agent $agent), not inside this session. Its final report will arrive as a message that begins with \"$FORGE_REPORT_PREFIX $agent\"; the sender's session name differs from the agent name, and that is expected. Do not launch it again. Go on with other work, or end your turn to wait for the report. The user can watch and talk to it in the herdr app. To give it another task later (the next fix pass of its task, a second look at its own findings), SendMessage to \"$agent\" with a summary that names the task: it gets the message in its terminal, or is reopened with its context if its terminal ended."
fi
deny "$reason"
