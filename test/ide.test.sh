#!/usr/bin/env bash
# Smallest check that fails if the IDE panel's reach into processes and the disk breaks (bin/forge-ide.sh): the stable
# name of a checkout's ttt, starting it in herdr-core with all it needs in its argv and only with forgerdr's profile,
# finding it live, stopping it only when it surely holds no unsaved files, its state and orders, the language servers
# a checkout lacks and the editors a file can be opened in, with ttt's version read as install.sh reads it. hc is a
# fake (test/fakes.sh); ttt, the editors and the installers are fakes on a PATH of the test's own, beside the system
# tools the script runs, so nothing of this machine is found.
# Run: bash test/ide.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
script="$root/bin/forge-ide.sh"
sandbox="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$sandbox"' EXIT
# shellcheck source=test/fakes.sh
. "$root/test/fakes.sh"
fakes_install "$sandbox/fakes"
export HOME="$sandbox/home" XDG_STATE_HOME="$sandbox/state" XDG_CONFIG_HOME="$sandbox/config" FAKE_TTT_VERSION=1.14.0 \
  FORGE_APPLICATIONS="$sandbox/Applications"
unset FORGE_IDE_DIR FAKE_TTT_OUTPUT FAKE_RUN_FAILS FAKE_RUN_RACED
mkdir -p "$HOME"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
status_of() { local status=0; "$@" >/dev/null 2>&1 || status=$?; echo "$status"; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }
name_for() { printf 'ide-%s' "$(printf '%s' "$1" | sha256 | cut -c1-12)"; }
closed() { [ -n "$(find "$1" -maxdepth 0 -perm 700)" ] && echo yes || echo no; }

# The fakes the script may find, and the system tools it runs: nothing else of this machine is on its PATH.
bin="$sandbox/bin"
tools="$sandbox/tools"
apps="$FORGE_APPLICATIONS"
mkdir -p "$bin" "$tools" "$apps"
for tool in bash env jq sed awk head tail cut tr sort cat mkdir chmod mktemp mv rm dirname basename seq sleep grep \
  sha256sum shasum perl; do
  if found="$(type -P "$tool")"; then ln -s "$found" "$tools/$tool"; fi
done
# A program that only logs its call, its name first, as hc does.
fake_program() {
  cat > "$2/$1" <<SH
#!/usr/bin/env bash
jq -cn '["$1"] + \$ARGS.positional' --args -- "\$@" >> "\$FAKE_CALLS"
SH
  chmod +x "$2/$1"
}
cat > "$bin/ttt" <<'SH'
#!/usr/bin/env bash
[ "${1:-}" != --version ] || printf '%s\n' "${FAKE_TTT_OUTPUT:-ttt v$FAKE_TTT_VERSION}"
SH
chmod +x "$bin/ttt"
fake_program npm "$bin"
search="$bin:$tools"
ide() { PATH="$search" bash "$script" "$@"; }

checkout="$sandbox/work/api"
spaced="$sandbox/work/my app"
mkdir -p "$checkout" "$spaced"
name="$(name_for "$checkout")"
profile="$XDG_CONFIG_HOME/forgerdr/ttt"
state="$XDG_STATE_HOME/forgerdr/ide"

expect "a checkout's ttt is named by the sha256 of its path" "$name" "$(ide name "$checkout")"
expect "a name hc takes" yes "$(ide name "$checkout" | grep -Eq '^[a-z0-9_-]{1,32}$' && echo yes || echo no)"
expect "another checkout, another name" "$(name_for "$spaced")" "$(ide name "$spaced")"
ln -s "$checkout" "$sandbox/link"
expect "a checkout is named by its physical path: with a trailing slash, through a link" "$name $name" \
  "$(ide name "$checkout/") $(ide name "$sandbox/link")"
expect "a path that is no folder, by itself without its trailing slash" "$(name_for "$sandbox/gone")" \
  "$(ide name "$sandbox/gone/")"
expect "a folder gone, by the physical path of the nearest one still there" "$(name_for "$checkout/gone/deeper")" \
  "$(ide name "$sandbox/link/gone//deeper/")"
expect "a relative path fails, whatever the command" "1 1 1 1 1 1 1" \
  "$(for command in name ensure stop servers; do printf '%s ' "$(status_of ide "$command" work/api)"; done
    printf '%s %s %s' "$(status_of ide stop --discard work/api)" "$(status_of ide order work/api save)" \
      "$(status_of ide open zed work/api)")"
expect "so does a path that is an option" 1 "$(status_of ide open zed -x)"
expect "and a wrong count of arguments" "1 1 1 1 1" \
  "$(status_of ide name "$checkout" "$spaced") $(status_of ide stop --discard) $(status_of ide stop "$checkout" "$spaced") \
$(status_of ide order "$checkout") $(status_of ide editors "$checkout")"

expect "no ttt on PATH: missing" '{"state":"missing"}' "$(search="$tools" ide ensure "$checkout")"
expect "a ttt below the version forgerdr needs: old, with its version and that minimum" \
  '{"state":"old","version":"1.5.0","minimum":"1.14.0"}' "$(FAKE_TTT_VERSION=1.5.0 ide ensure "$checkout")"
expect "versions compare as numbers, not as text" '{"state":"old","version":"1.9.9","minimum":"1.14.0"}' \
  "$(FAKE_TTT_VERSION=1.9.9 ide ensure "$checkout")"
expect "so is a patch below" old "$(FAKE_TTT_VERSION=1.13.99 ide ensure "$checkout" | jq -r .state)"
expect "a version that cannot be read: unreadable" '{"state":"unreadable"}' "$(FAKE_TTT_OUTPUT='ttt (dev build)' ide ensure "$checkout")"
expect "without forgerdr's ttt profile: noprofile" '{"state":"noprofile"}' "$(ide ensure "$checkout")"
expect "a newer major is no old one" noprofile "$(FAKE_TTT_VERSION=2.0.0 ide ensure "$checkout" | jq -r .state)"
# What install.sh says of the same ttt, from its own functions: fine, old or unreadable.
install_verdict() {
  (
    eval "$(sed -n -e '/^readonly TTT_MIN=/p' -e '/^have() /p' -e '/^piece_version() /p' \
      -e '/^version_state() {/,/^}/p' -e '/^newer() {/,/^}/p' "$root/install.sh")"
    PATH="$search" FAKE_TTT_OUTPUT="$1" version_state ttt
  )
}
ide_verdict() { FAKE_TTT_OUTPUT="$1" ide ensure "$checkout" | jq -r '.state | if . == "noprofile" then "fine" end'; }
outputs=('ttt v1.9.9' 'ttt v1.14.0' 'ttt v1.100.0' 'ttt v1.14' 'garbage' 'ttt-cli 1.15.0' 'ttt v1.5.0' 'ttt v2.0.0' 'ttt v1.13.99')
expect "ttt's version reads as install.sh reads it" 'old fine fine unreadable unreadable fine old fine old' \
  "$(for output in "${outputs[@]}"; do printf '%s ' "$(install_verdict "$output")"; done | sed 's/ $//')"
expect "and here too" 'old fine fine unreadable unreadable fine old fine old' \
  "$(for output in "${outputs[@]}"; do printf '%s ' "$(ide_verdict "$output")"; done | sed 's/ $//')"
expect "nothing is started without the profile" no "$(called hc run)"
mkdir -p "$HOME/.config/forgerdr/ttt"
printf '{}\n' > "$HOME/.config/forgerdr/ttt/settings.json"
touch "$HOME/.config/forgerdr/ttt/forgerdr.lua"
expect "the profile is looked for in ~/.config when XDG_CONFIG_HOME is unset" started \
  "$(env -u XDG_CONFIG_HOME PATH="$search" bash "$script" ensure "$checkout" | jq -r .state)"
rm -rf "$HOME/.config"
fakes_reset

expect "a checkout that is no folder fails" 1 "$(status_of ide ensure "$sandbox/nowhere")"
said="$(ide ensure "$sandbox/nowhere" 2>&1 || true)"
expect "saying why" yes "$(grep -q "^forgerdr: .*$sandbox/nowhere" <<<"$said" && echo yes || echo no)"

mkdir -p "$profile"
printf '{}\n' > "$profile/settings.json"
expect "a profile without forgerdr's plugin is none" noprofile "$(ide ensure "$checkout" | jq -r .state)"
mv "$profile/settings.json" "$sandbox/settings.json"
touch "$profile/forgerdr.lua"
expect "nor is one without its settings" noprofile "$(ide ensure "$checkout" | jq -r .state)"
mv "$sandbox/settings.json" "$profile/settings.json"
expect "a ttt not running is started" "{\"state\":\"started\",\"name\":\"$name\"}" "$(ide ensure "$checkout")"
expect "detached in herdr-core, named, in the checkout, with all it needs in its argv" \
  "$(jq -cn --arg name "$name" --arg checkout "$checkout" --arg profile "$profile" --arg path "$search" \
    --arg state "$state" --arg ttt "$bin/ttt" \
    '["hc", "run", "--bg", "--rm", "--no-parent", "--name", $name, "--cwd", $checkout, "--label", "forge.ide=\($checkout)",
      "--label", "herdr.right-click=program", "--", "env", "TTT_CONFIG_DIR=\($profile)", "PATH=\($path)", "FORGE_IDE_STATE=\($state)/\($name).json",
      "FORGE_IDE_ORDER=\($state)/\($name).order", "FORGE_IDE_CHECKOUT=\($checkout)", $ttt,
      "--plugin", "\($profile)/forgerdr.lua", "."]')" \
  "$(call_of hc run)"
expect "its state folder is the user's alone" yes "$(closed "$state")"

fakes_reset
ide ensure "$sandbox/link/" >/dev/null
expect "reached through a link, it runs in the physical folder" "$name|$checkout|forge.ide=$checkout|FORGE_IDE_CHECKOUT=$checkout" \
  "$(call_of hc run | jq -r '"\(.[index("--name") + 1])|\(.[index("--cwd") + 1])|\(.[index("--label") + 1])|\(.[index("env") + 5])"')"

fakes_reset
fake_terminal "$name" live
expect "a live ttt is answered as such" "{\"state\":\"live\",\"name\":\"$name\"}" "$(ide ensure "$checkout")"
expect "and not started again" no "$(called hc run)"
expect "its right clicks go to ttt, which takes the mouse, not to the app's menu" yes \
  "$(called hc label "$name" herdr.right-click=program)"
rm "$FAKE_DIR/terminals/$name.json"

fakes_reset
expect "started meanwhile by another copy: live" "{\"state\":\"live\",\"name\":\"$name\"}" \
  "$(FAKE_RUN_RACED="$name" ide ensure "$checkout")"
rm "$FAKE_DIR/terminals/$name.json"
expect "hc failing otherwise fails" 1 "$(FAKE_RUN_FAILS=1 status_of ide ensure "$checkout")"

fakes_reset
spaced_name="$(name_for "$spaced")"
ide ensure "$spaced" >/dev/null
expect "a path with a space stays one argument" "$spaced|forge.ide=$spaced|FORGE_IDE_CHECKOUT=$spaced" \
  "$(call_of hc run | jq -r '"\(.[index("--cwd") + 1])|\(.[index("--label") + 1])|\(.[index("env") + 5])"')"
expect "and names its ttt by its own path" "$spaced_name" "$(call_of hc run | option_of --name)"

fakes_reset
moved="$sandbox/elsewhere"
FORGE_IDE_DIR="$moved" ide ensure "$checkout" >/dev/null
expect "FORGE_IDE_DIR moves the state folder" "FORGE_IDE_STATE=$moved/$name.json" \
  "$(call_of hc run | jq -r '.[] | select(startswith("FORGE_IDE_STATE="))')"
expect "made the user's alone too" yes "$(closed "$moved")"

fakes_reset
expect "stopping a ttt that is not running does nothing" 0 "$(status_of ide stop "$checkout")"
expect "and kills nothing" no "$(called hc kill)"
fake_terminal "$name" live
printf '{"checkout":"%s","active":"src/a.ts","unsaved":["src/a.ts","my notes.md"]}\n' "$checkout" > "$state/$name.json"
printf 'save\n' > "$state/$name.order"
expect "one with unsaved files is not stopped" 1 "$(status_of ide stop "$checkout")"
said="$(ide stop "$checkout" 2>&1 || true)"
expect "which are named" yes "$(grep -q 'src/a.ts.*my notes.md' <<<"$said" && echo yes || echo no)"
expect "and nothing is killed" "no live" "$(called hc kill) $(jq -r .state "$FAKE_DIR/terminals/$name.json")"
expect "--discard stops it all the same" 0 "$(status_of ide stop --discard "$checkout")"
expect "killing it by name" yes "$(called hc kill "$name")"
expect "and forgetting its state and orders" "no no" "$( [ -e "$state/$name.json" ] && echo yes || echo no) $( [ -e "$state/$name.order" ] && echo yes || echo no)"

fakes_reset
fake_terminal "$name" live
printf '{"checkout":"%s","active":null,"unsaved":[]}\n' "$checkout" > "$state/$name.json"
expect "one with every file saved is stopped" 0 "$(status_of ide stop "$checkout")"
expect "killed" yes "$(called hc kill "$name")"

fakes_reset
fake_terminal "$name" live
expect "one whose state is missing is not stopped" 1 "$(status_of ide stop "$checkout")"
said="$(ide stop "$checkout" 2>&1 || true)"
expect "since nobody can tell what it holds" \
  "forgerdr: cannot tell whether ttt holds unsaved files in $checkout; stop it with --discard to lose them" "$said"
for broken in '{"checkout":' '{"checkout":"x","active":null}' '{"checkout":"x","unsaved":"a.ts"}' '["a.ts"]'; do
  printf '%s\n' "$broken" > "$state/$name.json"
  expect "nor one whose state does not read: $broken" 1 "$(status_of ide stop "$checkout")"
done
expect "and nothing is killed" no "$(called hc kill)"
expect "--discard stops one whose state does not read" 0 "$(status_of ide stop --discard "$checkout")"
fake_terminal "$name" live
expect "and one whose state is missing" "0 yes" "$(status_of ide stop --discard "$checkout") $(called hc kill "$name")"
expect "a path that is an option is no --discard" "1 live" \
  "$(fake_terminal "$name" live; status_of ide stop --force "$checkout") $(jq -r .state "$FAKE_DIR/terminals/$name.json")"
rm "$FAKE_DIR/terminals/$name.json"

rm -rf "$state"
order="$(ide order "$checkout" save)"
expect "the save order prints its id, a token of its own" yes "$(grep -Eq '^[A-Za-z0-9]{6,}$' <<<"$order" && echo yes || echo no)"
expect "and is written for its ttt with that id" "save $order" "$(cat "$state/$name.order")"
expect "in a folder that is the user's alone" yes "$(closed "$state")"
expect "with no temporary file left" "$name.order" "$(ls "$state")"
expect "each order its own id" no "$( [ "$(ide order "$checkout" save)" = "$order" ] && echo yes || echo no)"
expect "another order fails" 1 "$(status_of ide order "$checkout" quit)"

rm -rf "$state"
expect "dir prints the state folder" "$state" "$(ide dir)"
expect "and makes it, the user's alone, for the panel to follow before any ttt ran" yes "$(closed "$state")"
expect "FORGE_IDE_DIR moves it" "$sandbox/elsewhere" "$(FORGE_IDE_DIR="$sandbox/elsewhere" ide dir)"
expect "and it takes no argument" 1 "$(status_of ide dir "$checkout")"

servers_of() { mkdir -p "$1"; ide servers "$1"; }
mixed="$sandbox/servers/mixed"
mkdir -p "$mixed/bin"
touch "$mixed/package.json" "$mixed/Cargo.toml" "$mixed/bin/x.sh"
expect "the language servers a checkout needs and PATH lacks, with how to install them" \
  '[{"language":"TypeScript / JavaScript","server":"typescript-language-server","install":["npm","install","-g","typescript-language-server","typescript@6"],"needs":null},{"language":"Rust","server":"rust-analyzer","install":["rustup","component","add","rust-analyzer"],"needs":"rustup"},{"language":"Bash","server":"bash-language-server","install":["npm","install","-g","bash-language-server"],"needs":null}]' \
  "$(servers_of "$mixed")"
fake_program typescript-language-server "$bin"
expect "a server on PATH is not listed" 'Rust Bash' "$(servers_of "$mixed" | jq -r 'map(.language) | join(" ")')"
rm "$bin/typescript-language-server"
others="$sandbox/servers/others"
mkdir -p "$others"
touch "$others/requirements.txt" "$others/go.mod" "$others/Dockerfile" "$others/run.sh"
expect "python, go, a Dockerfile and a script at the root" 'Python:null Go:go Dockerfile:null Bash:null' \
  "$(servers_of "$others" | jq -r 'map("\(.language):\(.needs)") | join(" ")')"
expect "gopls goes to ~/.local/bin, which install.sh puts on PATH" \
  "$(jq -cn --arg home "$HOME" '{language: "Go", server: "gopls", install: ["env", "GOBIN=\($home)/.local/bin", "go", "install",
    "golang.org/x/tools/gopls@latest"], needs: "go"}')" \
  "$(servers_of "$others" | jq -c '.[] | select(.language == "Go")')"
fake_program go "$bin"
expect "go on PATH, nothing else is needed" null "$(servers_of "$others" | jq -c '.[] | select(.language == "Go") | .needs')"
rm "$bin/go"
expect "tsconfig.json, pyproject.toml and setup.py are markers too" 'TypeScript / JavaScript,Python' \
  "$(mkdir -p "$sandbox/servers/t" "$sandbox/servers/p" && touch "$sandbox/servers/t/tsconfig.json" "$sandbox/servers/p/pyproject.toml" \
    && printf '%s,%s' "$(servers_of "$sandbox/servers/t" | jq -r '.[].language')" "$(servers_of "$sandbox/servers/p" | jq -r '.[].language')")"
expect "and setup.py" 'Python' "$(mkdir -p "$sandbox/servers/s" && touch "$sandbox/servers/s/setup.py" && servers_of "$sandbox/servers/s" | jq -r '.[].language')"
mkdir -p "$sandbox/servers/deep/src"
touch "$sandbox/servers/deep/src/x.sh"
expect "a checkout with no marker needs none" '[]' "$(servers_of "$sandbox/servers/deep")"
# A server program on PATH that runs as one would: --version answers, or fails, or never ends.
fake_server() {
  printf '#!/usr/bin/env bash\n%s\n' "$2" > "$bin/$1"
  chmod +x "$bin/$1"
}
rust_of() { servers_of "$mixed" | jq -r '[.[] | select(.server == "rust-analyzer") | .language] | join(" ")'; }
fake_server rust-analyzer "echo \"error: Unknown binary 'rust-analyzer' in official toolchain 'stable-aarch64-apple-darwin'\" >&2; exit 1"
expect "rustup's proxy of rust-analyzer, which fails when run without its component, is no server: Rust is offered" \
  Rust "$(rust_of)"
# shellcheck disable=SC2016 # the fake's own script, expanded when it runs
fake_server rust-analyzer '[ "$1" = --version ] && echo "rust-analyzer 1.83.0 (90b35a6 2024-11-26)"'
expect "a rust-analyzer that answers --version is one" '' "$(rust_of)"
fake_server rust-analyzer 'sleep 30'
expect "one that does not answer in time is no server, and the look does not wait for it" "Rust yes" \
  "$(start=$SECONDS; printf '%s %s' "$(FORGE_SERVER_WAIT=3 rust_of)" "$([ $((SECONDS - start)) -lt 5 ] && echo yes || echo no)")"
rm "$bin/rust-analyzer"
fake_server typescript-language-server 'exit 1'
fake_server bash-language-server 'exit 1'
expect "typescript-language-server and bash-language-server are run too" 'TypeScript / JavaScript,Rust,Bash' \
  "$(servers_of "$mixed" | jq -r 'map(.language) | join(",")')"
rm "$bin/typescript-language-server" "$bin/bash-language-server"
fake_server docker-langserver "echo 'Connection input stream is not set.' >&2; exit 1"
expect "docker-langserver, which has no --version, is one when it is on PATH" 'Python Go Bash' \
  "$(servers_of "$others" | jq -r 'map(.language) | join(" ")')"
rm "$bin/docker-langserver"

expect "no editor installed" '[]' "$(ide editors)"
fake_program zed "$bin"
expect "zed on PATH" '[{"id":"zed","name":"Zed"}]' "$(ide editors)"
rm "$bin/zed"
fake_program zeditor "$bin"
expect "or as zeditor, its name on Linux" '[{"id":"zed","name":"Zed"}]' "$(ide editors)"
rm "$bin/zeditor"
mkdir -p "$apps/Visual Studio Code.app" "$apps/Zed.app"
expect "or as macOS apps, Zed first" '[{"id":"zed","name":"Zed"},{"id":"code","name":"VS Code"}]' "$(ide editors)"
rm -rf "$apps/Zed.app"
fake_program code "$bin"
expect "code on PATH" '[{"id":"code","name":"VS Code"}]' "$(ide editors)"

fakes_reset
fake_program zed "$bin"
fake_program open "$bin"
file="$spaced/src/my file.ts"
ide open zed "$file"
expect "a file opens in the editor's command, as one argument" "[\"zed\",\"$file\"]" "$(call_of zed)"
ide open code "$file"
expect "its macOS app first, even with its command on PATH: open hands the app over at once, as a menu waits" \
  "[\"open\",\"-a\",\"Visual Studio Code\",\"$file\"] no" "$(call_of open) $(called code)"
rm "$bin/code"
rm -rf "$apps/Visual Studio Code.app"
expect "an editor not installed fails" 1 "$(status_of ide open code "$file")"
expect "so does one forgerdr does not know" 1 "$(status_of ide open vim "$file")"

help="$(ide --help)"
expect "the help tells every command" "name ensure stop order dir servers editors open" \
  "$(for command in name ensure stop state order dir servers editors open; do
    if grep -qE "^# +$command( |$)" <<<"$help"; then printf '%s ' "$command"; fi
  done | sed 's/ $//')"
expect "an unknown command fails, state among them: the panel reads the state file itself" "1 1" \
  "$(status_of ide nonsense) $(status_of ide state "$checkout")"

expect "the sha256 of what forge-lib.sh is given" ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad \
  "$(bash -c '. "$1/bin/forge-lib.sh" && printf abc | forge_sha256' _ "$root")"
expect "forge-lib.sh can be sourced twice" 1.14.0 \
  "$(bash -c 'set -e; . "$1/bin/forge-lib.sh"; . "$1/bin/forge-lib.sh"; printf %s "$FORGE_TTT_MIN"' _ "$root" 2>&1)"

# install.sh updates ttt below the version this script asks for: both say the same.
expect "install.sh asks for the ttt version forgerdr needs" \
  "$(bash -c '. "$1/bin/forge-lib.sh" && printf %s "$FORGE_TTT_MIN"' _ "$root")" \
  "$(sed -n 's/^readonly TTT_MIN=//p' "$root/install.sh")"

[ "$failures" -eq 0 ] || { printf '%s failed\n' "$failures"; exit 1; }
printf 'all passed\n'
