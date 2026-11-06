#!/usr/bin/env bash
# Shared functions for the forgerdr scripts. Sourced, never executed.
# shellcheck shell=bash

forge_herdr() {
  "${HERDR_BIN_PATH:-herdr}" "$@"
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

# Branch for a work item: <kind>/#<id>-<slug>, or <kind>/AB<id>-<slug> when the workspace's spec mode is azure
# (the azdospec convention, so /azdo:apply finds the branch it expects).
forge_branch_name() {
  local kind="$1" id="$2" slug="$3" key="$4"
  case "$(forge_spec_mode "$key")" in
    azure) printf '%s/AB%s-%s\n' "$kind" "$id" "$slug" ;;
    *) printf '%s/#%s-%s\n' "$kind" "$id" "$slug" ;;
  esac
}

# Agent name herdr accepts ([a-z][a-z0-9_-]{0,31}, unique among live agents): <prefix>-<tag>[-<context>], the tag
# being the key itself when it is a number (a work item id) and a checksum of it otherwise, so long keys never collide.
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
  local url="$1" id author me
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

# Azure organization URL from a work item or pull request URL.
forge_azure_org() {
  printf '%s' "$1" | sed -nE 's#^(https://dev\.azure\.com/[^/]+)/.*#\1#p'
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
      file="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/agents/$name.md"
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

# Workspace id herdr has open for a worktree path, empty when none.
forge_workspace_of_path() {
  forge_herdr worktree list --cwd "$1" \
    | jq -r --arg path "$2" '.result.worktrees[] | select(.path == $path) | .open_workspace_id // empty'
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

# Existing branch that carries a work item id (<kind>/#<id>-… or <kind>/AB<id>-…), local first, then on origin
# without its remote prefix; empty when there is none.
forge_branch_for_id() {
  local repo="$1" id="$2" prefix
  for prefix in refs/heads/ refs/remotes/origin/; do
    git -C "$repo" for-each-ref --format='%(refname)' "${prefix%/}" \
      | sed "s#^$prefix##" | grep -E "^[^/]+/(#|AB)$id-" | head -n 1 | grep . && return 0
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

# Path and workspace id of the worktree of a branch: "path<TAB>workspace_id".
forge_worktree_of() {
  forge_herdr worktree list --cwd "$1" \
    | jq -r --arg branch "$2" '.result.worktrees[] | select(.branch == $branch) | [.path, (.open_workspace_id // "")] | @tsv'
}

# First pane of a workspace.
forge_root_pane() {
  forge_herdr pane list --workspace "$1" | jq -r '.result.panes[0].pane_id'
}

# Starts a claude agent in a pane, accepts the folder trust prompt when it shows (it defaults to "No, exit"), and sends the prompt.
# Arguments after the prompt, and the words of FORGE_CLAUDE_ARGS, go to claude. Fails when the prompt cannot be delivered.
forge_start_claude() {
  local name="$1" pane="$2" prompt="$3" screen error extra=()
  shift 3
  read -r -a extra <<<"${FORGE_CLAUDE_ARGS:-}"
  extra+=("$@")
  # A new pane's shell may still be starting (agent_pane_busy); a slow login shell takes seconds.
  local tries=40 pause=0.5
  for _ in $(seq 1 "$tries"); do
    error="$(forge_herdr agent start "$name" --kind claude --pane "$pane" ${extra[@]+-- "${extra[@]}"} 2>&1 >/dev/null)" && break
    case "$error" in *agent_pane_busy*) sleep "$pause" ;; *) break ;; esac
  done
  forge_herdr agent wait "$name" --until idle --until blocked --timeout 60000 >/dev/null 2>&1 || true
  screen="$(forge_herdr agent read "$name" --source detection 2>/dev/null || true)"
  case "$screen" in
    *"trust this folder"*)
      forge_herdr agent send-keys "$name" down enter >/dev/null
      forge_herdr agent wait "$name" --until idle --timeout 60000 >/dev/null 2>&1 || true ;;
  esac
  # A start that reports a failure can still bring the agent up (a trust prompt delays it); only the prompt tells.
  forge_herdr agent prompt "$name" "$prompt" >/dev/null || { [ -z "${error:-}" ] || printf '%s\n' "$error" >&2; return 1; }
}
