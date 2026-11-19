#!/usr/bin/env bash
# What the herdr app's forge mode and Start work dialogs (herdr/mods/forgerdr/roles/mode.js, start.js) read and do for a
# forge, as JSON on stdout:
#   info <dir>              the checkout, its origin (provider, host, project or Azure organization, project and
#                           repository), its memory project key, its mode and spec mode, the backlog forgerdr keeps for
#                           it and the one /azdo:init keeps in the clone's git config (azdospec.organization, .project)
#   changes <dir>           the OpenSpec changes of its spec mode (this repository's, or its store's), with tasks done
#   register <folder>       the OpenSpec store in a folder, registered when it is not yet: {id}
#   setup <folder>          a new OpenSpec store made in a folder: {id}
#   azdospec <dir> <url>    the backlog /azdo:init keeps in a clone's git config, set to an Azure DevOps project
#                           (https://dev.azure.com/<org>/<project>); only in a clone /azdo:init set up already
# What cannot be read or done answers {"error": "...", "fix": "..."} and exits 0, so the dialog says why.
# Usage: forge-start.sh info|changes <dir>
#        forge-start.sh register|setup <folder>
#        forge-start.sh azdospec <dir> <url>
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

command="${1:-}"
dir="${2:-}"
case "$command" in info|changes|register|setup|azdospec) ;; *) forge_die "usage: forge-start.sh info|changes|register|setup|azdospec <dir> [url]" ;; esac
[ -d "$dir" ] || forge_die "$dir is not a directory"

fail() { jq -cn --arg error "$1" --arg fix "${2:-}" '{error: $error} + (if $fix == "" then {} else {fix: $fix} end)'; exit 0; }

# The first error an OpenSpec answer reports, as this script fails with it.
openspec_fail() {
  jq -r 'first(.status[]? | select(.severity == "error")) | [.message, (.fix // "")] | @tsv' <<<"$1" 2>/dev/null
}

# Runs the OpenSpec CLI for its JSON, which carries what went wrong in its status.
openspec_json() { forge_openspec "$@" --json 2>/dev/null || true; }

# Stops with how to get the OpenSpec CLI when this machine does not have it.
needs_openspec() {
  forge_openspec --version >/dev/null 2>&1 || fail "the OpenSpec CLI is not installed" "/forgerdr:setup installs it"
}

# A URL's percent-encoding undone, as an Azure DevOps project name with spaces comes in its URLs.
url_decode() { local s="${1//+/ }"; printf '%b' "${s//%/\\x}"; }

# The parts of an origin URL, as JSON: provider, host, project (owner/repo or group/.../repo), and for Azure DevOps its
# organization URL, project and repository. https with or without a user, ssh with scp syntax or ssh://.
origin_parts() {
  local url="$1" provider host path
  provider="$(forge_provider "$url")"
  host="$(printf '%s' "$url" | sed -nE 's#^[a-z+]+://([^@/]+@)?([^/:]+).*#\2#p; s#^[^@/]+@([^:]+):.*#\1#p' | head -n 1)"
  path="$(printf '%s' "$url" | sed -E 's#^[a-z+]+://([^@/]+@)?[^/]+/##; s#^[^@/]+@[^:]+:##; s#\.git$##; s#/$##')"
  case "$provider" in
    azure)
      local org project repo
      org="$(forge_azure_org "$url")"
      case "$url" in
        *visualstudio.com*) path="$(printf '%s' "$path" | sed -E 's#^DefaultCollection/##')" ;;
        *) path="$(printf '%s' "$path" | sed -E 's#^v3/##; s#^[^/]+/##')" ;;
      esac
      project="$(url_decode "${path%%/*}")"
      repo="$(url_decode "${path##*/}")"
      jq -cn --arg host "$host" --arg org "$org" --arg project "$project" --arg repo "$repo" \
        '{provider: "azure", host: $host, org: $org, azure_project: $project, repo: $repo}'
      ;;
    github|gitlab)
      jq -cn --arg provider "$provider" --arg host "$host" --arg project "$path" \
        '{provider: $provider, host: $host, project: $project, repo: ($project | split("/") | last)}' ;;
    *) jq -cn --arg host "$host" '{provider: "unknown", host: $host}' ;;
  esac
}

# A store's or a forge's folder, its symlinks resolved, so two spellings of one folder compare equal.
real_dir() { (cd "$1" 2>/dev/null && pwd -P) || printf '%s' "$1"; }

case "$command" in
  azdospec)
    url="${3:-}"
    root="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" || fail "this forge is not in git"
    [[ "$url" =~ ^https://dev\.azure\.com/([^/]+)/([^/]+)/?$ ]] || fail "not an Azure DevOps project: $url"
    org="${BASH_REMATCH[1]}"
    project="$(url_decode "${BASH_REMATCH[2]}")"
    git -C "$root" config --local --get azdospec.organization >/dev/null 2>&1 \
      || fail "this clone has no azdospec settings: /azdo:init sets them up"
    git -C "$root" config --local azdospec.organization "$org"
    git -C "$root" config --local azdospec.project "$project"
    jq -cn --arg organization "$org" --arg project "$project" '{organization: $organization, project: $project}'
    exit 0 ;;
  register)
    needs_openspec
    folder="$(real_dir "$dir")"
    known="$(openspec_json store list | jq -r --arg folder "$folder" '.stores[]? | select(.root == $folder) | .id' 2>/dev/null | head -n 1)"
    if [ -z "$known" ]; then
      # A root registered under another spelling of its path.
      while IFS=$'\t' read -r id root; do
        [ -z "$id" ] || [ "$(real_dir "$root")" != "$folder" ] || { known="$id"; break; }
      done < <(openspec_json store list | jq -r '.stores[]? | [.id, .root] | @tsv' 2>/dev/null)
    fi
    [ -z "$known" ] || { jq -cn --arg id "$known" '{id: $id}'; exit 0; }
    out="$(openspec_json store register "$folder" --yes)"
    id="$(jq -r '.store.id // empty' <<<"$out" 2>/dev/null)"
    [ -z "$id" ] || { jq -cn --arg id "$id" '{id: $id}'; exit 0; }
    IFS=$'\t' read -r message fix <<<"$(openspec_fail "$out")"
    code="$(jq -r 'first(.status[]? | select(.severity == "error")) | .code // ""' <<<"$out" 2>/dev/null)"
    jq -cn --arg error "${message:-OpenSpec did not register $folder}" --arg fix "$fix" \
      --argjson setup "$([ "$code" = store_register_root_unhealthy ] && echo true || echo false)" \
      '{error: $error, fix: $fix, setup: $setup}'
    exit 0 ;;
  setup)
    needs_openspec
    folder="$(real_dir "$dir")"
    id="$(forge_slug "$(basename "$folder")")"
    [ -n "$id" ] || fail "no store id in the folder's name $folder"
    out="$(openspec_json store setup "$id" --path "$folder" --no-init-git)"
    made="$(jq -r '.store.id // empty' <<<"$out" 2>/dev/null)"
    [ -z "$made" ] || { jq -cn --arg id "$made" '{id: $id}'; exit 0; }
    IFS=$'\t' read -r message fix <<<"$(openspec_fail "$out")"
    fail "${message:-OpenSpec did not make a store in $folder}" "$fix" ;;
esac

root="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" || root=""
origin=""
[ -z "$root" ] || origin="$(git -C "$root" remote get-url origin 2>/dev/null)" || origin=""
parts='{"provider": "none"}'
[ -z "$origin" ] || parts="$(origin_parts "$origin")"
provider="$(jq -r '.provider' <<<"$parts")"
key="$(forge_project_key "${root:-$dir}")"
config="$(cd "$(dirname "$0")" && pwd)/forge-config.sh"
spec="$("$config" get spec "$key" 2>/dev/null || echo chat)"
mode="$("$config" get mode "$key" 2>/dev/null || echo "$spec")"
backlog="$("$config" get backlog "$key" 2>/dev/null || true)"
azdospec=""
if [ -n "$root" ]; then
  azdo_org="$(git -C "$root" config --local --get azdospec.organization 2>/dev/null || true)"
  azdo_project="$(git -C "$root" config --local --get azdospec.project 2>/dev/null || true)"
  [ -z "$azdo_org" ] || [ -z "$azdo_project" ] ||
    azdospec="https://dev.azure.com/$azdo_org/$(jq -rn --arg p "$azdo_project" '$p | @uri')"
fi

case "$command" in
  info)
    jq -cn --arg dir "$dir" --arg root "$root" --arg origin "$origin" --argjson parts "$parts" --arg key "$key" \
      --arg spec "$spec" --arg mode "$mode" --arg backlog "$backlog" --arg azdospec "$azdospec" \
      '{dir: $dir, root: $root, origin: $origin, key: $key, spec: $spec, mode: $mode, backlog: $backlog,
        azdospec_backlog: $azdospec} + $parts' ;;

  changes)
    [ -n "$root" ] || fail "this forge is not in git"
    store=()
    case "$spec" in
      openspec) ;;
      openspec:*) store=(--store "${spec#openspec:}") ;;
      *) fail "this forge's mode is $mode, not OpenSpec" ;;
    esac
    needs_openspec
    out="$(cd "$root" && openspec_json list --changes --sort name ${store[@]+"${store[@]}"})"
    jq -e '.changes' >/dev/null 2>&1 <<<"$out" || {
      IFS=$'\t' read -r message fix <<<"$(openspec_fail "$out")"
      fail "${message:-OpenSpec could not list the changes}" "$fix"
    }
    [ -z "$(openspec_fail "$out")" ] || {
      IFS=$'\t' read -r message fix <<<"$(openspec_fail "$out")"
      fail "$message" "$fix"
    }
    jq -c '[.changes[] | {name, done: (.completedTasks // 0), total: (.totalTasks // 0), status: (.status // "")}]' <<<"$out" ;;
esac
