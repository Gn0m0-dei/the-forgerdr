#!/usr/bin/env bash
# Smallest check that fails if install.sh and uninstall.sh break: on macOS, what a fresh machine gets, that another run
# changes nothing, that Claude Code, the herdr app and git are prerequisites they never touch, and that uninstalling
# removes only what is ticked and names what it could not remove; on openSUSE, the same round trip through zypper and
# sudo. Every command they run is a fake on a PATH of its own (brew, zypper, sudo, npm, az, claude, curl, fc-list and
# the tools they install), and the answers come from a file (FORGE_TTY). The real thing is checked by hand in an
# opensuse/tumbleweed container.
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
for tool in bash cat chmod cp find grep gzip head tail install ln mkdir mktemp mv rm sed seq sleep tar basename dirname touch tr env; do
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
# brew: installs a formula as its command, a cask as a mark; FAKE_BREW_FAIL names formulae it cannot install,
# FAKE_BREW_STUCK the ones it refuses to uninstall.
cat > "$TEMPLATES/brew" <<'SH'
#!/usr/bin/env bash
echo "brew $*" >> "$CALLS"
make() { cp "$TEMPLATES/${2:-tool}" "$FAKES/$1"; chmod 755 "$FAKES/$1"; }
case "$1 ${2:-}" in
  "install --cask") touch "$STATE/cask-$3" ;;
  "uninstall --cask") rm -f "$STATE/cask-$3" ;;
  "list --cask") [ -f "$STATE/cask-$3" ] ;;
  "install "*)
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

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
contains() { [[ "$1" == *"$2"* ]] && echo yes || echo no; }
called() { grep -cE -- "$1" "$CALLS" || true; }
exists() { [ -e "$1" ] && echo yes || echo no; }
answers() { printf '%b' "$1" > "$sandbox/answers"; }
run() {
  local script="$1"
  shift
  : > "$CALLS"
  status=0
  out="$(env -i HOME="$HOME" SHELL=/bin/zsh PATH="$FAKES:$sys" FAKES="$FAKES" TEMPLATES="$TEMPLATES" STATE="$STATE" \
    CALLS="$CALLS" PLUGIN_ROOT="$PLUGIN_ROOT" REAL_JQ="$REAL_JQ" FAKE_BREW_STUCK="${FAKE_BREW_STUCK:-}" FAKE_BREW_FAIL="${FAKE_BREW_FAIL:-}" \
    FAKE_OS="${FAKE_OS:-}" FAKE_NPM_PREFIX="${FAKE_NPM_PREFIX:-}" \
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
  "$status $(contains "$out" "Error: azure-cli failed to install") $(contains "$out" "skipped: needs Azure CLI (az)") $(contains "$out" "14 installed")"
expect "the rest is installed anyway" "yes yes" "$(exists "$FAKES/gh") $(exists "$STATE/plugin-forgerdr@the-forgerdr")"
expect "every tool from Homebrew, git not among them" "8 0" "$(called '^brew install') $(called '^brew install git')"
expect "the CLI of OpenSpec from npm" 1 "$(called '^npm install -g @fission-ai/openspec')"
expect "both plugins with their marketplaces" "2 2" "$(called '^claude plugin marketplace add') $(called '^claude plugin install')"
expect "the look with its sounds, shown, and the status line" "1 1" "$(called '^forge-herdr-install --sounds --switch$') $(called '^forge-statusline install')"
expect "the local bin folder on the PATH in the rc of the login shell" 1 "$(grep -c '# forgerdr$' "$HOME/.zshrc")"
expect "a sign-in missing is offered, not forced" "yes 0" "$(contains "$out" "run gh auth login when you need it") $(called '^gh auth login')"

unset FAKE_BREW_FAIL
run install.sh
expect "the next run installs only what is missing" "0 yes yes 1" "$status $(contains "$out" "2 installed") $(contains "$out" "14 already here") $(called '^brew install')"

run install.sh
expect "another run installs nothing" "0 yes 0 0 0 0" "$status $(contains "$out" "16 already here") $(called '^brew install') $(called '^npm install') $(called '^claude plugin .*(add|install)') $(called '^curl')"
expect "nor touches the rc again" 1 "$(grep -c '# forgerdr$' "$HOME/.zshrc")"
expect "nor switches the layout you are on" "1 0" "$(called '^forge-herdr-install --sounds$') $(called 'switch')"

answers 'x 99\n\n'
run uninstall.sh
expect "a pick not on the list is asked again" "0 yes yes 0" "$status $(contains "$out" "Only numbers from 1 to 16") $(contains "$out" "Nothing picked") $(called 'uninstall|remove')"

answers '14 16\ny\n'
run uninstall.sh
expect "only what is ticked goes" "0 no yes no yes" \
  "$status $(exists "$HOME/.local/share/forgerdr/forge-statusline.sh") $(exists "$STATE/plugin-forgerdr@the-forgerdr") $(exists "$STATE/plugin-azdo@azdospec") $(exists "$HOME/.local/state/forgerdr/herdr-installed.json")"

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
unset FAKE_BREW_STUCK

answers ''
run uninstall.sh
expect "only what is still there is listed" "yes no" "$(contains "$out" " 1  GitHub CLI (gh)") $(contains "$out" " 2  ")"

# A fresh openSUSE desktop: zypper, sudo, its fonts, git, Claude Code and the herdr app; npm's prefix is the system's.
export HOME="$sandbox/suse" FAKE_OS=Linux FAKE_NPM_PREFIX=/usr
rm -rf "$FAKES" "$STATE"
mkdir -p "$HOME" "$FAKES" "$STATE"
for fake in uname zypper sudo curl claude fc-list; do stub "$fake" "$fake"; done
for fake in herdr-app hc git fc-cache; do stub tool "$fake"; done
answers ''

run install.sh
expect "openSUSE: a fresh machine gets everything" "0 yes yes" "$status $(contains "$out" "16 installed") $(contains "$out" "0 failed")"
expect "through zypper, node and npm in one go, unzip for the font" "6 1" "$(called '^zypper .*install') $(called '^zypper .*install .*nodejs-default npm-default')"
expect "the global npm packages through sudo" "1 1" "$(called '^sudo npm install -g pnpm') $(called '^sudo npm install -g @fission-ai/openspec')"
expect "engram from its release, the font into the fonts folder" "yes yes" \
  "$(exists "$HOME/.local/bin/engram") $(exists "$HOME/.local/share/fonts/maple-mono-nf/MapleMono-NF-Regular.ttf")"
expect "and the font is seen among thousands" yes "$(contains "$out" "Maple Mono NF font       installed")"

run install.sh
expect "openSUSE: another run installs nothing" "0 yes 0 0" "$status $(contains "$out" "16 already here") $(called '^zypper .*install') $(called '^curl')"

answers 'all\ny\n'
run uninstall.sh
expect "openSUSE: everything ticked goes" "0 yes yes" "$status $(contains "$out" "16 removed") $(contains "$out" "0 still installed")"
expect "zypper takes its packages back" "1 1" "$(called '^zypper remove --clean-deps azure-cli') $(called '^zypper remove --clean-deps nodejs-default npm-default')"
expect "and the font goes" no "$(exists "$HOME/.local/share/fonts/maple-mono-nf")"

[ "$failures" = 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all passed\n'
