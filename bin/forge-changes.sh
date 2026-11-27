#!/usr/bin/env bash
# What the forge holds uncommitted, for the Changes panel of the forgerdr mod: the checkouts of each repository with the
# files each one changed, and a checkout's diff. Reads only: the user's index, HEAD and stash are never touched, and
# nothing is refreshed or locked under .git, which the panel watches.
#   tree <repo>...   each repository's checkouts, the main one first, as JSON: [{repo, name, worktrees: [{top, branch,
#                    main, files, submodules: [{name, top, files}]}]}]. files counts what git status lists, new files
#                    one by one; a submodule is listed only while it holds changes, which its checkout does not count.
#                    A folder that is no repository is left out.
#   diff <folder>    the diff of the checkout a folder is in, from its HEAD to what it holds, new files included; from
#                    nothing when it has no commit yet. A long one is cut at FORGE_CHANGES_DIFF_MAX lines (20000) or
#                    FORGE_CHANGES_DIFF_BYTES (4 MiB, under what the mod can read), its last line saying so, and a line
#                    past 4000 characters is cut too. Past FORGE_CHANGES_NEW_MAX new files (400) the rest are left
#                    out, a line saying so. A file git cannot read (no permission, a pipe, a folder with a repository
#                    of its own, a folder that cannot be entered) is left out with a line "\ forgerdr: not shown: <path>", and hides no other.
#   own <folder>     makes the folder the panel keeps its comments in, the user's alone (700) even when it was there
#                    before: they hold lines of code.
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"

readonly DIFF_MAX="${FORGE_CHANGES_DIFF_MAX:-20000}"
readonly DIFF_BYTES="${FORGE_CHANGES_DIFF_BYTES:-4194304}"
readonly LINE_MAX=4000
# Each new file is one git run: past this many, the rest are left out.
readonly NEW_MAX="${FORGE_CHANGES_NEW_MAX:-400}"
# git diff's exit when the two sides differ, which is no failure.
readonly DIFFERS=1
# A program's exit when what read it closed the pipe (SIGPIPE).
readonly PIPE_CLOSED=141
# A read that writes nothing under .git: no index refresh, no lock, no fsmonitor cookie.
readonly READ=(--no-optional-locks -c core.fsmonitor=false -c core.quotePath=false)

# How many files a checkout changed; with a second argument, its submodules' own changes count too.
files_of() {
  local ignore=(--ignore-submodules=dirty)
  [ -z "${2:-}" ] || ignore=()
  git -C "$1" "${READ[@]}" status --porcelain=v1 -z --untracked-files=all --no-renames ${ignore[@]+"${ignore[@]}"} \
    2>/dev/null | tr -cd '\0' | wc -c | tr -d ' '
}

# The submodules of a checkout that hold changes, as a JSON array.
submodules_of() {
  local top="$1" path files
  { git -C "$top" config --file .gitmodules --get-regexp '^submodule\..*\.path$' 2>/dev/null || true; } \
    | cut -d' ' -f2- | while IFS= read -r path; do
      [ -e "$top/$path/.git" ] || continue
      files="$(files_of "$top/$path" all)"
      [ "$files" -gt 0 ] || continue
      jq -cn --arg name "$path" --arg top "$top/$path" --argjson files "$files" '{name: $name, top: $top, files: $files}'
    done | jq -cs .
}

# The checkouts of a repository as tab-separated lines: folder, branch. The main one comes first.
checkouts_of() {
  git -C "$1" worktree list --porcelain | awk '
    function flush() { if (path != "" && !skip) printf "%s\t%s\n", path, branch; path = ""; branch = "(detached)"; skip = 0 }
    /^worktree / { flush(); path = substr($0, 10) }
    /^branch / { branch = substr($0, 8); sub(/^refs\/heads\//, "", branch) }
    /^bare$/ || /^prunable/ { skip = 1 }
    END { flush() }'
}

tree() {
  local given repo top branch first
  for given in "$@"; do
    repo="$(git -C "$given" rev-parse --show-toplevel 2>/dev/null)" || continue
    first="$(git -C "$repo" worktree list --porcelain | sed -n '1s/^worktree //p')"
    checkouts_of "$repo" | while IFS=$'\t' read -r top branch; do
      [ -d "$top" ] || continue
      jq -cn --arg top "$top" --arg branch "$branch" --arg first "$first" --argjson files "$(files_of "$top")" \
        --argjson submodules "$(submodules_of "$top")" \
        '{top: $top, branch: $branch, main: ($top == $first), files: $files, submodules: $submodules}'
    done | jq -cs --arg repo "$repo" '{repo: $repo, name: ($repo | split("/") | last), worktrees: .}'
  done | jq -cs .
}

# Whether git cannot show a file: one that is no file to read (a pipe, a socket, a device, a link to one), or one this
# user may not read. A link is shown as its target's name, whatever it leads to that can be read.
unreadable() {
  [ ! -p "$1" ] && [ ! -S "$1" ] && [ ! -b "$1" ] && [ ! -c "$1" ] || return 0
  [ -f "$1" ] && [ ! -L "$1" ] && [ ! -r "$1" ]
}

# Tells, in the diff, of a file it leaves out. Arguments: its path in the checkout, on one line here.
not_shown() {
  printf '\\ forgerdr: not shown: %s\n' "${1//$'\n'/ }"
}

diff_of() {
  local top index tmp from status
  [ -n "${1:-}" ] || forge_die "usage: forge-changes.sh diff <folder>"
  top="$(git -C "$1" rev-parse --show-toplevel 2>/dev/null)" || forge_die "not in a git repository: $1"
  index="$(git -C "$top" rev-parse --path-format=absolute --git-path index)"
  from="$(git -C "$top" rev-parse --verify -q 'HEAD^{commit}' || git -C "$top" hash-object -t tree /dev/null)"
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064 # the folder made now
  trap "rm -rf '$tmp'" EXIT
  # With its times, or git would stop trusting them and miss a file changed to the same size in the index's second.
  [ ! -f "$index" ] || cp -p "$index" "$tmp/index"
  # What git cannot read (no permission, a pipe, a socket, a device) would end its diff there, or hang it, and leave
  # out everything after: each is told instead, and kept out of git's way.
  local path excluded=()
  # New files are listed first, since git tells there of the folders it could not enter: what such a folder holds is
  # told as not shown, where git would give its tracked files as deleted and say nothing of its new ones.
  LC_ALL=C git -C "$top" "${READ[@]}" ls-files --others --exclude-standard -z > "$tmp/new" 2> "$tmp/warnings" || true
  {
    while IFS= read -r path; do
      not_shown "$path"
      path="${path%/}"
      excluded+=(":(exclude,literal)$path")
    done < <(sed -n "s/^warning: could not open directory '\\(.*\\)': .*$/\\1/p" "$tmp/warnings")
    while IFS= read -r -d '' path; do
      path="${path:3}"
      unreadable "$top/$path" || continue
      not_shown "$path"
      excluded+=(":(exclude,literal)$path")
    done < <(git -C "$top" "${READ[@]}" status --porcelain=v1 -z --untracked-files=no --no-renames \
      --ignore-submodules=dirty 2>/dev/null)
    status=0
    GIT_INDEX_FILE="$tmp/index" git -C "$top" "${READ[@]}" diff --no-color --no-ext-diff --no-textconv --no-renames \
      --ignore-submodules=dirty --src-prefix=a/ --dst-prefix=b/ "$from" -- . ${excluded[@]+"${excluded[@]}"} \
      2>/dev/null || status=$?
    # Stopped by something else than the cut closing the pipe: what it had left to show is not there.
    if [ "$status" -gt "$DIFFERS" ] && [ "$status" -ne "$PIPE_CLOSED" ]; then
      not_shown "some of the tracked files (git diff stopped: exit $status)"
    fi
    # New files are in no index: each is shown whole, against nothing, with no index or object written for it.
    {
      shown=0
      while IFS= read -r -d '' path; do
        if [ "$shown" -ge "$NEW_MAX" ]; then
          printf '\\ forgerdr: cut at %s new files\n' "$NEW_MAX"
          break
        fi
        shown=$((shown + 1))
        # A folder listed whole is a repository of its own, which git does not look into.
        if [ -d "$top/$path" ] && [ ! -L "$top/$path" ] || unreadable "$top/$path"; then
          not_shown "$path"
          continue
        fi
        status=0
        git -C "$top" "${READ[@]}" diff --no-index --no-color --no-ext-diff --no-textconv --src-prefix=a/ \
          --dst-prefix=b/ -- /dev/null "$path" 2>/dev/null || status=$?
        # The cut closed the pipe: nobody reads the rest.
        [ "$status" -ne "$PIPE_CLOSED" ] || break
        [ "$status" -le "$DIFFERS" ] || not_shown "$path"
      done
    } < "$tmp/new"
  } \
    | LC_ALL=C awk -v max="$DIFF_MAX" -v bytes="$DIFF_BYTES" -v wide="$LINE_MAX" '
      NR > max { print "\\ forgerdr: cut at " max " lines"; exit }
      {
        line = $0
        if (length(line) > wide) {
          # Bytes, here: what is left of a character cut in two goes too.
          line = substr(line, 1, wide)
          sub(/[\300-\367][\200-\277]*$/, "", line)
          line = line "… (line cut)"
        }
        size += length(line) + 1
      }
      size > bytes { print "\\ forgerdr: cut at " bytes " bytes"; exit }
      { print line }'
}

own() {
  [ -n "${1:-}" ] || forge_die "usage: forge-changes.sh own <folder>"
  mkdir -p "$1"
  chmod 700 "$1"
}

command="${1:-}"
[ $# -eq 0 ] || shift
case "$command" in
  tree) tree "$@" ;;
  diff) diff_of "$@" ;;
  own) own "$@" ;;
  *) forge_die "usage: forge-changes.sh tree <repo>... | diff <folder> | own <folder>" ;;
esac
