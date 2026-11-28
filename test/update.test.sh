#!/usr/bin/env bash
# Smallest check that fails if forgerdr's update from the herdr app breaks: bin/forge-update.sh check finds the newest
# release tag, keeps the release notes between the installed version and it, and leaves the state as it was when the
# network fails; apply updates the marketplace, then the plugin, then runs the new plugin's install.sh --update, writing
# each piece it says in the state as its line comes, and says which step failed; a piece that fails is no failed step.
# apply --detach returns once the apply is under way and leaves it running on its own, its process kept in the state so
# that no other starts while it lives, and an apply that stops where nothing said why says so in the state.
# Run: bash test/update.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
script="$root/bin/forge-update.sh"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
export FAKE_DIR="$sandbox/fake" FORGE_UPDATE_DIR="$sandbox/update"
state="$FORGE_UPDATE_DIR/state.json"
notes="$FORGE_UPDATE_DIR/notes.md"
mkdir -p "$FAKE_DIR/bin"
real_mktemp="$(command -v mktemp)"
export PATH="$FAKE_DIR/bin:$PATH"

# claude: plugin list answers plugins.json, or fails with FAKE_LIST_FAILS; marketplace update and plugin update fail
# with FAKE_MARKET_FAILS and FAKE_UPDATE_FAILS, and a plugin update that works installs 0.37.0 (nothing with
# FAKE_UPDATE_SAME). git ls-remote answers tags, or fails with
# FAKE_NET_DOWN. curl answers the CHANGELOG.md, or fails with FAKE_CURL_FAILS. Each call is a line in calls.
cat > "$FAKE_DIR/bin/claude" <<'SH'
#!/usr/bin/env bash
printf 'claude %s\n' "$*" >> "$FAKE_DIR/calls"
case "$1 $2" in
  "plugin list") [ -z "${FAKE_LIST_FAILS:-}" ] || exit 1; cat "$FAKE_DIR/plugins.json" ;;
  "plugin marketplace") [ -z "${FAKE_MARKET_FAILS:-}" ] || { echo "marketplace unreachable" >&2; exit 1; } ;;
  "plugin update")
    [ -z "${FAKE_UPDATE_FAILS:-}" ] || { printf 'Updating...\nboom: no such version\n\n' >&2; exit 1; }
    [ -n "${FAKE_UPDATE_SAME:-}" ] || installed 0.37.0 ;;
esac
SH
cat > "$FAKE_DIR/bin/git" <<'SH'
#!/usr/bin/env bash
printf 'git %s\n' "$*" >> "$FAKE_DIR/calls"
[ -z "${FAKE_NET_DOWN:-}" ] || { echo "fatal: unable to access" >&2; exit 128; }
cat "$FAKE_DIR/tags"
SH
cat > "$FAKE_DIR/bin/curl" <<'SH'
#!/usr/bin/env bash
printf 'curl %s\n' "${*: -1}" >> "$FAKE_DIR/calls"
[ -z "${FAKE_CURL_FAILS:-}" ] || exit 22
cat "$FAKE_DIR/CHANGELOG.md"
SH
# installed: writes the plugin list with this version installed, with an install.sh (none with FAKE_NO_INSTALLER) that
# logs its call and whether the state said an apply was under way, then prints the lines of the file lines one by one,
# after each piece's line waiting for the state to show it and logging what it showed (seen [step, how many pieces]),
# then prints FAKE_INSTALL_STDERR on stderr and exits with FAKE_INSTALL_EXIT (0 by default); with FAKE_INSTALL_HOLD it
# waits for the file go before it ends.
cat > "$FAKE_DIR/bin/installed" <<'SH'
#!/usr/bin/env bash
path="$FAKE_DIR/cache/$1"
mkdir -p "$path"
rm -f "$path/install.sh"
[ -n "${FAKE_NO_INSTALLER:-}" ] || cat > "$path/install.sh" <<'INSTALL'
#!/usr/bin/env bash
state="$FORGE_UPDATE_DIR/state.json"
printf 'install %s applying=%s\n' "$*" "$(jq -r '.applying | type' "$state")" >> "$FAKE_DIR/calls"
while IFS= read -r line; do
  printf '%s\n' "$line"
  case "$line" in *$'\t'*) ;; *) continue ;; esac
  for _ in $(seq 50); do [ "$(jq -r '.step' "$state")" = "${line%%$'\t'*}" ] && break; sleep 0.1; done
  printf 'seen %s\n' "$(jq -c '[.step, (.pieces | length)]' "$state")" >> "$FAKE_DIR/calls"
done < "$FAKE_DIR/lines"
[ -z "${FAKE_INSTALL_HOLD:-}" ] || for _ in $(seq 100); do [ -e "$FAKE_DIR/go" ] && break; sleep 0.1; done
[ -z "${FAKE_INSTALL_STDERR:-}" ] || printf 'checking the pieces\n%s\n\n' "$FAKE_INSTALL_STDERR" >&2
exit "${FAKE_INSTALL_EXIT:-0}"
INSTALL
printf '[{"id":"other@market","version":"9.9.9","scope":"user","installPath":"/x"},{"id":"forgerdr@the-forgerdr","version":"%s","scope":"user","installPath":"%s"}]\n' "$1" "$path" > "$FAKE_DIR/plugins.json"
SH
# mktemp: with no argument, as apply calls it, fails with FAKE_MKTEMP_FAILS; otherwise the real one.
cat > "$FAKE_DIR/bin/mktemp" <<SH
#!/usr/bin/env bash
[ \$# -gt 0 ] || [ -z "\${FAKE_MKTEMP_FAILS:-}" ] || { echo "mktemp: No space left on device" >&2; exit 1; }
exec "$real_mktemp" "\$@"
SH
chmod +x "$FAKE_DIR/bin/"*

printf '%s\trefs/tags/v%s\n' a 0.9.0 b 0.35.0 c 0.37.0 d 0.36.0 e 0.10.0 f 0.38.0-rc.1 > "$FAKE_DIR/tags"
cat > "$FAKE_DIR/CHANGELOG.md" <<'MD'
# Changelog

## [Unreleased]

## [0.37.0] - 2026-11-30

### Added

- The newest thing.

## [0.36.0] - 2026-11-25

### Fixed

- A fix.

## 0.35.0 - 2026-11-22

- What is already installed, under a heading with no brackets.
MD

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
status_of() { local status=0; "$@" >/dev/null 2>&1 || status=$?; echo "$status"; }
field() { jq -c "$1" "$state"; }
# What install.sh --update says by default: a line that is no piece's, a piece here, one updated, one installed, one
# that needs a password, the look refreshed and one removed on purpose.
pieces_said() {
  {
    printf 'Checking the pieces\n'
    printf '%s\t%s\t%s\n' jq here "" node updated "" ttt installed "" font missing "needs your password" \
      look refreshed "" azdo removed "removed on purpose: install.sh brings it back"
  } > "$FAKE_DIR/lines"
}
reset() { rm -rf "$FORGE_UPDATE_DIR" "$FAKE_DIR/go"; : > "$FAKE_DIR/calls"; installed 0.35.0; pieces_said; }
# Waits, 10 s at most, for a process to end.
ended() { for _ in $(seq 100); do kill -0 "$1" 2>/dev/null || return 0; sleep 0.1; done; }

# A newer release: its tag found among the others (no prerelease), the notes of every version after the installed one.
reset
expect "check succeeds" 0 "$(status_of bash "$script" check)"
expect "check keeps the installed and the newest release" '["0.35.0","0.37.0"]' "$(field '[.installed, .latest]')"
expect "check notes when it looked" true "$(field '.checked | type == "number"')"
expect "check reads the release notes at the newest tag" \
  "curl https://raw.githubusercontent.com/Gn0m0-dei/the-forgerdr/v0.37.0/CHANGELOG.md" "$(grep '^curl' "$FAKE_DIR/calls")"
expect "the notes hold the versions after the installed one, newest first" \
  "## [0.37.0] - 2026-11-30|### Added|- The newest thing.|## [0.36.0] - 2026-11-25|### Fixed|- A fix." \
  "$(grep -v '^$' "$notes" | paste -sd '|' -)"
expect "only its owner can read the folder" 700 "$(stat -c %a "$FORGE_UPDATE_DIR" 2>/dev/null || stat -f %Lp "$FORGE_UPDATE_DIR")"
expect "nor the state" 600 "$(stat -c %a "$state" 2>/dev/null || stat -f %Lp "$state")"

# Up to date: no notes left from before.
installed 0.37.0
expect "check up to date succeeds" 0 "$(status_of bash "$script" check)"
expect "up to date, both versions match" '["0.37.0","0.37.0"]' "$(field '[.installed, .latest]')"
expect "up to date, no notes" false "$([ -e "$notes" ] && echo true || echo false)"

# The network down: the state stays as it was.
before="$(cat "$state")"
expect "check without network fails" 1 "$(FAKE_NET_DOWN=1 status_of bash "$script" check)"
expect "check without network keeps the state" "$before" "$(cat "$state")"

# Notes that cannot be read do not keep the check from saying there is a release.
reset
expect "check without notes succeeds" 0 "$(FAKE_CURL_FAILS=1 status_of bash "$script" check)"
expect "check without notes still finds the release" '"0.37.0"' "$(field .latest)"
expect "check without notes leaves none" false "$([ -e "$notes" ] && echo true || echo false)"

# Apply: the marketplace, then the plugin in its scope, then the new version's install.sh --update, then a check.
reset
bash "$script" check >/dev/null
: > "$FAKE_DIR/calls"
expect "apply succeeds" 0 "$(status_of bash "$script" apply)"
expect "apply runs its steps in order" \
  "claude plugin list --json|claude plugin marketplace update the-forgerdr|claude plugin update forgerdr@the-forgerdr --scope user|claude plugin list --json|install --update applying=number|claude plugin list --json" \
  "$(grep -v '^git\|^curl\|^seen' "$FAKE_DIR/calls" | paste -sd '|' -)"
expect "apply writes each piece in the state as its line comes" \
  'seen ["jq",1]|seen ["node",2]|seen ["ttt",3]|seen ["font",4]|seen ["look",5]|seen ["azdo",6]' \
  "$(grep '^seen' "$FAKE_DIR/calls" | paste -sd '|' -)"
expect "apply keeps every piece and ends with none under way" \
  '{"step":null,"pieces":[{"piece":"jq","result":"here","detail":""},{"piece":"node","result":"updated","detail":""},{"piece":"ttt","result":"installed","detail":""},{"piece":"font","result":"missing","detail":"needs your password"},{"piece":"look","result":"refreshed","detail":""},{"piece":"azdo","result":"removed","detail":"removed on purpose: install.sh brings it back"}]}' \
  "$(field '{step, pieces}')"
expect "apply records the version it applied" '{"installed":"0.37.0","latest":"0.37.0","applied":"0.37.0","applying":null,"error":null,"pid":null}' \
  "$(field '{installed, latest, applied, applying, error, pid}')"

# A piece that fails (install.sh exits 1) is no failed apply: the plugin is in, and the piece in the state.
reset
bash "$script" check >/dev/null
printf '%s\t%s\t%s\n' jq here "" gh failed "brew: no bottle for gh" > "$FAKE_DIR/lines"
expect "apply with a piece that failed succeeds" 0 \
  "$(FAKE_INSTALL_EXIT=1 FAKE_INSTALL_STDERR="gh went wrong" status_of bash "$script" apply)"
expect "apply with a piece that failed is applied" '{"applied":"0.37.0","applying":null,"error":null,"step":null}' \
  "$(field '{applied, applying, error, step}')"
expect "apply with a piece that failed keeps it" '{"piece":"gh","result":"failed","detail":"brew: no bottle for gh"}' \
  "$(field '.pieces | last')"

# install.sh exiting 1 with no piece that failed died on its own (an unbound variable, say): a failed step.
reset
bash "$script" check >/dev/null
expect "apply whose pieces stop with none failed fails" 1 \
  "$(FAKE_INSTALL_EXIT=1 FAKE_INSTALL_STDERR="install.sh: line 300: piece: unbound variable" status_of bash "$script" apply)"
expect "apply whose pieces stop with none failed says why" '["pieces: install.sh: line 300: piece: unbound variable",null]' \
  "$(field '[.error, .applied]')"

# install.sh dying with nothing said, or with a status of its own, is a failed step, named with its last words.
reset
bash "$script" check >/dev/null
: > "$FAKE_DIR/lines"
expect "apply whose pieces say nothing fails" 1 \
  "$(FAKE_INSTALL_EXIT=1 FAKE_INSTALL_STDERR="install.sh: jq: command not found" status_of bash "$script" apply)"
expect "apply whose pieces say nothing says why" '["pieces: install.sh: jq: command not found",null,null,null]' \
  "$(field '[.error, .applying, .applied, .step]')"
reset
bash "$script" check >/dev/null
expect "apply whose pieces crash fails" 1 \
  "$(FAKE_INSTALL_EXIT=2 FAKE_INSTALL_STDERR="usage: install.sh [--uninstall]" status_of bash "$script" apply)"
expect "apply whose pieces crash says why" '["pieces: usage: install.sh [--uninstall]",null,null]' \
  "$(field '[.error, .applying, .step]')"

# An updated plugin with no install.sh: a failed step, nothing run.
reset
bash "$script" check >/dev/null
: > "$FAKE_DIR/calls"
expect "apply with no install.sh fails" 1 "$(FAKE_NO_INSTALLER=1 status_of bash "$script" apply)"
expect "apply with no install.sh says so" "\"no install.sh in the updated plugin at $FAKE_DIR/cache/0.37.0\"" "$(field .error)"
expect "apply with no install.sh installs nothing" "" "$(grep '^install' "$FAKE_DIR/calls" || true)"

# Detached: under way when it returns, before install.sh ends, with its output read through a pipe as herdr's exec reads
# it; its process in the state; another refused meanwhile, even past the 15 minutes; applied once it ends.
reset
bash "$script" check >/dev/null
: > "$FAKE_DIR/calls"
expect "apply --detach returns at once, read through a pipe" 0 "$(FAKE_INSTALL_HOLD=1 bash "$script" apply --detach; echo $?)"
expect "apply --detach returns with the apply under way" '["number",null]' "$(field '[(.applying | type), .applied]')"
pid="$(field .pid)"
expect "a detached apply keeps its process in the state" 0 "$(status_of kill -0 "$pid")"
expect "apply while a detached one runs is refused" 1 "$(status_of bash "$script" apply --detach)"
jq '.applying = 1000' "$state" > "$state.tmp" && mv "$state.tmp" "$state"
expect "apply while a detached one runs past the 15 minutes is refused" 1 "$(status_of bash "$script" apply --detach)"
bash "$script" check >/dev/null
expect "a check keeps an apply past the 15 minutes whose process lives" 1000 "$(field .applying)"
touch "$FAKE_DIR/go"
ended "$pid"
expect "a detached apply ends applied" '{"applied":"0.37.0","applying":null,"error":null,"step":null,"pid":null}' \
  "$(field '{applied, applying, error, step, pid}')"
expect "a detached apply checks the pieces" "install --update applying=number" "$(grep '^install' "$FAKE_DIR/calls")"
expect "an unknown option to apply is refused" 1 "$(status_of bash "$script" apply --nope)"

# A detached apply that stops where nothing said why (a command failing under set -e) says so in the state, with the
# last line it printed, kept in apply.log for its owner alone.
reset
bash "$script" check >/dev/null
expect "apply --detach that will stop returns" 0 "$(FAKE_MKTEMP_FAILS=1 bash "$script" apply --detach; echo $?)"
ended "$(field .pid)"
expect "a detached apply that stops says why" '["the apply stopped: mktemp: No space left on device",null,null,null]' \
  "$(field '[.error, .applying, .step, .pid]')"
expect "only its owner can read the apply's log" 600 \
  "$(stat -c %a "$FORGE_UPDATE_DIR/apply.log" 2>/dev/null || stat -f %Lp "$FORGE_UPDATE_DIR/apply.log")"
# Stopped by a SIGTERM, which waits for install.sh to end, it says so too.
reset
bash "$script" check >/dev/null
expect "apply --detach to be stopped returns" 0 "$(FAKE_INSTALL_HOLD=1 bash "$script" apply --detach; echo $?)"
pid="$(field .pid)"
kill -TERM "$pid"
touch "$FAKE_DIR/go"
ended "$pid"
expect "a detached apply stopped by a SIGTERM says so" '["the apply stopped: exit 143",null,null,null]' \
  "$(field '[.error, .applying, .step, .pid]')"
# Not detached, it says so too, its output being the caller's.
reset
bash "$script" check >/dev/null
expect "apply that stops fails" 1 "$(FAKE_MKTEMP_FAILS=1 status_of bash "$script" apply)"
expect "apply that stops says so" '["the apply stopped: exit 1",null,null]' "$(field '[.error, .applying, .pid]')"

# A step that fails: named with its last words, nothing after it runs, the state no longer applying, and what an apply
# before it said gone.
reset
bash "$script" check >/dev/null
jq '.step = "jq" | .pieces = [{piece: "jq", result: "here", detail: ""}]' "$state" > "$state.tmp" && mv "$state.tmp" "$state"
: > "$FAKE_DIR/calls"
expect "apply that fails fails" 1 "$(FAKE_UPDATE_FAILS=1 status_of bash "$script" apply)"
expect "apply that fails says which step and why" '"plugin update: boom: no such version"' "$(field .error)"
expect "apply that fails is no longer applying" null "$(field .applying)"
expect "apply that fails installs nothing" "" "$(grep '^install' "$FAKE_DIR/calls" || true)"
expect "apply that fails keeps the release offered" '["0.35.0","0.37.0"]' "$(field '[.installed, .latest]')"
expect "apply that fails starts with no pieces and ends with none under way" '[[],null]' "$(field '[.pieces, .step]')"

# A plugin update that changes nothing is a failure, not an offer made again.
reset
bash "$script" check >/dev/null
expect "apply that installs nothing new fails" 1 "$(FAKE_UPDATE_SAME=1 status_of bash "$script" apply)"
expect "apply that installs nothing new says so" '"plugin update: still at 0.35.0"' "$(field .error)"

# Updated meanwhile from the command line, before the state looked again: nothing to update, the pieces still checked.
reset
bash "$script" check >/dev/null
installed 0.37.0
: > "$FAKE_DIR/calls"
expect "apply after an update elsewhere succeeds" 0 "$(FAKE_UPDATE_SAME=1 status_of bash "$script" apply)"
expect "apply after an update elsewhere checks the pieces" "install --update applying=number" "$(grep '^install' "$FAKE_DIR/calls")"
expect "apply after an update elsewhere records it" '["0.37.0",null]' "$(field '[.applied, .error]')"

# A failure before any step still lands in the state.
reset
bash "$script" check >/dev/null
expect "apply that cannot list the plugins fails" 1 "$(FAKE_LIST_FAILS=1 status_of bash "$script" apply)"
expect "apply that cannot list the plugins says so" '["claude plugin list failed",null]' "$(field '[.error, .applying]')"

# An apply under way refuses another, writing nothing and running nothing; one started long ago died.
reset
bash "$script" check >/dev/null
jq --argjson at "$(($(date +%s) * 1000))" '.applying = $at' "$state" > "$state.tmp" && mv "$state.tmp" "$state"
: > "$FAKE_DIR/calls"
expect "apply while one is under way is refused" 1 "$(status_of bash "$script" apply)"
expect "apply while one is under way runs nothing" "" "$(cat "$FAKE_DIR/calls")"
jq '.applying = 1000' "$state" > "$state.tmp" && mv "$state.tmp" "$state"
expect "apply after one that died succeeds" 0 "$(status_of bash "$script" apply)"
# Its process number now another program's (after a restart, say) keeps nothing from starting.
jq --argjson pid "$$" '.applying = 1000 | .pid = $pid' "$state" > "$state.tmp" && mv "$state.tmp" "$state"
expect "apply after one whose process number another program has succeeds" 0 "$(status_of bash "$script" apply)"

# A check forgets an apply that died long ago, and an old failure once a newer release is out.
reset
bash "$script" check >/dev/null
jq '.applying = 1000 | .error = "plugin update: boom"' "$state" > "$state.tmp" && mv "$state.tmp" "$state"
bash "$script" check >/dev/null
expect "a check keeps the failure of the same release, forgets a dead apply" '["plugin update: boom",null]' \
  "$(field '[.error, .applying]')"
printf '%s\trefs/tags/v%s\n' g 0.38.0 >> "$FAKE_DIR/tags"
bash "$script" check >/dev/null
expect "a check forgets the failure once a newer release is out" '["0.38.0",null]' "$(field '[.latest, .error]')"

expect "an unknown command is refused" 1 "$(status_of bash "$script" nope)"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all update checks passed\n'
