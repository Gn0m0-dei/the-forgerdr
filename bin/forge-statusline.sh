#!/usr/bin/env bash
# Claude Code's status line for forgerdr. Claude Code hands its status line a JSON on stdin; this keeps what it says of
# the subscription's limits (rate_limits: the 5-hour and the weekly window) for the forgerdr look's usage bar, then hands
# the same JSON to the status line the user had before and prints what that prints, so the user keeps their line.
# Usage: forge-statusline.sh            as the statusLine command (stdin: Claude Code's JSON)
#        forge-statusline.sh install    makes it the statusLine of Claude Code's settings, keeping the one before
#        forge-statusline.sh remove     puts the one before back
#        forge-statusline.sh status     says whether it is installed, what it hands on to and what it last saw
# Keeps: ${XDG_STATE_HOME:-~/.local/state}/forgerdr/usage/claude.json, the windows as every session tells them, as
#        {"at": <epoch s>, "windows": {"five_hour": {"used": <%>, "resets_at": <epoch s>}, "seven_day": {...}}}
#        (each window keeps its newest period and, within it, the highest use any session sent; a window goes once its
#        reset passes; a JSON with no rate_limits, before a session's first answer, leaves the file as it was), and
#        sessions/<terminal>.json, the context of the session in each herdr terminal: {"used": <%>, "size", "session", "at"},
#        and history.jsonl beside it, one sample
#        {"at", "five_hour", "seven_day"} a minute at most while the numbers change, the last 7 days.
# Settings: ${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json; the status line before forgerdr's is kept in
#        ${XDG_CONFIG_HOME:-~/.config}/forgerdr/statusline.json, and install and remove back the settings up first.
set -uo pipefail

state="${XDG_STATE_HOME:-$HOME/.local/state}/forgerdr/usage"
chain="${XDG_CONFIG_HOME:-$HOME/.config}/forgerdr/statusline.json"
copy="${XDG_DATA_HOME:-$HOME/.local/share}/forgerdr/forge-statusline.sh"
settings="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
week=$((7 * 24 * 3600))
history_cap=11000

die() { printf 'forge-statusline: %s\n' "$1" >&2; exit 1; }

# The statusLine command that runs forgerdr's: the copy that stays put across plugin versions.
ours() { printf 'bash %q' "$copy"; }

# Writes a file whole or not at all: through a temporary file of its own beside it, so status lines of several sessions
# writing at once never leave it half written.
write_whole() {
  local target="$1" tmp
  tmp="$(mktemp "$target.XXXXXX")" || return 1
  if cat > "$tmp" && mv "$tmp" "$target"; then return 0; fi
  rm -f "$tmp"
  return 1
}

# Keeps how full the session's context is, in a file of the herdr terminal the session runs in (HC_TERMINAL_ID, which
# the session's status line inherits), so the golem that stands for it can show it; each session writes only its own.
# Files a day old go.
remember_context() {
  local payload="$1" now="$2" terminal="${HC_TERMINAL_ID:-}" context dir="$state/sessions"
  [[ "$terminal" =~ ^[A-Za-z0-9_-]+$ ]] || return 0
  context="$(jq -c --argjson at "$now" '
    if (.context_window.used_percentage? | type) != "number" then empty else
      {used: .context_window.used_percentage, size: .context_window.context_window_size, session: .session_id, at: $at}
    end' <<<"$payload" 2>/dev/null)"
  [ -n "$context" ] || return 0
  mkdir -p "$dir" || return 0
  printf '%s\n' "$context" | write_whole "$dir/$terminal.json"
  find "$dir" -name '*.json' -mtime +1 -delete 2>/dev/null || true
}

# Keeps the windows the JSON tells of, and a sample of them in the history. Never fails the status line.
record() {
  local payload="$1" now windows last
  now="$(date +%s)"
  remember_context "$payload" "$now"
  local sent known
  sent="$(jq -c --argjson now "$now" '
    if (.rate_limits | type) != "object" then empty else
      .rate_limits
      | {five_hour, seven_day}
      | with_entries(select((.value.used_percentage? | type) == "number" and ((.value.resets_at? // 0) > $now)))
      | map_values({used: .used_percentage, resets_at})
    end' <<<"$payload" 2>/dev/null)" || return 0
  [ -n "$sent" ] || return 0
  mkdir -p "$state" || return 0
  known="$(jq -c '.windows // {}' "$state/claude.json" 2>/dev/null)"
  [ -n "$known" ] || known="{}"
  # Every session sends what it last heard, so one that has not asked for a while sends old numbers, or a window less:
  # a window keeps its newest period (the later reset) and, within a period, its highest use (use only grows in one);
  # a window a session leaves out stays until its reset passes.
  windows="$(jq -cn --argjson now "$now" --argjson known "$known" --argjson sent "$sent" '
    def same($a; $b): (($a.resets_at - $b.resets_at) | fabs) < 120;
    reduce ($sent | to_entries[]) as $w ($known;
      .[$w.key] as $old
      | .[$w.key] = (
          if $old == null or ($w.value.resets_at > $old.resets_at and (same($w.value; $old) | not)) then $w.value
          elif same($w.value; $old) then {used: ([$old.used, $w.value.used] | max), resets_at: ([$old.resets_at, $w.value.resets_at] | max)}
          else $old end))
    | with_entries(select((.value.resets_at // 0) > $now))')" || return 0
  jq -cn --argjson at "$now" --argjson windows "$windows" '{at: $at, windows: $windows}' | write_whole "$state/claude.json"

  local sample history="$state/history.jsonl"
  sample="$(jq -c --argjson at "$now" '{at: $at, five_hour: .five_hour.used, seven_day: .seven_day.used}' <<<"$windows")"
  last="$(tail -n 1 "$history" 2>/dev/null)"
  if [ -n "$last" ] && jq -e --argjson now "$now" --argjson sample "$sample" '
      ($now - .at) < 60 or (.five_hour == $sample.five_hour and .seven_day == $sample.seven_day and ($now - .at) < 600)
    ' <<<"$last" >/dev/null 2>&1; then
    return 0
  fi
  printf '%s\n' "$sample" >> "$history"
  if [ "$(wc -l < "$history")" -gt "$history_cap" ]; then
    jq -c --argjson since "$((now - week))" 'select(.at >= $since)' "$history" | tail -n "$history_cap" |
      write_whole "$history"
  fi
}

previous_command() {
  [ -f "$chain" ] || return 0
  jq -r '.previous.command // empty' "$chain" 2>/dev/null
}

line() {
  local payload command
  payload="$(cat)"
  record "$payload" >/dev/null 2>&1
  command="$(previous_command)"
  # Never hand on to itself: an install over its own line keeps no loop.
  [ -n "$command" ] && [ "$command" != "$(ours)" ] || exit 0
  printf '%s' "$payload" | bash -c "$command"
}

# Writes the settings with a jq filter, after a backup, keeping the file itself (a link stays a link).
write_settings() {
  local filter="$1"; shift
  local backup
  backup="$settings.forgerdr-$(date +%Y%m%d%H%M%S).bak"
  cp "$settings" "$backup" || die "cannot back $settings up"
  jq "$@" "$filter" "$settings" > "$settings.forgerdr.tmp" || { rm -f "$settings.forgerdr.tmp"; die "cannot write $settings"; }
  cat "$settings.forgerdr.tmp" > "$settings" && rm -f "$settings.forgerdr.tmp"
  printf 'forge-statusline: backed %s up to %s\n' "$settings" "$backup"
}

check_settings() {
  command -v jq >/dev/null || die "jq is needed"
  mkdir -p "$(dirname "$settings")"
  [ -f "$settings" ] || printf '{}\n' > "$settings"
  jq -e 'type == "object"' "$settings" >/dev/null 2>&1 || die "$settings is not a JSON object: left as it is"
}

install() {
  check_settings
  mkdir -p "$(dirname "$copy")" "$(dirname "$chain")"
  if ! { cp "$0" "$copy.tmp" && chmod +x "$copy.tmp" && mv "$copy.tmp" "$copy"; }; then
    die "cannot copy itself to $copy"
  fi
  local current
  current="$(jq -c '.statusLine // null' "$settings")"
  if [ "$(jq -r '.command? // empty' <<<"$current")" = "$(ours)" ]; then
    printf 'forge-statusline: already the status line; its copy at %s is up to date\n' "$copy"
    return 0
  fi
  jq -n --argjson previous "$current" '{previous: $previous}' > "$chain"
  # shellcheck disable=SC2016 # a jq filter: $previous and $command are jq's
  write_settings '.statusLine = (($previous // {}) + {type: "command", command: $command})' \
    --argjson previous "$current" --arg command "$(ours)"
  if [ "$current" = "null" ]; then
    printf 'forge-statusline: installed; there was no status line before\n'
  else
    printf 'forge-statusline: installed; it hands on to: %s\n' "$(jq -r '.command // "(no command)"' <<<"$current")"
  fi
}

remove() {
  check_settings
  if [ "$(jq -r '.statusLine.command? // empty' "$settings")" != "$(ours)" ]; then
    printf 'forge-statusline: not the status line; %s left as it is\n' "$settings"
    return 0
  fi
  local previous="null"
  [ -f "$chain" ] && previous="$(jq -c '.previous // null' "$chain")"
  # shellcheck disable=SC2016 # a jq filter: $previous is jq's
  write_settings 'if $previous == null then del(.statusLine) else .statusLine = $previous end' --argjson previous "$previous"
  rm -f "$chain" "$copy"
  printf 'forge-statusline: removed; the status line is the one before again\n'
}

status() {
  local here="no"
  [ -f "$settings" ] && [ "$(jq -r '.statusLine.command? // empty' "$settings" 2>/dev/null)" = "$(ours)" ] && here="yes"
  printf 'installed: %s\n' "$here"
  printf 'hands on to: %s\n' "$(previous_command || true)"
  if [ -f "$state/claude.json" ]; then
    jq -r --argjson now "$(date +%s)" '"last seen: \($now - .at) s ago, windows: \(.windows | keys | join(", "))"' \
      "$state/claude.json"
  else
    printf 'last seen: never\n'
  fi
}

case "${1:-}" in
  "") line ;;
  install) install ;;
  remove) remove ;;
  status) status ;;
  *) die "usage: forge-statusline.sh [install | remove | status]" ;;
esac
