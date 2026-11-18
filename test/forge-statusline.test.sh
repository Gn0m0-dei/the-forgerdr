#!/usr/bin/env bash
# Smallest check that fails if forge-statusline.sh breaks: what it keeps of the subscription's windows (none sent,
# one expired, history), the hand-on to the status line before it, and install and remove on a sandboxed Claude Code.
# Run: bash test/forge-statusline.test.sh
set -euo pipefail
bin="$(cd "$(dirname "$0")/.." && pwd)/bin/forge-statusline.sh"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
unset HC_TERMINAL_ID
export HOME="$sandbox/home" XDG_STATE_HOME="$sandbox/state" XDG_CONFIG_HOME="$sandbox/config" \
  XDG_DATA_HOME="$sandbox/data" CLAUDE_CONFIG_DIR="$sandbox/claude"
mkdir -p "$HOME" "$CLAUDE_CONFIG_DIR"
usage="$XDG_STATE_HOME/forgerdr/usage"
settings="$CLAUDE_CONFIG_DIR/settings.json"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}

now="$(date +%s)"
later=$((now + 3600))
payload() { # five-hour %, its reset, seven-day %, its reset
  jq -cn --argjson f "$1" --argjson fr "$2" --argjson s "$3" --argjson sr "$4" \
    '{session_id: "s1", rate_limits: {five_hour: {used_percentage: $f, resets_at: $fr}, seven_day: {used_percentage: $s, resets_at: $sr}}}'
}

# As the status line, with nothing to hand on to.
out="$(payload 19 "$later" 27 "$later" | bash "$bin")"
expect "prints nothing of its own" "" "$out"
expect "keeps both windows" "19 27" "$(jq -r '"\(.windows.five_hour.used) \(.windows.seven_day.used)"' "$usage/claude.json")"
expect "with their resets" "$later" "$(jq -r '.windows.five_hour.resets_at' "$usage/claude.json")"
expect "and a first sample" 1 "$(wc -l < "$usage/history.jsonl" | tr -d ' ')"

printf '{"session_id":"s2","model":{"display_name":"Opus"}}' | bash "$bin" >/dev/null
expect "a JSON without windows leaves the last ones" "19" "$(jq -r '.windows.five_hour.used' "$usage/claude.json")"

jq -cn --argjson r "$later" '{rate_limits: {seven_day: {used_percentage: 30, resets_at: $r}}}' | bash "$bin" >/dev/null
expect "a window a session leaves out stays" "19 30" \
  "$(jq -r '"\(.windows.five_hour.used) \(.windows.seven_day.used)"' "$usage/claude.json")"
payload 12 "$later" 25 "$later" | bash "$bin" >/dev/null
expect "an idle session's older numbers do not lower a window" "19 30" \
  "$(jq -r '"\(.windows.five_hour.used) \(.windows.seven_day.used)"' "$usage/claude.json")"
next=$((later + 5 * 3600))
payload 3 "$next" 31 "$later" | bash "$bin" >/dev/null
expect "a newer period replaces the window" "3 $next" \
  "$(jq -r '"\(.windows.five_hour.used) \(.windows.five_hour.resets_at)"' "$usage/claude.json")"
jq -c --argjson past $((now - 10)) '.windows.five_hour.resets_at = $past' "$usage/claude.json" > "$sandbox/c" &&
  mv "$sandbox/c" "$usage/claude.json"
jq -cn --argjson r "$later" '{rate_limits: {seven_day: {used_percentage: 31, resets_at: $r}}}' | bash "$bin" >/dev/null
expect "a window goes once its reset passes" "seven_day" "$(jq -r '.windows | keys | join(",")' "$usage/claude.json")"
expect "a sample within the minute is not kept" 1 "$(wc -l < "$usage/history.jsonl" | tr -d ' ')"

jq -c '.at -= 120' "$usage/history.jsonl" > "$sandbox/h" && mv "$sandbox/h" "$usage/history.jsonl"
payload 41 "$later" 31 "$later" | bash "$bin" >/dev/null
expect "a changed sample after a minute is kept" 2 "$(wc -l < "$usage/history.jsonl" | tr -d ' ')"

# The session's context, by the herdr terminal it runs in.
printf '{"session_id":"s9","context_window":{"used_percentage":61,"context_window_size":1000000}}' |
  HC_TERMINAL_ID=t5 bash "$bin" >/dev/null
printf '{"session_id":"s8","context_window":{"used_percentage":12,"context_window_size":200000}}' |
  HC_TERMINAL_ID=t7 bash "$bin" >/dev/null
expect "keeps each terminal's context" "61 12" "$(jq -r '"\(.t5.used) \(.t7.used)"' "$usage/sessions.json")"
printf '{"session_id":"s9","context_window":{"used_percentage":8,"context_window_size":1000000}}' |
  HC_TERMINAL_ID=t5 bash "$bin" >/dev/null
expect "a compacted session's context falls" 8 "$(jq -r '.t5.used' "$usage/sessions.json")"
printf '{"session_id":"s0","context_window":{"used_percentage":50}}' | bash "$bin" >/dev/null
expect "outside herdr no context is kept" "t5,t7" "$(jq -r 'keys | join(",")' "$usage/sessions.json")"

# Install over the user's status line, which gets the same JSON and is what shows.
cat > "$sandbox/theirs.sh" <<'SH'
#!/usr/bin/env bash
cat > "$(dirname "$0")/seen.json"
printf 'their line\n'
SH
chmod +x "$sandbox/theirs.sh"
theirs="bash $sandbox/theirs.sh"
jq -n --arg command "$theirs" '{model: "opus", statusLine: {type: "command", command: $command, refreshInterval: 60}}' > "$settings"
cp "$settings" "$sandbox/original.json"
bash "$bin" install >/dev/null
ours="$(printf 'bash %q' "$XDG_DATA_HOME/forgerdr/forge-statusline.sh")"
expect "install makes it the status line" "$ours" "$(jq -r '.statusLine.command' "$settings")"
expect "keeping the line's other settings" 60 "$(jq -r '.statusLine.refreshInterval' "$settings")"
expect "and the rest of the settings" opus "$(jq -r '.model' "$settings")"
expect "after a backup" 1 "$(find "$CLAUDE_CONFIG_DIR" -name 'settings.json.forgerdr-*.bak' | wc -l | tr -d ' ')"
expect "from a copy of its own" yes "$([ -x "$XDG_DATA_HOME/forgerdr/forge-statusline.sh" ] && echo yes || echo no)"

out="$(payload 50 "$later" 60 "$later" | bash -c "$ours")"
expect "the user's line is what shows" "their line" "$out"
expect "it gets the same JSON" 50 "$(jq -r '.rate_limits.five_hour.used_percentage' "$sandbox/seen.json")"
expect "while the windows are kept" 50 "$(jq -r '.windows.five_hour.used' "$usage/claude.json")"

bash "$bin" install >/dev/null
expect "a second install keeps the user's line to hand on to" "$theirs" \
  "$(jq -r '.previous.command' "$XDG_CONFIG_HOME/forgerdr/statusline.json")"

bash "$bin" remove >/dev/null
expect "remove puts the user's line back" "$(jq -S . "$sandbox/original.json")" "$(jq -S . "$settings")"
expect "and takes its copy" no "$([ -e "$XDG_DATA_HOME/forgerdr/forge-statusline.sh" ] && echo yes || echo no)"

# Without a status line before, remove leaves none.
printf '{"model":"opus"}\n' > "$settings"
bash "$bin" install >/dev/null
out="$(payload 1 "$later" 2 "$later" | bash -c "$ours")"
expect "with no line before it prints nothing" "" "$out"
bash "$bin" remove >/dev/null
expect "remove leaves no status line" null "$(jq -c '.statusLine' "$settings")"

printf '{ "model": "opus", // a comment\n}\n' > "$settings"
cp "$settings" "$sandbox/broken.json"
expect "settings that are not plain JSON are refused" 1 "$(bash "$bin" install >/dev/null 2>&1; echo $?)"
expect "and left as they were" "" "$(diff "$sandbox/broken.json" "$settings")"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all good\n'
