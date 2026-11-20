#!/usr/bin/env bash
# the forgerdr installer: everything forgerdr needs around Claude Code, the herdr app and git, which come first.
# macOS (Homebrew) and openSUSE Tumbleweed (zypper). It shows what is here and what it will install, asks, and installs
# what is missing, a line a piece; what is here is left as it is, so another run changes nothing. A piece that fails does
# not stop the rest, and the summary names it. The commands' own output goes to the log, not to the terminal.
#
#   curl -fsSL https://raw.githubusercontent.com/Gn0m0-dei/the-forgerdr/main/install.sh | bash
#
# uninstall.sh takes away the pieces you pick, through install.sh --uninstall: this file is the one place that knows
# them. Claude Code, the herdr app, git and your data are never touched. NO_COLOR turns the colours off.
set -euo pipefail

readonly LOCAL_BIN="$HOME/.local/bin"
# shellcheck disable=SC2016 # written as is, for the shell rc to expand
readonly PATH_LINE='export PATH="$HOME/.local/bin:$PATH" # forgerdr'
readonly LINUX_FONT_DIR="$HOME/.local/share/fonts/maple-mono-nf"
readonly STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/forgerdr"
readonly LOOK_MANIFEST="$STATE_DIR/herdr-installed.json"
readonly STATUSLINE_COPY="${XDG_DATA_HOME:-$HOME/.local/share}/forgerdr/forge-statusline.sh"
readonly CLAUDE_SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
# Where questions are answered: the terminal, which stays the keyboard when this script comes through a pipe (the
# tests point it at a file of answers).
readonly TTY="${FORGE_TTY:-/dev/tty}"
# Every piece, in the order they are installed; uninstalling goes the other way, so a piece goes before what it needs.
readonly PIECES=(path jq node pnpm az devops gh glab engram openspec codebase-memory font forgerdr azdo look statusline)

mode=install
os=""
local_bin_missing=""
has_tty=""
log=""
animate=""
bold="" dim="" reset="" green="" red="" amber="" accent="" ember="" white_hot=""

main() {
  case "${1:-}" in
    "") ;;
    --uninstall) mode=uninstall ;;
    *) printf 'usage: install.sh [--uninstall]\n' >&2; exit 2 ;;
  esac
  paint
  banner
  case "$(uname -s)" in
    Darwin) os=mac ;;
    Linux)
      have zypper || die "only macOS and openSUSE Tumbleweed are supported: install what README.md lists by hand"
      os=suse ;;
    *) die "$(uname -s) is not supported: macOS and openSUSE Tumbleweed are" ;;
  esac
  case ":$PATH:" in *":$LOCAL_BIN:"*) ;; *) export PATH="$LOCAL_BIN:$PATH"; local_bin_missing=1 ;; esac
  if { exec 3< "$TTY"; } 2>/dev/null; then has_tty=1; fi
  mkdir -p "$STATE_DIR"
  log="$STATE_DIR/$mode.log"
  : > "$log"
  if [ "$mode" = install ]; then run_install; else run_uninstall; fi
}

# --- install ---------------------------------------------------------------------------------------------------------

run_install() {
  local piece pending=() installed=0 here=0 failed=() blocker
  check_prerequisites
  mkdir -p "$LOCAL_BIN"

  step "THE PLAN"
  for piece in "${PIECES[@]}"; do
    if present "$piece"; then ok "$(name "$piece")" "here"; else todo "$(name "$piece")" "to install"; pending+=("$piece"); fi
  done
  [ "${#pending[@]}" -gt 0 ] || note "Everything is here: forgerdr's look and status line are brought up to date."
  confirm "Go ahead? [Y/n]" yes || { note "Nothing changed."; exit 0; }
  if [ "$os" = suse ] && [ "${#pending[@]}" -gt 0 ] && any_uses_sudo "${pending[@]}"; then keep_sudo; fi

  step "INSTALLING"
  for piece in "${PIECES[@]}"; do
    if present "$piece"; then
      case "$piece" in
        look|statusline)
          if quietly "updating $(name "$piece")" refresh_piece "$piece"; then ok "$(name "$piece")" "up to date"
          else bad "$(name "$piece")" "could not update it"; show_failure; failed+=("$(name "$piece")"); fi ;;
        *) ok "$(name "$piece")" "already here" ;;
      esac
      here=$((here + 1))
      continue
    fi
    blocker="$(needs "$piece")"
    if [ -n "$blocker" ] && ! present "$blocker"; then
      bad "$(name "$piece")" "skipped: needs $(name "$blocker")"
      failed+=("$(name "$piece")")
    elif quietly "installing $(name "$piece")" install_piece "$piece" && present "$piece"; then
      ok "$(name "$piece")" "$(installed_detail "$piece")"
      installed=$((installed + 1))
    else
      bad "$(name "$piece")" "$(failed_detail "$piece")"
      show_failure
      failed+=("$(name "$piece")")
    fi
  done

  sign_ins

  step "SUMMARY"
  rule
  printf '   %s✓ %s installed%s   %s✓ %s already here%s   %s✗ %s failed%s\n' \
    "$green" "$installed" "$reset" "$green" "$here" "$reset" "$([ "${#failed[@]}" = 0 ] && printf '%s' "$dim" || printf '%s' "$red")" \
    "${#failed[@]}" "$reset"
  rule
  if [ "${#failed[@]}" -gt 0 ]; then
    printf '   %sStill missing:%s %s\n' "$red" "$reset" "$(join "${failed[@]}")"
    note "The log says why: $(tilde "$log")"
    note "Fix it and run this again: what is here is skipped."
    exit 1
  fi
  printf '\n   %s▸%s Open the herdr app: %sctrl-shift-l%s switches to the forgerdr layout.\n' "$ember" "$reset" "$bold" "$reset"
  printf '   %s▸%s Start Claude Code in one of its terminals.\n' "$ember" "$reset"
  printf '   %s▸%s %s/forgerdr:setup%s checks every piece whenever you want.\n' "$ember" "$reset" "$bold" "$reset"
  printf '   %s▸%s The log: %s\n\n' "$ember" "$reset" "$(tilde "$log")"
}

check_prerequisites() {
  local missing=0
  step "PREREQUISITES"
  prerequisite "Claude Code" claude "https://claude.com/claude-code" || missing=1
  prerequisite "herdr app" herdr-app "https://herdr.dev/download/" || missing=1
  prerequisite "herdr-core (hc)" hc "it comes with the herdr app" || missing=1
  prerequisite git git "your package manager has it" || missing=1
  [ "$os" != mac ] || prerequisite Homebrew brew "https://brew.sh" || missing=1
  [ "$missing" = 0 ] || die "Install what is missing first, then run this again."
}

prerequisite() {
  if have "$2"; then ok "$1" "$(command -v "$2")"; return 0; fi
  bad "$1" "missing: $3"
  return 1
}

install_piece() {
  case "$1" in
    path) local_bin_in_rc ;;
    jq|gh|glab) package_install "$1" ;;
    az) package_install azure-cli ;;
    node) if [ "$os" = mac ]; then brew install node; else package_install nodejs-default npm-default; fi ;;
    pnpm) if [ "$os" = mac ]; then brew install pnpm; else npm_global install pnpm; fi ;;
    devops) az extension add --name azure-devops ;;
    engram) if [ "$os" = mac ]; then brew_engram; else github_binary Gentleman-Programming/engram engram; fi ;;
    openspec) npm_global install @fission-ai/openspec ;;
    codebase-memory) fetch https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash -s -- --skip-config ;;
    font) if [ "$os" = mac ]; then brew install --cask font-maple-mono-nf; else linux_font; fi ;;
    forgerdr) plugin_add the-forgerdr Gn0m0-dei/the-forgerdr forgerdr@the-forgerdr ;;
    azdo) plugin_add azdospec Gn0m0-dei/azdospec azdo@azdospec ;;
    # The first time, it also shows the layout if the app is open.
    look) "$(plugin_root)/bin/forge-herdr-install.sh" --sounds --switch ;;
    statusline) "$(plugin_root)/bin/forge-statusline.sh" install ;;
  esac
}

# forgerdr's look and status line update themselves from the plugin: what you changed by hand stays.
refresh_piece() {
  case "$1" in
    look) "$(plugin_root)/bin/forge-herdr-install.sh" --sounds ;;
    statusline) "$(plugin_root)/bin/forge-statusline.sh" install ;;
  esac
}

# The piece another one cannot be installed without.
needs() {
  case "$1" in
    devops) printf az ;;
    openspec) printf node ;;
    pnpm) if [ "$os" = suse ]; then printf node; fi ;;
    look|statusline) printf forgerdr ;;
  esac
}

installed_detail() {
  case "$1" in
    path) printf 'added to %s: open a new terminal' "$(tilde "$(shell_rc)")" ;;
    *) printf installed ;;
  esac
}

failed_detail() {
  case "$1" in
    path) if [ -z "$(shell_rc)" ]; then printf 'your shell is not zsh or bash: add %s to its PATH' "$LOCAL_BIN"; return; fi ;;
  esac
  printf 'failed'
}

sign_ins() {
  local tool
  step "SIGN-INS"
  for tool in az gh glab; do
    have "$tool" || continue
    if signed_in "$tool"; then ok "$(provider "$tool")" "signed in"; continue; fi
    if confirm "Sign in to $(provider "$tool") now, with $(login_command "$tool")? [y/N]" no; then
      if login "$tool"; then ok "$(provider "$tool")" "signed in"; else bad "$(provider "$tool")" "did not finish: run $(login_command "$tool") later"; fi
    else
      todo "$(provider "$tool")" "not now: run $(login_command "$tool") when you need it"
    fi
  done
}

signed_in() {
  case "$1" in
    az) az account show ;;
    *) "$1" auth status ;;
  esac >/dev/null 2>&1
}

login() {
  case "$1" in
    az) az login <&3 ;;
    *) "$1" auth login <&3 ;;
  esac
}

provider() { case "$1" in az) printf 'Azure DevOps' ;; gh) printf GitHub ;; glab) printf GitLab ;; esac; }
login_command() { case "$1" in az) printf 'az login' ;; *) printf '%s auth login' "$1" ;; esac; }

# --- uninstall -------------------------------------------------------------------------------------------------------

run_uninstall() {
  local listed=() picked=() still=() piece answer index removed=0
  tty_ok || die "Uninstalling asks what to remove: run it from a terminal."

  step "WHAT IS HERE"
  for piece in "${PIECES[@]}"; do
    if present "$piece"; then listed+=("$piece"); fi
  done
  if [ "${#listed[@]}" -eq 0 ]; then
    note "Nothing install.sh installs is on this machine."
    return 0
  fi
  note "A tool you had before is listed too: pick only what you want gone."
  note "Claude Code, the herdr app, git and your data stay."
  printf '\n'
  checklist "" "${listed[@]}"

  while :; do
    answer="$(ask "Numbers to remove, separated by spaces (all for every one, Enter for none):")"
    [ "$answer" != all ] || answer="$(seq -s ' ' 1 "${#listed[@]}")"
    valid_picks "$answer" "${#listed[@]}" && break
    note "Only numbers from 1 to ${#listed[@]}, or all."
  done
  index=0
  for piece in "${listed[@]}"; do
    index=$((index + 1))
    case " $answer " in *" $index "*) picked+=("$piece") ;; esac
  done
  if [ "${#picked[@]}" -eq 0 ]; then
    note "Nothing picked, nothing removed."
    return 0
  fi

  step "TO REMOVE"
  checklist " ${picked[*]} " "${listed[@]}"
  confirm "Remove the ones ticked? [y/N]" no || { note "Nothing removed."; return 0; }
  if [ "$os" = suse ] && any_uses_sudo "${picked[@]}"; then keep_sudo; fi

  step "REMOVING"
  for ((index = ${#PIECES[@]} - 1; index >= 0; index--)); do
    piece="${PIECES[index]}"
    case " ${picked[*]} " in *" $piece "*) ;; *) continue ;; esac
    if removal_asks "$piece"; then
      printf '   %s▸%s %s: zypper asks before it removes anything\n' "$ember" "$reset" "$(name "$piece")"
      remove_piece "$piece" || true
    else
      quietly "removing $(name "$piece")" remove_piece "$piece" || true
    fi
    if present "$piece"; then
      bad "$(name "$piece")" "still installed"
      removal_asks "$piece" || show_failure
      still+=("$(name "$piece")")
    else
      ok "$(name "$piece")" "removed"
      removed=$((removed + 1))
    fi
  done

  step "SUMMARY"
  rule
  printf '   %s✓ %s removed%s   %s✗ %s still installed%s\n' "$green" "$removed" "$reset" \
    "$([ "${#still[@]}" = 0 ] && printf '%s' "$dim" || printf '%s' "$red")" "${#still[@]}" "$reset"
  rule
  note "Kept: Claude Code, the herdr app, git and your data."
  if [ "${#still[@]}" -gt 0 ]; then
    printf '   %sStill installed:%s %s\n' "$red" "$reset" "$(join "${still[@]}")"
    note "The log says why: $(tilde "$log")"
    exit 1
  fi
  printf '\n'
}

# The pieces, numbered, ticked when they are in the first argument (a space-separated list padded with spaces).
checklist() {
  local ticked="$1" piece index=0 mark
  shift
  for piece in "$@"; do
    index=$((index + 1))
    mark=" "
    case "$ticked" in *" $piece "*) mark="${ember}x${reset}" ;; esac
    printf '   [%s] %2d  %-24s %s%s%s\n' "$mark" "$index" "$(name "$piece")" "$dim" "$(about "$piece")" "$reset"
  done
}

valid_picks() {
  local number
  for number in $1; do
    [[ "$number" =~ ^[0-9]+$ ]] && [ "$number" -ge 1 ] && [ "$number" -le "$2" ] || return 1
  done
}

remove_piece() {
  case "$1" in
    path) rc_without_local_bin ;;
    jq|gh|glab) package_remove "$1" ;;
    node) if [ "$os" = mac ]; then brew uninstall node; else package_remove nodejs-default npm-default; fi ;;
    pnpm) if [ "$os" = mac ]; then brew uninstall pnpm; else npm_global uninstall pnpm; fi ;;
    az) package_remove azure-cli ;;
    devops) az extension remove --name azure-devops ;;
    engram) if [ "$os" = mac ]; then brew uninstall gentleman-programming/tap/engram; else rm -f "$LOCAL_BIN/engram"; fi ;;
    openspec) npm_global uninstall @fission-ai/openspec ;;
    codebase-memory) "$LOCAL_BIN/codebase-memory-mcp" uninstall -y ;;
    font) if [ "$os" = mac ]; then brew uninstall --cask font-maple-mono-nf; else rm -rf "$LINUX_FONT_DIR" && fc-cache -f; fi ;;
    forgerdr) plugin_remove the-forgerdr forgerdr@the-forgerdr ;;
    azdo) plugin_remove azdospec azdo@azdospec ;;
    look) "$(plugin_root)/bin/forge-herdr-install.sh" --remove ;;
    statusline) bash "$STATUSLINE_COPY" remove ;;
  esac
}

# zypper shows what goes with a package and asks, on the terminal.
removal_asks() {
  [ "$os" = suse ] || return 1
  case "$1" in
    jq|gh|glab|node|az) return 0 ;;
    *) return 1 ;;
  esac
}

# --- the pieces ------------------------------------------------------------------------------------------------------

name() {
  # shellcheck disable=SC2088 # the path is shown, not expanded
  case "$1" in
    path) printf '~/.local/bin on PATH' ;;
    node) printf 'Node.js + npm' ;;
    az) printf 'Azure CLI (az)' ;;
    devops) printf 'azure-devops extension' ;;
    gh) printf 'GitHub CLI (gh)' ;;
    glab) printf 'GitLab CLI (glab)' ;;
    openspec) printf 'OpenSpec CLI' ;;
    codebase-memory) printf 'codebase-memory-mcp' ;;
    font) printf 'Maple Mono NF font' ;;
    forgerdr) printf 'forgerdr plugin' ;;
    azdo) printf 'azdo plugin' ;;
    look) printf 'forgerdr look in herdr' ;;
    statusline) printf 'forgerdr status line' ;;
    *) printf '%s' "$1" ;;
  esac
}

# What removing a piece takes with it, or leaves.
about() {
  case "$1" in
    path) printf 'the line install.sh added to %s' "$(tilde "$(shell_rc)")" ;;
    node) printf 'whatever else runs on it stops' ;;
    devops) printf 'of az' ;;
    engram) printf 'your memories in ~/.engram stay' ;;
    codebase-memory) printf 'and its code indexes' ;;
    forgerdr) printf 'and its marketplace, the-forgerdr' ;;
    azdo) printf 'and its marketplace, azdospec' ;;
    look) printf 'its layout, mod and alert sounds' ;;
    statusline) printf 'the one you had before comes back' ;;
  esac
}

# Asked of the disk each time: bash remembers where a command was even after it is removed.
present() {
  hash -r
  case "$1" in
    path) grep -qsxF "$PATH_LINE" "$(shell_rc)" || { [ "$mode" = install ] && [ -z "$local_bin_missing" ]; } ;;
    node) have node && npm --version >/dev/null 2>&1 ;;
    devops) have az && az extension show --name azure-devops >/dev/null 2>&1 ;;
    codebase-memory) [ -x "$LOCAL_BIN/codebase-memory-mcp" ] ;;
    font) if [ "$os" = mac ]; then brew list --cask font-maple-mono-nf >/dev/null 2>&1; else fc-list 2>/dev/null | grep "Maple Mono NF" >/dev/null; fi ;;
    forgerdr) plugin_installed forgerdr@the-forgerdr ;;
    azdo) plugin_installed azdo@azdospec ;;
    look) [ -f "$LOOK_MANIFEST" ] ;;
    statusline) grep -qs forge-statusline "$CLAUDE_SETTINGS" ;;
    *) have "$1" ;;
  esac
}

any_uses_sudo() {
  local piece
  for piece in "$@"; do
    case "$piece" in jq|node|pnpm|az|gh|glab|openspec|font) return 0 ;; esac
  done
  return 1
}

# --- how ----------------------------------------------------------------------------------------------------------------

have() { command -v "$1" >/dev/null 2>&1; }

# A download that fails says why, in the log.
fetch() { curl --fail --silent --show-error --location "$@"; }

package_install() {
  if [ "$os" = mac ]; then brew install "$@"; else sudo zypper --non-interactive install "$@"; fi
}

package_remove() {
  if [ "$os" = mac ]; then brew uninstall "$@"; else sudo zypper remove --clean-deps "$@" <&3; fi
}

brew_engram() {
  brew tap gentleman-programming/tap
  brew trust gentleman-programming/tap >/dev/null 2>&1 || true
  brew install gentleman-programming/tap/engram
}

# Through sudo when npm's prefix is the system's (/usr on openSUSE), as zypper's packages are.
npm_global() {
  if [ -w "$(npm config get prefix)" ]; then npm "$1" -g "$2"; else sudo npm "$1" -g "$2"; fi
}

# sudo asked once, before the spinners, and kept fresh until the end.
keep_sudo() {
  sudo -n true 2>/dev/null && return 0
  printf '\n   %s▸%s zypper needs sudo: asked once now.\n' "$ember" "$reset"
  local keeper
  sudo -v || die "Without sudo, zypper cannot install or remove anything."
  while sleep 50; do sudo -n true 2>/dev/null || exit 0; done &
  keeper=$!
  # shellcheck disable=SC2064 # the keeper's pid, as it is now
  trap "kill $keeper 2>/dev/null || true" EXIT
}

shell_rc() {
  case "$(basename "${SHELL:-}")" in
    zsh) printf '%s' "$HOME/.zshrc" ;;
    bash) printf '%s' "$HOME/.bashrc" ;;
  esac
}

local_bin_in_rc() {
  local rc
  rc="$(shell_rc)"
  [ -n "$rc" ] || return 1
  printf '\n%s\n' "$PATH_LINE" >> "$rc"
}

rc_without_local_bin() {
  local rc
  rc="$(shell_rc)"
  { grep -vxF "$PATH_LINE" "$rc" || true; } > "$rc.forgerdr" && cat "$rc.forgerdr" > "$rc" && rm -f "$rc.forgerdr"
}

# grep reads the whole list: grep -q would stop at the match, and under pipefail the writer's SIGPIPE fails the check.
marketplace_added() { claude plugin marketplace list --json 2>/dev/null | grep -E "\"name\": *\"$1\"" >/dev/null; }
plugin_installed() { claude plugin list --json 2>/dev/null | grep "\"$1\"" >/dev/null; }

# A plugin from its marketplace on GitHub, for the user.
plugin_add() {
  marketplace_added "$1" || claude plugin marketplace add --scope user "$2" || return
  claude plugin install --scope user "$3"
}

plugin_remove() {
  claude plugin uninstall --scope user "$2" && claude plugin marketplace remove "$1"
}

# Where Claude Code keeps the installed forgerdr plugin; empty when it is not installed.
plugin_root() {
  claude plugin list --json 2>/dev/null | jq -r '.[] | select(.id == "forgerdr@the-forgerdr") | .installPath' 2>/dev/null || true
}

# The terminal font of the forgerdr layout for the herdr app, from its release: openSUSE has no package of it.
linux_font() {
  local tmp status
  have unzip || sudo zypper --non-interactive install unzip || return
  have fc-cache || sudo zypper --non-interactive install fontconfig || return
  tmp="$(mktemp -d)"
  fetch https://github.com/subframe7536/maple-font/releases/latest/download/MapleMono-NF.zip -o "$tmp/font.zip" \
    && mkdir -p "$LINUX_FONT_DIR" && unzip -oq "$tmp/font.zip" '*.ttf' -d "$LINUX_FONT_DIR" && fc-cache -f "$LINUX_FONT_DIR"
  status=$?
  rm -rf "$tmp"
  return "$status"
}

# Latest GitHub release tarball of a Go binary for this os/arch, into ~/.local/bin.
github_binary() {
  local repo="$1" name="$2" arch tag url tmp status
  case "$(uname -m)" in x86_64|amd64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; *) printf 'no build for %s\n' "$(uname -m)"; return 1 ;; esac
  tag="$(fetch "https://api.github.com/repos/$repo/releases/latest" | jq -r '.tag_name')"
  url="https://github.com/$repo/releases/download/$tag/${name}_${tag#v}_linux_${arch}.tar.gz"
  tmp="$(mktemp -d)"
  fetch "$url" | tar -xz -C "$tmp" && install -m 755 "$(find "$tmp" -type f -name "$name" | head -n 1)" "$LOCAL_BIN/$name"
  status=$?
  rm -rf "$tmp"
  return "$status"
}

# --- the screen ----------------------------------------------------------------------------------------------------------

# Colours and the spinner only on a terminal that wants them (no-color.org). The colours are forgerdr's: the forge's
# from its brand, the states' from its forge-night theme; in true colour when the terminal says it has it, else the
# nearest of the 256.
paint() {
  if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != dumb ]; then
    bold=$'\033[1m' reset=$'\033[0m'
    dim="$(tint 110 104 118 242)" green="$(tint 143 207 122 114)" red="$(tint 240 96 122 204)"
    amber="$(tint 245 180 60 215)" accent="$(tint 111 168 255 75)" ember="$(tint 255 107 26 202)"
    white_hot="$(tint 255 243 214 230)"
    animate=1
  fi
}

tint() {
  case "${COLORTERM:-}" in
    truecolor|24bit) printf '\033[38;2;%s;%s;%sm' "$1" "$2" "$3" ;;
    *) printf '\033[38;5;%sm' "$4" ;;
  esac
}

banner() {
  # The logo cools from white-hot to deep ember, row by row.
  local heat=("255 243 214 230" "244 211 94 221" "255 179 71 215" "229 169 59 179" "255 107 26 202" "184 56 12 130") row=0 line
  printf '\n'
  while IFS= read -r line; do
    # shellcheck disable=SC2086 # the row's heat is four numbers for tint
    if [ -n "$reset" ]; then printf '  %s%s%s\n' "$(tint ${heat[row]})" "$line" "$reset"; else printf '  %s\n' "$line"; fi
    row=$((row + 1))
  done <<'LOGO'
███████╗ ██████╗ ██████╗  ██████╗ ███████╗██████╗ ██████╗ ██████╗
██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝██╔══██╗██╔══██╗██╔══██╗
█████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ██████╔╝██║  ██║██████╔╝
██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ██╔══██╗██║  ██║██╔══██╗
██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗██║  ██║██████╔╝██║  ██║
╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝
LOGO
  printf '  %s░▒▓█%s %sFORGE ONCE. HERD MANY.%s %s█▓▒░%s   %s%s%s\n' \
    "$ember" "$reset" "$bold$white_hot" "$reset" "$ember" "$reset" "$dim" "the-forgerdr · $mode" "$reset"
}

step() { printf '\n  %s━━▶%s %s%s%s\n' "$ember" "$reset" "$bold" "$1" "$reset"; }
rule() { printf '   %s════════════════════════════════════════════════════════════%s\n' "$ember" "$reset"; }
line() {
  printf '   %s%s%s %-24s %s%s%s\n' "$1" "$2" "$reset" "$3" "$4" "$5" "$reset"
  [ -z "$log" ] || printf '=> %s %s: %s\n' "$2" "$3" "$5" >> "$log"
}
ok() { line "$green" "✓" "$1" "$dim" "${2:-}"; }
bad() { line "$red" "✗" "$1" "$red" "${2:-}"; }
todo() { line "$amber" "•" "$1" "$amber" "${2:-}"; }
note() { printf '   %s%s%s\n' "$dim" "$1" "$reset"; }
die() { printf '\n   %s✗ %s%s\n\n' "$red" "$1" "$reset" >&2; exit 1; }
join() { local IFS=,; printf '%s' "$*" | sed 's/,/, /g'; }
tilde() { local home="~"; printf '%s' "${1/#$HOME/$home}"; }

# Runs a piece's commands with their output in the log, and a spinner meanwhile on a terminal.
quietly() {
  local title="$1" frames="|/-\\" frame=0 pid
  shift
  printf '\n### %s\n' "$title" >> "$log"
  if [ -z "$animate" ]; then
    "$@" >> "$log" 2>&1
    return
  fi
  "$@" >> "$log" 2>&1 &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    printf '\r   %s%s%s %s…' "$ember" "${frames:frame:1}" "$reset" "$title"
    frame=$(((frame + 1) % 4))
    sleep 0.1
  done
  printf '\r\033[K'
  wait "$pid"
}

# The last lines the failed piece's own commands left in the log, after its ### header.
show_failure() {
  # shellcheck disable=SC2016 # a sed script: $ is its last line
  sed -n '/^### /{h;d;};H;${x;p;}' "$log" | grep -v -e '^### ' -e '^=> ' -e '^ *$' | tail -n 3 \
    | while IFS= read -r line; do printf '       %s%s%s\n' "$dim" "$line" "$reset"; done
}

tty_ok() { [ -n "$has_tty" ]; }

ask() {
  local answer=""
  printf '\n   %s?%s %s ' "$accent" "$reset" "$1" >&2
  read -r answer <&3 || true
  printf '%s' "$answer"
}

# A yes or a no on the terminal, Enter taking the default; with no terminal, the default.
confirm() {
  local answer
  tty_ok || { [ "$2" = yes ]; return; }
  answer="$(ask "$1")"
  case "$answer" in
    [yY]*) return 0 ;;
    "") [ "$2" = yes ] ;;
    *) return 1 ;;
  esac
}

main "$@"
