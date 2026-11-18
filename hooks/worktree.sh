#!/usr/bin/env bash
# WorktreeCreate, WorktreeRemove and SessionEnd for Claude Code's own worktrees (EnterWorktree, isolated subagents,
# claude --worktree): git worktrees under the main checkout's .claude/worktrees/<name> on branch worktree-<name>, each
# opened as a herdr app space that does not take the focus when the session runs in the app; when a session ends, the
# ones it created with no work left go, their spaces with them.
# Nothing here removes uncommitted work or a commit: git removes only clean worktrees, and a branch goes only while it
# still points where it started or is merged. Inside the app, when a session starts or ends, the spaces forgerdr opened
# for worktrees that were removed where no hook sees it are closed.
# Usage: worktree.sh create|remove|sweep|orphans  (hook JSON on stdin)
#        worktree.sh sweep-session <session-id> <cwd>  (what sweep runs detached)
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"

readonly WORKTREES_DIR=".claude/worktrees"
readonly BRANCH_PREFIX="worktree-"
# Claude Code caps its own fetch for a new worktree at five seconds.
readonly FETCH_SECONDS=5
readonly TAB=$'\t'
state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/forgerdr/worktrees"

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

# Removes a clean worktree, then closes its herdr app spaces; nothing goes when git refuses (a dirty one) or a space must
# stay (the one this session runs in, one with an agent at work).
drop_worktree() {
  local root="$1" path="$2"
  ! forge_in_herdr || forge_spaces_closable "$path" || return 1
  git -C "$root" worktree remove "$path" || return 1
  ! forge_in_herdr || forge_close_spaces_of "$path" \
    || printf 'forgerdr: the space of %s stays open until the app closes it as an orphan\n' "$path" >&2
}

# Opens a worktree as a herdr app space when the session runs in the app and none is open on it; a worktree still works
# when the app does not answer.
open_space() {
  forge_in_herdr || return 0
  [ -z "$(forge_spaces_of "$2")" ] || return 0
  forge_open_space "$1" "$2" >/dev/null || printf 'forgerdr: the herdr app did not open a space for %s\n' "$2" >&2
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
    open_space "$label" "$path"
    record "$session" "$path" "$(git -C "$path" branch --show-current)" "$(git -C "$path" rev-parse HEAD)"
    printf '%s\n' "$path"
    return 0
  fi
  [ ! -e "$path" ] || forge_die "$path exists and is not a worktree of $root"

  base_branch="$(forge_base_branch "$root")"
  GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND="ssh -o BatchMode=yes" \
    capped "$FETCH_SECONDS" git -C "$root" fetch origin "$base_branch" --quiet >/dev/null 2>&1 || true
  base="$(forge_claude_base_ref "$root" "$cwd")"
  if git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
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
  open_space "$label" "$path"
  printf '%s\n' "$path"
}

remove() {
  local input="$1" path root changes row branch start
  path="$(printf '%s' "$input" | jq -r '.worktree_path // empty')"
  [ -n "$path" ] || forge_die "no worktree_path given"
  if [ ! -d "$path" ]; then
    forget "$path"
    ! forge_in_herdr || close_orphans
    return 0
  fi
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

# Closes the herdr app spaces forgerdr opened for worktrees whose checkout is gone from disk: removed with git or rm from
# Bash or a terminal, where no hook sees it, the app keeps the space open. The one this session stands in and one where
# an agent is still at work stay.
close_orphans() {
  local file own listed path id
  file="$(forge_spaces_file)"
  [ -f "$file" ] || return 0
  listed="$(forge_app ls 2>/dev/null)" || { printf 'forgerdr: the herdr app did not answer; spaces of removed worktrees left open\n' >&2; return 0; }
  own="$(forge_own_space)" || { printf 'forgerdr: hc cannot tell which space this session runs in; spaces of removed worktrees left open\n' >&2; return 0; }
  while IFS=$'\t' read -r path id; do
    [ -n "$path" ] && [ ! -e "$path" ] && [ "$id" != "$own" ] || continue
    # The same id on another folder is another space.
    if printf '%s' "$listed" | jq -e --arg id "$id" --arg path "$path" 'any(.spaces[]?; .id == $id and .folder == $path)' >/dev/null 2>&1; then
      ! forge_space_at_work "$id" || continue
      forge_do space.close --id "$id" --confirmed true >/dev/null \
        || { printf 'forgerdr: could not close space %s of the removed worktree %s\n' "$id" "$path" >&2; continue; }
    fi
    forge_forget_space "$path"
  done < <(cat "$file")
}

# Removes the worktrees a session created or reused that have no work left: no change, no untracked file, no commit
# since it started, no agent still at work in its space. The one the session stands in, one another session also holds,
# and any with work stay. Then ends the agent terminals the session started (hooks/agent-dispatch.sh) whose agent is done
# or waiting for input, and removes the ones already ended; an agent at work stays. The records of its agents go with it.
sweep_session() {
  local session="$1" cwd file path branch start root changes ahead space terminal info
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
      if forge_in_herdr; then
        for space in $(forge_spaces_of "$path"); do ! forge_space_at_work "$space" || continue 2; done
      fi
      drop_worktree "$root" "$path" && drop_branch "$root" "$branch" "$start"
    done < "$file"
    rm -f "$file"
  fi
  file="$state_dir/$session.terminals"
  if [ -f "$file" ] && forge_in_herdr; then
    while IFS=$'\t' read -r terminal _; do
      info="$(forge_hc get "$terminal" --json 2>/dev/null)" || continue
      if printf '%s' "$info" | jq -e '.state == "live" and .status.app? == "claude-code" and (.status.state? == "idle" or .status.state? == "done")' >/dev/null; then
        forge_end_terminal "$terminal" || printf 'forgerdr: could not end agent terminal %s\n' "$terminal" >&2
      elif printf '%s' "$info" | jq -e '.state != "live"' >/dev/null; then
        forge_hc rm "$terminal" >/dev/null 2>&1 || true
      fi
    done < "$file"
  fi
  rm -f "$file" "$state_dir/$session".prompt.* "$state_dir/$session.grid" "$state_dir/$session.area"
  rm -rf "$state_dir/$session.agents"
  ! forge_in_herdr || close_orphans
}

case "${1:-}" in
  create) create "$(cat)" ;;
  remove) remove "$(cat)" ;;
  orphans) cat >/dev/null; ! forge_in_herdr || close_orphans ;;
  sweep)
    # SessionEnd hooks get a short time budget; the sweep runs detached so it outlives Claude Code, and logs there.
    input="$(cat)"
    session="$(printf '%s' "$input" | jq -r '.session_id // empty')"
    [ -n "$session" ] && { forge_in_herdr || [ -f "$state_dir/$session.tsv" ] || [ -f "$state_dir/$session.terminals" ] || [ -d "$state_dir/$session.agents" ]; } || exit 0
    mkdir -p "$state_dir"
    perl -MPOSIX -e 'exit 0 if fork; POSIX::setsid(); exec @ARGV' \
      "$0" sweep-session "$session" "$(printf '%s' "$input" | jq -r '.cwd // empty')" \
      </dev/null >/dev/null 2>>"$state_dir/sweep.log" ;;
  sweep-session) sweep_session "$2" "$3" ;;
  *) forge_die "usage: worktree.sh create|remove|sweep|orphans" ;;
esac
