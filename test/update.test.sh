#!/usr/bin/env bash
# Smallest check that fails if forgerdr's update from the herdr app breaks: bin/forge-update.sh check finds the newest
# release tag, keeps the release notes between the installed version and it, and leaves the state as it was when the
# network fails; apply updates the marketplace, the plugin and the herdr look in that order, and says which step failed.
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
# installed: writes the plugin list with this version installed, its installer logging its call and whether the state
# said an apply was under way while it ran; it fails with FAKE_INSTALL_FAILS.
cat > "$FAKE_DIR/bin/installed" <<'SH'
#!/usr/bin/env bash
path="$FAKE_DIR/cache/$1"
mkdir -p "$path/bin"
cat > "$path/bin/forge-herdr-install.sh" <<'INSTALL'
#!/usr/bin/env bash
printf 'install applying=%s\n' "$(jq -r '.applying | type' "$FORGE_UPDATE_DIR/state.json")" >> "$FAKE_DIR/calls"
[ -z "${FAKE_INSTALL_FAILS:-}" ] || { echo "kept 2 files changed by hand" >&2; echo "cannot write the layout" >&2; exit 1; }
INSTALL
printf '[{"id":"other@market","version":"9.9.9","scope":"user","installPath":"/x"},{"id":"forgerdr@the-forgerdr","version":"%s","scope":"user","installPath":"%s"}]\n' "$1" "$path" > "$FAKE_DIR/plugins.json"
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
reset() { rm -rf "$FORGE_UPDATE_DIR"; : > "$FAKE_DIR/calls"; installed 0.35.0; }

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
expect "the state is the user's alone" 600 "$(stat -f '%Lp' "$state" 2>/dev/null || stat -c '%a' "$state")"

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

# Apply: the marketplace, then the plugin in its scope, then the new version's look, then a check.
reset
bash "$script" check >/dev/null
: > "$FAKE_DIR/calls"
expect "apply succeeds" 0 "$(status_of bash "$script" apply)"
expect "apply runs its steps in order" \
  "claude plugin list --json|claude plugin marketplace update the-forgerdr|claude plugin update forgerdr@the-forgerdr --scope user|claude plugin list --json|install applying=number|claude plugin list --json" \
  "$(grep -v '^git\|^curl' "$FAKE_DIR/calls" | paste -sd '|' -)"
expect "apply records the version it applied" '{"installed":"0.37.0","latest":"0.37.0","applied":"0.37.0","applying":null,"error":null}' \
  "$(field '{installed, latest, applied, applying, error}')"

# A step that fails: named with its last words, nothing after it runs, the state no longer applying.
reset
bash "$script" check >/dev/null
: > "$FAKE_DIR/calls"
expect "apply that fails fails" 1 "$(FAKE_UPDATE_FAILS=1 status_of bash "$script" apply)"
expect "apply that fails says which step and why" '"plugin update: boom: no such version"' "$(field .error)"
expect "apply that fails is no longer applying" null "$(field .applying)"
expect "apply that fails installs nothing" "" "$(grep '^install' "$FAKE_DIR/calls" || true)"
expect "apply that fails keeps the release offered" '["0.35.0","0.37.0"]' "$(field '[.installed, .latest]')"

# The installer fails: named with its last line.
reset
bash "$script" check >/dev/null
expect "apply whose look fails fails" 1 "$(FAKE_INSTALL_FAILS=1 status_of bash "$script" apply)"
expect "apply whose look fails says so" '"the herdr look: cannot write the layout"' "$(field .error)"

# A plugin update that changes nothing is a failure, not an offer made again.
reset
bash "$script" check >/dev/null
expect "apply that installs nothing new fails" 1 "$(FAKE_UPDATE_SAME=1 status_of bash "$script" apply)"
expect "apply that installs nothing new says so" '"plugin update: still at 0.35.0"' "$(field .error)"

# Updated meanwhile from the command line, before the state looked again: nothing to update, the look still put in.
reset
bash "$script" check >/dev/null
installed 0.37.0
: > "$FAKE_DIR/calls"
expect "apply after an update elsewhere succeeds" 0 "$(FAKE_UPDATE_SAME=1 status_of bash "$script" apply)"
expect "apply after an update elsewhere puts its look in" "install applying=number" "$(grep '^install' "$FAKE_DIR/calls")"
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
