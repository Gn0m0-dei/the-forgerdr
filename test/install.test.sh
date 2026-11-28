#!/usr/bin/env bash
# Smallest check that fails if install.sh and uninstall.sh break: on macOS, what a fresh machine gets, that another run
# changes nothing, that Claude Code, the herdr app and git are prerequisites they never touch, that a ttt older than
# forgerdr needs is updated, that uninstalling removes only what is ticked, names what it could not remove and keeps
# what it removed out of install.sh --update, whose lines say what it did to each piece; on openSUSE, the same round
# trip through zypper and sudo, ttt from its release only when its checksum matches, and an --update that leaves what
# needs a password. Every command they run is a fake on a PATH of its own (brew, zypper, sudo, npm, az, claude, curl,
# fc-list and the tools they install), and the answers come from a file (FORGE_TTY). The real thing is checked by hand
# in an opensuse/tumbleweed container.
# Run: bash test/install.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
sandbox="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "$sandbox"' EXIT

export FAKES="$sandbox/fakes" TEMPLATES="$sandbox/templates" STATE="$sandbox/state" CALLS="$sandbox/calls"
export PLUGIN_ROOT="$sandbox/plugin" REAL_JQ
REAL_JQ="$(command -v jq)"
sys="$sandbox/sys"
mkdir -p "$FAKES" "$TEMPLATES" "$STATE" "$sys" "$PLUGIN_ROOT/bin"
for tool in bash cat chmod cp find grep gzip head tail install ln mkdir mktemp mv rm sed seq sleep sort sha256sum tar basename dirname touch tr env; do
  ln -s "$(command -v "$tool")" "$sys/$tool"
done

stub() { cp "$TEMPLATES/$1" "$FAKES/$2"; chmod 755 "$FAKES/$2"; }

# Any tool: says it ran; not signed in anywhere.
cat > "$TEMPLATES/tool" <<'SH'
#!/usr/bin/env bash
echo "$(basename "$0") $*" >> "$CALLS"
[ "$*" != "auth status" ]
SH
cat > "$TEMPLATES/uname" <<'SH'
#!/usr/bin/env bash
case "$1" in -s) echo "${FAKE_OS:-Darwin}" ;; -m) echo arm64 ;; esac
SH
# ttt: says the version it was made with.
cat > "$TEMPLATES/ttt" <<'SH'
#!/usr/bin/env bash
[ "$*" != --version ] || echo "ttt vVERSION"
SH
# brew: installs a formula as its command, a cask as a mark; ttt from its tap at 1.14.0, Homebrew's when it is in its
# folder. FAKE_BREW_FAIL names formulae it cannot install, FAKE_BREW_STUCK the ones it refuses to uninstall; with
# FAKE_STDIN, installing a formula keeps there whatever it can read from its input.
cat > "$TEMPLATES/brew" <<'SH'
#!/usr/bin/env bash
echo "brew $*" >> "$CALLS"
make() { cp "$TEMPLATES/${2:-tool}" "$FAKES/$1"; chmod 755 "$FAKES/$1"; }
case "$1 ${2:-}" in
  "install --cask") touch "$STATE/cask-$3" ;;
  "uninstall --cask") rm -f "$STATE/cask-$3" ;;
  "list --cask") [ -f "$STATE/cask-$3" ] ;;
  "list eugenioenko/ttt/ttt") [ -e "$FAKES/ttt" ] ;;
  "install eugenioenko/ttt/ttt"|"upgrade eugenioenko/ttt/ttt") sed 's/VERSION/1.14.0/' "$TEMPLATES/ttt" > "$FAKES/ttt"; chmod 755 "$FAKES/ttt" ;;
  "install "*)
    [ -z "${FAKE_STDIN:-}" ] || cat >> "$FAKE_STDIN"
    case " ${FAKE_BREW_FAIL:-} " in *" $2 "*) echo "Error: $2 failed to install" >&2; exit 1 ;; esac
    case "$2" in
      azure-cli) make az az ;;
      node) make node; make npm npm ;;
      jq) ln -sf "$REAL_JQ" "$FAKES/jq" ;;
      */engram) make engram ;;
      *) make "$2" ;;
    esac ;;
  "uninstall "*)
    case " ${FAKE_BREW_STUCK:-} " in *" $2 "*) echo "Error: refusing to uninstall $2" >&2; exit 1 ;; esac
    case "$2" in
      azure-cli) rm -f "$FAKES/az" ;;
      node) rm -f "$FAKES/node" "$FAKES/npm" ;;
      */engram) rm -f "$FAKES/engram" ;;
      */ttt) rm -f "$FAKES/ttt" ;;
      *) rm -f "$FAKES/$2" ;;
    esac ;;
esac
SH
cat > "$TEMPLATES/npm" <<'SH'
#!/usr/bin/env bash
echo "npm $*" >> "$CALLS"
case "$1" in
  config) echo "${FAKE_NPM_PREFIX:-$STATE}" ;;
  install) cp "$TEMPLATES/tool" "$FAKES/${3#@fission-ai/}"; chmod 755 "$FAKES/${3#@fission-ai/}" ;;
  uninstall) rm -f "$FAKES/${3#@fission-ai/}" ;;
esac
SH
cat > "$TEMPLATES/az" <<'SH'
#!/usr/bin/env bash
echo "az $*" >> "$CALLS"
case "$1 ${2:-}" in
  "extension show") [ -f "$STATE/devops" ] ;;
  "extension add") touch "$STATE/devops" ;;
  "extension remove") rm -f "$STATE/devops" ;;
  "account show") exit 1 ;;
esac
SH
# claude: marketplaces and plugins as marks; every plugin installs into $PLUGIN_ROOT.
cat > "$TEMPLATES/claude" <<'SH'
#!/usr/bin/env bash
echo "claude $*" >> "$CALLS"
last="${*: -1}"
list() {
  local sep="" mark
  printf '['
  for mark in "$STATE/$1"-*; do
    [ -e "$mark" ] || continue
    printf "$2" "$sep" "${mark##*/$1-}" "$PLUGIN_ROOT"
    sep=","
  done
  printf ']\n'
}
case "$2 $3" in
  "marketplace list") list market '%s{"name": "%s", "source": "github"}' ;;
  "marketplace add") touch "$STATE/market-${last##*/}" ;;
  "marketplace remove") rm -f "$STATE/market-$last" ;;
  "list --json") list plugin '%s{"id": "%s", "installPath": "%s"}' ;;
  "install "*) touch "$STATE/plugin-$last" ;;
  "uninstall "*) rm -f "$STATE/plugin-$last" ;;
esac
SH
cat > "$TEMPLATES/curl" <<'SH'
#!/usr/bin/env bash
echo "curl $*" >> "$CALLS"
case "$*" in
  *codebase-memory-mcp*) printf 'cp "$TEMPLATES/cbm" "$HOME/.local/bin/codebase-memory-mcp"\n' ;;
  *api.github.com/repos/Gentleman-Programming/engram*) printf '{"tag_name": "v1.0.0"}\n' ;;
  *engram_1.0.0_linux_arm64.tar.gz*) cat "$TEMPLATES/engram.tar.gz" ;;
  *api.github.com/repos/eugenioenko/ttt*) printf '{"tag_name": "v1.14.0"}\n' ;;
  */eugenioenko/ttt/releases/download/v1.14.0/ttt-linux-arm64*) cp "$TEMPLATES/ttt-linux-arm64" "${*: -1}" ;;
  */eugenioenko/ttt/releases/download/v1.14.0/checksums.txt*) cp "$TEMPLATES/checksums.txt" "${*: -1}" ;;
  *MapleMono-NF.zip*) touch "${*: -1}" ;;
  *) exit 22 ;;
esac
SH
cat > "$TEMPLATES/cbm" <<'SH'
#!/usr/bin/env bash
echo "codebase-memory-mcp $*" >> "$CALLS"
[ "$*" != "uninstall -y" ] || rm -f "$0"
SH
# zypper: installs a package as its commands and removes them; flags are ignored.
cat > "$TEMPLATES/zypper" <<'SH'
#!/usr/bin/env bash
echo "zypper $*" >> "$CALLS"
make() { cp "$TEMPLATES/${2:-tool}" "$FAKES/$1"; chmod 755 "$FAKES/$1"; }
action=""
for word in "$@"; do
  case "$action:$word" in
    *:-*) ;;
    :install|:remove) action="$word" ;;
    install:jq) ln -sf "$REAL_JQ" "$FAKES/jq" ;;
    install:nodejs-default) make node ;;
    install:npm-default) make npm npm ;;
    install:azure-cli) make az az ;;
    install:unzip) make unzip unzip ;;
    install:*) make "$word" ;;
    remove:nodejs-default) rm -f "$FAKES/node" ;;
    remove:npm-default) rm -f "$FAKES/npm" ;;
    remove:azure-cli) rm -f "$FAKES/az" ;;
    remove:*) rm -f "$FAKES/$word" ;;
  esac
done
SH
# sudo: runs what it is given, with no password to ask.
cat > "$TEMPLATES/sudo" <<'SH'
#!/usr/bin/env bash
echo "sudo $*" >> "$CALLS"
case "$1" in -n|-v) exit 0 ;; esac
exec "$@"
SH
# A desktop's fonts: the Maple Mono NF files once there, then thousands of others, one a line, as fc-list prints them.
cat > "$TEMPLATES/fc-list" <<'SH'
#!/usr/bin/env bash
for font in "$HOME/.local/share/fonts/maple-mono-nf"/*.ttf; do
  [ ! -e "$font" ] || printf '%s: Maple Mono NF:style=Regular\n' "$font"
done
for number in $(seq 1 20000); do printf '/usr/share/fonts/font-%s.ttf: Font %s:style=Regular\n' "$number" "$number"; done
SH
cat > "$TEMPLATES/unzip" <<'SH'
#!/usr/bin/env bash
echo "unzip $*" >> "$CALLS"
touch "${*: -1}/MapleMono-NF-Regular.ttf"
SH

# The plugin's own installers: the look leaves its manifest, the status line its command in Claude Code's settings and a
# copy of itself, which takes it away again.
cat > "$PLUGIN_ROOT/bin/forge-herdr-install.sh" <<'SH'
#!/usr/bin/env bash
echo "forge-herdr-install $*" >> "$CALLS"
manifest="$HOME/.local/state/forgerdr/herdr-installed.json"
if [ "${1:-}" = --remove ]; then rm -f "$manifest"; else mkdir -p "$(dirname "$manifest")"; echo '{}' > "$manifest"; fi
SH
cat > "$PLUGIN_ROOT/bin/forge-statusline.sh" <<'SH'
#!/usr/bin/env bash
echo "forge-statusline $*" >> "$CALLS"
copy="$HOME/.local/share/forgerdr/forge-statusline.sh"
case "$1" in
  install) mkdir -p "$(dirname "$copy")" "$HOME/.claude"; cp "$0" "$copy"; printf '{"statusLine":{"command":"bash %s"}}\n' "$copy" > "$HOME/.claude/settings.json" ;;
  remove) echo '{}' > "$HOME/.claude/settings.json"; rm -f "$copy" ;;
esac
SH
chmod 755 "$PLUGIN_ROOT/bin/"* "$TEMPLATES/"*
mkdir -p "$sandbox/release"
cp "$TEMPLATES/tool" "$sandbox/release/engram"
tar -czf "$TEMPLATES/engram.tar.gz" -C "$sandbox/release" engram
# ttt's release: its Linux build, downloaded without the mode it is installed with, and the checksums of its builds.
sed 's/VERSION/1.14.0/' "$TEMPLATES/ttt" > "$TEMPLATES/ttt-linux-arm64"
chmod 644 "$TEMPLATES/ttt-linux-arm64"
release_sum="$(sha256sum "$TEMPLATES/ttt-linux-arm64")"
release_sum="${release_sum%% *}"
sums() { printf '%064d  ttt-linux-amd64\n%s  ttt-linux-arm64\n' 0 "$1" > "$TEMPLATES/checksums.txt"; }
sums "$release_sum"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
contains() { [[ "$1" == *"$2"* ]] && echo yes || echo no; }
called() { grep -cE -- "$1" "$CALLS" || true; }
exists() { [ -e "$1" ] && echo yes || echo no; }
answers() { printf '%b' "$1" > "$sandbox/answers"; }
ttt_at() { sed "s/VERSION/$2/" "$TEMPLATES/ttt" > "$1"; chmod 755 "$1"; }
ttt_version() { "$1" --version; }
mode_755() { [ -n "$(find "$1" -perm 755 2>/dev/null)" ] && echo yes || echo no; }
removed() { "$REAL_JQ" -r '.pieces | join(" ")' "$HOME/.local/state/forgerdr/removed.json"; }
# What --update prints, from piece result detail triples.
lines() { printf '%s\t%s\t%s\n' "$@"; }
run() {
  local script="$1"
  shift
  : > "$CALLS"
  status=0
  out="$(env -i HOME="$HOME" SHELL=/bin/zsh PATH="$FAKES:$sys" FAKES="$FAKES" TEMPLATES="$TEMPLATES" STATE="$STATE" \
    CALLS="$CALLS" PLUGIN_ROOT="$PLUGIN_ROOT" REAL_JQ="$REAL_JQ" FAKE_BREW_STUCK="${FAKE_BREW_STUCK:-}" FAKE_BREW_FAIL="${FAKE_BREW_FAIL:-}" \
    FAKE_OS="${FAKE_OS:-}" FAKE_NPM_PREFIX="${FAKE_NPM_PREFIX:-}" FAKE_STDIN="${FAKE_STDIN:-}" \
    FORGE_TTY="$sandbox/answers" bash "$root/$script" "$@" 2>&1)" || status=$?
}

# A fresh Mac: Homebrew, git, Claude Code and the herdr app, nothing else.
export HOME="$sandbox/home"
mkdir -p "$HOME"
stub uname uname
stub brew brew
stub curl curl
stub claude claude
stub tool herdr-app
stub tool hc
stub tool git
answers ''

rm "$FAKES/claude"
run install.sh
expect "Claude Code is a prerequisite" "1 yes 0" "$status $(contains "$out" "missing: https://claude.com/claude-code") $(called '^brew ')"
stub claude claude
rm "$FAKES/hc"
run install.sh
expect "the herdr app is a prerequisite" "1 yes" "$status $(contains "$out" "missing: it comes with the herdr app")"
stub tool hc
rm "$FAKES/git"
run install.sh
expect "git is a prerequisite" "1 yes" "$status $(contains "$out" "missing: your package manager has it")"
stub tool git

FAKE_BREW_FAIL=azure-cli
run install.sh
expect "a piece that fails is named, with what needs it, and the run fails" "1 yes yes yes" \
  "$status $(contains "$out" "Error: azure-cli failed to install") $(contains "$out" "skipped: needs Azure CLI (az)") $(contains "$out" "15 installed")"
expect "the rest is installed anyway" "yes yes" "$(exists "$FAKES/gh") $(exists "$STATE/plugin-forgerdr@the-forgerdr")"
expect "every tool from Homebrew, git not among them" "9 0" "$(called '^brew install') $(called '^brew install git')"
expect "ttt from its Homebrew tap, at the version forgerdr needs" "1 1.14.0" \
  "$(called '^brew install eugenioenko/ttt/ttt$') $(ttt_version "$FAKES/ttt" | sed 's/^ttt v//')"
expect "the CLI of OpenSpec from npm" 1 "$(called '^npm install -g @fission-ai/openspec')"
expect "both plugins with their marketplaces" "2 2" "$(called '^claude plugin marketplace add') $(called '^claude plugin install')"
expect "the look with its sounds, shown, and the status line" "1 1" "$(called '^forge-herdr-install --sounds --switch$') $(called '^forge-statusline install')"
expect "the local bin folder on the PATH in the rc of the login shell" 1 "$(grep -c '# forgerdr$' "$HOME/.zshrc")"
expect "a sign-in missing is offered, not forced" "yes 0" "$(contains "$out" "run gh auth login when you need it") $(called '^gh auth login')"

unset FAKE_BREW_FAIL
run install.sh
expect "the next run installs only what is missing" "0 yes yes 1" "$status $(contains "$out" "2 installed") $(contains "$out" "15 already here") $(called '^brew install')"

run install.sh
expect "another run installs nothing" "0 yes 0 0 0 0 0" "$status $(contains "$out" "17 already here") $(called '^brew (install|upgrade)') $(called '^npm install') $(called '^claude plugin .*(add|install)') $(called '^curl') $(called 'ttt')"
expect "nor touches the rc again" 1 "$(grep -c '# forgerdr$' "$HOME/.zshrc")"
expect "nor switches the layout you are on" "1 0" "$(called '^forge-herdr-install --sounds$') $(called 'switch')"

ttt_at "$FAKES/ttt" 1.5.0
run install.sh
expect "a ttt older than forgerdr needs is to update, through Homebrew when it is Homebrew's" "0 yes 1 0 yes" \
  "$status $(contains "$out" "to update from 1.5.0") $(called '^brew upgrade eugenioenko/ttt/ttt$') $(called '^brew install') $(contains "$out" "editor) updated")"
run install.sh
expect "and then it is here" "0 yes 0" "$status $(contains "$out" "ttt (the IDE panel's editor) here") $(called 'ttt')"

rm "$FAKES/ttt"
ttt_at "$HOME/.local/bin/ttt" 1.2.0
run install.sh
expect "an older ttt outside Homebrew gets Homebrew's, and is named when it still comes first in PATH" "1 1 0 yes" \
  "$status $(called '^brew install eugenioenko/ttt/ttt$') $(called '^brew upgrade') $(contains "$out" "an older ttt at $HOME/.local/bin/ttt comes first in PATH")"
ttt_at "$HOME/.local/bin/ttt" 1.100.0
run install.sh
expect "a ttt of your own, new enough, is left as it is" "0 yes 0" "$status $(contains "$out" "editor) here") $(called 'ttt')"
rm "$HOME/.local/bin/ttt"

ttt_at "$FAKES/ttt" 1.5.0
rm "$FAKES/gh"
answers 'n\nn\n'
run install.sh --update
expect "--update: a line a piece, with no banner, no question and no sign-in" "0
$(lines path here '' jq here '' node here '' pnpm here '' az here '' devops here '' gh installed '' glab here '' engram here '' \
  openspec here '' codebase-memory here '' ttt updated '' font here '' forgerdr here '' azdo here '' look refreshed '' \
  statusline refreshed '')" "$status
$out"
expect "--update refreshes the look without its sounds, which the person may have declined" "1 0" \
  "$(called '^forge-herdr-install ?$') $(called '^forge-herdr-install.*--sounds')"
expect "and the commands' own output in its log" "1 yes" \
  "$(called '^brew upgrade eugenioenko/ttt/ttt$') $(contains "$(cat "$HOME/.local/state/forgerdr/update.log")" "### installing GitHub CLI (gh)")"

rm "$FAKES/az" "$STATE/devops"
FAKE_BREW_FAIL=azure-cli
run install.sh --update
expect "--update: a piece that fails says why, what needs it is missing, and the run fails" "1 yes yes yes" \
  "$status $(contains "$out" "$(lines az failed 'Error: azure-cli failed to install')") $(contains "$out" "$(lines devops missing 'needs Azure CLI (az)')") $(contains "$out" "$(lines gh here '')")"
unset FAKE_BREW_FAIL
run install.sh --update
expect "--update: the next one installs them" "0 yes yes" \
  "$status $(contains "$out" "$(lines az installed '')") $(contains "$out" "$(lines devops installed '')")"

rm "$FAKES/openspec" "$FAKES/gh"
FAKE_NPM_PREFIX=/usr FAKE_STDIN="$sandbox/stdin"
: > "$FAKE_STDIN"
run install.sh --update <<< "a line typed for the caller"
expect "--update on macOS: a global npm package that needs sudo is left for install.sh" "0 yes 0 0" \
  "$status $(contains "$out" "$(lines openspec missing 'needs your password')") $(called '^sudo') $(called '^npm install')"
expect "and what it installs reads nothing of the caller's input" "yes []" \
  "$(contains "$out" "$(lines gh installed '')") [$(cat "$FAKE_STDIN")]"
unset FAKE_NPM_PREFIX FAKE_STDIN
run install.sh --update
expect "and with npm's prefix yours, it installs it" "0 yes" "$status $(contains "$out" "$(lines openspec installed '')")"

ttt_at "$HOME/.local/bin/ttt" dev
answers 'n\n'
run install.sh --update
expect "--update: a ttt whose version cannot be read fails, and says so" "1 yes 0" \
  "$status $(contains "$out" "$(lines ttt failed "cannot read ttt's version")") $(called 'brew .*ttt')"
answers ''
run install.sh
expect "and install.sh says the same, with nothing to update" "1 yes no 0" \
  "$status $(contains "$out" "editor) cannot read ttt's version") $(contains "$out" "to update from") $(called 'brew .*ttt')"
rm "$HOME/.local/bin/ttt"

answers '12\ny\n'
run uninstall.sh
expect "uninstalling ttt keeps it out on purpose" "0 1 ttt" "$status $(called '^brew uninstall eugenioenko/ttt/ttt$') $(removed)"
answers 'n\n'
run install.sh --update
expect "--update leaves what was removed on purpose out" "0 yes 0" \
  "$status $(contains "$out" "$(lines ttt removed 'removed on purpose: install.sh brings it back')") $(called 'ttt')"
answers ''
run install.sh
expect "install.sh offers it again, brings it back and forgets it was removed" "0 yes 1 []" \
  "$status $(contains "$out" "ttt (the IDE panel's editor) to install") $(called '^brew install eugenioenko/ttt/ttt$') [$(removed)]"

answers '16\ny\n'
run uninstall.sh
expect "uninstalling the look keeps it out on purpose" "0 look" "$status $(removed)"
echo '{}' > "$HOME/.local/state/forgerdr/herdr-installed.json"
answers 'n\n'
run install.sh --update
expect "--update refreshes a piece removed on purpose that came back another way, and forgets it was removed" "0 yes []" \
  "$status $(contains "$out" "$(lines look refreshed '')") [$(removed)]"
rm "$HOME/.local/state/forgerdr/herdr-installed.json"
answers 'n\n'
run install.sh --update
expect "--update installs a look that is missing with no sounds written and no layout switched under the person" "0 yes 1 0" \
  "$status $(contains "$out" "$(lines look installed '')") $(called '^forge-herdr-install ?$') $(called '^forge-herdr-install.*(--sounds|--switch)')"

printf '{"pieces": ["*"]}\n' > "$HOME/.local/state/forgerdr/removed.json"
answers ''
(cd "$sandbox" && run install.sh)
expect "removed.json is written back as it was read, a * too" "*" "$(removed)"
printf '{"pieces": []}\n' > "$HOME/.local/state/forgerdr/removed.json"

answers 'x 99\n\n'
run uninstall.sh
expect "a pick not on the list is asked again" "0 yes yes 0" "$status $(contains "$out" "Only numbers from 1 to 17") $(contains "$out" "Nothing picked") $(called 'uninstall|remove')"

answers '15 17\ny\n'
run uninstall.sh
expect "only what is ticked goes" "0 no yes no yes" \
  "$status $(exists "$HOME/.local/share/forgerdr/forge-statusline.sh") $(exists "$STATE/plugin-forgerdr@the-forgerdr") $(exists "$STATE/plugin-azdo@azdospec") $(exists "$HOME/.local/state/forgerdr/herdr-installed.json")"
expect "and is kept as removed on purpose" "azdo statusline" "$(removed)"

answers 'all\nn\n'
run uninstall.sh
expect "a no at the confirmation removes nothing" "0 0" "$status $(called 'uninstall|remove')"

FAKE_BREW_STUCK=gh
answers 'all\ny\n'
run uninstall.sh
expect "what could not go is named, alone, and the run fails" "1 yes yes" \
  "$status $(contains "$out" "Still installed: GitHub CLI (gh)") $(contains "$out" "1 still installed")"
expect "the rest is gone" "no no no no no no" \
  "$(exists "$FAKES/az") $(exists "$FAKES/node") $(exists "$FAKES/openspec") $(exists "$HOME/.local/bin/codebase-memory-mcp") $(exists "$STATE/plugin-forgerdr@the-forgerdr") $(exists "$STATE/devops")"
expect "and the PATH line with it" 0 "$(grep -c '# forgerdr$' "$HOME/.zshrc" || true)"
expect "Claude Code, the herdr app and git stay" "yes yes yes yes" "$(exists "$FAKES/claude") $(exists "$FAKES/herdr-app") $(exists "$FAKES/hc") $(exists "$FAKES/git")"
expect "what went is kept as removed on purpose, sorted, once each, even after jq went" \
  "az azdo codebase-memory devops engram font forgerdr glab jq look node openspec path pnpm statusline ttt" "$(removed)"
unset FAKE_BREW_STUCK

ttt_at "$FAKES/ttt" 1.5.0
answers ''
run uninstall.sh
expect "only what is still there is listed, an older ttt too" "yes yes no" \
  "$(contains "$out" " 1  GitHub CLI (gh)") $(contains "$out" " 2  ttt (the IDE panel's editor)") $(contains "$out" " 3  ")"

# A fresh openSUSE desktop: zypper, sudo, its fonts, git, Claude Code and the herdr app; npm's prefix is the system's.
export HOME="$sandbox/suse" FAKE_OS=Linux FAKE_NPM_PREFIX=/usr
rm -rf "$FAKES" "$STATE"
mkdir -p "$HOME" "$FAKES" "$STATE"
for fake in uname zypper sudo curl claude fc-list; do stub "$fake" "$fake"; done
for fake in herdr-app hc git fc-cache; do stub tool "$fake"; done
answers ''

run install.sh
expect "openSUSE: a fresh machine gets everything" "0 yes yes" "$status $(contains "$out" "17 installed") $(contains "$out" "0 failed")"
expect "through zypper, node and npm in one go, unzip for the font" "6 1" "$(called '^zypper .*install') $(called '^zypper .*install .*nodejs-default npm-default')"
expect "the global npm packages through sudo" "1 1" "$(called '^sudo npm install -g pnpm') $(called '^sudo npm install -g @fission-ai/openspec')"
expect "engram from its release, the font into the fonts folder" "yes yes" \
  "$(exists "$HOME/.local/bin/engram") $(exists "$HOME/.local/share/fonts/maple-mono-nf/MapleMono-NF-Regular.ttf")"
expect "and the font is seen among thousands" yes "$(contains "$out" "Maple Mono NF font       installed")"
expect "ttt from its release, its checksum matched, runnable" "1 yes ttt v1.14.0" \
  "$(called '^curl .*/eugenioenko/ttt/releases/download/v1.14.0/checksums.txt') $(mode_755 "$HOME/.local/bin/ttt") $(ttt_version "$HOME/.local/bin/ttt")"

run install.sh
expect "openSUSE: another run installs nothing" "0 yes 0 0" "$status $(contains "$out" "17 already here") $(called '^zypper .*install') $(called '^curl')"

rm "$HOME/.local/bin/ttt"
sums "$(printf '%064d' 1)"
run install.sh
expect "openSUSE: a ttt that does not match its checksum is not installed" "1 no yes" \
  "$status $(exists "$HOME/.local/bin/ttt") $(contains "$out" "ttt-linux-arm64 does not match its sha256 in checksums.txt")"
sums "$release_sum"

ttt_at "$HOME/.local/bin/ttt" 1.5.0
rm "$FAKES/gh"
answers 'n\n'
run install.sh --update
expect "openSUSE --update: what needs a password is left for install.sh, the rest goes on without one" "0 yes yes 0 0" \
  "$status $(contains "$out" "$(lines gh missing 'needs your password')") $(contains "$out" "$(lines ttt updated '')") $(called '^sudo') $(called '^zypper')"
stub tool gh
answers ''

FAKE_NPM_PREFIX="$STATE"
rm "$FAKES/pnpm" "$FAKES/openspec"
run install.sh --update
expect "openSUSE --update: global npm packages without sudo when npm's prefix is yours, as with nvm" "0 yes yes 0" \
  "$status $(contains "$out" "$(lines pnpm installed '')") $(contains "$out" "$(lines openspec installed '')") $(called '^sudo')"
FAKE_NPM_PREFIX=/usr

answers 'all\ny\n'
run uninstall.sh
expect "openSUSE: everything ticked goes" "0 yes yes" "$status $(contains "$out" "17 removed") $(contains "$out" "0 still installed")"
expect "zypper takes its packages back" "1 1" "$(called '^zypper remove --clean-deps azure-cli') $(called '^zypper remove --clean-deps nodejs-default npm-default')"
expect "and the font goes" no "$(exists "$HOME/.local/share/fonts/maple-mono-nf")"

[ "$failures" = 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all passed\n'
