#!/usr/bin/env bash
# the forgerdr bootstrap: the tools a fresh machine needs before installing the plugin.
# macOS (Homebrew) and openSUSE Tumbleweed (zypper). Idempotent: every step is skipped when its tool is already there.
#
#   curl -fsSL https://raw.githubusercontent.com/Gn0m0-dei/the-forgerdr/main/install.sh | bash
set -euo pipefail

main() {
  local os
  case "$(uname -s)" in
    Darwin) os=mac ;;
    Linux)
      command -v zypper >/dev/null 2>&1 || die "only macOS and openSUSE Tumbleweed are supported; install the tools listed in README.md by hand"
      os=suse ;;
    *) die "unsupported OS $(uname -s)" ;;
  esac

  mkdir -p "$HOME/.local/bin"
  case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH"; note "add $HOME/.local/bin to PATH in your shell rc" ;; esac

  step "packages"
  if [ "$os" = mac ]; then
    command -v brew >/dev/null 2>&1 || die "install Homebrew first: https://brew.sh"
    brew_install git git
    brew_install jq jq
    brew_install node node
    brew_install pnpm pnpm
    brew_install az azure-cli
    brew_install gh gh
    brew_install glab glab
    command -v engram >/dev/null 2>&1 || { brew tap gentleman-programming/tap; brew trust gentleman-programming/tap >/dev/null 2>&1 || true; brew install gentleman-programming/tap/engram; }
  else
    zypper_install git git
    zypper_install jq jq
    zypper_install node nodejs22
    zypper_install npm npm22
    zypper_install az azure-cli
    zypper_install gh gh
    zypper_install glab glab
    command -v pnpm >/dev/null 2>&1 || npm install -g pnpm
    command -v engram >/dev/null 2>&1 || github_binary Gentleman-Programming/engram engram
  fi

  step "azure-devops extension"
  az extension show --name azure-devops >/dev/null 2>&1 || az extension add --name azure-devops

  step "herdr"
  command -v herdr >/dev/null 2>&1 || curl -fsSL https://herdr.dev/install.sh | sh

  step "claude code"
  command -v claude >/dev/null 2>&1 || curl -fsSL https://claude.ai/install.sh | bash

  step "codebase-memory-mcp"
  [ -x "$HOME/.local/bin/codebase-memory-mcp" ] || curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash -s -- --skip-config

  step "done"
  cat <<'NEXT'
Open Claude Code in any project and run:

  /plugin marketplace add Gn0m0-dei/the-forgerdr
  /plugin install forgerdr@the-forgerdr
  /forgerdr:setup

Sign in when asked: az login · gh auth login · glab auth login
NEXT
}

step() { printf '\n==> %s\n' "$1"; }
note() { printf '    note: %s\n' "$1"; }
die() { printf 'install: %s\n' "$1" >&2; exit 1; }

brew_install() {
  command -v "$1" >/dev/null 2>&1 && return 0
  brew install "$2"
}

zypper_install() {
  command -v "$1" >/dev/null 2>&1 && return 0
  sudo zypper --non-interactive install "$2" || note "zypper could not install $2; install it by hand"
}

# Latest GitHub release tarball of a Go binary for this os/arch, into ~/.local/bin.
github_binary() {
  local repo="$1" name="$2" arch tag url tmp
  case "$(uname -m)" in x86_64|amd64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; *) die "unsupported arch $(uname -m)" ;; esac
  tag="$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest" | jq -r '.tag_name')"
  url="https://github.com/$repo/releases/download/$tag/${name}_${tag#v}_linux_${arch}.tar.gz"
  tmp="$(mktemp -d)"
  curl -fsSL "$url" | tar -xz -C "$tmp"
  install -m 755 "$(find "$tmp" -type f -name "$name" | head -n 1)" "$HOME/.local/bin/$name"
  rm -rf "$tmp"
}

main "$@"
