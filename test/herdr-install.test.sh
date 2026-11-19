#!/usr/bin/env bash
# Smallest check that fails if installing forgerdr's look into the herdr app breaks (bin/forge-herdr-install.sh): what
# the stable install copies and records, what it updates, keeps and removes, and the forgerdr-dev copy --dev makes and
# --watch keeps in step, in a sandboxed app home against a copy of herdr/ and a fake herdr-app (test/fakes.sh). The real
# app is checked by hand.
# Run: bash test/herdr-install.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
sandbox="$(cd "$(mktemp -d)" && pwd -P)"
watcher=""
trap '[ -z "$watcher" ] || kill "$watcher" 2>/dev/null; rm -rf "$sandbox"' EXIT
# shellcheck source=test/fakes.sh
. "$root/test/fakes.sh"
fakes_install "$sandbox/fakes"
export HOME="$sandbox/home" XDG_STATE_HOME="$sandbox/state" HERDR_APP_HOME="$sandbox/app" FORGE_HERDR_SRC="$sandbox/src"
mkdir -p "$HOME"
cp -R "$root/herdr" "$sandbox/src"
rm -f "$sandbox/src/mods/forgerdr/name.js" "$sandbox/src"/mods/forgerdr/*.d.ts
install="$root/bin/forge-herdr-install.sh"
app="$sandbox/app"
manifest="$sandbox/state/forgerdr/herdr-installed.json"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
exists() { [ -e "$1" ] && echo yes || echo no; }
status_of() { "$@" >/dev/null 2>&1 && echo 0 || echo $?; }
contains() { [[ "$1" == *"$2"* ]] && echo yes || echo no; }
kept_line="kept as it is (changed by hand, or not installed by forgerdr)"

out="$(bash "$install")"
expect "the layout, its picture and the theme are installed" "yes yes yes" \
  "$(exists "$app/layouts/forgerdr.json") $(exists "$app/layouts/forgerdr.svg") $(exists "$app/themes/forge-night.json")"
expect "the mod with its fonts and their licences" "yes yes yes" \
  "$(exists "$app/mods/forgerdr/main.js") $(exists "$app/mods/forgerdr/fonts/PixelifySans-Regular.ttf") $(exists "$app/mods/forgerdr/fonts/LICENSES/silkscreen.txt")"
expect "the mod knows the folder it runs from" 'export const MOD = "forgerdr";' "$(tail -n 1 "$app/mods/forgerdr/name.js")"
expect "every file is recorded" "$(cd "$app" && find layouts themes mods -type f | wc -l | tr -d ' ')" "$(jq '.files | length' "$manifest")"
expect "it says what it did" yes "$(contains "$out" "installed the forgerdr layout")"
expect "the mod is checked by the app" yes "$(called herdr-app check "$app/mods/forgerdr")"
expect "the app's own layouts are left alone" no "$(exists "$app/layouts/main.json")"

fakes_reset
expect "run again, it changes nothing" "0 file(s) changed" "$(bash "$install" | grep -o '[0-9]* file(s) changed')"

# A new version: what nobody touched is updated, what the user changed is kept, what it no longer ships goes.
printf '{"background":"#000000","foreground":"#ffffff","selection":"#222222","ansi":[]}\n' > "$app/themes/forge-night.json"
jq '.gap = 9' "$sandbox/src/layouts/forgerdr.json" > "$sandbox/l.json" && mv "$sandbox/l.json" "$sandbox/src/layouts/forgerdr.json"
jq '.colors = {"accent": "#ffffff"}' "$sandbox/src/themes/forge-night.json" > "$sandbox/t.json" && mv "$sandbox/t.json" "$sandbox/src/themes/forge-night.json"
rm "$sandbox/src/mods/forgerdr/fonts/Silkscreen-Bold.ttf"
out="$(bash "$install")"
expect "an untouched file is updated" 9 "$(jq .gap "$app/layouts/forgerdr.json")"
expect "a file the user changed is kept" "#000000" "$(jq -r .background "$app/themes/forge-night.json")"
expect "and named" yes "$(contains "$out" "$kept_line: themes/forge-night.json")"
expect "a file no longer shipped is removed" no "$(exists "$app/mods/forgerdr/fonts/Silkscreen-Bold.ttf")"
expect "and forgotten" null "$(jq '.files["mods/forgerdr/fonts/Silkscreen-Bold.ttf"]' "$manifest")"
bash "$install" --force >/dev/null
expect "--force replaces it" "#ffffff" "$(jq -r .colors.accent "$app/themes/forge-night.json")"
expect "keeping a copy beside it" 1 "$(find "$app/themes" -name 'forge-night.json.forgerdr-*' | wc -l | tr -d ' ')"

# A file that was there before with other content is not the install's to replace.
rm -rf "$app" "$manifest"
mkdir -p "$app/themes"
printf '{"background":"#123456"}\n' > "$app/themes/forge-night.json"
bash "$install" >/dev/null
expect "a theme of the same name made by hand is kept" "#123456" "$(jq -r .background "$app/themes/forge-night.json")"
cp "$sandbox/src/themes/forge-night.json" "$app/themes/forge-night.json"
bash "$install" >/dev/null
expect "one with the same content is taken over" yes "$([ -n "$(jq -r '.files["themes/forge-night.json"] // empty' "$manifest")" ] && echo yes || echo no)"

# --remove takes away what it installed, and leaves the theme and what was changed.
printf 'changed\n' >> "$app/mods/forgerdr/main.js"
printf '// types\n' > "$app/mods/forgerdr/gpui-kit.d.ts"
fakes_reset
printf '{"layout":"forgerdr"}\n' > "$FAKE_DIR/status.json"
out="$(bash "$install" --remove)"
expect "removing shows the app's main layout first" yes "$(called herdr-app "do" layout.switch --name main)"
expect "removing takes the layout and its picture" "no no" "$(exists "$app/layouts/forgerdr.json") $(exists "$app/layouts/forgerdr.svg")"
expect "and leaves the theme, which any layout may use" yes "$(exists "$app/themes/forge-night.json")"
expect "and a file the user changed" yes "$(exists "$app/mods/forgerdr/main.js")"
expect "saying so" yes "$(contains "$out" "$kept_line: mods/forgerdr/main.js")"
expect "the type files the app wrote go with the mod" no "$(exists "$app/mods/forgerdr/gpui-kit.d.ts")"
expect "with its record gone" no "$(exists "$manifest")"
rm -rf "$app"

# --dev: a copy of this checkout's mod beside it, as forgerdr-dev.
jq '.toast = "forgerdr"' "$sandbox/src/layouts/forgerdr.json" > "$sandbox/l.json" &&
  mv "$sandbox/l.json" "$sandbox/src/layouts/forgerdr.json"
fakes_reset
bash "$install" --dev --switch >/dev/null
dev="$app/mods/forgerdr-dev"
expect "the dev mod is a folder of its own, not a link" "yes no" "$(exists "$dev/main.js") $([ -L "$dev" ] && echo yes || echo no)"
expect "which knows it runs as forgerdr-dev" 'export const MOD = "forgerdr-dev";' "$(tail -n 1 "$dev/name.js")"
expect "nothing is written into the checkout" no "$(exists "$sandbox/src/mods/forgerdr/name.js")"
expect "the dev layout's blocks and toasts use it" "forgerdr-dev forgerdr-dev forgerdr-dev" \
  "$(jq -r '[(.. | objects | select(.id? == "topbar" or .id? == "forge") | .content.mod), .toast] | join(" ")' \
    "$app/layouts/forgerdr-dev.json")"
expect "the app's own mods keep their names" "workspace-chrome" \
  "$(jq -r '.. | objects | select(.id? == "sidebar-footer") | .content.mod' "$app/layouts/forgerdr-dev.json")"
expect "with the shared theme and picture" "yes yes" "$(exists "$app/themes/forge-night.json") $(exists "$app/layouts/forgerdr.svg")"
expect "and the dev layout shown with --switch" yes "$(called herdr-app "do" layout.switch --name forgerdr-dev)"
expect "the stable mod is not installed by --dev" no "$(exists "$app/mods/forgerdr")"

# Run again, --dev brings the copy in step: changed files, new ones, and the ones gone from the checkout.
printf '// edited\n' >> "$sandbox/src/mods/forgerdr/main.js"
touch -t 203001010000 "$sandbox/src/mods/forgerdr/main.js"
printf 'export const x = 1;\n' > "$sandbox/src/mods/forgerdr/extra.js"
rm "$sandbox/src/mods/forgerdr/assets.js"
bash "$install" --dev >/dev/null
expect "an edited file is copied again" "// edited" "$(tail -n 1 "$dev/main.js")"
expect "a new file is copied, a removed one goes" "yes no" "$(exists "$dev/extra.js") $(exists "$dev/assets.js")"
expect "its name.js stays" 'export const MOD = "forgerdr-dev";' "$(tail -n 1 "$dev/name.js")"

# --watch keeps it in step until stopped.
FORGE_WATCH_PAUSE=0.1 bash "$install" --dev --watch > "$sandbox/watch.log" 2>&1 &
watcher=$!
for _ in $(seq 1 50); do grep -qs 'watching' "$sandbox/watch.log" && break; sleep 0.1; done
printf 'export const y = 2;\n' > "$sandbox/src/mods/forgerdr/later.js"
for _ in $(seq 1 50); do grep -qs 'file(s) synced' "$sandbox/watch.log" && break; sleep 0.1; done
expect "--watch copies what changes in the checkout" yes "$(exists "$dev/later.js")"
expect "and says what it synced" yes "$(contains "$(cat "$sandbox/watch.log")" "1 file(s) synced")"
kill -TERM "$watcher" 2>/dev/null || true
wait "$watcher" 2>/dev/null || true
watcher=""
expect "it stops on TERM" yes "$(contains "$(cat "$sandbox/watch.log")" "stopped watching")"
expect "--watch needs --dev" 1 "$(status_of bash "$install" --watch)"

rm -rf "$dev"
mkdir -p "$dev"
expect "a folder of that name it did not make is not replaced" 1 "$(status_of bash "$install" --dev)"
rm -rf "$dev"
bash "$install" --dev >/dev/null
bash "$install" --dev --remove >/dev/null
expect "--dev --remove takes the dev mod and layout" "no no" "$(exists "$dev") $(exists "$app/layouts/forgerdr-dev.json")"
expect "leaving the checkout as it is" yes "$(exists "$sandbox/src/mods/forgerdr/main.js")"

# --sounds: the app's alert sounds (settings.json) are the forge's, the person's own kept; --remove takes them away.
settings="$app/settings.json"
printf '{"zoom":1,"sounds":{"enabled":true}}\n' > "$settings"
bash "$install" --sounds >/dev/null
expect "the forge's sounds for both alerts" "mods/forgerdr/sounds/blocked.mp3 mods/forgerdr/sounds/done.mp3" \
  "$(jq -r '"\(.sounds.blocked) \(.sounds.done)"' "$settings")"
expect "shipped with the mod" "yes yes yes" \
  "$(exists "$app/mods/forgerdr/sounds/blocked.mp3") $(exists "$app/mods/forgerdr/sounds/done.mp3") $(exists "$app/mods/forgerdr/sounds/cracked.mp3")"
expect "the rest of the person's settings stay" "1 true" "$(jq -r '"\(.zoom) \(.sounds.enabled)"' "$settings")"
jq '.sounds.blocked = "sounds/my-bell.mp3"' "$settings" > "$sandbox/s" && mv "$sandbox/s" "$settings"
out="$(bash "$install" --sounds)"
expect "a sound of the person's own is kept" "sounds/my-bell.mp3" "$(jq -r '.sounds.blocked' "$settings")"
expect "and named" yes "$(contains "$out" "kept your own blocked sound: sounds/my-bell.mp3")"
bash "$install" --sounds --force >/dev/null
expect "unless --force" "mods/forgerdr/sounds/blocked.mp3" "$(jq -r '.sounds.blocked' "$settings")"
bash "$install" >/dev/null
expect "an install without --sounds leaves them as they are" "mods/forgerdr/sounds/done.mp3" "$(jq -r '.sounds.done' "$settings")"
jq '.sounds.done = "sounds/my-chime.mp3"' "$settings" > "$sandbox/s" && mv "$sandbox/s" "$settings"
bash "$install" --remove >/dev/null
expect "--remove takes the forge's sounds away, and keeps the person's own" '{"enabled":true,"done":"sounds/my-chime.mp3"}' \
  "$(jq -c '.sounds' "$settings")"
bash "$install" --dev --sounds >/dev/null
expect "--dev points them at the dev copy" "mods/forgerdr-dev/sounds/blocked.mp3" "$(jq -r '.sounds.blocked' "$settings")"
bash "$install" --dev --remove >/dev/null
expect "and --dev --remove takes those" null "$(jq -c '.sounds.blocked' "$settings")"
printf '{ "zoom": 1, // a comment\n}\n' > "$settings"
expect "settings that are not plain JSON are refused" 1 "$(status_of bash "$install" --sounds)"
expect "and left as they were" yes "$(contains "$(cat "$settings")" "// a comment")"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
