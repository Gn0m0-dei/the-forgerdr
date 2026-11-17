#!/usr/bin/env bash
# Shared functions for the forgerdr scripts. Sourced, never executed.
# shellcheck shell=bash

# herdr-core's CLI, which runs every terminal and agent, and the herdr app's, which shows them in spaces, tabs and panes.
# FORGE_HC and FORGE_HERDR_APP replace them in the tests.
forge_hc() {
  "${FORGE_HC:-hc}" "$@"
}

forge_app() {
  "${FORGE_HERDR_APP:-herdr-app}" "$@"
}

# A herdr app command, as herdr-app do <command> --<argument> <value>...: prints what it made, fails with its error.
forge_do() {
  forge_app "do" "$@"
}

# Whether this runs in a herdr-core terminal: one the herdr app shows, or one hc started.
forge_in_herdr() {
  [ -n "${HC_TERMINAL_ID:-}" ]
}

# How long forgerdr waits on a terminal or a lock: this many checks, this many seconds apart.
FORGE_WAIT_TRIES="${FORGE_READY_TRIES:-120}"
FORGE_WAIT_PAUSE="${FORGE_READY_PAUSE:-0.5}"

# The herdr app space this terminal shows in; empty for a terminal outside any space, such as a sub-agent. Fails when hc
# cannot tell.
forge_own_space() {
  local info
  [ -n "${HC_TERMINAL_ID:-}" ] || return 0
  info="$(forge_hc get "$HC_TERMINAL_ID" --json 2>/dev/null)" || return 1
  printf '%s' "$info" | jq -er '.labels["herdr.space"]? // ""'
}

# Runs a command holding a lock next to a state file, so sessions that rewrite and append to the same file do not lose
# each other's lines. A lock older than the wait is taken as left behind by a session that died.
forge_locked() {
  local lock="$1.lock" status=0
  shift
  mkdir -p "$(dirname "$lock")"
  for _ in $(seq 1 "$FORGE_WAIT_TRIES"); do
    mkdir "$lock" 2>/dev/null && break
    sleep 0.05
  done
  [ -d "$lock" ] || mkdir "$lock"
  "$@" || status=$?
  rmdir "$lock" 2>/dev/null || true
  return "$status"
}

# A label of a terminal, this one when none is given; empty when it has none or hc cannot tell. The herdr app labels
# the terminals it shows with herdr.space and herdr.tab.
forge_terminal_label() {
  local terminal="${2:-${HC_TERMINAL_ID:-}}"
  [ -n "$terminal" ] || return 0
  forge_hc get "$terminal" --json 2>/dev/null | jq -r --arg key "$1" '.labels[$key]? // empty' || true
}

forge_die() {
  printf 'forgerdr: %s\n' "$1" >&2
  exit 1
}

# Workspace root of a directory: the parent of the repository when that parent carries its own
# .claude, CLAUDE.md or AGENTS.md (a workspace of several repositories), the repository otherwise.
# A linked worktree belongs to its main checkout. Outside git, the directory itself.
forge_workspace_root() {
  local dir top common parent
  dir="$(cd "$1" 2>/dev/null && pwd -P)" || dir="$1"
  top="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" || top="$dir"
  common="$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" && [ -n "$common" ] && top="$(dirname "$common")"
  parent="$(dirname "$top")"
  if [ -d "$parent/.claude" ] || [ -f "$parent/CLAUDE.md" ] || [ -f "$parent/AGENTS.md" ]; then
    printf '%s\n' "$parent"
  else
    printf '%s\n' "$top"
  fi
}

# Memory project key: the workspace root's name, lowercase.
forge_project_key() {
  basename "$(forge_workspace_root "$1")" | tr '[:upper:]' '[:lower:]'
}

# One line per skill in a skills directory: "name<TAB>path<TAB>description".
forge_skills_in() {
  local skill name description
  for skill in "$1"/*/SKILL.md; do
    [ -f "$skill" ] || continue
    name="$(sed -n 's/^name:[[:space:]]*//p' "$skill" | head -n 1 | tr -d '"')"
    [ -n "$name" ] || name="$(basename "$(dirname "$skill")")"
    description="$(sed -n 's/^description:[[:space:]]*//p' "$skill" | head -n 1 | tr -d '"')"
    printf '%s\t%s\t%s\n' "$name" "$skill" "$description"
  done
}

# Skills under <workspace>/.claude/skills that Claude Code will not load by itself because the
# workspace root sits outside the git tree of the directory: "name<TAB>path<TAB>description" per line.
forge_workspace_skills() {
  local dir="$1" root top
  root="$(forge_workspace_root "$dir")"
  top="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" || return 0
  [ "$root" != "$top" ] || return 0
  forge_skills_in "$root/.claude/skills"
}

# Skills of the git repositories directly under a directory that is not itself a repository (a session
# started at a workspace root): "repo<TAB>name<TAB>path<TAB>description" per line.
forge_child_repo_skills() {
  local dir="$1" child
  git -C "$dir" rev-parse --show-toplevel >/dev/null 2>&1 && return 0
  for child in "$dir"/*/; do
    [ -d "$child/.git" ] || [ -f "$child/.git" ] || continue
    forge_skills_in "${child%/}/.claude/skills" | sed "s#^#$(basename "$child")\t#"
  done
}

# Spec mode of a memory project key: chat | openspec | openspec:<store> | azure.
forge_spec_mode() {
  "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/forge-config.sh" get spec "$1" 2>/dev/null || echo chat
}

# Branch for a work item: <kind>/EXT-<id>-<slug> for an item of an external backlog (fifth argument "external"),
# else <kind>/AB<id>-<slug> when the workspace's spec mode is azure (the azdospec convention, so /azdo:apply finds
# the branch it expects), else <kind>/#<id>-<slug>.
forge_branch_name() {
  local kind="$1" id="$2" slug="$3" key="$4" backlog="${5:-}"
  [ "$backlog" != external ] || { printf '%s/EXT-%s-%s\n' "$kind" "$id" "$slug"; return; }
  case "$(forge_spec_mode "$key")" in
    azure) printf '%s/AB%s-%s\n' "$kind" "$id" "$slug" ;;
    *) printf '%s/#%s-%s\n' "$kind" "$id" "$slug" ;;
  esac
}

# Agent name, also its terminal's name in herdr-core ([a-z][a-z0-9_-]{0,31}; hc wants it unique among live terminals):
# <prefix>-<tag>[-<context>], the tag being the key itself when it is a number (a work item id) and a checksum of it
# otherwise, so long keys never collide.
forge_agent_name() {
  local prefix="$1" key="$2" context="${3:-}" tag
  case "$key" in ''|*[!0-9]*) tag="$(printf '%s' "$key" | cksum | cut -d' ' -f1)" ;; *) tag="$key" ;; esac
  printf '%s-%s%s\n' "$prefix" "$tag" "${context:+-$(forge_slug "$context")}" | cut -c1-32
}

# Provider of a URL or a git remote: azure | github | gitlab | unknown
forge_provider() {
  case "$1" in
    *dev.azure.com*|*visualstudio.com*) echo azure ;;
    *github.com*) echo github ;;
    *gitlab*) echo gitlab ;;
    *) echo unknown ;;
  esac
}

# Branch slug from a title: ascii, lowercase, hyphens, cut at a word boundary under 40 characters.
forge_slug() {
  local slug
  slug="$(printf '%s' "$1" \
    | sed 'y/áàäâéèëêíìïîóòöôúùüûñçÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇ/aaaaeeeeiiiioooouuuuncAAAAEEEEIIIIOOOOUUUUNC/' \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  [ ${#slug} -le 40 ] && { printf '%s\n' "$slug"; return; }
  printf '%s' "$slug" | cut -c1-41 | sed -E 's/-?[^-]*$//'
  printf '\n'
}

# Repository name named by a pull request or work item URL.
forge_url_repo() {
  case "$(forge_provider "$1")" in
    azure) printf '%s' "$1" | sed -nE 's#.*/_git/([^/?]+)/.*#\1#p' ;;
    github) printf '%s' "$1" | sed -nE 's#.*github\.com/[^/]+/([^/?]+)/.*#\1#p' ;;
    gitlab) printf '%s' "$1" | sed -nE 's#.*/([^/]+)/-/.*#\1#p' ;;
  esac
}

# Title of a pull request, "PR <id>" when the provider cannot answer.
forge_pr_title() {
  local url="$1" id title=""
  id="$(forge_url_id "$url")"
  case "$(forge_provider "$url")" in
    azure) title="$(az repos pr show --id "$id" --organization "$(forge_azure_org "$url")" --query title -o tsv 2>/dev/null || true)" ;;
    github) title="$(gh pr view "$url" --json title --jq .title 2>/dev/null || true)" ;;
    gitlab) title="$(glab mr view "$id" --repo "$(forge_url_project "$url")" --output json 2>/dev/null | jq -r '.title // empty' || true)" ;;
  esac
  printf 'PR %s%s\n' "$id" "${title:+: $title}"
}

# Whether the signed-in user authored a pull request: the fan-out then addresses its review instead of reviewing it.
forge_pr_is_mine() {
  local url="$1" id author="" me=""
  id="$(forge_url_id "$url")"
  case "$(forge_provider "$url")" in
    azure)
      author="$(az repos pr show --id "$id" --organization "$(forge_azure_org "$url")" --query createdBy.uniqueName -o tsv 2>/dev/null || true)"
      me="$(az account show --query user.name -o tsv 2>/dev/null || true)" ;;
    github)
      author="$(gh pr view "$url" --json author --jq .author.login 2>/dev/null || true)"
      me="$(gh api user --jq .login 2>/dev/null || true)" ;;
    gitlab)
      author="$(glab mr view "$id" --repo "$(forge_url_project "$url")" --output json 2>/dev/null | jq -r '.author.username // empty' || true)"
      me="$(glab api user --jq .username 2>/dev/null || true)" ;;
  esac
  [ -n "$author" ] && [ -n "$me" ] && [ "$(printf '%s' "$author" | tr '[:upper:]' '[:lower:]')" = "$(printf '%s' "$me" | tr '[:upper:]' '[:lower:]')" ]
}

# Numeric id at the end of a pull request or work item URL.
forge_url_id() {
  printf '%s' "$1" | sed -nE 's#.*/([0-9]+)/?([?\#].*)?$#\1#p'
}

# Azure organization URL (https://dev.azure.com/<org>, lowercase) from a work item or pull request URL, or from
# a git remote: https with or without a user, the legacy <org>.visualstudio.com host, or ssh, whose host may be
# an alias of ~/.ssh/config since only the v3/<org>/ path is read. Empty for anything else.
forge_azure_org() {
  printf '%s' "$1" | sed -nE '
    s#^https://([^@/]+@)?dev\.azure\.com/([^/]+)/.*#https://dev.azure.com/\2#p
    s#^https://([^./]+)\.visualstudio\.com/.*#https://dev.azure.com/\1#p
    s#^[^/]*:v3/([^/]+)/.*#https://dev.azure.com/\1#p' | head -n 1 | tr '[:upper:]' '[:lower:]'
}

# Whether a work item lives in an external backlog: an Azure DevOps item whose organization is not the one of
# the repository's remote. Nothing links across organizations, and a #<id> in a commit would link the item with
# that id in the repository's organization, so the repository refers to it as EXT-<id>.
forge_item_external() {
  local url="$1" repo="$2"
  [ "$(forge_provider "$url")" = azure ] || return 1
  [ "$(forge_azure_org "$url")" != "$(forge_azure_org "$(git -C "$repo" remote get-url origin 2>/dev/null)")" ]
}

# GitHub or GitLab project path (owner/repo) from a URL.
forge_url_project() {
  printf '%s' "$1" | sed -nE 's#^https://[^/]+/(.+)/(-/)?(pull|issues|merge_requests)/[0-9]+.*#\1#p' | sed -E 's#/-$##'
}

# Work item metadata as "id<TAB>kind<TAB>title", kind = fix | feature.
forge_item_meta() {
  local url="$1" id raw type title labels
  id="$(forge_url_id "$url")"
  [ -n "$id" ] || forge_die "no item id in $url"
  case "$(forge_provider "$url")" in
    azure)
      raw="$(az boards work-item show --id "$id" --organization "$(forge_azure_org "$url")" \
        --query '[fields."System.WorkItemType", fields."System.Title"]' -o json | jq -r '@tsv')" || forge_die "az boards work-item show failed for $id"
      type="${raw%%	*}"
      title="${raw#*	}"
      case "$type" in Bug|bug) type=fix ;; *) type=feature ;; esac ;;
    github)
      raw="$(gh issue view "$url" --json title,labels --jq '[(.labels | map(.name) | join(",")), .title] | @tsv')" || forge_die "gh issue view failed for $url"
      labels="${raw%%	*}"
      title="${raw#*	}"
      case "$labels" in *bug*) type=fix ;; *) type=feature ;; esac ;;
    gitlab)
      raw="$(glab issue view "$id" --repo "$(forge_url_project "$url")" --output json | jq -r '[(.labels | join(",")), .title] | @tsv')" || forge_die "glab issue view failed for $url"
      labels="${raw%%	*}"
      title="${raw#*	}"
      case "$labels" in *bug*) type=fix ;; *) type=feature ;; esac ;;
    *) forge_die "unknown provider for $url" ;;
  esac
  printf '%s\t%s\t%s\n' "$id" "$type" "$title"
}

# Local clone of a repository name under a base directory: the base itself, a child, or the base as fallback.
forge_find_clone() {
  local base="$1" name="$2" candidate remote
  [ "$(basename "$base")" = "$name" ] && { printf '%s\n' "$base"; return; }
  [ -d "$base/$name/.git" ] && { printf '%s\n' "$base/$name"; return; }
  for candidate in "$base"/*/; do
    [ -d "$candidate/.git" ] || continue
    remote="$(git -C "$candidate" remote get-url origin 2>/dev/null)" || continue
    case "$remote" in *"/$name"|*"/$name.git"|*"/$name/"*) printf '%s\n' "${candidate%/}"; return ;; esac
  done
  printf '%s\n' "$base"
}

# Git repositories to work on: the directory itself when it is one, else its first-level children.
forge_detect_repos() {
  local base="$1" child
  if git -C "$base" rev-parse --show-toplevel >/dev/null 2>&1; then
    git -C "$base" rev-parse --show-toplevel
    return
  fi
  for child in "$base"/*/; do
    [ -d "$child/.git" ] && printf '%s\n' "${child%/}"
  done
}

# Base branch of a repository: develop when the remote has it, the remote HEAD otherwise.
forge_base_branch() {
  local repo="$1" head
  if git -C "$repo" show-ref --verify --quiet refs/remotes/origin/develop; then
    echo develop
    return
  fi
  head="$(git -C "$repo" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)" && { printf '%s\n' "${head#origin/}"; return; }
  echo main
}

# Ignored env files of a clone, relative paths (unquoted, so non-ASCII names stay copyable), node_modules excluded.
forge_env_files() {
  git -C "$1" -c core.quotePath=false ls-files --others --ignored --exclude-standard \
    | grep -E '(^|/)\.env[^/]*$' \
    | grep -vE '(^|/)node_modules/' || true
}

# Ignored files a clone's .worktreeinclude names (gitignore syntax), relative paths; nothing without the file.
forge_worktree_includes() {
  [ -f "$1/.worktreeinclude" ] || return 0
  git -C "$1" -c core.quotePath=false ls-files --others --ignored --exclude-from="$1/.worktreeinclude" \
    | git -C "$1" -c core.quotePath=false check-ignore --stdin || true
}

# Copies the files listed on stdin, relative to a clone, into a worktree at the same paths, printing the count.
forge_copy_listed() {
  local source="$1" target="$2" file count=0
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    mkdir -p "$target/$(dirname "$file")"
    cp "$source/$file" "$target/$file"
    count=$((count + 1))
  done
  printf '%s\n' "$count"
}

# Copies every ignored env file from a clone into a worktree, printing the count.
forge_copy_env() {
  forge_env_files "$1" | forge_copy_listed "$1" "$2"
}

# Main checkout of the repository a directory belongs to, from inside a linked worktree too. A submodule keeps its
# git directory under the superproject's .git/modules, and names its checkout in core.worktree.
forge_main_checkout() {
  local common worktree
  common="$(git -C "$1" rev-parse --path-format=absolute --git-common-dir)" || return 1
  case "$common" in
    */.git) dirname "$common" ;;
    *)
      worktree="$(git --git-dir="$common" config core.worktree)" || return 1
      (cd "$common" && cd "$worktree" && pwd -P) ;;
  esac
}

# Adds a pattern to a repository's local exclude file (never committed), once.
forge_exclude_local() {
  local file
  file="$(git -C "$1" rev-parse --path-format=absolute --git-common-dir)/info/exclude"
  grep -qxF "$2" "$file" 2>/dev/null && return 0
  mkdir -p "$(dirname "$file")"
  printf '%s\n' "$2" >> "$file"
}

# Drops the upstream a new worktree's branch inherits from its base; a branch that tracks itself on origin keeps it.
forge_drop_inherited_upstream() {
  [ "$(git -C "$1" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null)" = "origin/$2" ] \
    || git -C "$1" branch --unset-upstream >/dev/null 2>&1 || true
}

# Ref a Claude Code worktree starts from, as its worktree.baseRef setting says (local, project, then user settings):
# "head" is the HEAD of the directory it was asked from; "fresh", the default, the forgerdr base on origin, or that
# same HEAD when the remote does not have it.
forge_claude_base_ref() {
  local root="$1" from="$2" setting="" file base top
  top="$(git -C "$from" rev-parse --show-toplevel)"
  for file in "$top/.claude/settings.local.json" "$top/.claude/settings.json" \
    "$root/.claude/settings.local.json" "$root/.claude/settings.json" "$HOME/.claude/settings.json"; do
    [ -f "$file" ] || continue
    setting="$(jq -r '.worktree.baseRef // empty' "$file")" \
      || printf 'forgerdr: %s is not valid JSON; worktree.baseRef there is ignored\n' "$file" >&2
    [ -z "$setting" ] || break
  done
  base="$(forge_base_branch "$root")"
  if [ "$setting" != head ] && git -C "$root" show-ref --verify --quiet "refs/remotes/origin/$base"; then
    printf 'origin/%s\n' "$base"
  else
    git -C "$from" rev-parse HEAD
  fi
}

# Definition file of a named subagent type: <plugin>:<name> from this plugin or the plugin cache, otherwise the
# repository's .claude/agents or ~/.claude/agents; empty for a built-in type.
forge_agent_definition() {
  local type="$1" dir="$2" plugin name top file
  case "$type" in
    *:*)
      plugin="${type%%:*}"
      name="${type#*:}"
      file="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/agents/$name.md"
      if [ "$plugin" = forgerdr ] && [ -f "$file" ]; then printf '%s\n' "$file"; return 0; fi
      # shellcheck disable=SC2012 # newest installed version first; plugin cache paths have no spaces
      ls -td "$HOME"/.claude/plugins/cache/*/"$plugin"/*/agents/"$name".md 2>/dev/null | head -n 1 || true ;;
    *)
      top="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$dir")"
      for file in "$top/.claude/agents/$type.md" "$HOME/.claude/agents/$type.md"; do
        [ -f "$file" ] && { printf '%s\n' "$file"; return 0; }
      done ;;
  esac
  return 0
}

# One field of a Markdown file's YAML frontmatter, unquoted; empty when absent.
forge_frontmatter_field() {
  awk 'NR == 1 && $0 == "---" { inside = 1; next } inside && $0 == "---" { exit } inside' "$1" \
    | sed -n "s/^$2:[[:space:]]*//p" | head -n 1 | tr -d '"'
}

# A list field of a Markdown file's YAML frontmatter, written inline ("a, b" or "[a, b]") or as "- item" lines,
# comma-separated without spaces; empty when absent.
forge_frontmatter_list() {
  awk -v key="$2" '
    NR == 1 && $0 == "---" { inside = 1; next }
    inside && $0 == "---" { exit }
    !inside { next }
    listing && /^[[:space:]]*-[[:space:]]*/ { item = $0; sub(/^[[:space:]]*-[[:space:]]*/, "", item); gsub(/["\047]/, "", item); out = out (out == "" ? "" : ",") item; next }
    { listing = 0 }
    $0 ~ "^" key ":" { value = $0; sub("^" key ":[[:space:]]*", "", value); gsub(/["\047\[\]]/, "", value); gsub(/[[:space:]]*,[[:space:]]*/, ",", value); if (value == "") listing = 1; else out = value }
    END { print out }
  ' "$1"
}

# Removes the lines of a tab-separated state file whose first field is the given value.
forge_drop_line() {
  local tmp
  tmp="$(mktemp "$1.XXXXXX")"
  value="$2" awk -F'\t' '$1 != ENVIRON["value"]' "$1" > "$tmp" && mv "$tmp" "$1"
}

# A Markdown file without its YAML frontmatter and the blank lines that follow it.
forge_frontmatter_body() {
  awk 'NR == 1 && $0 == "---" { inside = 1; next } inside && $0 == "---" { inside = 0; next } !inside && (started || NF) { started = 1; print }' "$1"
}

# Ref a worktree for a branch starts from: the branch on origin when the remote has it, the base otherwise.
forge_start_ref() {
  local repo="$1" branch="$2" base="$3"
  if git -C "$repo" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    printf 'origin/%s\n' "$branch"
  else
    printf 'origin/%s\n' "$base"
  fi
}

# Existing branch that carries a work item id (<kind>/#<id>-…, <kind>/AB<id>-… or <kind>/EXT-<id>-…), local first,
# then on origin without its remote prefix; empty when there is none.
forge_branch_for_id() {
  local repo="$1" id="$2" prefix
  for prefix in refs/heads/ refs/remotes/origin/; do
    git -C "$repo" for-each-ref --format='%(refname)' "${prefix%/}" \
      | sed "s#^$prefix##" | grep -E "^[^/]+/(#|AB|EXT-)$id-" | head -n 1 | grep . && return 0
  done
  return 0
}

# Path of the clone or worktree where a branch is checked out, empty when it is free.
forge_checked_out_at() {
  git -C "$1" worktree list --porcelain \
    | awk -v ref="branch refs/heads/$2" '/^worktree / { path = substr($0, 10) } $0 == ref { print path; exit }'
}

# Copies an OpenSpec change from a clone into a worktree that lacks it (never committed), printing true or false.
# Only a kebab-case name can be a change; a URL or free text never matches.
forge_copy_change() {
  local source="$1" target="$2" name="$3"
  case "$name" in ''|*[!a-z0-9-]*) echo false; return ;; esac
  if [ -d "$source/openspec/changes/$name" ] && [ ! -e "$target/openspec/changes/$name" ]; then
    { mkdir -p "$target/openspec/changes" && cp -R "$source/openspec/changes/$name" "$target/openspec/changes/"; } \
      || forge_die "could not copy openspec/changes/$name into $target"
    echo true
  else
    echo false
  fi
}

# Dev command of a directory when there is exactly one obvious choice, empty otherwise.
forge_dev_command() {
  local dir="$1"
  [ -f "$dir/package.json" ] || return 0
  [ "$(jq -r '.scripts.dev // empty' "$dir/package.json")" ] || return 0
  if [ -f "$dir/pnpm-lock.yaml" ]; then echo "pnpm dev"
  elif [ -f "$dir/yarn.lock" ]; then echo "yarn dev"
  elif [ -f "$dir/bun.lockb" ] || [ -f "$dir/bun.lock" ]; then echo "bun dev"
  else echo "npm run dev"
  fi
}

# The herdr app's folder: its settings, layouts and keys.
forge_app_home() {
  printf '%s\n' "${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
}

# Where new item worktrees go: the herdr app's worktrees.directory setting, ~/.herdr/worktrees by default, so the app's
# own Open and Remove worktree find them.
forge_worktrees_dir() {
  local dir
  dir="$(jq -r '.worktrees.directory // empty' "$(forge_app_home)/settings.json" 2>/dev/null || true)"
  # shellcheck disable=SC2088 # expanded below, as the herdr app expands it
  dir="${dir:-~/.herdr/worktrees}"
  # shellcheck disable=SC2088 # the same
  case "$dir" in "~") dir="$HOME" ;; "~/"*) dir="$HOME/${dir#"~/"}" ;; esac
  printf '%s\n' "$dir"
}

# Path of a branch's worktree: <worktrees dir>/<repository>/<branch, its slashes made dashes>, as the herdr app names its own.
forge_worktree_path() {
  printf '%s/%s/%s\n' "$(forge_worktrees_dir)" "$(basename "$1")" "$(printf '%s' "$2" | tr '/' '-')"
}

# Adds a worktree for a branch: the local branch when there is one, else a new branch from the start ref; then drops
# the upstream it inherits from a base.
forge_add_worktree() {
  local repo="$1" branch="$2" start="$3" path="$4"
  mkdir -p "$(dirname "$path")"
  if git -C "$repo" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$repo" worktree add --quiet "$path" "$branch" >&2
  else
    git -C "$repo" worktree add --quiet -b "$branch" "$path" "$start" >&2
  fi
  forge_drop_inherited_upstream "$path" "$branch"
}

# The herdr app spaces forgerdr opened for worktrees, "path<TAB>space id" per line, so a space goes with its worktree.
forge_spaces_file() {
  printf '%s/forgerdr/spaces.tsv\n' "${XDG_STATE_HOME:-$HOME/.local/state}"
}

forge_append_line() {
  printf '%s\n' "$2" >> "$1"
}

# Opens a worktree as a herdr app space that does not take the focus: named, its first tab named when a name is given,
# running the argv given as JSON or a shell. Records it and prints what herdr-app made: {"space", "tab", "terminal"}.
forge_open_space() {
  local name="$1" path="$2" tab="${3:-}" argv="${4:-}" made file
  made="$(forge_do space.new --name "$name" --folder "$path" ${tab:+--tab "$tab"} ${argv:+--argv "$argv"} --focus false)" \
    || return 1
  file="$(forge_spaces_file)"
  mkdir -p "$(dirname "$file")"
  forge_locked "$file" forge_append_line "$file" "$(printf '%s\t%s' "$path" "$(printf '%s' "$made" | jq -r .space)")"
  printf '%s\n' "$made"
}

# Forgets the spaces recorded for a path.
forge_forget_space() {
  local file
  file="$(forge_spaces_file)"
  [ ! -f "$file" ] || forge_locked "$file" forge_drop_line "$file" "$1"
}

# Ids of the herdr app spaces open on a folder, the folder named as given or with its symlinks resolved; nothing when the
# app does not answer.
forge_spaces_of() {
  local listed real
  listed="$(forge_app ls 2>/dev/null)" || return 0
  real="$(cd "$1" 2>/dev/null && pwd -P || printf '%s' "$1")"
  printf '%s' "$listed" | jq -r --arg path "$1" --arg real "$real" '.spaces[]? | select(.folder == $path or .folder == $real) | .id' \
    2>/dev/null || true
}

# Whether a terminal's agent is at work: working, or blocked on a question.
forge_terminal_at_work() {
  forge_hc get "$1" --json 2>/dev/null \
    | jq -e '.state == "live" and (.status.state? == "working" or .status.state? == "blocked")' >/dev/null
}

# Ends a herdr-core terminal, by address or name, and removes it once it has ended (hc kill returns before it has), so
# it does not linger in hc ls --all. Fails when it is still live after the wait; a terminal hc does not know is ended.
forge_end_terminal() {
  local state=""
  forge_hc kill "$1" >/dev/null 2>&1 || true
  for _ in $(seq 1 "$FORGE_WAIT_TRIES"); do
    state="$(forge_hc get "$1" --json 2>/dev/null | jq -r '.state // empty')" || state=""
    [ "$state" = live ] || break
    sleep "$FORGE_WAIT_PAUSE"
  done
  [ "$state" != live ] || return 1
  [ -z "$state" ] || forge_hc rm "$1" >/dev/null 2>&1 || true
}

# Whether an agent is at work in a herdr app space, its sub-agents included. Anything the app's answer does not make
# plain (no answer, an answer of another shape) counts as at work, so nothing at work is closed by mistake.
forge_space_at_work() {
  local listed verdict sub
  listed="$(forge_app ls 2>/dev/null)" || return 0
  # shellcheck disable=SC2016 # a jq filter
  verdict="$(printf '%s' "$listed" | jq -r --arg id "$1" '
    (.spaces | if type == "array" then . else error("no spaces") end) as $spaces
    | ([$spaces[] | select(.id == $id)] | first) as $space
    | if $space == null then "gone"
      else ($space.tabs | if type == "array" then . else error("no tabs") end)
        | [.[] | .terminals | if type == "array" then .[] else error("no terminals") end] as $terminals
        | if any($terminals[]; .status == "working" or .status == "blocked") then "busy"
          else "subs " + ([$terminals[] | .sub_agents[]? | if type == "object" then (.terminal // .address // "") else . end
            | strings | select(length > 0)] | join(" ")) end
      end' 2>/dev/null)" || return 0
  case "$verdict" in
    gone) return 1 ;;
    "subs "*)
      for sub in ${verdict#subs }; do
        forge_terminal_at_work "$sub" && return 0
      done
      return 1 ;;
    *) return 0 ;;
  esac
}

# Fails, saying why, when the herdr app spaces open on a worktree must not be closed: one is the space this terminal
# shows in, hc cannot tell which that is, or, unless forced, an agent is at work in one. Nothing to say while the app
# does not answer.
forge_spaces_closable() {
  local path="$1" force="${2:-}" own id
  forge_app ls >/dev/null 2>&1 || return 0
  own="$(forge_own_space)" || { printf 'forgerdr: hc cannot tell which space this session runs in; %s left in place\n' "$path" >&2; return 1; }
  for id in $(forge_spaces_of "$path"); do
    [ "$id" != "$own" ] || { printf 'forgerdr: %s is open in the space this session runs in\n' "$path" >&2; return 1; }
    [ -n "$force" ] || ! forge_space_at_work "$id" || { printf 'forgerdr: an agent is at work in the space of %s\n' "$path" >&2; return 1; }
  done
}

# Closes the herdr app spaces open on a worktree, ending their terminals, and forgets them; forge_spaces_closable says
# first whether they may go. While the app does not answer nothing is closed and the record stays, so the space is
# closed as an orphan once it answers again.
forge_close_spaces_of() {
  local path="$1" id
  forge_app ls >/dev/null 2>&1 || return 0
  for id in $(forge_spaces_of "$path"); do
    forge_do space.close --id "$id" --confirmed true >/dev/null \
      || { printf 'forgerdr: the herdr app could not close space %s of %s\n' "$id" "$path" >&2; return 1; }
  done
  forge_forget_space "$path"
}

# Starts a program in a new herdr-core terminal, through the user's login interactive shell as the herdr app starts
# agents, so it gets what the shell profile sets (PATH, version managers, exported keys); a shell that takes neither the
# sh nor the fish form, such as nushell, gives way to a login sh with this PATH. The terminal ends with the program and
# hc types no note about it into this one. Options, then -- and the program with its arguments:
#   --name N            its name, unique among live terminals
#   --cwd DIR           where it starts
#   --space ID --tab ID the herdr app tab it shows in as a pane; without them it is a sub-agent of this terminal,
#                       listed under it in the app's Agents sidebar
# Prints the terminal's address. Fails with 1 when hc starts nothing, with 2 when it started a terminal whose address it
# did not print (end it by its name).
forge_launch() {
  local args=(run --bg --json --no-notify) shell="${SHELL:-/bin/sh}" out
  while [ $# -gt 0 ]; do
    case "$1" in
      --name|--cwd) args+=("$1" "$2"); shift 2 ;;
      --space) [ -z "$2" ] || args+=(--label "herdr.space=$2"); shift 2 ;;
      --tab) [ -z "$2" ] || args+=(--label "herdr.tab=$2"); shift 2 ;;
      --) shift; break ;;
      *) printf 'forge_launch: unknown option %s\n' "$1" >&2; return 1 ;;
    esac
  done
  # shellcheck disable=SC2016 # expanded by that shell
  case "$(basename "$shell")" in
    sh|bash|zsh|dash|ksh|mksh) args+=(-- "$shell" -lic 'exec "$@"' "$shell") ;;
    fish) args+=(-- "$shell" -lic 'exec $argv') ;;
    *) args+=(-- /bin/sh -lc 'exec "$@"' sh env "PATH=$PATH") ;;
  esac
  out="$(forge_hc "${args[@]}" "$@")" || return 1
  printf '%s' "$out" | jq -er '.address' 2>/dev/null || return 2
}

# The argv the herdr app runs for a titled Claude session, as JSON for space.new and tab.new (the app runs it in the
# user's login interactive shell): FORGE_SESSION_TITLE in its environment (hooks/session-start.sh makes it the session
# title), the words of FORGE_CLAUDE_ARGS, then the prompt.
forge_claude_argv() {
  local extra=()
  read -r -a extra <<<"${FORGE_CLAUDE_ARGS:-}"
  # shellcheck disable=SC2016 # a jq filter
  jq -cn --arg title "$1" --arg prompt "$2" '["env", ("FORGE_SESSION_TITLE=" + $title), "claude"] + $ARGS.positional + [$prompt]' \
    --args -- ${extra[@]+"${extra[@]}"}
}

# Waits for a Claude agent just started in a terminal to come up: up once it reports a status, the folder trust prompt
# accepted once on the way (it defaults to "No, exit"). Fails with 1 when the terminal ends first, with 2 when claude has
# reported nothing by the end of the wait (not found, a bad argument, a slow start); a shell the herdr app keeps after
# claude exits stays live, so only the status tells.
forge_claude_ready() {
  local terminal="$1" info status screen trust accepted=""
  for _ in $(seq 1 "$FORGE_WAIT_TRIES"); do
    info="$(forge_hc get "$terminal" --json 2>/dev/null)" || return 1
    [ "$(printf '%s' "$info" | jq -r '.state // empty')" = live ] || return 1
    status="$(printf '%s' "$info" | jq -r '[.status.state? // "", .status.msg? // ""] | join(" ")')"
    trust=""
    case "$status" in
      blocked*trust*) trust=1 ;;
      " ")
        screen="$(forge_hc read "$terminal" --lines 0 2>/dev/null || true)"
        case "$screen" in *"trust this folder"*) trust=1 ;; esac ;;
      *) return 0 ;;
    esac
    if [ -n "$trust" ] && [ -z "$accepted" ]; then
      forge_hc keys "$terminal" down enter >/dev/null || return 1
      accepted=1
    fi
    sleep "$FORGE_WAIT_PAUSE"
  done
  return 2
}

# First line of the message that gives a dispatched agent a task (hooks/agent-dispatch.sh, hooks/agent-message.sh);
# hooks/agent-state.sh starts the agent's current task at the last message that carries it.
FORGE_TASK_HEADER="Task from the Claude session that dispatched you"
# First words of the report a dispatched agent sends back.
FORGE_REPORT_PREFIX="Report from"

# The message that gives a dispatched agent a task: the header, the task, and where and how to report.
# Arguments: agent type, agent name, task title, task, report address, note on where it works (may be empty).
forge_agent_task() {
  printf '%s (%s agent %s, "%s"):\n\n%s\n\n---\nYou are running in a herdr terminal of your own. %sWhen you finish, even after waiting for agents of your own, send your complete final report with SendMessage to "%s", beginning with the line "%s %s (%s)". That session sees nothing else of your work: a reply typed in this terminal reaches nobody. Ask it the same way if you need a decision.' \
    "$FORGE_TASK_HEADER" "$1" "$2" "$3" "$4" "$6" "$5" "$FORGE_REPORT_PREFIX" "$2" "$3"
}

# Applies a jq filter, with its jq arguments, to a JSON state file in place.
forge_json_update() {
  local file="$1" tmp
  shift
  tmp="$(mktemp "$file.XXXXXX")"
  jq "$@" "$file" > "$tmp" && mv "$tmp" "$file"
}

# Sets the state of a dispatched agent (working or done), and its task title when one is given, in its record.
forge_agent_mark() {
  # shellcheck disable=SC2016 # a jq filter
  forge_json_update "$1" --arg state "$2" --arg title "${3:-}" '.state = $state | .title = (if $title == "" then .title else $title end)'
}
