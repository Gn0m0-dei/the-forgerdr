#!/usr/bin/env bash
# Removes a git worktree and closes the herdr app spaces open on it first, as the app's own Remove worktree does; git
# alone would leave them open on a folder that is gone. Its branch is kept.
# Refuses uncommitted work, the worktree this session stands in, and a space where an agent is at work; --force throws
# the uncommitted work away and closes that space anyway, so ask the user first.
# Usage: forge-worktree-remove.sh [--force] <path>
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

force=""
path=""
while [ $# -gt 0 ]; do
  case "$1" in
    --force) force=1; shift ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) path="$1"; shift ;;
  esac
done
[ -n "$path" ] || forge_die "usage: forge-worktree-remove.sh [--force] <path>"
[ -d "$path" ] || forge_die "$path is not a directory"
logical="$(cd "$path" && pwd)"
real="$(cd "$path" && pwd -P)"
root="$(forge_main_checkout "$real")" || forge_die "$path is not inside a git repository"
# The top of a linked worktree, as git lists it: not the main checkout, not a folder inside a checkout.
path="$(git -C "$root" worktree list --porcelain | sed -n 's/^worktree //p' | grep -vxF "$root" | grep -xF -e "$logical" -e "$real" | head -n 1)" \
  || forge_die "$logical is not the top of a linked worktree of $root"
case "$(pwd -P)/" in "$real"/*) forge_die "this session stands in $logical; remove it from somewhere else" ;; esac
changes="$(git -C "$path" status --porcelain)" || forge_die "cannot read the state of $path"
[ -z "$changes" ] || [ -n "$force" ] || forge_die "$path has uncommitted work; commit it, or pass --force to throw it away"

# Its spaces go only once git has removed it, so a refusal (a locked worktree, submodules) leaves them open. They are
# looked up by the path as given and with its symlinks resolved: once the folder is gone, neither can be worked out.
names=("$logical")
[ "$real" = "$logical" ] || names+=("$real")
if forge_in_herdr; then
  for name in "${names[@]}"; do forge_spaces_closable "$name" "$force" || forge_die "left $path in place"; done
fi
git -C "$root" worktree remove ${force:+--force} "$path" || forge_die "git did not remove $path; its spaces stay open"
if forge_in_herdr; then
  for name in "${names[@]}"; do
    forge_close_spaces_of "$name" || printf 'forgerdr: the space of %s stays open until the app closes it as an orphan\n' "$name" >&2
  done
fi
printf 'forgerdr: removed the worktree %s; its branch stays\n' "$path"
