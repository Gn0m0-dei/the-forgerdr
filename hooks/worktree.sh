#!/usr/bin/env bash
# WorktreeCreate, WorktreeRemove and SessionEnd for Claude Code's own worktrees (EnterWorktree, isolated subagents,
# claude --worktree): herdr worktrees inside herdr, plain git worktrees outside it, always under the main checkout's
# .claude/worktrees/<name> on branch worktree-<name>; when a session ends, the ones it created with no work left go.
# Usage: worktree.sh create|remove|sweep  (hook JSON on stdin)
#        worktree.sh sweep-session <session-id> <cwd>  (what sweep runs detached)
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=herdr/bin/forge-lib.sh
. "$plugin_root/herdr/bin/forge-lib.sh"

state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/forgerdr/worktrees"

in_herdr() { [ "${HERDR_ENV:-}" = 1 ]; }

# Removes a worktree from herdr (its workspace with it) or from git; branch and state are the callers'.
drop_worktree() {
  local root="$1" path="$2" workspace=""
  in_herdr && workspace="$(forge_workspace_of_path "$root" "$path")"
  if [ -n "$workspace" ]; then
    forge_herdr worktree remove --workspace "$workspace" --force >/dev/null
  else
    git -C "$root" worktree remove --force "$path"
  fi
}

# Deletes a worktree's branch only when its commits are merged; otherwise keeps it and says so.
drop_branch() {
  [ -n "$2" ] || return 0
  git -C "$1" branch -d "$2" >/dev/null 2>&1 || printf 'forgerdr: kept branch %s, it has commits that are not merged\n' "$2" >&2
}

forget() {
  local file="$state_dir/$1.tsv"
  [ -f "$file" ] || return 0
  awk -F'\t' -v path="$2" '$1 != path' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
}

create() {
  local input="$1" name cwd session root path branch base label parent workspace
  name="$(printf '%s' "$input" | jq -r '.name // empty')"
  cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
  session="$(printf '%s' "$input" | jq -r '.session_id // empty')"
  case "$name" in ''|/*|*..*) forge_die "invalid worktree name: $name" ;; esac
  cwd="${cwd:-$PWD}"
  root="$(forge_main_checkout "$cwd")" || forge_die "not inside a git repository: $cwd"
  path="$root/.claude/worktrees/$name"
  branch="worktree-$name"
  label="$name"
  parent="$(git -C "$cwd" rev-parse --show-toplevel)"
  [ "$parent" = "$root" ] || label="$(basename "$parent")/$name"
  forge_exclude_local "$root" ".claude/worktrees/"

  if git -C "$root" worktree list --porcelain | grep -qxF "worktree $path"; then
    if in_herdr; then
      workspace="$(forge_workspace_of_path "$root" "$path")"
      [ -n "$workspace" ] || forge_herdr worktree open --cwd "$root" --path "$path" --label "$label" --no-focus >/dev/null
    fi
    printf '%s\n' "$path"
    return 0
  fi
  [ ! -e "$path" ] || forge_die "$path exists and is not a worktree of $root"

  # Claude Code caps its own fetch at five seconds; so does this one.
  perl -e 'alarm 5; exec @ARGV' git -C "$root" fetch origin --quiet >/dev/null 2>&1 || true
  base="$(forge_claude_base_ref "$root" "$cwd")"
  if in_herdr; then
    forge_herdr worktree create --cwd "$root" --branch "$branch" --base "$base" --path "$path" --label "$label" --no-focus >/dev/null
  elif git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$root" worktree add --quiet "$path" "$branch" >&2
  else
    git -C "$root" worktree add --quiet --no-track -b "$branch" "$path" "$base" >&2
  fi
  [ -d "$path" ] || forge_die "worktree $path was not created"
  forge_drop_inherited_upstream "$path" "$branch"
  { forge_env_files "$root"; forge_worktree_includes "$root"; } | sort -u | forge_copy_listed "$root" "$path" >/dev/null
  if [ -n "$session" ]; then
    mkdir -p "$state_dir"
    printf '%s\t%s\t%s\n' "$path" "$branch" "$(git -C "$path" rev-parse HEAD)" >> "$state_dir/$session.tsv"
  fi
  printf '%s\n' "$path"
}

remove() {
  local input="$1" path session root branch
  path="$(printf '%s' "$input" | jq -r '.worktree_path // empty')"
  session="$(printf '%s' "$input" | jq -r '.session_id // empty')"
  [ -n "$path" ] || forge_die "no worktree_path given"
  [ -z "$session" ] || forget "$session" "$path"
  [ -d "$path" ] || return 0
  root="$(forge_main_checkout "$path")"
  branch="$(git -C "$path" symbolic-ref --quiet --short HEAD || true)"
  drop_worktree "$root" "$path"
  drop_branch "$root" "$branch"
}

# Removes the worktrees a session created that have no work left: no change, no untracked file, no commit since
# creation. The one the session still stands in, and any with work, stay.
sweep_session() {
  local session="$1" cwd="$2" file path branch start root
  file="$state_dir/$session.tsv"
  [ -f "$file" ] || return 0
  while IFS=$'\t' read -r path branch start; do
    [ -d "$path" ] || continue
    case "$cwd/" in "$path"/*) continue ;; esac
    [ -z "$(git -C "$path" status --porcelain)" ] || continue
    [ "$(git -C "$path" rev-list --count "$start..HEAD")" = 0 ] || continue
    root="$(forge_main_checkout "$path")"
    drop_worktree "$root" "$path" && drop_branch "$root" "$branch"
  done < "$file"
  rm -f "$file"
}

case "${1:-}" in
  create) create "$(cat)" ;;
  remove) remove "$(cat)" ;;
  sweep)
    # SessionEnd hooks get a short time budget; the sweep runs detached so it outlives Claude Code.
    input="$(cat)"
    session="$(printf '%s' "$input" | jq -r '.session_id // empty')"
    [ -n "$session" ] && [ -f "$state_dir/$session.tsv" ] || exit 0
    perl -MPOSIX -e 'exit 0 if fork; POSIX::setsid(); exec @ARGV' \
      "$0" sweep-session "$session" "$(printf '%s' "$input" | jq -r '.cwd // empty')" </dev/null >/dev/null 2>&1 ;;
  sweep-session) sweep_session "$2" "$3" ;;
  *) forge_die "usage: worktree.sh create|remove|sweep" ;;
esac
