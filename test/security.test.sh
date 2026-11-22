#!/usr/bin/env bash
# Smallest check that fails if the security view's bridge breaks: bin/forge-security.sh launches a security session
# parked behind its security view, in a tab of their own, keeps the audit and its findings in a file per terminal for
# that session alone, shows them to the mod, and closes the view when the triage is over.
# Run: bash test/security.test.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
script="$root/bin/forge-security.sh"
sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
# shellcheck source=test/fakes.sh
. "$root/test/fakes.sh"
fakes_install "$sandbox"
export FORGE_SECURITY_DIR="$sandbox/security"
dir="$FORGE_SECURITY_DIR"
cd "$sandbox"

failures=0
expect() {
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; failures=$((failures + 1)); fi
}
status_of() { local status=0; "$@" >/dev/null 2>&1 || status=$?; echo "$status"; }

# The script as the security session launch opened in herdr terminal t7 runs it, as the session that launches one
# (t7 too) runs it, and as the mod runs it (no terminal of its own).
sec() { HC_TERMINAL_ID=t7 FORGE_SECURITY_VIEW=1 bash "$script" "$@"; }
lead() { HC_TERMINAL_ID=t7 bash "$script" "$@"; }
mod() { bash "$script" "$@"; }
field() { jq -r "$1" "$dir/t7.json"; }
exists() { [ -e "$1" ] && echo true || echo false; }
# What herdr-app ls answers: the session's space with the session's tab and this tab, holding these terminals; with
# "lone", the space holds this tab alone.
listed() {
  jq -n --arg tab "$1" --argjson terminals "$2" --arg lone "${3:-}" \
    '{spaces: [{id: "sp-own", tabs: ((if $lone == "" then [{id: "tb-session", terminals: [{terminal: "t7", pane: "p-t7"}]}]
      else [] end) + [{id: $tab, terminals: $terminals}])}]}' > "$FAKE_DIR/ls.json"
}
layout() { jq -n --arg layout "$1" '{layout: $layout}' > "$FAKE_DIR/status.json"; }
copies() { find "$dir" -maxdepth 1 -name '.findings.*'; }

# A fake that fails the calls starting with the words in FAIL_ON, and hands the rest to the fake in FAIL_FAKE.
cat > failing <<'SH'
#!/usr/bin/env bash
case "$* " in "$FAIL_ON "*) exit 1 ;; esac
exec "$FAIL_FAKE" "$@"
SH
chmod +x failing
# The security session's command, with the herdr app or hc failing the calls that start with the first argument; what
# it says on stderr, and how it exits.
app_failing() {
  local status=0
  { FORGE_HERDR_APP="$sandbox/failing" FAIL_FAKE="$FAKE_DIR/herdr-app" FAIL_ON="$1" sec "${@:2}" >/dev/null; } 2>&1 \
    || status=$?
  echo "exit $status"
}
hc_failing() {
  local status=0
  { FORGE_HC="$sandbox/failing" FAIL_FAKE="$FAKE_DIR/hc" FAIL_ON="$1" sec "${@:2}" >/dev/null; } 2>&1 || status=$?
  echo "exit $status"
}

# The session is parked behind its view, in tab tb-view.
fake_terminal t7 live "" "" herdr.space=sp-own forge.tab=tb-view
listed tb-view '[]'
cat > audit.json <<'JSON'
{"title": "#18 session-restore", "scope": "git diff origin/main...HEAD", "item": "#18"}
JSON
cat > findings.json <<'JSON'
[{"id": "F2", "status": "confirmed", "severity": "high", "path": "src/restore.rs", "line": 41,
  "title": "session file read through a symlink", "who": "another local user", "input": "a planted symlink",
  "control": "none", "trace": "restore() opens the path as given", "effect": "reads any file the user can",
  "fix": "open with O_NOFOLLOW", "test": "a symlinked session file is refused",
  "verifier": {"verdict": "confirmed"}},
 {"id": "F1", "status": "needs-validation", "path": "", "line": null, "title": "token in the log",
  "fact": "the log level in production", "check": "grep the deployed config"},
 {"id": "F3", "status": "rejected", "path": "src/socket.rs", "line": 12, "title": "socket open to all",
  "reason": "the directory is 700", "verifier": {"verdict": "rejected", "was": "medium"}}]
JSON

outside='forgerdr: not inside the herdr app: triage in the chat'
expect "open outside the herdr app is refused, saying so once" "$outside" "$(bash "$script" open audit.json 2>&1 || true)"
expect "and so are findings" "$outside" "$(bash "$script" findings findings.json 2>&1 || true)"
expect "and done" "$outside" "$(bash "$script" "done" 2>&1 || true)"
expect "and forget" "$outside" "$(bash "$script" forget 2>&1 || true)"
expect "and nothing is written" false "$(exists "$dir")"
# open runs in the session launch opened alone: told so (FORGE_SECURITY_VIEW) and parked behind a listed tab.
elsewhere='forgerdr: open runs inside the security session launch opens: run forge-security.sh launch'
expect "open in a session launch did not open is refused" "$elsewhere"$'\nexit 1' \
  "$(lead open audit.json 2>&1 >/dev/null; echo "exit $?")"
fake_terminal t6 live "" "" herdr.space=sp-own
expect "and so is open in one told so but parked behind no tab" "$elsewhere" \
  "$(HC_TERMINAL_ID=t6 FORGE_SECURITY_VIEW=1 bash "$script" open audit.json 2>&1 || true)"
fake_terminal t6 live "" "" herdr.space=sp-own forge.tab=tb-left
expect "or behind a tab the app no longer lists" "$elsewhere" \
  "$(HC_TERMINAL_ID=t6 FORGE_SECURITY_VIEW=1 bash "$script" open audit.json 2>&1 || true)"
rm -f "$FAKE_DIR/terminals/t6.json"
# A review session is parked behind its review view, labelled with its tab, and has no forge.review label yet (or
# no longer): open is refused there, and done never closes its review's tab.
fake_terminal t2 live "" "" herdr.space=sp-own forge.tab=tb-review
listed tb-review '[]'
expect "open in a review session parked behind its view is refused" "$elsewhere" \
  "$(HC_TERMINAL_ID=t2 bash "$script" open audit.json 2>&1 || true)"
HC_TERMINAL_ID=t2 bash "$script" "done"
expect "and done there leaves its review's tab open" no "$(called herdr-app "do" tab.close)"
expect "open opens no tab, nor writes a file" 'no false false' \
  "$(called herdr-app "do" tab.new) $(exists "$dir/t6.json") $(exists "$dir/t2.json")"
listed tb-view '[]'
for audit in '{"scope": "src/"}' '{"title": "", "scope": "src/"}' '{"title": "a"}' \
  '{"title": "a", "scope": "src/", "item": 5}' '"a"'; do
  printf '%s' "$audit" > refused.json
  expect "the audit $audit is refused" 'forgerdr: not an audit: it needs a title and a scope' \
    "$(sec open refused.json 2>&1 || true)"
done
expect "and writes no file" false "$(exists "$dir/t7.json")"

# The view is there already: no layout is asked for.
layout main
: > "$FAKE_CALLS"
expect "open prints the tab of the view the session is parked behind" tb-view "$(sec open audit.json)"
expect "and opens no tab" no "$(called herdr-app "do" tab.new)"
expect "open labels the terminal, so the inbox sends its triage question to the view" yes \
  "$(called hc label t7 forge.review=security forge.view=tb-view)"
expect "open keeps the audit, the tab and no findings yet" '1 t7 tb-view 0 #18 session-restore #18 0' \
  "$(field '"\(.v) \(.terminal) \(.tab) \(.sent) \(.audit.title) \(.audit.item) \(.findings | length)"')"
expect "only its owner can read it" 700 "$(stat -c %a "$dir" 2>/dev/null || stat -f %Lp "$dir")"
expect "nor the file" 600 "$(stat -c %a "$dir/t7.json" 2>/dev/null || stat -f %Lp "$dir/t7.json")"

# A finding of each status the shapes take, whole: each refusal below breaks one thing in one of them.
confirmed='{"id": "C1", "status": "confirmed", "severity": "high", "path": "src/a.rs", "line": 3, "title": "t",
  "who": "w", "input": "i", "control": "c", "trace": "t", "effect": "e", "fix": "f", "test": "t"}'
validation='{"id": "V1", "status": "needs-validation", "path": "", "line": null, "title": "t", "fact": "f", "check": "c"}'
rejected='{"id": "R1", "status": "rejected", "path": "", "line": 0, "title": "t", "reason": "r",
  "verifier": {"verdict": "downgraded", "was": "low"}}'
jq -cn --argjson c "$confirmed" --argjson v "$validation" --argjson r "$rejected" '[$c, $v, $r]' | sec findings -
expect "findings come from stdin too, a finding of each status" 'C1 V1 R1' "$(field '[.findings[].id] | join(" ")')"

sec findings findings.json
expect "findings keep the skill's order" 'F2 F1 F3' "$(field '[.findings[].id] | join(" ")')"
expect "and fill what they leave out" '||||null|medium' \
  "$(field '"\(.findings[1].severity)|\(.findings[1].who)|\(.findings[0].reason)|\(.findings[0].verifier.was)|\(.findings[1].verifier)|\(.findings[2].verifier.was)"')"
expect "every finding has every field" 17 "$(field '[.findings[] | keys | length] | unique | first')"
expect "findings mark when they were sent" true "$(field '.sent > 0')"

# Sends a whole finding changed by a jq filter, and expects it refused, naming it.
refused() {
  local name="$1" finding="$2" change="$3"
  jq -c "[. | $change]" <<<"$finding" > refused.json
  expect "$name" "forgerdr: finding $(jq -r .id <<<"$finding") is not one" "$(sec findings refused.json 2>&1 || true)"
}
refused "a finding of an unknown status is refused, naming it" "$confirmed" '.status = "maybe"'
refused "a confirmed finding with no severity is refused" "$confirmed" 'del(.severity)'
refused "and one of an unknown severity" "$confirmed" '.severity = "major"'
refused "a confirmed finding that says no test is refused" "$confirmed" 'del(.test)'
refused "and one whose who is empty" "$confirmed" '.who = ""'
refused "a finding to validate that says no check is refused" "$validation" 'del(.check)'
refused "and one of an unknown severity" "$validation" '.severity = "major"'
refused "a rejected finding that says no reason is refused" "$rejected" 'del(.reason)'
refused "a text that is no text is refused, even one the status does not need" "$rejected" '.who = 3'
refused "a finding with an empty title is refused" "$rejected" '.title = ""'
refused "a negative line is refused" "$rejected" '.line = -1'
refused "and a fractional one" "$rejected" '.line = 1.5'
refused "and one in text" "$rejected" '.line = "3"'
refused "a path that is no text is refused" "$rejected" '.path = 3'
refused "a verifier's unknown verdict is refused" "$rejected" '.verifier.verdict = "maybe"'
refused "and an unknown severity it had" "$rejected" '.verifier.was = "bogus"'
refused_file() {
  printf '%s' "$2" > refused.json
  expect "$1" "$3" "$(sec findings refused.json 2>&1 || true)"
}
refused_file "a finding with no id is refused" '[{"status": "rejected"}]' 'forgerdr: a finding has no id'
refused_file "two findings with one id are refused" "[$rejected, $rejected]" 'forgerdr: two findings share an id'
refused_file "findings that are no list are refused" "$rejected" 'forgerdr: findings are a JSON array'
refused_file "a file that is not JSON is refused, saying so" '[{"id": "F1"' 'forgerdr: not one JSON value: refused.json'
expect "a refused file keeps what was there" 'F2 F1 F3' "$(field '[.findings[].id] | join(" ")')"
expect "and leaves no copy behind" '' "$(copies)"
said="$(HC_TERMINAL_ID=t8 bash "$script" findings findings.json 2>&1 || true)"
expect "findings before open are refused" \
  'forgerdr: no triage is open in this terminal: forge-security.sh open first' "$said"
expect "and write nothing" false "$(exists "$dir/t8.json")"

# While findings wait for the file's lock, the copy they hold sits in the triage folder, the user's alone.
mkdir "$dir/t7.json.lock"
FORGE_READY_TRIES=60 sec findings findings.json &
waiting=$!
seen=no
for _ in $(seq 1 60); do
  if [ -n "$(copies)" ]; then seen=yes; break; fi
  sleep 0.05
done
rmdir "$dir/t7.json.lock" 2>/dev/null || true
wait "$waiting" || true
expect "findings keep their copy in the triage folder" yes "$seen"
expect "and remove it" '' "$(copies)"

expect "a second open starts the triage afresh in the same view" 'tb-view 0 0' \
  "$(sec open audit.json) $(field '"\(.findings | length) \(.sent)"')"
sec findings findings.json
kept="$(cat "$dir/t7.json")"
expect "an app that does not say whether the view is there stops open" \
  $'forgerdr: the herdr app does not answer: triage in the chat\nexit 1' "$(app_failing ls open audit.json)"
expect "and the triage stays as it was" "$kept" "$(cat "$dir/t7.json")"
fake_terminal t7 live "" "" herdr.space=sp-own forge.tab=tb-view forge.review=security forge.view=tb-view
: > "$FAKE_CALLS"
sec open audit.json >/dev/null
expect "a terminal labelled for its security view already is labelled afresh" yes \
  "$(called hc label t7 forge.review=security forge.view=tb-view)"
# A review session's terminal keeps its labels: done would take them away, and its review view its questions.
kept="$(cat "$dir/t7.json")"
for view in other own; do
  fake_terminal t7 live "" "" herdr.space=sp-own forge.tab=tb-view "forge.review=$view"
  : > "$FAKE_CALLS"
  said="$(sec open audit.json 2>&1 >/dev/null; echo "exit $?")"
  expect "open in a terminal whose questions go to its $view review view is refused" \
    "forgerdr: this terminal's questions already go to its review view: triage in the chat"$'\nexit 1' "$said"
  said="$(sec "done" 2>&1 >/dev/null; echo "exit $?")"
  expect "and so is done there" \
    "forgerdr: this terminal's questions already go to its review view: triage in the chat"$'\nexit 1' "$said"
  expect "neither takes any of its labels" no "$(called hc label)"
  expect "nor opens a view, nor closes one" 'no no' "$(called herdr-app "do" tab.new) $(called herdr-app "do" tab.close)"
done
expect "nor changes the triage there" "$kept" "$(cat "$dir/t7.json")"
fake_terminal t7 live "" "" herdr.space=sp-own forge.tab=tb-view

sec findings findings.json
expect "show gives the mod the triage of a terminal" 't7 3' "$(mod show t7 | jq -r '"\(.terminal) \(.findings | length)"')"
expect "show of a terminal with none is null" null "$(mod show t9)"
said="$(mod show '../x' 2>&1 || true)"
expect "a terminal id is checked" 'forgerdr: not a herdr terminal id: ../x' "$said"
jq '.terminal = "t6"' "$dir/t7.json" > outside.json
ln -s "$sandbox/outside.json" "$dir/t6.json"
expect "a file that is a symlink shows as none" null "$(mod show t6)"
printf 'not json' > "$dir/t5.json"
expect "and so does one that is not a triage" null "$(mod show t5)"
cp "$dir/t7.json" "$dir/t3.json"
expect "and one that is another terminal's" null "$(mod show t3)"
cp "$dir/t7.json" week.json
jq '.updated = 0' week.json > "$dir/t7.json"
expect "a triage a week untouched goes" 'null false' "$(mod show t7) $(exists "$dir/t7.json")"
cp week.json "$dir/t7.json"

: > "$FAKE_CALLS"
sec "done"
expect "done ends the view's hold on the terminal's questions" yes "$(called hc label t7 forge.review= forge.view=)"
expect "done removes the triage" false "$(exists "$dir/t7.json")"
expect "and closes the view's tab, which it held alone" '["herdr-app","do","tab.close","--id","tb-view"]' \
  "$(call_of herdr-app "do" tab.close)"
# The view's tab stays when closing it would close more than the view, or when the app cannot tell.
stays() {
  local name="$1"
  shift
  listed tb-view '[]'
  expect "the next triage opens in the view" tb-view "$(sec open audit.json)"
  listed tb-view "$@"
  : > "$FAKE_CALLS"
  sec "done"
  expect "$name" no "$(called herdr-app "do" tab.close)"
}
stays "a tab that holds a terminal too stays" '[{"terminal": "t30", "pane": "p-t30"}]'
stays "the last tab of its space stays, which would close the space" '[]' lone
stays "a tab whose terminals the app does not list stays" 'null'
listed tb-view '[]'
sec open audit.json >/dev/null
listed tb-other '[]'
: > "$FAKE_CALLS"
sec "done"
expect "a tab the app no longer lists is not closed" no "$(called herdr-app "do" tab.close)"
listed tb-view '[]'
sec open audit.json >/dev/null
expect "done says so when the view's tab does not close, and ends well" \
  $'forgerdr: the herdr app could not close the security view\nexit 0' "$(app_failing "do tab.close" "done")"
sec open audit.json >/dev/null
expect "and when the app does not answer" \
  $'forgerdr: the herdr app does not answer: the security view stays open\nexit 0' "$(app_failing ls "done")"
expect "and when the terminal keeps its labels" \
  $'forgerdr: the terminal keeps its security labels: the inbox may still send its questions to the view\nexit 0' \
  "$(hc_failing label "done")"
expect "done with no triage succeeds" 0 "$(status_of sec "done")"
# A new Claude session in the terminal (/clear, claude started again: hooks/golem-state.sh born) forgets the triage the
# session before it opened, so the view says it is over, and leaves the view's tab, whose closing would end the session.
listed tb-view '[]'
sec open audit.json >/dev/null
printf '{}' > "$dir/t9.json"
: > "$FAKE_CALLS"
sec forget
expect "forget removes the terminal's triage" false "$(exists "$dir/t7.json")"
expect "and no other terminal's" true "$(exists "$dir/t9.json")"
expect "and leaves the view's tab open" no "$(called herdr-app "do" tab.close)"
expect "forget with no triage succeeds" 0 "$(status_of sec forget)"
rm "$dir/t9.json"
expect "an unknown command shows the usage" 1 "$(status_of mod close t7)"

# launch: the security session of a folder in a tab of its own, parked behind its view, as forge-review.sh opens a
# review. The fakes' tab.new makes a sized terminal (t40) with an agent at work, and ls lists its pane (p-t40).
git init -q -b feature/x repo
mkdir -p plain
repo="$(cd repo && pwd -P)"
rm -f "$FAKE_DIR/ls.json"
launched() { FAKE_TAB_SIZE="310 66" FAKE_LS_PANES=1 lead launch "$@"; }
fakes_reset
cannot='forgerdr: cannot open the security session:'
expect "launch outside the herdr app is refused" "$cannot not inside the herdr app" "$(bash "$script" launch 2>&1 || true)"
expect "and from a claude -p run, which would end before the report" \
  "$cannot a non-interactive run (claude -p) ends before its report could reach it" \
  "$(CLAUDE_CODE_ENTRYPOINT=sdk-cli lead launch 2>&1 || true)"
layout main
expect "and in another layout" "$cannot the security view needs the forgerdr layout (shown: main)" \
  "$(lead launch --cwd repo 2>&1 || true)"
expect "a mod that is no name is refused" "$cannot not a mod name: ../x" "$(lead launch --mod ../x 2>&1 || true)"
expect "and one that starts with a dash" "$cannot not a mod name: -x" "$(lead launch --mod -x 2>&1 || true)"
expect "a folder that is not one is refused" "$cannot no folder nowhere" "$(lead launch --cwd nowhere 2>&1 || true)"
usage='forgerdr: usage: forge-security.sh launch [--cwd PATH] [--mod NAME] [--title TITLE] [--item ID] [--scope TEXT] [--report-to ADDRESS] [--no-agent]'
expect "an option given last without its value shows the usage" "$usage" "$(lead launch --mod forgerdr --scope 2>&1 || true)"
expect "and so does an unknown one" "$usage" "$(lead launch --mod forgerdr --bogus x 2>&1 || true)"
expect "and so does an option taken for --mod's value" "$usage" "$(lead launch --mod --title x 2>&1 || true)"
expect "and nothing is opened" no "$(called herdr-app "do" tab.new)"

fakes_reset
layout forgerdr-dev
out="$(launched --cwd repo --item '#18' --report-to uds:/tmp/lead.sock)"
made="$(call_of herdr-app "do" tab.new)"
argv="$(option_of --argv <<<"$made")"
expect "launch opens a tab in this session's space, named for the item, in the folder, and shows it" \
  "sp-own|Security #18|$repo|true" \
  "$(jq -r '[.[(index("--space")) + 1, (index("--name")) + 1, (index("--folder")) + 1, (index("--focus")) + 1]] | join("|")' <<<"$made")"
expect "running claude titled for the branch, told its view is there, under the session that waits for it" \
  'FORGE_SESSION_TITLE=Security · feature/x FORGE_SECURITY_VIEW=1 FORGE_PARENT_TERMINAL=t7 claude' \
  "$(jq -r '.[1:-1] | join(" ")' <<<"$argv")"
expect "on the branch diff, reporting to that session, for the item" \
  '/forgerdr:security the branch diff (git diff origin/main...HEAD) When the triage and its fixes are over, send your report with SendMessage to uds:/tmp/lead.sock, beginning with the line "Report from security (feature/x)". The work item is #18.' \
  "$(jq -r '.[-1]' <<<"$argv")"
expect "the view splits off the agent's pane, in the layout's mod copy, told the agent's terminal" \
  'p-t40 right forgerdr-dev {"role":"security","terminal":"t40"}' \
  "$(call_of herdr-app "do" pane.split | jq -r '"\(.[(index("--pane")) + 1]) \(.[(index("--direction")) + 1]) \(.[(index("--mod")) + 1]) \(.[(index("--props")) + 1])"')"
expect "the agent is parked out of sight, the view alone in its tab" '["herdr-app","do","terminal.park","--terminal","t40"]' \
  "$(call_of herdr-app "do" terminal.park)"
expect "labelled with the tab, for open, the inbox and the sidebar's sweep" yes "$(called hc label t40 forge.tab=tb-made-1)"
expect "launch says what it opened" '{"tab":"tb-made-1","terminal":"t40","title":"feature/x","agent_started":true}' "$out"

fakes_reset
layout main
out="$(launched --cwd plain --mod forgerdr --scope src/auth/)"
expect "--mod picks the mod copy, whatever the layout" forgerdr "$(call_of herdr-app "do" pane.split | option_of --mod)"
expect "a tab with no item is named Security alone" Security "$(call_of herdr-app "do" tab.new | option_of --name)"
expect "a folder out of git titles it by its name, the scope given, nobody waiting nor reported to" \
  'plain ["env","FORGE_SESSION_TITLE=Security · plain","FORGE_SECURITY_VIEW=1","claude","/forgerdr:security src/auth/"]' \
  "$(jq -r .title <<<"$out") $(call_of herdr-app "do" tab.new | option_of --argv)"
fakes_reset
out="$(launched --cwd repo --mod forgerdr --title 'session restore, take 2' --scope '--all of src/ and lib/')"
argv="$(call_of herdr-app "do" tab.new | option_of --argv)"
expect "--title titles it as given, spaces and all" 'session restore, take 2|FORGE_SESSION_TITLE=Security · session restore, take 2' \
  "$(jq -r .title <<<"$out")|$(jq -r '.[1]' <<<"$argv")"
expect "a --scope that starts with a dash reaches the skill as given" '/forgerdr:security --all of src/ and lib/' \
  "$(jq -r '.[-1]' <<<"$argv")"
fakes_reset
mkdir -p repo/src
(cd repo/src && launched --mod forgerdr >/dev/null)
expect "a folder inside a repository gives way to its top level, where the session runs and audits" \
  "$repo|Security · feature/x|the branch diff (git diff origin/main...HEAD)" \
  "$(call_of herdr-app "do" tab.new | jq -r '"\(.[(index("--folder")) + 1])|\(.[(index("--argv")) + 1] | fromjson | .[1] | ltrimstr("FORGE_SESSION_TITLE="))|\(.[(index("--argv")) + 1] | fromjson | .[-1] | ltrimstr("/forgerdr:security "))"')"
fakes_reset
(cd plain && launched --mod forgerdr >/dev/null)
expect "with no --cwd the folder is this one, out of git its files the scope" \
  "$sandbox/plain|/forgerdr:security the files of $sandbox/plain" \
  "$(call_of herdr-app "do" tab.new | jq -r '"\(.[(index("--folder")) + 1])|\(.[(index("--argv")) + 1] | fromjson | .[-1])"')"
fakes_reset
out="$(launched --cwd repo --mod forgerdr --no-agent)"
expect "--no-agent parks a shell behind the view, no claude" 'no yes false' \
  "$(call_of herdr-app "do" tab.new | has_arg --argv) $(called herdr-app "do" terminal.park) $(jq -r .agent_started <<<"$out")"
# What launch opened and could not finish goes, the session in it with it.
closed='["herdr-app","do","tab.close","--id","tb-made-1","--confirmed","true"]'
fakes_reset
said="$(FAKE_SPLIT_FAILS=1 launched --cwd repo --mod forgerdr 2>&1 >/dev/null; echo "exit $?")"
expect "a view the app cannot split off stops launch, saying so" \
  "$cannot the herdr app could not open the security view"$'\nexit 1' "$said"
expect "and closes the tab it opened, parking nothing" "$closed no" \
  "$(call_of herdr-app "do" tab.close) $(called herdr-app "do" terminal.park)"
fakes_reset
said="$(FAKE_TAB_SIZE="310 66" lead launch --cwd repo --mod forgerdr 2>&1 >/dev/null; echo "exit $?")"
expect "a pane the app does not list stops launch" "$cannot the herdr app lists no pane for its terminal"$'\nexit 1' "$said"
expect "and closes the tab it opened, splitting nothing" "$closed no" \
  "$(call_of herdr-app "do" tab.close) $(called herdr-app "do" pane.split)"
fakes_reset
said="$(FORGE_HC="$sandbox/failing" FAIL_FAKE="$FAKE_DIR/hc" FAIL_ON=label launched --cwd repo --mod forgerdr 2>&1 >/dev/null; echo "exit $?")"
expect "a session that cannot be labelled with its tab stops launch" \
  "$cannot hc could not label its terminal with its tab"$'\nexit 1' "$said"
expect "and closes the tab it opened" "$closed" "$(call_of herdr-app "do" tab.close)"

[ "$failures" -eq 0 ] || { printf '%s failure(s)\n' "$failures"; exit 1; }
printf 'all passed\n'
