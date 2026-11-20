#!/usr/bin/env bash
# the forgerdr uninstaller: lists what install.sh installs that is on this machine, removes the pieces you tick, and
# names whatever could not be removed. Claude Code, the herdr app, git and your data stay.
#
#   curl -fsSL https://raw.githubusercontent.com/Gn0m0-dei/the-forgerdr/main/uninstall.sh | bash
#
# install.sh is the one place that knows the pieces, so this runs it with --uninstall: the one beside this file in a
# checkout, the repository's when this comes through a pipe.
set -euo pipefail

main() {
  case "${BASH_SOURCE[0]:-}" in
    *uninstall.sh) exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install.sh" --uninstall ;;
  esac
  curl -fsSL https://raw.githubusercontent.com/Gn0m0-dei/the-forgerdr/main/install.sh | bash -s -- --uninstall
}

main "$@"
