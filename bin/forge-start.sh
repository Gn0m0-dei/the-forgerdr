#!/usr/bin/env bash
# What the herdr app's forge mode and Start work dialogs (herdr/mods/forgerdr/roles/mode.js, start.js) read and do for a
# forge, as JSON on stdout:
#   info <dir>              the checkout, its origin (provider, host, project or Azure organization, project and
#                           repository), its memory project key, its mode and spec mode, the backlog forgerdr keeps for
#                           it and the one /azdo:init keeps in the clone's git config (azdospec.organization, .project);
#                           for a parent folder of repositories, which has no origin, the origin of each (repos)
#   repos <dir>             the repositories of a parent folder, as the sidebar shows them under it: {root, repos}, its
#                           path and theirs with symlinks resolved, as git names them; none for a folder inside git
#   changes <dir>           the OpenSpec changes of its spec mode (this repository's, or its store's), with tasks done;
#                           for a parent folder of repositories, its store's or those of each repository with OpenSpec,
#                           each with its repository's name (repo)
#   indexed <dir>           whether the forge a directory is of is indexed: {state: none | indexing | ready, root,
#                           folder, repos, joined, code, project, indexed_at, failed}. Its root is the parent folder
#                           of repositories the directory is or works with, else its repository; failed, what went
#                           wrong in its last run
#   index <dir>             indexes that forge and answers its state: each repository of a parent folder records the
#                           folder in its own git config (forgerdr.workspace), so every session in it, however it was
#                           opened, takes the folder's key, mode, backlog and skills; and the code is indexed from the
#                           root as one project, through the code index's command line when it is installed
#   index-start <dir>       starts that indexing on its own and answers the state at once (indexing): for the herdr
#                           app, which asks the state meanwhile
#   unindex <dir>           undoes it: the repositories are on their own again and the record goes; the code index's
#                           own project stays
#   register <folder>       the OpenSpec store in a folder, registered when it is not yet: {id}
#   setup <folder>          a new OpenSpec store made in a folder: {id}
#   azdospec <dir> <url>    the backlog /azdo:init keeps in a clone's git config, set to an Azure DevOps project
#                           (https://dev.azure.com/<org>/<project>); only in a clone /azdo:init set up already
# What cannot be read or done answers {"error": "...", "fix": "..."} and exits 0, so the dialog says why.
# Usage: forge-start.sh info|repos|changes|indexed|index|index-start|unindex <dir>
#        forge-start.sh register|setup <folder>
#        forge-start.sh azdospec <dir> <url>
set -euo pipefail

# shellcheck source-path=SCRIPTDIR
# shellcheck source=forge-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/forge-lib.sh"

command="${1:-}"
dir="${2:-}"
case "$command" in info|repos|changes|indexed|index|index-start|unindex|register|setup|azdospec) ;; *) forge_die "usage: forge-start.sh info|repos|changes|indexed|index|index-start|unindex|register|setup|azdospec <dir> [url]" ;; esac
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

# The repositories of a forge's root that is a parent folder, a path a line; none for a repository. A child that is a
# link to a repository elsewhere is not the folder's: its parent is another folder, so it could never join this one.
index_repos() {
  local repo
  ! git -C "$1" rev-parse --show-toplevel >/dev/null 2>&1 || return 0
  while IFS= read -r repo; do
    [ -z "$repo" ] || [ "$(dirname "$repo")" != "$1" ] || printf '%s\n' "$repo"
  done <<EOT
$(forge_detect_repos "$1")
EOT
}

# The process id of the run that indexes a forge now, by its record; nothing when none does: the run that left it is
# gone, or the id is another program's by now.
index_running() {
  local pid
  pid="$(cat "$1.running" 2>/dev/null || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || return 0
  case "$(ps -p "$pid" -o args= 2>/dev/null || true)" in *"forge-start.sh index "*) printf '%s\n' "$pid" ;; esac
}

# A forge's indexing as it stands, by its root: indexing while a run of this script holds its record, ready once it is
# recorded and every repository of a parent folder has joined it, none otherwise (a repository added since). What went
# wrong in its last run comes with it (failed, never "error": an answer with an error is this script failing), until a
# run goes well.
index_state() {
  local root="$1" file repo count=0 joined=0 folder=false state=none code=false kept none='{}'
  file="$(forge_index_file "$root")"
  git -C "$root" rev-parse --show-toplevel >/dev/null 2>&1 || folder=true
  while IFS= read -r repo; do
    [ -n "$repo" ] || continue
    count=$((count + 1))
    [ "$(forge_joined_workspace "$repo" 2>/dev/null || true)" != "$root" ] || joined=$((joined + 1))
  done <<EOT
$(index_repos "$root")
EOT
  # A record that cannot be read is no record.
  kept="$(jq -c 'select(type == "object")' "$file" 2>/dev/null || true)"
  if [ -n "$(index_running "$file")" ]; then state=indexing
  elif [ -n "$kept" ] && [ "$joined" -eq "$count" ]; then state=ready
  fi
  [ ! -x "$(forge_code_index)" ] || code=true
  jq -cn --arg state "$state" --arg root "$root" --argjson folder "$folder" --argjson repos "$count" \
    --argjson joined "$joined" --argjson code "$code" --argjson kept "${kept:-$none}" \
    --arg failed "$(cat "$file.error" 2>/dev/null || true)" \
    '{state: $state, root: $root, folder: $folder, repos: $repos, joined: $joined, code: $code,
      project: ($kept.project // ""), indexed_at: ($kept.indexed_at // ""), failed: $failed}'
}

case "$command" in
  indexed)
    index_state "$(forge_index_root "$dir")"
    exit 0 ;;
  unindex)
    root="$(forge_index_root "$dir")"
    file="$(forge_index_file "$root")"
    # A run in progress would join the repositories again and record the forge under what is undone here.
    [ -z "$(index_running "$file")" ] || fail "a run is indexing this forge" "undo it once it ends"
    while IFS= read -r repo; do
      [ -n "$repo" ] || continue
      [ "$(forge_joined_workspace "$repo" 2>/dev/null || true)" != "$root" ] \
        || git -C "$repo" config --local --unset-all forgerdr.workspace || fail "cannot change the git config of $repo"
    done <<EOT
$(index_repos "$root")
EOT
    rm -f "$file" "$file.error" "$file.running"
    index_state "$root"
    exit 0 ;;
  index-start)
    # For the herdr app: the run goes on by itself, which takes minutes on a large folder, and the state is asked
    # meanwhile. One run at a time.
    root="$(forge_index_root "$dir")"
    file="$(forge_index_file "$root")"
    if [ -z "$(index_running "$file")" ]; then
      mkdir -p "$(dirname "$file")"
      nohup bash "$0" index "$dir" >/dev/null 2>&1 &
      printf '%s\n' "$!" > "$file.running"
    fi
    index_state "$root"
    exit 0 ;;
  index)
    root="$(forge_index_root "$dir")"
    file="$(forge_index_file "$root")"
    mkdir -p "$(dirname "$file")"
    running="$(index_running "$file")"
    [ -z "$running" ] || [ "$running" = "$$" ] || { index_state "$root"; exit 0; }
    # Any other process asking meanwhile reads "indexing".
    printf '%s\n' "$$" > "$file.running"
    trap 'rm -f "$file.running"' EXIT
    # What goes wrong is kept for whoever asks the state later: the app's run has nobody waiting on it.
    broke() { printf '%s' "$1" > "$file.error"; rm -f "$file.running"; fail "$1" "${2:-}"; }
    while IFS= read -r repo; do
      [ -z "$repo" ] || git -C "$repo" config --local --replace-all forgerdr.workspace "$root" \
        || broke "cannot write the git config of $repo"
    done <<EOT
$(index_repos "$root")
EOT
    project=""
    code=false
    tool="$(forge_code_index)"
    if [ -x "$tool" ]; then
      # The program answers JSON with its project; a run that breaks, JSON with status error and a hint; a root it
      # refuses (too broad, outside its allowed roots), one line of plain words. A record a good run left stays.
      # Its answer is what it prints; what it says on the errors' side is only the reason of a run that failed, since a
      # good run may warn there too.
      out="$("$tool" cli --quiet index_repository --repo-path "$root" 2>"$file.stderr")" && ran=0 || ran=$?
      said="$(cat "$file.stderr" 2>/dev/null || true)"
      rm -f "$file.stderr"
      project="$(jq -r 'select(type == "object" and .status != "error") | .project // empty' <<<"$out" 2>/dev/null || true)"
      if [ "$ran" -ne 0 ] || [ -z "$project" ]; then
        reason="$(jq -r 'select(type == "object") | .hint // .error // empty' <<<"$out" 2>/dev/null || true)"
        [ -n "$reason" ] || reason="$(printf '%s\n%s\n' "$out" "$said" | grep -v '^[[:space:]]*$' | head -n 1)"
        broke "the code index failed${reason:+: $reason}" "the repositories are joined; index again once it can be indexed"
      fi
      code=true
    fi
    jq -cn --arg root "$root" --arg project "$project" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson code "$code" \
      '{root: $root, project: $project, indexed_at: $at, code: $code}' > "$file.new" && mv "$file.new" "$file"
    rm -f "$file.error" "$file.running"
    index_state "$root"
    exit 0 ;;
  repos)
    folder="$(real_dir "$dir")"
    repos=""
    git -C "$folder" rev-parse --show-toplevel >/dev/null 2>&1 || repos="$(forge_detect_repos "$folder")"
    jq -cn --arg root "$folder" --arg repos "$repos" '{root: $root, repos: ($repos | split("\n") | map(select(. != "")))}'
    exit 0 ;;
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
    # A parent folder of repositories has no origin of its own: the origin of each one it holds, so its Start work takes
    # the work of any of them.
    repos='[]'
    if [ -z "$root" ]; then
      while IFS= read -r repo; do
        [ -n "$repo" ] || continue
        remote="$(git -C "$repo" remote get-url origin 2>/dev/null)" || continue
        repos="$(jq -c --argjson one "$(origin_parts "$remote")" '. + [$one]' <<<"$repos")"
      done <<EOT
$(forge_detect_repos "$(real_dir "$dir")")
EOT
    fi
    jq -cn --arg dir "$dir" --arg root "$root" --arg origin "$origin" --argjson parts "$parts" --arg key "$key" \
      --arg spec "$spec" --arg mode "$mode" --arg backlog "$backlog" --arg azdospec "$azdospec" --argjson repos "$repos" \
      '{dir: $dir, root: $root, origin: $origin, key: $key, spec: $spec, mode: $mode, backlog: $backlog,
        azdospec_backlog: $azdospec, repos: $repos} + $parts' ;;

  changes)
    store=()
    case "$spec" in
      openspec) ;;
      openspec:*) store=(--store "${spec#openspec:}") ;;
      *) fail "this forge's mode is $mode, not OpenSpec" ;;
    esac
    needs_openspec
    # A store's changes are read from wherever the forge is; a repository's own, in it. A parent folder of
    # repositories has no OpenSpec of its own: the changes of each repository that has one, told by its name.
    places=()
    if [ -n "$root" ] || [ ${#store[@]} -gt 0 ]; then
      places=("${root:-$dir}")
    else
      while IFS= read -r repo; do
        [ -z "$repo" ] || [ ! -d "$repo/openspec" ] || places+=("$repo")
      done <<EOT
$(forge_detect_repos "$(real_dir "$dir")")
EOT
      [ ${#places[@]} -gt 0 ] || fail "no repository of this folder has OpenSpec" "openspec init in the repository that keeps the specs, or pick a store in Forge mode"
    fi
    listed='[]'
    for place in "${places[@]}"; do
      out="$(cd "$place" && openspec_json list --changes --sort name ${store[@]+"${store[@]}"})"
      jq -e '.changes' >/dev/null 2>&1 <<<"$out" || {
        IFS=$'\t' read -r message fix <<<"$(openspec_fail "$out")"
        fail "${message:-OpenSpec could not list the changes}" "$fix"
      }
      [ -z "$(openspec_fail "$out")" ] || {
        IFS=$'\t' read -r message fix <<<"$(openspec_fail "$out")"
        fail "$message" "$fix"
      }
      # Told by its repository only where several are read.
      of=""
      [ -n "$root" ] || [ ${#store[@]} -gt 0 ] || of="$(basename "$place")"
      listed="$(jq -c --argjson all "$listed" --arg repo "$of" \
        '$all + [.changes[] | {name, done: (.completedTasks // 0), total: (.totalTasks // 0), status: (.status // "")}
          + (if $repo == "" then {} else {repo: $repo} end)]' <<<"$out")"
    done
    printf '%s\n' "$listed" ;;
esac
