#!/usr/bin/env bash
# engram HTTP helpers for the hooks. Sourced, never executed.
# shellcheck shell=bash

ENGRAM_URL="http://127.0.0.1:${ENGRAM_PORT:-7437}"

engram_ensure_serve() {
  command -v engram >/dev/null 2>&1 || return 1
  curl -sf "$ENGRAM_URL/health" --max-time 1 >/dev/null 2>&1 && return 0
  engram serve >/dev/null 2>&1 &
  sleep 0.5
  curl -sf "$ENGRAM_URL/health" --max-time 1 >/dev/null 2>&1
}

engram_post() {
  curl -sf "$ENGRAM_URL$1" -X POST -H 'Content-Type: application/json' -d "$2" --max-time 3 >/dev/null 2>&1 || true
}

# Folds the projects engram derived from directory names (the cwd and the repository) into the workspace key.
engram_merge_split_projects() {
  local cwd="$1" key="$2" old top
  top="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$cwd")"
  for old in "$(basename "$cwd")" "$(basename "$top")"; do
    old="$(printf '%s' "$old" | tr '[:upper:]' '[:lower:]')"
    [ "$old" = "$key" ] && continue
    engram_post /projects/migrate "$(jq -cn --arg old "$old" --arg new "$key" '{old_project:$old,new_project:$new}')"
  done
}

engram_register_session() {
  engram_post /sessions "$(jq -cn --arg id "$1" --arg project "$2" --arg dir "$3" '{id:$id,project:$project,directory:$dir}')"
}

engram_end_session() {
  engram_post "/sessions/$1/end" '{}'
}

engram_capture() {
  engram_post /observations/passive "$(jq -cn --arg sid "$1" --arg project "$2" --arg content "$3" --arg source "$4" '{session_id:$sid,project:$project,content:$content,source:$source}')"
}

engram_context() {
  curl -sf "$ENGRAM_URL/context?project=$(printf '%s' "$1" | jq -sRr @uri)" --max-time 3 2>/dev/null | jq -r '.context // empty'
}
