#!/usr/bin/env bash
# Reads and writes the forgerdr settings file (~/.config/forgerdr/config.toml).
# Usage: forge-config.sh get <setting> [project-key]
#        forge-config.sh set <setting> <value> [project-key]
# A value set with a project key overrides the global one for that project. Settings: spec.
set -euo pipefail

config="${FORGERDR_CONFIG:-$HOME/.config/forgerdr/config.toml}"
action="${1:-}"; setting="${2:-}"

die() { printf 'forge-config: %s\n' "$1" >&2; exit 1; }
[ -n "$setting" ] || die "usage: forge-config.sh get|set <setting> [value] [project-key]"
case "$setting" in spec) ;; *) die "unknown setting $setting (known: spec)" ;; esac

# Reads one key from one table: table "" for the top-level [<setting>] table, or "projects" for [<setting>.projects].
read_key() {
  local table="$1" key="$2" header
  [ -f "$config" ] || return 0
  if [ -z "$table" ]; then header="[$setting]"; else header="[$setting.$table]"; fi
  awk -v header="$header" -v key="$key" '
    /^\[/ { inside = ($0 == header) }
    inside && $1 == key && $2 == "=" { value = $0; sub(/^[^=]*=[[:space:]]*"/, "", value); sub(/"[[:space:]]*$/, "", value); print value; exit }
  ' "$config"
}

write_key() {
  local table="$1" key="$2" value="$3" header
  if [ -z "$table" ]; then header="[$setting]"; else header="[$setting.$table]"; fi
  mkdir -p "$(dirname "$config")"
  touch "$config"
  awk -v header="$header" -v key="$key" -v value="$value" '
    function emit() { if (!done) { print key " = \"" value "\""; done = 1 } }
    /^\[/ { if (inside && !done) emit(); inside = ($0 == header); seen = seen || inside }
    inside && $1 == key && $2 == "=" { emit(); next }
    { print }
    END { if (inside && !done) emit(); if (!seen) { print ""; print header; emit() } }
  ' "$config" > "$config.tmp"
  mv "$config.tmp" "$config"
}

case "$action" in
  get)
    project="${3:-}"
    value=""
    [ -n "$project" ] && value="$(read_key projects "$project")"
    [ -n "$value" ] || value="$(read_key "" default)"
    printf '%s\n' "${value:-chat}" ;;
  set)
    value="${3:-}"; project="${4:-}"
    [ -n "$value" ] || die "usage: forge-config.sh set <setting> <value> [project-key]"
    case "$value" in chat|openspec|openspec:*|azure) ;; *) die "unknown spec mode $value (chat | openspec | openspec:<store> | azure)" ;; esac
    if [ -n "$project" ]; then write_key projects "$project" "$value"; else write_key "" default "$value"; fi
    printf '%s %s = %s\n' "$setting" "${project:-default}" "$value" ;;
  *) die "usage: forge-config.sh get|set <setting> [value] [project-key]" ;;
esac
