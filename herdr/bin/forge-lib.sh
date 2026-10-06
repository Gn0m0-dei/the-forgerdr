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

# Skills under <workspace>/.claude/skills that Claude Code will not load by itself because the
# workspace root sits outside the git tree of the directory: "name<TAB>path<TAB>description" per line.
forge_workspace_skills() {
  local dir="$1" root top skill name description
  root="$(forge_workspace_root "$dir")"
  top="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" || return 0
  [ "$root" != "$top" ] || return 0
  for skill in "$root"/.claude/skills/*/SKILL.md; do
    [ -f "$skill" ] || continue
    name="$(sed -n 's/^name:[[:space:]]*//p' "$skill" | head -n 1 | tr -d '"')"
    [ -n "$name" ] || name="$(basename "$(dirname "$skill")")"
    description="$(sed -n 's/^description:[[:space:]]*//p' "$skill" | head -n 1 | tr -d '"')"
    printf '%s\t%s\t%s\n' "$name" "$skill" "$description"
  done
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

# Ignored env files of a clone, relative paths, node_modules excluded.
forge_env_files() {
  git -C "$1" ls-files --others --ignored --exclude-standard \
    | grep -E '(^|/)\.env[^/]*$' \
    | grep -vE '(^|/)node_modules/' || true
}

# Copies every ignored env file from a clone into a worktree, printing the count.
forge_copy_env() {
  local source="$1" target="$2" file count=0
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    mkdir -p "$target/$(dirname "$file")"
    cp "$source/$file" "$target/$file"
    count=$((count + 1))
  done <<EOT
$(forge_env_files "$source")
EOT
  printf '%s\n' "$count"
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
forge_start_claude() {
  local name="$1" pane="$2" prompt="$3" screen
  forge_herdr agent start "$name" --kind claude --pane "$pane" >/dev/null 2>&1 || true
  forge_herdr agent wait "$name" --until idle --until blocked --timeout 60000 >/dev/null 2>&1 || true
  screen="$(forge_herdr agent read "$name" --source detection 2>/dev/null || true)"
  case "$screen" in
    *"trust this folder"*)
      forge_herdr agent send-keys "$name" down enter >/dev/null
      forge_herdr agent wait "$name" --until idle --timeout 60000 >/dev/null 2>&1 || true ;;
  esac
  forge_herdr agent prompt "$name" "$prompt" >/dev/null
}
