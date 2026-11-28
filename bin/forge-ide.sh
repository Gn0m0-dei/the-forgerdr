#!/usr/bin/env bash
# The IDE panel of the forgerdr mod: one ttt (a terminal IDE) per git checkout, run by herdr-core as a detached terminal
# with a stable name, which the panel's layout block shows by that name and which lives on, its tabs and cursor kept,
# until it is stopped. The mod can only run commands: what touches processes and the disk is done here, every answer
# JSON on stdout. Every path given must be absolute, or the script dies. A checkout is taken by its physical path (the
# folder's links resolved; for a folder that is not there, those of the nearest one that is, the rest kept), which
# names its ttt and is the one its ttt is given.
#   name <checkout>        the name of its ttt: ide- and the first 12 hex of the sha256 of the path.
#   ensure <checkout>      its ttt running: {"state":"live","name"} when it is, {"state":"started","name"} once started;
#                          or why it cannot be: {"state":"missing"} (no ttt on PATH), {"state":"unreadable"} (no x.y.z
#                          in what ttt --version prints), {"state":"old","version","minimum"} (a ttt below
#                          FORGE_TTT_MIN, the minimum, read and compared as install.sh does), {"state":"noprofile"}
#                          (forgerdr's ttt profile, its settings.json and forgerdr.lua plugin, not installed: ttt would
#                          write its own defaults where the profile goes). hc runs it with herdr-core's environment, not
#                          this one, so all it needs is in its argv: TTT_CONFIG_DIR (the profile), this PATH,
#                          FORGE_IDE_STATE, FORGE_IDE_ORDER, FORGE_IDE_CHECKOUT and the profile's plugin, which writes
#                          its state there as soon as it starts.
#   stop [--discard] <checkout>
#                          ends its ttt and forgets its state and orders. Refused, saying why on stderr, while its state
#                          lists unsaved files, naming them, or while there is no state that reads, so nobody can tell;
#                          unless --discard, which loses them. Nothing running, nothing done.
#   order <checkout> save  leaves its ttt the order to save every file, the line "save <id>" in FORGE_IDE_ORDER, and
#                          prints the id, fresh for each order: the state carries it once the ttt has answered.
#   dir                    the state folder, where every ttt writes its state and reads its orders, made if missing.
#   servers <checkout>     the language servers the checkout needs and this machine lacks, by the files at its root:
#                          [{"language","server","install":[argv],"needs"}], needs naming the program the install runs
#                          when PATH lacks it too, null otherwise. A server is there when it is on PATH and, for the
#                          ones that take --version, answers it within FORGE_SERVER_WAIT tenths of a second (30).
#   editors                the editors installed: [{"id","name"}], Zed then VS Code.
#   open <zed|code> <path> opens a path in one of them: its macOS app, which open hands over at once, else its command.
# Its state is kept in FORGE_IDE_DIR (${XDG_STATE_HOME:-~/.local/state}/forgerdr/ide), the user's alone.
# FORGE_APPLICATIONS replaces /Applications, where macOS keeps the editors' apps.
# shellcheck source-path=SCRIPTDIR/..
set -euo pipefail

plugin_root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"

readonly STATE_DIR="${FORGE_IDE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/forgerdr/ide}"
readonly APPLICATIONS="${FORGE_APPLICATIONS:-/Applications}"
readonly SAVE=save
# The language servers servers knows, in the order it lists them: language|files at the checkout root that call for it
# (names or globs)|server|how it is told there|install argv, where $HOME is the user's home. run: on PATH and answering
# --version, since rustup puts a proxy of rust-analyzer on PATH even without its component, which fails when run;
# path: on PATH, for docker-langserver, which takes no --version, and the ones not seen answering it (pyright, gopls).
# typescript@6 on purpose: TypeScript 7 dropped tsserver, which typescript-language-server runs. gopls goes to
# ~/.local/bin, which install.sh puts on PATH.
# shellcheck disable=SC2016 # $HOME is expanded word by word, once the argv is split
readonly SERVERS='TypeScript / JavaScript|package.json tsconfig.json|typescript-language-server|run|npm install -g typescript-language-server typescript@6
Python|pyproject.toml requirements.txt setup.py|pyright|path|npm install -g pyright
Go|go.mod|gopls|path|env GOBIN=$HOME/.local/bin go install golang.org/x/tools/gopls@latest
Rust|Cargo.toml|rust-analyzer|run|rustup component add rust-analyzer
Dockerfile|Dockerfile|docker-langserver|path|npm install -g dockerfile-language-server-nodejs
Bash|*.sh bin/*.sh|bash-language-server|run|npm install -g bash-language-server'
# How long a server may take to answer --version, in tenths of a second.
readonly SERVER_WAIT="${FORGE_SERVER_WAIT:-30}"
# ttt takes the mouse: its right clicks go to it (its own menu: Go to Definition, Find All References…), not to the
# app's terminal menu, which has nothing to offer a terminal shown in a layout block. Shift+right-click still opens it.
readonly RIGHT_CLICK="herdr.right-click=program"
# The editors open knows, in the order editors lists them: id|name|its commands (zeditor is Zed's on Linux)|macOS app.
readonly EDITORS='zed|Zed|zed zeditor|Zed
code|VS Code|code|Visual Studio Code'

usage() {
  forge_die "usage: forge-ide.sh name|ensure|servers <checkout> | stop [--discard] <checkout>
  | order <checkout> save | dir | editors | open <zed|code> <path>"
}

absolute() {
  [[ "$1" == /* ]] || forge_die "not an absolute path: $1"
}

# Takes the one checkout a command is given, as checkout: its physical path. A folder that is not there (any more)
# keeps the part of its path past the nearest folder that is, whose physical path leads it.
one_checkout() {
  [ $# -eq 1 ] || usage
  absolute "$1"
  local path="$1" rest=""
  # / is always there.
  until [ -d "$path" ]; do
    [ -z "${path##*/}" ] || rest="/${path##*/}$rest"
    path="${path%/*}"
    path="${path:-/}"
  done
  checkout="$(cd "$path" && pwd -P)"
  checkout="${checkout%/}$rest"
  checkout="${checkout:-/}"
}

name_of() {
  local digest
  digest="$(printf '%s' "$1" | forge_sha256)"
  printf 'ide-%s\n' "${digest:0:12}"
}

# The state folder, made the user's alone: it names the files being edited.
own_state_dir() {
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
}

live() {
  forge_hc get "$1" --json 2>/dev/null | jq -e '.state == "live"' >/dev/null
}

answer() {
  jq -cn --arg state "$1" --arg name "$2" '{state: $state, name: $name}'
}

ensure() {
  local checkout="$1" ttt version profile name
  [ -d "$checkout" ] || forge_die "not a folder: $checkout"
  ttt="$(command -v ttt)" || { jq -cn '{state: "missing"}'; return 0; }
  version="$(forge_version_of "$ttt")"
  profile="$(forge_ttt_profile)"
  name="$(name_of "$checkout")"
  if [ -z "$version" ]; then
    jq -cn '{state: "unreadable"}'
  elif forge_version_newer "$FORGE_TTT_MIN" "$version"; then
    jq -cn --arg version "$version" --arg minimum "$FORGE_TTT_MIN" \
      '{state: "old", version: $version, minimum: $minimum}'
  elif [ ! -f "$profile/settings.json" ] || [ ! -f "$profile/forgerdr.lua" ]; then
    jq -cn '{state: "noprofile"}'
  elif live "$name"; then
    # One started before forgerdr labelled its right clicks gets the label now.
    forge_hc label "$name" "$RIGHT_CLICK" >/dev/null 2>&1 || true
    answer live "$name"
  else
    start "$checkout" "$name" "$ttt" "$profile"
  fi
}

start() {
  local checkout="$1" name="$2" ttt="$3" profile="$4"
  own_state_dir
  if forge_hc run --bg --rm --no-parent --name "$name" --cwd "$checkout" --label "forge.ide=$checkout" \
    --label "$RIGHT_CLICK" -- env "TTT_CONFIG_DIR=$profile" "PATH=$PATH" "FORGE_IDE_STATE=$STATE_DIR/$name.json" \
    "FORGE_IDE_ORDER=$STATE_DIR/$name.order" "FORGE_IDE_CHECKOUT=$checkout" "$ttt" --plugin "$profile/forgerdr.lua" . \
    >/dev/null; then
    answer started "$name"
  elif live "$name"; then
    # Another copy started it meanwhile: names are unique among live terminals.
    answer live "$name"
  else
    forge_die "hc could not start ttt in $checkout"
  fi
}

# A ttt's state, by its name, compact: one JSON object whose unsaved is an array. Fails when there is none that reads.
state_read() {
  jq -cs 'if length == 1 and (first | type) == "object" and (first | .unsaved | type) == "array" then first
    else error("not a state") end' "$STATE_DIR/$1.json" 2>/dev/null
}

# The unsaved files a ttt's state lists, comma-separated; fails when there is no state that reads.
unsaved_of() {
  state_read "$1" | jq -r '.unsaved | map(tostring) | join(", ")'
}

stop() {
  local discard="$1" checkout="$2" name unsaved
  name="$(name_of "$checkout")"
  live "$name" || return 0
  if [ -z "$discard" ]; then
    unsaved="$(unsaved_of "$name")" \
      || forge_die "cannot tell whether ttt holds unsaved files in $checkout; stop it with --discard to lose them"
    [ -z "$unsaved" ] \
      || forge_die "ttt holds unsaved files in $checkout: $unsaved; save them, or stop it with --discard"
  fi
  forge_end_terminal "$name" || forge_die "ttt in $checkout did not end"
  rm -f "$STATE_DIR/$name.json" "$STATE_DIR/$name.order"
}

# The order, with an id of its own: mktemp's random part, and more of bash's.
order() {
  local file tmp id
  [ "$2" = "$SAVE" ] || forge_die "unknown order: $2"
  own_state_dir
  file="$STATE_DIR/$(name_of "$1").order"
  tmp="$(mktemp "$file.XXXXXX")"
  id="${tmp##*.}$RANDOM$RANDOM"
  printf '%s %s\n' "$SAVE" "$id" > "$tmp"
  mv "$tmp" "$file"
  printf '%s\n' "$id"
}

# Whether a checkout has a file at its root that one of these names or globs matches.
has_any() {
  local checkout="$1" markers marker path
  read -r -a markers <<<"$2"
  for marker in "${markers[@]}"; do
    # shellcheck disable=SC2086 # the marker is a glob
    for path in "$checkout"/$marker; do
      [ ! -f "$path" ] || return 0
    done
  done
  return 1
}

# The program an install command runs: its first word past env and the variables env sets.
program_of() {
  local word
  for word in $1; do
    if [ "$word" != env ] && [[ "$word" != *=* ]]; then
      printf '%s\n' "$word"
      return 0
    fi
  done
}

# Whether a program answers --version, successfully, within SERVER_WAIT; one still running then is stopped.
# forge: run from here, never from the checkout: there rustup's proxy would follow a rust-toolchain.toml, and might
# fetch the toolchain it names just because the IDE shows that checkout; so a checkout pinning another toolchain is
# told about the default one's rust-analyzer, which the IDE's Install adds from the user's home for the same reason.
answers() {
  local pid waited=0
  "$1" --version </dev/null >/dev/null 2>&1 &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$waited" -ge "$SERVER_WAIT" ]; then
      { kill -KILL "$pid" && wait "$pid"; } 2>/dev/null || true
      return 1
    fi
    sleep 0.1
    waited=$((waited + 1))
  done
  wait "$pid"
}

# Whether a server is there, told as SERVERS says: on PATH, and for run, answering --version too.
installed() {
  command -v "$1" >/dev/null && { [ "$2" = path ] || answers "$1"; }
}

servers() {
  local checkout="$1" language markers server told install program needs
  while IFS='|' read -r language markers server told install; do
    if ! has_any "$checkout" "$markers" || installed "$server" "$told"; then continue; fi
    program="$(program_of "$install")"
    needs=""
    command -v "$program" >/dev/null || needs="$program"
    # shellcheck disable=SC2086 # the install command, split into its argv
    jq -cn --arg language "$language" --arg server "$server" --arg needs "$needs" --arg home "$HOME" --args \
      '{language: $language, server: $server, install: ($ARGS.positional | map(gsub("\\$HOME"; $home))),
        needs: ($needs | if . == "" then null else . end)}' \
      -- $install
  done <<<"$SERVERS" | jq -cs .
}

# The first of an editor's commands on PATH; fails when none is.
command_of() {
  local command
  for command in $1; do
    command -v "$command" && return 0
  done
  return 1
}

editors() {
  local id name commands app
  while IFS='|' read -r id name commands app; do
    command_of "$commands" >/dev/null || [ -d "$APPLICATIONS/$app.app" ] || continue
    jq -cn --arg id "$id" --arg name "$name" '{id: $id, name: $name}'
  done <<<"$EDITORS" | jq -cs .
}

open_in() {
  local wanted="$1" path="$2" id name commands app command
  while IFS='|' read -r id name commands app; do
    [ "$id" != "$wanted" ] || break
  done <<<"$EDITORS"
  [ "$id" = "$wanted" ] || forge_die "unknown editor: $wanted"
  # The macOS app first: open hands it over at once, while the editor's command waits for the editor to come up, and
  # the menu that runs this waits for it to say whether it failed.
  if [ -d "$APPLICATIONS/$app.app" ]; then
    open -a "$app" "$path" </dev/null
  elif command="$(command_of "$commands")"; then
    "$command" "$path" </dev/null
  else
    forge_die "$name is not installed"
  fi
}

command="${1:-}"
[ $# -eq 0 ] || shift
checkout=""
case "$command" in
  name) one_checkout "$@"; name_of "$checkout" ;;
  ensure) one_checkout "$@"; ensure "$checkout" ;;
  stop)
    discard=""
    [ "${1:-}" != --discard ] || { discard=1; shift; }
    one_checkout "$@"
    stop "$discard" "$checkout" ;;
  order) [ $# -eq 2 ] || usage; one_checkout "$1"; order "$checkout" "$2" ;;
  dir) [ $# -eq 0 ] || usage; own_state_dir; printf '%s\n' "$STATE_DIR" ;;
  servers) one_checkout "$@"; servers "$checkout" ;;
  editors) [ $# -eq 0 ] || usage; editors ;;
  open) [ $# -eq 2 ] || usage; absolute "$2"; open_in "$1" "$2" ;;
  -h|--help) sed -n '/^# shellcheck/q; 2,$p' "$0" ;;
  *) usage ;;
esac
