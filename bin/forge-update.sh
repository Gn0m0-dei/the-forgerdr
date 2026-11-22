#!/usr/bin/env bash
# Keeps forgerdr up to date from the herdr app, which shows a new release beside its own update and never applies one
# without a click.
# check: the installed version (claude plugin list) and the newest release tag of the plugin's repository (git
# ls-remote, vX.Y.Z only, no prerelease); when the release is newer, its CHANGELOG.md at that tag, kept from the version
# after the installed one to the release. Leaves the state as it was when either cannot be read.
# apply: claude plugin marketplace update, claude plugin update in the plugin's scope, then the new version's
# forge-herdr-install.sh (the layout, the theme and the mod, leaving what was changed by hand), then a check. The open
# Claude sessions keep the old rules and hooks until they restart. A step that fails is named in the state, with the
# last line it printed, and nothing after it runs. An apply started less than 15 minutes ago is under way, and another is
# refused; one older than that died with whatever ran it.
# State, in FORGE_UPDATE_DIR (~/.local/state/forgerdr/update by default), which the forgerdr mod reads and watches:
#   state.json  {installed, latest, checked (ms), applying (ms it started, or null), applied (the version the last apply
#               installed), error (why the last apply failed, or null), updated (ms)}
#   notes.md    the release notes between the installed version and the newest, while there is a newer one
# Usage: forge-update.sh check|apply
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
  # Why an apply failed belongs to the release it tried; an apply that died long ago is under way no more.
  # shellcheck disable=SC2016 # a jq filter
  forge_json_rewrite "$state" '(. // {})
    | if .latest != $latest then .error = null else . end
    | if (.applying | type) == "number" and $now - .applying >= $stuck then .applying = null else . end
    | . + {installed: $installed, latest: $latest, checked: $now}' \
    --arg installed "$installed" --arg latest "$latest" --argjson stuck "$STUCK_MS"
}

apply() {
  local plugin scope path before version latest out
  state_dir
  # Under the state's lock: an apply under way refuses this one before it writes anything, the rewrite saying why.
  # shellcheck disable=SC2016 # a jq filter
  forge_json_rewrite "$state" '(. // {})
    | if (.applying | type) == "number" and $now - .applying < $stuck then error("an update is already under way")
      else . + {applying: $now, error: null} end' --argjson stuck "$STUCK_MS" ||
    exit 1
  plugin="$(installed_plugin)" || failed "claude plugin list failed"
  [ -n "$plugin" ] || failed "$PLUGIN is not installed"
  scope="$(jq -r '.scope // "user"' <<<"$plugin")"
  before="$(jq -r '.version' <<<"$plugin")"
  out="$(mktemp)"
  # shellcheck disable=SC2064 # the file is known now
  trap "rm -f '$out'" EXIT
  step() {
    local what="$1"
    shift
    "$@" > "$out" 2>&1 && return 0
    failed "$what: $(grep -v '^[[:space:]]*$' "$out" | tail -n 1)"
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
  [ -f "$path/bin/forge-herdr-install.sh" ] || failed "no forge-herdr-install.sh in the updated plugin at $path"
  step "the herdr look" bash "$path/bin/forge-herdr-install.sh"
  # shellcheck disable=SC2016 # a jq filter
  forge_json_rewrite "$state" '. + {installed: $version, applied: $version, applying: null, error: null}' \
    --arg version "$version"
  (check) || printf 'forgerdr: %s is in; the look for a newer release after it failed\n' "$version" >&2
}

# An apply that stops: the state says why and is no longer applying.
failed() {
  # shellcheck disable=SC2016 # a jq filter
  forge_json_rewrite "$state" '. + {applying: null, error: $error}' --arg error "$1"
  forge_die "$1"
}

case "${1:-}" in
  check) check ;;
  apply) apply ;;
  -h|--help) sed -n '2,16p' "$0" ;;
  *) forge_die "usage: forge-update.sh check|apply" ;;
esac
