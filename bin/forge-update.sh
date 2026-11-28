#!/usr/bin/env bash
# Keeps forgerdr up to date from the herdr app, which shows a new release beside its own update and never applies one
# without a click.
# check: the installed version (claude plugin list) and the newest release tag of the plugin's repository (git
# ls-remote, vX.Y.Z only, no prerelease); when the release is newer, its CHANGELOG.md at that tag, kept from the version
# after the installed one to the release. Leaves the state as it was when either cannot be read.
# apply: claude plugin marketplace update, claude plugin update in the plugin's scope, then the new version's
# install.sh --update (every piece forgerdr needs: what is missing installed, what is older than it needs updated, the
# look and the status line refreshed, what needs a password left missing), each piece written in the state as its line
# comes, then a check. The open Claude sessions keep the old rules and hooks until they restart. A step that fails is
# named in the state, with the last line it printed, and nothing after it runs; a piece that fails is no failed step,
# only a piece that says so. An apply started less than 15 minutes ago, or whose process lives, is under way, and another
# is refused; one older than that whose process is gone died with whatever ran it. An apply that stops where nothing said
# why (a command failing under set -e) is no longer applying, and says so with the last line it printed. apply --detach,
# which the herdr app runs, returns once the apply is under way and leaves it running on its own, out of the caller's
# reach, its output in apply.log.
# State, in FORGE_UPDATE_DIR (~/.local/state/forgerdr/update by default), which the forgerdr mod reads and watches:
#   state.json  {installed, latest, checked (ms), applying (ms it started, or null), applied (the version the last apply
#               installed), error (why the last apply failed, or null), step (the piece install.sh --update said last
#               while the apply runs, or null), pieces (what it said of each piece in the last apply, in order:
#               [{piece, result, detail}]), pid (the process of the apply under way, or null), updated (ms)}
#   notes.md    the release notes between the installed version and the newest, while there is a newer one
#   apply.log   what the last detached apply printed
# Usage: forge-update.sh check|apply [--detach]
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

readonly PLUGIN=forgerdr@the-forgerdr
readonly MARKETPLACE=the-forgerdr
# How long an apply may run before it is taken for dead: the mod's UPDATE_TIMING.stuck (herdr/mods/forgerdr/update.js).
readonly STUCK_MS=$((15 * 60 * 1000))
# A credential prompt would wait for nobody: the repository is public.
export GIT_TERMINAL_PROMPT=0
root="$(cd "$(dirname "$0")/.." && pwd -P)"
dir="${FORGE_UPDATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/forgerdr/update}"
state="$dir/state.json"
notes="$dir/notes.md"
# The apply's temporary file, and its log when detached: its EXIT trap reads both.
out=""
log=""

# The installed plugin, as claude plugin list --json gives it; nothing when it is not installed.
installed_plugin() {
  local listed
  listed="$(claude plugin list --json)" || return 1
  jq -c --arg id "$PLUGIN" 'first(.[] | select(.id == $id)) // empty' <<<"$listed"
}

# The newest release tag of a repository, without its v.
newest_release() {
  local tags
  tags="$(git ls-remote --tags --refs "$1")" || return 1
  sed -n 's#.*refs/tags/v\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)$#\1#p' <<<"$tags" |
    sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1
}

# Whether one version is newer than another.
newer() {
  [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1)" = "$1" ]
}

# The sections of a CHANGELOG.md (Keep a Changelog) after one version up to another, on stdout. Every second-level
# heading starts a section; one that names no version (Unreleased) is left out.
notes_between() {
  awk -v from="$1" -v to="$2" '
    function newer(a, b,   x, y, i) {
      split(a, x, "."); split(b, y, ".")
      for (i = 1; i <= 3; i++) if (x[i] + 0 != y[i] + 0) return x[i] + 0 > y[i] + 0
      return 0
    }
    /^## / {
      keep = match($0, /[0-9]+\.[0-9]+\.[0-9]+/)
      if (keep) { version = substr($0, RSTART, RLENGTH); keep = newer(version, from) && !newer(version, to) }
    }
    keep { print }'
}

# The release notes of a newer version, from its tag on GitHub. forge: GitHub only, the host of the-forgerdr; another
# host's raw files would need its own URL.
release_notes() {
  local repo="$1" from="$2" to="$3" changelog
  case "$repo" in https://github.com/*) ;; *) return 1 ;; esac
  changelog="$(curl -fsSL --max-time 20 "https://raw.githubusercontent.com/${repo#https://github.com/}/v$to/CHANGELOG.md")" ||
    return 1
  notes_between "$from" "$to" <<<"$changelog"
}

# The process the state gives the apply under way, when it is still alive and still this script (a number reused after a
# restart is not); null otherwise.
live_pid() {
  local pid=""
  [ ! -f "$state" ] || pid="$(jq -r '.pid | numbers' "$state" 2>/dev/null)" || true
  if [ -n "$pid" ] && ps -o command= -p "$pid" 2>/dev/null | grep -q forge-update.sh; then
    printf '%s' "$pid"
  else
    printf null
  fi
}

# The state folder, the user's alone, there before anything else so the mod's watch has a folder to watch.
state_dir() {
  [ -d "$dir" ] || { mkdir -p "$dir" && chmod 700 "$dir"; }
}

check() {
  local plugin installed repo latest written tmp
  state_dir
  plugin="$(installed_plugin)" || forge_die "claude plugin list failed"
  [ -n "$plugin" ] || forge_die "$PLUGIN is not installed"
  installed="$(jq -r '.version' <<<"$plugin")"
  repo="$(jq -r '.repository // empty' "$root/.claude-plugin/plugin.json")"
  [ -n "$repo" ] || forge_die "no repository in $root/.claude-plugin/plugin.json"
  latest="$(newest_release "$repo")" || forge_die "the release tags of $repo could not be read"
  [ -n "$latest" ] || forge_die "$repo has no release tag"
  if newer "$latest" "$installed" && written="$(release_notes "$repo" "$installed" "$latest")" && [ -n "$written" ]; then
    tmp="$(mktemp "$notes.XXXXXX")"
    printf '%s\n' "$written" > "$tmp" && chmod 600 "$tmp" && mv "$tmp" "$notes"
  else
    rm -f "$notes"
  fi
  # Why an apply failed belongs to the release it tried; an apply that died long ago, its process gone, is under way no
  # more.
  # shellcheck disable=SC2016 # a jq filter
  forge_json_rewrite "$state" '(. // {})
    | if .latest != $latest then .error = null else . end
    | if (.applying | type) == "number" and $now - .applying >= $stuck and ($live == null or .pid != $live)
      then .applying = null | .pid = null else . end
    | . + {installed: $installed, latest: $latest, checked: $now}' \
    --arg installed "$installed" --arg latest "$latest" --argjson stuck "$STUCK_MS" --argjson live "$(live_pid)"
}

# The state taken for an apply, under its lock, with this process as the apply's: an apply under way (started less than
# 15 minutes ago, or its process alive) refuses this one before it writes anything, the rewrite saying why.
claim() {
  state_dir
  # shellcheck disable=SC2016 # a jq filter
  forge_json_rewrite "$state" '(. // {})
    | if (.applying | type) == "number" and ($now - .applying < $stuck or ($live != null and .pid == $live))
      then error("an update is already under way")
      else . + {applying: $now, error: null, step: null, pieces: [], pid: $pid} end' \
    --argjson stuck "$STUCK_MS" --argjson live "$(live_pid)" --argjson pid "$$" ||
    exit 1
}

# The apply, once claimed, in the background: a process group of its own that ignores hangups, nothing tied to the
# caller but its output in apply.log, since herdr's exec gives up after 10 minutes at most and installing pieces through
# brew or npm can take longer. Its process takes over from this one in the state, unless the state names another by then.
# forge: past STUCK_MS (15 minutes, the mod's UPDATE_TIMING.stuck) the mod takes an apply for dead, though its process,
# alive, still keeps another from starting; a heartbeat in the state would lift that ceiling.
detach() {
  log="$dir/apply.log"
  : > "$log"
  chmod 600 "$log"
  set -m
  (trap '' HUP; apply) < /dev/null >> "$log" 2>&1 &
  # shellcheck disable=SC2016 # a jq filter
  forge_json_rewrite "$state" 'if .pid == $claimer then .pid = $pid else . end' --argjson pid "$!" --argjson claimer "$$"
}

# How an apply ends, by its EXIT trap: its temporary file gone and, when it stopped where nothing said why (a command
# failing under set -e) so the state still says applying, the state no longer applying, with the last line it printed
# (apply.log when detached; its status alone otherwise, its output being the caller's).
ended() {
  local status="$1" last=""
  rm -f "$out"
  [ "$status" -ne 0 ] || return 0
  [ -z "$log" ] || last="$(grep -v '^[[:space:]]*$' "$log" | tail -n 1)" || true
  # shellcheck disable=SC2016 # a jq filter
  forge_json_rewrite "$state" 'if (.applying | type) == "number" then . + {applying: null, step: null, pid: null,
    error: $error} else . end' --arg error "the apply stopped: ${last:-exit $status}"
}

apply() {
  local plugin scope path before version latest status
  trap 'ended "$?"' EXIT
  # A SIGTERM would end it with status 0 for the EXIT trap, which would then take it for an apply that ended well.
  trap 'exit 143' TERM
  plugin="$(installed_plugin)" || failed "claude plugin list failed"
  [ -n "$plugin" ] || failed "$PLUGIN is not installed"
  scope="$(jq -r '.scope // "user"' <<<"$plugin")"
  before="$(jq -r '.version' <<<"$plugin")"
  out="$(mktemp)"
  # The last line a step printed.
  last_words() { grep -v '^[[:space:]]*$' "$out" | tail -n 1; }
  step() {
    local what="$1"
    shift
    "$@" > "$out" 2>&1 && return 0
    failed "$what: $(last_words)"
  }
  step "marketplace update" claude plugin marketplace update "$MARKETPLACE"
  # forge: run from wherever the app runs it; a plugin installed for one project (scope project or local) is updated
  # from that project's folder, which this does not know.
  step "plugin update" claude plugin update "$PLUGIN" --scope "$scope"
  plugin="$(installed_plugin)" || failed "claude plugin list failed"
  path="$(jq -r '.installPath // empty' <<<"$plugin")"
  version="$(jq -r '.version // empty' <<<"$plugin")"
  # Nothing newer came in: fine when the plugin is the newest release already (updated elsewhere meanwhile).
  if ! newer "$version" "$before"; then
    latest="$(newest_release "$(jq -r '.repository // empty' "$root/.claude-plugin/plugin.json")")" ||
      failed "plugin update: still at $before, and the release tags could not be read"
    ! newer "$latest" "$version" || failed "plugin update: still at $before"
  fi
  [ -f "$path/install.sh" ] || failed "no install.sh in the updated plugin at $path"
  # install.sh exits 1 when a piece failed, which its line says; 1 with no such line (bash stops with 1 too, on an unbound
  # variable), or another status, is a step that failed.
  status=0
  bash "$path/install.sh" --update 2> "$out" | record_pieces || status="${PIPESTATUS[0]}"
  case "$status" in
    0) ;;
    1) jq -e 'any(.pieces[]?; .result == "failed")' "$state" > /dev/null || failed "pieces: $(last_words)" ;;
    *) failed "pieces: $(last_words)" ;;
  esac
  # shellcheck disable=SC2016 # a jq filter
  forge_json_rewrite "$state" '. + {installed: $version, applied: $version, applying: null, error: null, step: null,
    pid: null}' --arg version "$version"
  (check) || printf 'forgerdr: %s is in; the look for a newer release after it failed\n' "$version" >&2
}

# Each line install.sh --update prints, <piece> TAB <result> TAB <detail>, into the state as it comes: the piece said
# last and the pieces said so far. A line with no result after a tab is no piece's.
record_pieces() {
  local piece result detail
  while IFS=$'\t' read -r piece result detail; do
    [ -n "$result" ] || continue
    # shellcheck disable=SC2016 # a jq filter
    forge_json_rewrite "$state" '. + {step: $piece, pieces: ((.pieces // []) + [{piece: $piece, result: $result,
      detail: $detail}])}' --arg piece "$piece" --arg result "$result" --arg detail "$detail"
  done
}

# An apply that stops: the state says why and is no longer applying.
failed() {
  # shellcheck disable=SC2016 # a jq filter
  forge_json_rewrite "$state" '. + {applying: null, error: $error, step: null, pid: null}' --arg error "$1"
  forge_die "$1"
}

usage() { forge_die "usage: forge-update.sh check|apply [--detach]"; }

case "${1:-}" in
  check) check ;;
  apply)
    case "${2:-}" in
      "") claim; apply ;;
      --detach) claim; detach ;;
      *) usage ;;
    esac ;;
  -h|--help) sed -n '2,24p' "$0" ;;
  *) usage ;;
esac
