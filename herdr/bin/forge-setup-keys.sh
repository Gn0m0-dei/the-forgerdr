#!/usr/bin/env bash
# Installs the forgerdr keybindings in the herdr config, replacing a previous block.
set -euo pipefail

config="${HERDR_CONFIG_PATH:-$HOME/.config/herdr/config.toml}"
begin="# BEGIN gn0m0dei.forgerdr — managed by setup-keys; edit via the plugin, not by hand"
end="# END gn0m0dei.forgerdr"

[ -f "$config" ] || { printf "forgerdr: herdr config not found at %s\n" "$config" >&2; exit 1; }
if grep -qF "$begin" "$config"; then
  awk -v begin="$begin" -v end="$end" '$0 == begin { skip = 1 } !skip { print } $0 == end { skip = 0 }' "$config" > "$config.tmp"
  mv "$config.tmp" "$config"
fi

cat >> "$config" <<EOT

$begin
[[keys.command]]
key = "prefix+shift+p"
type = "plugin_action"
command = "gn0m0dei.forgerdr.review"
description = "forgerdr: review pull requests"

[[keys.command]]
key = "prefix+shift+t"
type = "plugin_action"
command = "gn0m0dei.forgerdr.worktree"
description = "forgerdr: work items in worktrees"
$end
EOT
printf 'forgerdr keybindings written to %s\n' "$config"
