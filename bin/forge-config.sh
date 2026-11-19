#!/usr/bin/env bash
# Reads and writes the forgerdr settings file (~/.config/forgerdr/config.toml).
# Usage: forge-config.sh get <setting> [project-key]
#        forge-config.sh set <setting> <value> [project-key]
# A value set with a project key overrides the global one for that project. Settings:
#   spec     where /forgerdr:spec, plan, build and ship keep the design: chat | openspec | openspec:<store> | azure
#   mode     how the forge works, as the herdr app's forge mode shows it: a spec mode, or github | gitlab (whose design
#            stays in the chat). Setting it sets spec too; read while spec still agrees with it, else spec is the mode.
#   backlog  where a forge's work comes from when it is not its repository: a GitHub repository, a GitLab project or an
#            Azure DevOps project, by its URL (https://dev.azure.com/<org>/<project>); empty when unset
set -euo pipefail

config="${FORGERDR_CONFIG:-$HOME/.config/forgerdr/config.toml}"
action="${1:-}"; setting="${2:-}"

die() { printf 'forge-config: %s\n' "$1" >&2; exit 1; }
[ -n "$setting" ] || die "usage: forge-config.sh get|set <setting> [value] [project-key]"
case "$setting" in spec|mode|backlog) ;; *) die "unknown setting $setting (known: spec, mode, backlog)" ;; esac

# Reads one key from one table of a setting: table "" for the top-level [<setting>] table, or "projects" for
# [<setting>.projects].
read_key() {
  local name="$1" table="$2" key="$3" header
  [ -f "$config" ] || return 0
  if [ -z "$table" ]; then header="[$name]"; else header="[$name.$table]"; fi
  awk -v header="$header" -v key="$key" '
    /^\[/ { inside = ($0 == header) }
    inside && $1 == key && $2 == "=" { value = $0; sub(/^[^=]*=[[:space:]]*"/, "", value); sub(/"[[:space:]]*$/, "", value); print value; exit }
  ' "$config"
}

write_key() {
  local name="$1" table="$2" key="$3" value="$4" header
  if [ -z "$table" ]; then header="[$name]"; else header="[$name.$table]"; fi
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

# A setting's value for a project, else its global default, else empty.
value_of() {
  local name="$1" project="$2" value=""
  [ -z "$project" ] || value="$(read_key "$name" projects "$project")"
  [ -n "$value" ] || value="$(read_key "$name" "" default)"
  printf '%s' "$value"
}

# The spec mode a forge mode keeps its design in.
spec_of() {
  case "$1" in github|gitlab) printf 'chat' ;; *) printf '%s' "$1" ;; esac
}

check_value() {
  case "$setting:$1" in
    spec:chat|spec:openspec|spec:openspec:?*|spec:azure) ;;
    spec:*) die "unknown spec mode $1 (chat | openspec | openspec:<store> | azure)" ;;
    mode:chat|mode:openspec|mode:openspec:?*|mode:azure|mode:github|mode:gitlab) ;;
    mode:*) die "unknown mode $1 (chat | openspec | openspec:<store> | azure | github | gitlab)" ;;
    backlog:-) ;;
    backlog:https://?*/?*) ;;
    backlog:*) die "a backlog is the URL of a repository or project (https://...), or - to unset it" ;;
  esac
}

case "$action" in
  get)
    project="${3:-}"
    case "$setting" in
      spec) value="$(value_of spec "$project")"; printf '%s\n' "${value:-chat}" ;;
      mode)
        spec="$(value_of spec "$project")"; spec="${spec:-chat}"
        mode="$(value_of mode "$project")"
        if [ -n "$mode" ] && [ "$(spec_of "$mode")" = "$spec" ]; then printf '%s\n' "$mode"; else printf '%s\n' "$spec"; fi ;;
      backlog) value="$(value_of backlog "$project")"; [ "$value" = - ] && value=""; printf '%s\n' "$value" ;;
    esac ;;
  set)
    value="${3:-}"; project="${4:-}"
    [ -n "$value" ] || die "usage: forge-config.sh set <setting> <value> [project-key]"
    check_value "$value"
    table=""; key=default
    [ -z "$project" ] || { table=projects; key="$project"; }
    write_key "$setting" "$table" "$key" "$value"
    [ "$setting" != mode ] || write_key spec "$table" "$key" "$(spec_of "$value")"
    printf '%s %s = %s\n' "$setting" "${project:-default}" "$value" ;;
  *) die "usage: forge-config.sh get|set <setting> [value] [project-key]" ;;
esac
