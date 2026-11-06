#!/usr/bin/env bash
# WorktreeCreate, WorktreeRemove and SessionEnd for Claude Code's own worktrees (EnterWorktree, isolated subagents,
# claude --worktree): herdr worktrees inside herdr, plain git worktrees outside it, always under the main checkout's
# .claude/worktrees/<name> on branch worktree-<name>; when a session ends, the ones it created with no work left go.
# Nothing here removes uncommitted work or a commit: git and herdr remove only clean worktrees, and a branch goes only
# while it still points where it started or is merged.
# Usage: worktree.sh create|remove|sweep  (hook JSON on stdin)
#        worktree.sh sweep-session <session-id> <cwd>  (what sweep runs detached)
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=herdr/bin/forge-lib.sh
. "$plugin_root/herdr/bin/forge-lib.sh"

readonly WORKTREES_DIR=".claude/worktrees"
readonly BRANCH_PREFIX="worktree-"
# Claude Code caps its own fetch for a new worktree at five seconds.
readonly FETCH_SECONDS=5
readonly TAB=$'\t'
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/forgerdr/worktrees"

in_herdr() { [ "${HERDR_ENV:-}" = 1 ]; }

# Runs a command, sending it TERM (which git cleans up after) when it outlasts the given seconds.
capped() {
  perl -e 'my $seconds = shift; my $pid = fork; exec @ARGV unless $pid;
    local $SIG{ALRM} = sub { kill "TERM", $pid }; alarm $seconds; waitpid $pid, 0; exit($? >> 8)' "$@"
}

# One state file per session, one line per worktree it created or reused: path, branch, commit it started at.
record() {
  [ -n "$1" ] || return 0
  mkdir -p "$state_dir"
  grep -qF "$2$TAB" "$state_dir/$1.tsv" 2>/dev/null || printf '%s\t%s\t%s\n' "$2" "$3" "$4" >> "$state_dir/$1.tsv"
}

# "branch<TAB>start" recorded for a path by any session, empty when none.
recorded() {
  local file
  for file in "$state_dir"/*.tsv; do
    [ -f "$file" ] || continue
    path="$1" awk -F'\t' '$1 == ENVIRON["path"] { print $2 "\t" $3; found = 1; exit } END { exit !found }' "$file" \
      && return 0
  done
  return 0
}

listed_by_other_session() {
  local file
  for file in "$state_dir"/*.tsv; do
    [ -f "$file" ] && [ "$file" != "$state_dir/$1.tsv" ] || continue
    path="$2" awk -F'\t' '$1 == ENVIRON["path"] { found = 1 } END { exit !found }' "$file" && return 0
  done
  return 1
}

forget() {
  local file tmp
  for file in "$state_dir"/*.tsv; do
    [ -f "$file" ] || continue
    tmp="$(mktemp "$file.XXXXXX")"
    path="$1" awk -F'\t' '$1 != ENVIRON["path"]' "$file" > "$tmp" && mv "$tmp" "$file"
  done
}

# Uncommitted changes or untracked files in a worktree; fails when git cannot tell.
uncommitted() {
  git -C "$1" status --porcelain
}

# Removes a clean worktree from herdr (its workspace with it) or from git; both refuse a dirty one.
drop_worktree() {
  local root="$1" path="$2" workspace=""
  in_herdr && workspace="$(forge_workspace_of_path "$root" "$path")"
  if [ -n "$workspace" ]; then
    forge_herdr worktree remove --workspace "$workspace" >/dev/null
  else
    git -C "$root" worktree remove "$path"
  fi
}

# Deletes a worktree's own branch while it still points at the commit it started from, or once it is merged;
# otherwise keeps it and says so.
drop_branch() {
  local root="$1" branch="$2" start="$3"
  git -C "$root" show-ref --verify --quiet "refs/heads/$branch" || return 0
  [ -n "$start" ] && git -C "$root" update-ref -d "refs/heads/$branch" "$start" 2>/dev/null && return 0
  git -C "$root" branch -d "$branch" >/dev/null 2>&1 \
    || printf 'forgerdr: kept branch %s, it has commits that are not merged\n' "$branch" >&2
}

create() {
  local input="$1" name cwd session root path branch base base_branch label parent start
  name="$(printf '%s' "$input" | jq -r '.name // empty')"
  cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
  session="$(printf '%s' "$input" | jq -r '.session_id // empty')"
  case "$name" in ''|/*|*..*) forge_die "invalid worktree name: $name" ;; esac
  cwd="${cwd:-$PWD}"
  root="$(forge_main_checkout "$cwd")" || forge_die "not inside a git repository: $cwd"
  [ ! -L "$root/.claude" ] && [ ! -L "$root/$WORKTREES_DIR" ] || forge_die "$root/$WORKTREES_DIR goes through a symlink"
  path="$root/$WORKTREES_DIR/$name"
  branch="$BRANCH_PREFIX$name"
  label="$name"
  parent="$(git -C "$cwd" rev-parse --show-toplevel)"
  [ "$parent" = "$root" ] || label="$(basename "$parent")/$name"
  forge_exclude_local "$root" "$WORKTREES_DIR/"
  git -C "$root" worktree prune

  if [ -d "$path" ] && git -C "$root" worktree list --porcelain | grep -qxF "worktree $path"; then
    if in_herdr && [ -z "$(forge_workspace_of_path "$root" "$path")" ]; then
      forge_herdr worktree open --cwd "$root" --path "$path" --label "$label" --no-focus >/dev/null
    fi
    record "$session" "$path" "$(git -C "$path" branch --show-current)" "$(git -C "$path" rev-parse HEAD)"
    printf '%s\n' "$path"
    return 0
  fi
  [ ! -e "$path" ] || forge_die "$path exists and is not a worktree of $root"

  base_branch="$(forge_base_branch "$root")"
  GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes" \
    capped "$FETCH_SECONDS" git -C "$root" fetch origin "$base_branch" --quiet >/dev/null 2>&1 || true
  base="$(forge_claude_base_ref "$root" "$cwd")"
  if in_herdr; then
    forge_herdr worktree create --cwd "$root" --branch "$branch" --base "$base" --path "$path" --label "$label" --no-focus >/dev/null
  elif git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$root" worktree add --quiet "$path" "$branch" >&2
  else
    git -C "$root" worktree add --quiet --no-track -b "$branch" "$path" "$base" >&2
  fi
  [ -d "$path" ] || forge_die "worktree $path was not created"
  start="$(git -C "$path" rev-parse HEAD)" || forge_die "no commit in $path"
  record "$session" "$path" "$branch" "$start"
  forge_drop_inherited_upstream "$path" "$branch"
  { forge_env_files "$root"; forge_worktree_includes "$root"; } | sort -u | forge_copy_listed "$root" "$path" >/dev/null \
    || printf 'forgerdr: some ignored files could not be copied into %s\n' "$path" >&2
  printf '%s\n' "$path"
}

remove() {
  local input="$1" path root changes row branch start
  path="$(printf '%s' "$input" | jq -r '.worktree_path // empty')"
  [ -n "$path" ] || forge_die "no worktree_path given"
  if [ ! -d "$path" ]; then forget "$path"; return 0; fi
  changes="$(uncommitted "$path")" || forge_die "cannot read the state of $path; left in place"
  [ -z "$changes" ] || forge_die "$path has uncommitted work; left in place. Commit it, or remove the worktree by hand to throw it away"
  root="$(forge_main_checkout "$path")"
  row="$(recorded "$path")"
  branch="${row%%"$TAB"*}"
  start="${row#*"$TAB"}"
  [ -n "$row" ] || { branch="$BRANCH_PREFIX${path#"$root/$WORKTREES_DIR/"}"; start=""; }
  drop_worktree "$root" "$path"
  forget "$path"
  drop_branch "$root" "$branch" "$start"
}

# Whether an agent in a herdr pane list is still at work (working, or blocked on a question).
agent_at_work() {
  jq -e '[.result.panes[] | select(.agent_status == "working" or .agent_status == "blocked")] | length > 0' >/dev/null
}

# Removes the worktrees a session created or reused that have no work left: no change, no untracked file, no commit
# since it started, no agent still at work in it. The one the session stands in, one another session also holds, and
# any with work stay. Then closes the agent panes the session opened (hooks/agent-dispatch.sh) that still hold that agent,
# now done; a pane its agent left, or one at work, stays. The records of its agents go with it.
sweep_session() {
  local session="$1" cwd file path branch start root changes ahead workspace pane agent agents
  cwd="$(cd "$2" 2>/dev/null && pwd -P || printf '%s' "$2")"
  file="$state_dir/$session.tsv"
  if [ -f "$file" ]; then
    while IFS=$'\t' read -r path branch start; do
      [ -d "$path" ] && [ -n "$start" ] || continue
      case "$cwd/" in "$path"/*) continue ;; esac
      ! listed_by_other_session "$session" "$path" || continue
      changes="$(uncommitted "$path")" && [ -z "$changes" ] || continue
      ahead="$(git -C "$path" rev-list --count "$start..HEAD")" && [ "$ahead" = 0 ] || continue
      root="$(forge_main_checkout "$path")"
      if in_herdr; then
        workspace="$(forge_workspace_of_path "$root" "$path")"
        [ -z "$workspace" ] || ! forge_herdr pane list --workspace "$workspace" | agent_at_work || continue
      fi
      drop_worktree "$root" "$path" && drop_branch "$root" "$branch" "$start"
    done < "$file"
    rm -f "$file"
  fi
  file="$state_dir/$session.panes"
  if [ -f "$file" ] && in_herdr; then
    agents="$(forge_herdr agent list)" || { printf 'forgerdr: herdr could not list agents; agent panes left open\n' >&2; agents='{}'; }
    while IFS=$'\t' read -r pane agent; do
      printf '%s' "$agents" | jq -e --arg pane "$pane" --arg agent "$agent" \
        '.result.agents[]? | select(.pane_id == $pane and .name == $agent and .agent_status != "working" and .agent_status != "blocked")' \
        >/dev/null || continue
      forge_herdr pane close "$pane" >/dev/null || printf 'forgerdr: could not close agent pane %s\n' "$pane" >&2
    done < "$file"
  fi
  rm -f "$file" "$state_dir/$session".prompt.*
  rm -rf "$state_dir/$session.agents"
}

case "${1:-}" in
  create) create "$(cat)" ;;
  remove) remove "$(cat)" ;;
  sweep)
    # SessionEnd hooks get a short time budget; the sweep runs detached so it outlives Claude Code, and logs there.
    input="$(cat)"
    session="$(printf '%s' "$input" | jq -r '.session_id // empty')"
    [ -n "$session" ] && { [ -f "$state_dir/$session.tsv" ] || [ -f "$state_dir/$session.panes" ] || [ -d "$state_dir/$session.agents" ]; } || exit 0
    perl -MPOSIX -e 'exit 0 if fork; POSIX::setsid(); exec @ARGV' \
      "$0" sweep-session "$session" "$(printf '%s' "$input" | jq -r '.cwd // empty')" \
      </dev/null >/dev/null 2>>"$state_dir/sweep.log" ;;
  sweep-session) sweep_session "$2" "$3" ;;
  *) forge_die "usage: worktree.sh create|remove|sweep" ;;
esac
