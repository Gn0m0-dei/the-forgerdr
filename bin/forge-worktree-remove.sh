#!/usr/bin/env bash
# Removes a git worktree and closes the herdr app spaces open on it first, as the app's own Remove worktree does; git
# alone would leave them open on a folder that is gone. Its branch is kept.
# Refuses uncommitted work, the worktree this session stands in, a space where an agent is at work, and an IDE ttt
# (bin/forge-ide.sh) open on it that holds unsaved files, or whose state cannot be read; --discard throws the uncommitted
# work and the unsaved files away and still refuses an agent at work; --force does both, so ask the user first. The
# work of its submodules counts as its own: their uncommitted files and the commits no remote has. Its ttt is stopped
# before git removes the folder under it.
# --plan prints, for the worktree a folder is in, what removing it would do as JSON ({path, branch, forced, changes}: its
# top, its branch, whether it goes by force (git removes a worktree with submodules no other way, and then looks at
# nothing itself), its uncommitted files and the submodules that hold work) and removes nothing.
# Usage: forge-worktree-remove.sh [--discard | --force] <path>
#        forge-worktree-remove.sh --plan <folder>
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$here/forge-lib.sh"

force=""
discard=""
plan=""
path=""
while [ $# -gt 0 ]; do
  case "$1" in
    --force) force=1; shift ;;
    --discard) discard=1; shift ;;
    --plan) plan=1; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) path="$1"; shift ;;
  esac
done
[ -n "$path" ] || forge_die "usage: forge-worktree-remove.sh [--discard | --force] <path>"
[ -d "$path" ] || forge_die "$path is not a directory"
# A plan is asked from wherever a space is, so it takes the worktree that folder is in.
[ -z "$plan" ] || path="$(git -C "$path" rev-parse --show-toplevel 2>/dev/null)" || forge_die "$path is not inside a git repository"
logical="$(cd "$path" && pwd)"
real="$(cd "$path" && pwd -P)"
root="$(forge_main_checkout "$real")" || forge_die "$path is not inside a git repository"
# The top of a linked worktree, as git lists it: not the main checkout, not a folder inside a checkout.
path="$(git -C "$root" worktree list --porcelain | sed -n 's/^worktree //p' | grep -vxF "$root" | grep -xF -e "$logical" -e "$real" | head -n 1)" \
  || forge_die "$logical is not the top of a linked worktree of $root"
if [ -n "$plan" ]; then
  submodules="$(forge_submodule_work "$path")" || forge_die "cannot read the submodules of $path"
  # git removes a worktree with submodules only by force, and then looks at nothing itself: the dialog says so.
  forced=false
  ! forge_has_submodules "$path" || forced=true
  # A record a file, "XY path"; a rename or a copy, in either column, is followed by the record of its source, which is
  # not listed. The status goes through stdin: thousands of untracked files would not fit in an argument.
  # shellcheck disable=SC2016 # a jq filter
  git -C "$path" status --porcelain -z --untracked-files=all \
    | jq -Rsc --arg path "$path" --arg branch "$(git -C "$path" branch --show-current)" --arg submodules "$submodules" --argjson forced "$forced" '
      (split("\u0000") | map(select(. != ""))) as $records
      | reduce range(0; $records | length) as $i ({skip: false, files: []};
          if .skip then .skip = false
          else $records[$i] as $record | .files += [$record[3:]] | .skip = ($record[0:2] | test("[RC]")) end)
      | .files as $files
      | {path: $path, branch: $branch, forced: $forced, changes: ($files + (($submodules | split("\n") | map(select(. != ""))) - $files))}' || forge_die "cannot read the state of $path"
  exit 0
fi
case "$(pwd -P)/" in "$real"/*) forge_die "this session stands in $logical; remove it from somewhere else" ;; esac
# What is thrown away is not read first: a submodule git cannot read must not keep its worktree for ever.
if [ -z "$force$discard" ]; then
  changes="$(git -C "$path" status --porcelain)" || forge_die "cannot read the state of $path"
  changes="$changes$(forge_submodule_work "$path")" || forge_die "cannot read the submodules of $path; nothing removed"
else
  changes=""
fi
[ -z "$changes" ] || forge_die "$path has uncommitted work, or a submodule with work no remote has; commit and push it, or pass --discard to throw it away"
git_force=""
[ -z "$force$discard" ] || git_force=--force
# git refuses a worktree with submodules, clean or not; by here theirs hold no work, or it was given up.
! forge_has_submodules "$path" || git_force=--force

# Its spaces go only once git has removed it, so a refusal (a locked worktree) leaves them open. They are
# looked up by the path as given and with its symlinks resolved: once the folder is gone, neither can be worked out.
names=("$logical")
[ "$real" = "$logical" ] || names+=("$real")
# The app's spaces go whenever it answers: a herdr app mod runs this with no terminal of its own.
if forge_app_answers; then
  for name in "${names[@]}"; do forge_spaces_closable "$name" "$force" || forge_die "left $path in place"; done
fi
ide_discard=""
[ -z "$force$discard" ] || ide_discard=--discard
"$here/forge-ide.sh" stop ${ide_discard:+"$ide_discard"} "$path" || forge_die "left $path in place"
git -C "$root" worktree remove ${git_force:+"$git_force"} "$path" || forge_die "git did not remove $path; its spaces stay open"
if forge_app_answers; then
  for name in "${names[@]}"; do
    forge_close_spaces_of "$name" || printf 'forgerdr: the space of %s stays open until the app closes it as an orphan\n' "$name" >&2
  done
fi
printf 'forgerdr: removed the worktree %s; its branch stays\n' "$path"
