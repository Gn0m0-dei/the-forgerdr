#!/usr/bin/env bash
# Installs forgerdr's look into the herdr app: the forgerdr layout, the forge-night theme and the forgerdr mod with its
# fonts, from this plugin's herdr/ folder into the app's home (HERDR_APP_HOME, ~/.config/herdr-app by default). A file
# it installed and nobody changed since is updated; one changed by hand, or there before with other content, is left
# as it is and named, unless --force, which keeps a copy beside it first. A file a newer version no longer ships is
# removed when unchanged. The app's own layouts, mods and keys.json are never touched.
# --dev installs this checkout beside it as forgerdr-dev: a copy of the mod under that name and a layout whose forgerdr
# blocks use it. --watch keeps that copy in step with the checkout until Ctrl-C, so the app reloads the mod as it is
# edited (the app does not see edits through a link). ctrl-shift-l switches layouts; ctrl-alt-shift-escape always goes
# back to the app's own main layout.
# --remove takes away what it installed (with --dev, the forgerdr-dev pieces only), except the theme, which any layout
# may use. --switch shows the layout after.
# Usage: forge-herdr-install.sh [--dev [--watch]] [--remove] [--force] [--switch]
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

readonly MOD=forgerdr
readonly DEV_MOD=forgerdr-dev
dev=0
watch=0
remove=0
force=0
switch=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dev) dev=1; shift ;;
    --watch) watch=1; shift ;;
    --remove) remove=1; shift ;;
    --force) force=1; shift ;;
    --switch) switch=1; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) forge_die "unknown option $1" ;;
  esac
done
[ "$watch" = 0 ] || [ "$dev" = 1 ] || forge_die "--watch goes with --dev"

src="${FORGE_HERDR_SRC:-$(cd "$(dirname "$0")/../herdr" && pwd -P)}"
# The plugin (or checkout) the herdr folder belongs to.
root="$(cd "$src/.." && pwd -P)"
[ -d "$src/mods/$MOD" ] || forge_die "no herdr/mods/$MOD in $src"
home="$(forge_app_home)"
# What the stable install put in the app's home, "relative path -> sha256", to tell its files from changed ones.
manifest="${XDG_STATE_HOME:-$HOME/.local/state}/forgerdr/herdr-installed.json"
# Seconds between two looks at the checkout under --watch.
watch_pause="${FORGE_WATCH_PAUSE:-1}"
kept=()
changed=0

sha() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

recorded() {
  [ -f "$manifest" ] || return 0
  jq -r --arg rel "$1" '.files[$rel] // empty' "$manifest"
}

record() {
  [ -f "$manifest" ] || { mkdir -p "$(dirname "$manifest")"; printf '{"files":{}}\n' > "$manifest"; }
  # shellcheck disable=SC2016 # a jq filter
  forge_json_update "$manifest" --arg rel "$1" --arg sha "$2" '.files[$rel] = $sha'
}

forget() {
  [ -f "$manifest" ] || return 0
  # shellcheck disable=SC2016 # a jq filter
  forge_json_update "$manifest" --arg rel "$1" 'del(.files[$rel])'
}

# Puts one file at a path of the app's home, as the rules above say.
place() {
  local from="$1" rel="$2" to="$home/$2" new current was
  new="$(sha "$from")"
  if [ -e "$to" ]; then
    current="$(sha "$to")"
    was="$(recorded "$rel")"
    if [ "$current" = "$new" ]; then
      record "$rel" "$new"
      return 0
    fi
    if [ -z "$was" ] || [ "$current" != "$was" ]; then
      if [ "$force" = 0 ]; then
        kept+=("$rel")
        return 0
      fi
      cp -p "$to" "$to.forgerdr-$(date +%Y%m%d%H%M%S)"
    fi
  fi
  mkdir -p "$(dirname "$to")"
  cp "$from" "$to.forgerdr-tmp"
  mv "$to.forgerdr-tmp" "$to"
  record "$rel" "$new"
  changed=$((changed + 1))
}

# Removes a file it installed, unless it changed since; says so when it leaves one.
unplace() {
  local rel="$1" to="$home/$1" was
  was="$(recorded "$rel")"
  if [ -e "$to" ]; then
    if [ -n "$was" ] && [ "$(sha "$to")" = "$was" ]; then
      rm -f "$to"
      changed=$((changed + 1))
    else
      kept+=("$rel")
    fi
  fi
  forget "$rel"
}

# The files of the mod in the checkout, relative to its folder, without what the app or this script writes there.
mod_files() {
  (cd "$src/mods/$MOD" && find . -type f ! -name name.js ! -name '*.d.ts' ! -name '.*' | sed 's|^\./||' | LC_ALL=C sort)
}

# The files the stable install ships: the layout, the theme and the mod.
shipped() {
  (cd "$src" && find layouts themes -type f ! -name '.*' | LC_ALL=C sort)
  mod_files | sed "s|^|mods/$MOD/|"
}

# Writes name.js to a path: the plugin the mod came from (its references, such as the cheat sheet the manual shows) and
# the name of the folder the mod runs from (herdr/mods/forgerdr/assets.js).
name_file() {
  {
    printf '// Written by bin/forge-herdr-install.sh: the plugin this mod came from and the folder it runs from.\n'
    printf 'export const ROOT = "%s";\nexport const MOD = "%s";\n' "$root" "$1"
  } > "$2"
}

# Takes away the type files the app writes into the mods it loads, then the folders left empty.
clear_mod_folder() {
  [ -d "$1" ] || return 0
  find "$1" -type f \( -name gpui-kit.d.ts -o -name herdr.d.ts \) -delete
  find "$1" -depth -type d -empty -delete
}

# Shows the app's own main layout when the one about to go is shown.
leave_layout() {
  local shown
  shown="$(forge_app status 2>/dev/null | jq -r '.layout // empty' 2>/dev/null || true)"
  [ "$shown" != "$1" ] || forge_do layout.switch --name main >/dev/null 2>&1 || true
}

# Checks an installed mod with the app, when the app is there.
check_mod() {
  command -v "${FORGE_HERDR_APP:-herdr-app}" >/dev/null 2>&1 || return 0
  forge_app check "$home/mods/$1" >/dev/null 2>&1 || forge_die "herdr-app check failed for $home/mods/$1: run it to see why"
}

report() {
  local rel
  printf 'forgerdr: %s, %d file(s) changed in %s\n' "$1" "$changed" "$home"
  for rel in ${kept[@]+"${kept[@]}"}; do
    printf '  kept as it is (changed by hand, or not installed by forgerdr): %s\n' "$rel"
  done
  [ ${#kept[@]} -eq 0 ] || [ "$remove" = 1 ] || printf '  --force replaces them, keeping a copy beside each\n'
}

# Brings the dev copy of the mod in step with the checkout: the files that changed or are new, the ones gone, and
# name.js. Prints how many files it touched.
sync_dev_mod() {
  local to="$home/mods/$DEV_MOD" rel touched=0
  mkdir -p "$to"
  while IFS= read -r rel; do
    if [ ! -e "$to/$rel" ] || [ "$src/mods/$MOD/$rel" -nt "$to/$rel" ] || [ "$to/$rel" -nt "$src/mods/$MOD/$rel" ]; then
      mkdir -p "$(dirname "$to/$rel")"
      cp -p "$src/mods/$MOD/$rel" "$to/$rel"
      touched=$((touched + 1))
    fi
  done < <(mod_files)
  while IFS= read -r rel; do
    [ -e "$src/mods/$MOD/$rel" ] || { rm -f "$to/$rel"; touched=$((touched + 1)); }
  done < <(cd "$to" && find . -type f ! -name name.js ! -name '*.d.ts' | sed 's|^\./||')
  if ! grep -qs "\"$DEV_MOD\"" "$to/name.js" || ! grep -qsF "ROOT = \"$root\"" "$to/name.js"; then
    name_file "$DEV_MOD" "$to/name.js"
    touched=$((touched + 1))
  fi
  printf '%s\n' "$touched"
}

# Writes the dev layout from the checkout's: its forgerdr blocks, toasts and terminal menu use the dev mod.
sync_dev_layout() {
  local to="$home/layouts/$DEV_MOD.json"
  [ ! -e "$to" ] || [ "$src/layouts/$MOD.json" -nt "$to" ] || return 0
  # shellcheck disable=SC2016 # a jq filter
  jq --arg from "$MOD" --arg to "$DEV_MOD" 'walk(if type == "object" then with_entries(
      if (.key == "mod" or .key == "toast" or .key == "terminal_menu") and .value == $from then .value = $to else . end)
    else . end)' "$src/layouts/$MOD.json" > "$to.forgerdr-tmp"
  mv "$to.forgerdr-tmp" "$to"
}

if [ "$dev" = 1 ] && [ "$remove" = 1 ]; then
  leave_layout "$DEV_MOD"
  rm -f "$home/layouts/$DEV_MOD.json"
  if [ -L "$home/mods/$DEV_MOD" ]; then
    rm -f "$home/mods/$DEV_MOD"
  elif [ -d "$home/mods/$DEV_MOD" ]; then
    grep -qs "\"$DEV_MOD\"" "$home/mods/$DEV_MOD/name.js" || forge_die "$home/mods/$DEV_MOD was not made by forgerdr; left as it is"
    rm -rf "$home/mods/$DEV_MOD"
  fi
  printf 'forgerdr: removed the %s layout and mod from %s\n' "$DEV_MOD" "$home"
  exit 0
fi

if [ "$remove" = 1 ]; then
  leave_layout "$MOD"
  if [ -f "$manifest" ]; then
    while IFS= read -r rel; do
      case "$rel" in themes/*) forget "$rel" ;; *) unplace "$rel" ;; esac
    done < <(jq -r '.files | keys[]' "$manifest")
    rm -f "$manifest"
  fi
  clear_mod_folder "$home/mods/$MOD"
  report "removed the $MOD layout and mod (the forge-night theme stays: any layout may use it)"
  exit 0
fi

if [ "$dev" = 1 ]; then
  # The theme and the layout's picture come from the stable install, shared by both layouts.
  place "$src/themes/forge-night.json" themes/forge-night.json
  place "$src/layouts/$MOD.svg" "layouts/$MOD.svg"
  if [ -L "$home/mods/$DEV_MOD" ]; then
    rm -f "$home/mods/$DEV_MOD"
  elif [ -e "$home/mods/$DEV_MOD" ] && ! grep -qs "\"$DEV_MOD\"" "$home/mods/$DEV_MOD/name.js"; then
    [ "$force" = 1 ] || forge_die "$home/mods/$DEV_MOD was not made by forgerdr; --force moves it aside"
    mv "$home/mods/$DEV_MOD" "$home/mods/$DEV_MOD.forgerdr-$(date +%Y%m%d%H%M%S)"
  fi
  mkdir -p "$home/layouts"
  sync_dev_mod >/dev/null
  sync_dev_layout
  check_mod "$DEV_MOD"
  [ "$switch" = 0 ] || forge_do layout.switch --name "$DEV_MOD" >/dev/null 2>&1 || true
  report "installed the $DEV_MOD layout and mod from $src"
  [ "$watch" = 1 ] || exit 0
  printf 'forgerdr: watching %s; Ctrl-C stops\n' "$src"
  trap 'printf "\nforgerdr: stopped watching\n"; exit 0' INT TERM
  while :; do
    sleep "$watch_pause"
    touched="$(sync_dev_mod)"
    [ "$touched" = 0 ] || printf '%s %s file(s) synced\n' "$(date +%H:%M:%S)" "$touched"
    sync_dev_layout
  done
fi

current=()
while IFS= read -r rel; do
  current+=("$rel")
  place "$src/$rel" "$rel"
done < <(shipped)
named="$(mktemp)"
name_file "$MOD" "$named"
place "$named" "mods/$MOD/name.js"
rm -f "$named"
current+=("mods/$MOD/name.js")
# What an earlier version installed and this one no longer ships.
if [ -f "$manifest" ]; then
  while IFS= read -r rel; do
    case " ${current[*]} " in *" $rel "*) ;; *) unplace "$rel" ;; esac
  done < <(jq -r '.files | keys[]' "$manifest")
fi
check_mod "$MOD"
[ "$switch" = 0 ] || forge_do layout.switch --name "$MOD" >/dev/null 2>&1 || true
report "installed the $MOD layout, theme and mod"
