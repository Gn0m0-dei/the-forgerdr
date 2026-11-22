#!/usr/bin/env bash
# The security view's triage (forge_security_dir): the audit a security session runs and what it found, in a file named
# for the herdr terminal it runs in. launch starts that session parked behind its security view, in a tab of their own;
# the security skill writes the triage from the session, and the forgerdr mod shows it in the view, where the human
# triages the findings.
# From a herdr terminal (one showing a forgerdr layout, unless --mod names the copy of the mod):
#   launch [--cwd PATH] [--mod NAME] [--title TITLE] [--item ID] [--scope TEXT] [--report-to ADDRESS] [--no-agent]
#                      a security session in a tab of its own in this terminal's space, named "Security <item>", as
#                      bin/forge-review.sh opens a review: claude (titled "Security · <title>", told by
#                      FORGE_SECURITY_VIEW that the view is there) running /forgerdr:security on the scope in the folder
#                      (--cwd, else this one; its repository's top level inside git), labelled with the tab (forge.tab)
#                      and parked once the security view (the copy of the mod --mod names, else the layout's) has split
#                      off its pane. The scope defaults to the branch diff, or to the folder's files out of git; the
#                      title to the folder's branch, else its name. With --report-to, the session sends its report
#                      there once it is over, and its golem hangs under this terminal's (FORGE_PARENT_TERMINAL): a
#                      session with a parent writes no flow (forge-flow.sh skips it), so the session that launched it
#                      reports the security cell. --no-agent parks a shell instead. Prints {"tab", "terminal",
#                      "title", "agent_started"}; a tab it opened but could not finish goes, the session in it with it.
# From the security session launch opened (HC_TERMINAL_ID, FORGE_SECURITY_VIEW), each given a JSON file, or - for stdin:
#   open <file>        the audit ({"title", "scope", "item"}): starts the triage afresh in the view the session is
#                      parked behind and labels the terminal forge.review=security and forge.view=<tab>, so the inbox
#                      sends its triage question to the view; prints the view's tab. In any other terminal, or one whose
#                      questions go to a review view, it changes nothing: the triage stays in the chat.
#   findings <file>    what the audit found, each finding verified or not, in the order the skill reports it.
#   done               the triage is over: the labels and the triage go, and the view's tab with them when it holds
#                      the view alone and is not the last tab of its space; the sidebar then ends the session parked
#                      behind it, as it ends a review's. A terminal whose questions go to a review view keeps them all.
# From the session start hook (hooks/golem-state.sh born), in any herdr terminal (HC_TERMINAL_ID):
#   forget             a new Claude session started in the terminal (/clear, claude started again), as the hook takes
#                      the labels away: the triage of the session before it goes, so the view says it is over, and the
#                      view's tab stays, since closing it would end the new session.
# From the mod, for a terminal:
#   show <terminal>    its triage, or null.
# A file a week untouched goes; one that is not a triage shows as none.
# shellcheck source-path=SCRIPTDIR/..
# shellcheck disable=SC2016 # jq filters, in single quotes
set -euo pipefail

plugin_root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=bin/forge-lib.sh
. "$plugin_root/bin/forge-lib.sh"

triages="$(forge_security_dir)"
readonly TERMINAL_PATTERN='^[A-Za-z0-9_-]{1,64}$'
readonly LAYOUT_PATTERN='^forgerdr(-dev)?$' MOD_PATTERN='^[A-Za-z0-9][A-Za-z0-9_-]*$'
readonly LAUNCH_USAGE='usage: forge-security.sh launch [--cwd PATH] [--mod NAME] [--title TITLE] [--item ID] [--scope TEXT] [--report-to ADDRESS] [--no-agent]'
# The labels that send a terminal's questions to its security view (the inbox reads them), and the view's role, which
# the review label names too; the tab a launched session is parked behind (forge-review.sh's label too).
readonly REVIEW_LABEL=forge.review VIEW_LABEL=forge.view ROLE=security TAB_LABEL=forge.tab

# What each part of a triage is, as jq checks it: a filter per part that fails, naming what is wrong, or answers the
# part with the fields it leaves out filled. A finding's status says which texts it must tell, not empty (needs); the
# rest of its texts are optional.
readonly SHAPES='
  def text: type == "string";
  def filled: text and . != "";
  def maybe_text: . == null or type == "string";
  def line: . == null or (type == "number" and . >= 0 and floor == .);
  def need($ok; $what): if $ok then . else error($what) end;
  def needs: {confirmed: ["who", "input", "control", "trace", "effect", "fix", "test"],
    "needs-validation": ["fact", "check"], rejected: ["reason"]};
  def texts: ["who", "input", "control", "trace", "effect", "fix", "test", "fact", "check", "reason"];
  def severity: IN($severities[]);
  def maybe_severity: . == null or . == "" or severity;
  def verifier: . == null or (type == "object" and (.verdict | IN($verdicts[])) and (.was | maybe_severity));
  def told: . as $finding | all(needs[$finding.status][]; $finding[.] | filled)
    and all(texts[]; $finding[.] | maybe_text);
  def audit: need(type == "object" and (.title | filled) and (.scope | text) and (.item | maybe_text);
      "not an audit: it needs a title and a scope")
    | {title, scope, item: (.item // "")};
  def finding: need(type == "object" and (.id | filled); "a finding has no id")
    | need((.status | text) and (.status as $status | needs | has($status)) and (.path | text) and (.line | line)
      and (.title | filled) and (if .status == "confirmed" then .severity | severity else .severity | maybe_severity end)
      and told and (.verifier | verifier); "finding \(.id) is not one")
    | . as $finding | {id, status, severity: (.severity // ""), path, line, title}
      + (reduce texts[] as $field ({}; .[$field] = ($finding[$field] // "")))
      + {verifier: (.verifier | if . == null then null else {verdict, was: (.was // "")} end)};
  def findings_of: need(type == "array"; "findings are a JSON array") | map(finding)
    | need(([.[].id] | unique | length) == length; "two findings share an id");
  def triage: type == "object" and .v == 1 and .terminal == $terminal and (.updated | type) == "number"
    and (.sent | type) == "number" and (.tab | text) and (.audit | type) == "object" and (.findings | type) == "array";'

# The sets the shapes check against, as jq arguments.
readonly SETS=(--argjson severities '["critical","high","medium","low"]'
  --argjson verdicts '["confirmed","downgraded","needs-validation","rejected"]')

# The triage file of a terminal, checked.
file_of() {
  [[ "$1" =~ $TERMINAL_PATTERN ]] || forge_die "not a herdr terminal id: $1"
  printf '%s/%s.json\n' "$triages" "$1"
}

# This session's terminal: the skill's commands work for the session they run in, and only inside herdr.
own_terminal() {
  forge_in_herdr || forge_die "not inside the herdr app: triage in the chat"
  printf '%s\n' "$HC_TERMINAL_ID"
}

# A review session's terminal keeps its labels, its triage and its tab: open and done would take its questions from its
# review view, or its review's tab away.
not_a_review() {
  local review
  review="$(forge_terminal_label "$REVIEW_LABEL" "$1")"
  [[ -z "$review" || "$review" == "$ROLE" ]] \
    || forge_die "this terminal's questions already go to its review view: triage in the chat"
}

# Applies a jq filter to a terminal's triage (null when it has none) and keeps the result (forge_json_rewrite).
change() {
  local file="$1" filter="$2"
  shift 2
  forge_json_rewrite "$file" "$SHAPES $filter" "${SETS[@]}" "$@"
}

# A terminal's triage, checked, on stdout; nothing when it has none or it went (forge_json_entry).
entry() {
  forge_json_entry "$1" triage "$SHAPES triage" "${SETS[@]}"
}

# The tab a terminal is parked behind when it runs the security session launch opened, its security view's; empty in any
# other terminal, such as a review session's, parked behind its review view.
parked_tab() {
  [ -z "${FORGE_SECURITY_VIEW:-}" ] || forge_terminal_label "$TAB_LABEL" "$1"
}

# The tab of a terminal's security view: its triage's, else the one its label names, else the one it is parked behind;
# empty when it has none.
view_of() {
  local terminal="$1" tab
  tab="$(entry "$(file_of "$terminal")" 2>/dev/null | jq -r '.tab // empty')"
  [ -n "$tab" ] || tab="$(forge_terminal_label "$VIEW_LABEL" "$terminal")"
  printf '%s\n' "${tab:-$(parked_tab "$terminal")}"
}

# A tab as the herdr app lists it, as JSON with the number of tabs its space holds (.space_tabs); nothing when the app
# lists no such tab, or no tab is given. Fails when the app does not answer.
listed_tab() {
  local listing
  [ -n "$1" ] || return 0
  listing="$(forge_app ls 2>/dev/null)" || return 1
  jq -c --arg tab "$1" \
    'first(.spaces[]? | (.tabs | length) as $tabs | .tabs[]? | select(.id == $tab) | .space_tabs = $tabs) // empty' \
    <<<"$listing" 2>/dev/null
}

# Whether the security view may close its tab (a listed_tab): the tab holds the view alone, no terminal the human opened
# beside it, and is not the last of its space, which would close the space too. A tab the app does not list stays.
readonly CLOSABLE='. != null and (.terminals | type) == "array" and (.terminals | length) == 0 and .space_tabs > 1'

# launch fails, saying why.
cannot_launch() {
  forge_die "cannot open the security session: $1"
}

# launch fails once the herdr app has opened its tab: the tab goes, ending the session in it.
abandon() {
  forge_do tab.close --id "$1" --confirmed true >/dev/null 2>&1 \
    || printf 'forgerdr: the herdr app could not close the tab of the security session\n' >&2
  cannot_launch "$2"
}

launch() {
  local folder="$PWD" mod="" title="" item="" scope="" report_to="" start_agent=1 top env prompt argv="" space made \
    tab terminal pane view started=false
  while [ $# -gt 0 ]; do
    [ "$1" = --no-agent ] || [ $# -ge 2 ] || forge_die "$LAUNCH_USAGE"
    case "$1" in
      --cwd) folder="$(cd "$2" 2>/dev/null && pwd -P)" || cannot_launch "no folder $2" ;;
      --mod) mod="$2" ;;
      --title) title="$2" ;;
      --item) item="$2" ;;
      --scope) scope="$2" ;;
      --report-to) report_to="$2" ;;
      --no-agent) start_agent=0; shift; continue ;;
      *) forge_die "$LAUNCH_USAGE" ;;
    esac
    shift 2
  done
  forge_in_herdr || cannot_launch "not inside the herdr app"
  if [ -z "$mod" ]; then
    mod="$(forge_app status 2>/dev/null | jq -r '.layout // empty' 2>/dev/null || true)"
    [[ "$mod" =~ $LAYOUT_PATTERN ]] || cannot_launch "the security view needs the forgerdr layout (shown: $mod)"
  elif ! [[ "$mod" =~ $MOD_PATTERN ]]; then
    cannot_launch "not a mod name: $mod"
  fi
  # Inside a repository the session runs and audits at its top level, from whatever folder of it this was asked.
  if top="$(git -C "$folder" rev-parse --show-toplevel 2>/dev/null)"; then
    folder="$top"
    [ -n "$title" ] || title="$(git -C "$folder" branch --show-current)"
    [ -n "$scope" ] || scope="the branch diff (git diff origin/$(forge_base_branch "$folder")...HEAD)"
  fi
  [ -n "$title" ] || title="$(basename "$folder")"
  prompt="/forgerdr:security ${scope:-the files of $folder}"
  env=(FORGE_SECURITY_VIEW=1)
  if [ -n "$report_to" ]; then
    prompt+=" When the triage and its fixes are over, send your report with SendMessage to $report_to, beginning with"
    prompt+=" the line \"Report from security ($title)\"."
    env+=("FORGE_PARENT_TERMINAL=$HC_TERMINAL_ID")
  fi
  [ -z "$item" ] || prompt+=" The work item is $item."
  [ "$start_agent" = 0 ] || argv="$(forge_claude_argv "Security · $title" "$prompt" "${env[@]}")"
  space="$(forge_terminal_label herdr.space)"
  made="$(forge_do tab.new ${space:+--space "$space"} --name "Security${item:+ $item}" --folder "$folder" \
    ${argv:+--argv "$argv"} --focus true)" || cannot_launch "the herdr app could not open its tab"
  tab="$(jq -r '.tab // empty' <<<"$made" 2>/dev/null || true)"
  [ -n "$tab" ] || cannot_launch "the herdr app opened no tab"
  terminal="$(jq -r '.terminal // empty' <<<"$made" 2>/dev/null || true)"
  [ -n "$terminal" ] || abandon "$tab" "the herdr app opened no terminal in its tab"
  # open finds the view in this tab, the inbox takes the human there, and the sidebar ends the session once it is gone.
  forge_hc label "$terminal" "$TAB_LABEL=$tab" >/dev/null 2>&1 \
    || abandon "$tab" "hc could not label its terminal with its tab"
  pane="$(forge_pane_of "$terminal")"
  [ -n "$pane" ] || abandon "$tab" "the herdr app lists no pane for its terminal"
  view="$(forge_do pane.split --pane "$pane" --direction right --mod "$mod" \
    --props "$(jq -cn --arg role "$ROLE" --arg terminal "$terminal" '{role: $role, terminal: $terminal}')")" \
    || abandon "$tab" "the herdr app could not open the security view"
  [ -n "$(jq -r '.pane // empty' <<<"$view" 2>/dev/null || true)" ] \
    || abandon "$tab" "the herdr app opened no security view"
  forge_do terminal.park --terminal "$terminal" >/dev/null \
    || printf 'forgerdr: the security session stays in sight\n' >&2
  if [ "$start_agent" = 1 ]; then
    if forge_claude_ready "$terminal"; then
      started=true
    else
      printf 'forgerdr: claude did not come up; Discuss in its view shows it\n' >&2
    fi
  fi
  jq -cn --arg tab "$tab" --arg terminal "$terminal" --arg title "$title" --argjson started "$started" \
    '{tab: $tab, terminal: $terminal, title: $title, agent_started: $started}'
}

open() {
  local terminal file json audit tab listed
  terminal="$(own_terminal)"
  file="$(file_of "$terminal")"
  not_a_review "$terminal"
  # The view is the one launch parked this session behind, still open; no other terminal has one.
  tab="$(parked_tab "$terminal")"
  listed="$(listed_tab "$tab")" || forge_die "the herdr app does not answer: triage in the chat"
  [ -n "$listed" ] || forge_die "open runs inside the security session launch opens: run forge-security.sh launch"
  json="$(forge_json_given "${1:-}")"
  audit="$(jq -c "${SETS[@]}" "$SHAPES audit" <<<"$json" 2>&1)" || forge_die "${audit#jq: error (at <stdin>:*): }"
  change "$file" '{v: 1, terminal: $terminal, sent: 0, tab: $tab, audit: $audit, findings: []}' --arg tab "$tab" \
    --argjson audit "$audit"
  forge_hc label "$terminal" "$REVIEW_LABEL=$ROLE" "$VIEW_LABEL=$tab" >/dev/null 2>&1 \
    || printf 'forgerdr: the inbox cannot send the triage question to its view\n' >&2
  printf '%s\n' "$tab"
}

# The findings a filter sets need a triage open in this terminal: the skill opens it first.
readonly OPENED='if triage then . else error("no triage is open in this terminal: forge-security.sh open first") end'

# Sets this session's findings from the skill's file. jq takes them from a copy, as a file: a long audit would not fit
# in an argument. The copy sits in the triage folder, the user's alone, and goes when the script ends, which is why it
# is not local: the trap that removes it runs after the function.
findings() {
  local terminal file json
  terminal="$(own_terminal)"
  file="$(file_of "$terminal")"
  json="$(forge_json_given "${1:-}")"
  [ -d "$triages" ] || { mkdir -p "$triages" && chmod 700 "$triages"; }
  copy="$(mktemp "$triages/.findings.XXXXXX")"
  trap 'rm -f "$copy"' EXIT
  printf '%s\n' "$json" > "$copy"
  change "$file" "$OPENED | .findings = (\$given[0] | findings_of) | .sent = \$now" --slurpfile given "$copy"
}

# The triage is over: the terminal's questions go back to the inbox, the triage goes, and so does the view's tab when
# it may (CLOSABLE). What does not go is said, and the triage is over all the same.
finish() {
  local terminal file tab listed
  terminal="$(own_terminal)"
  file="$(file_of "$terminal")"
  not_a_review "$terminal"
  tab="$(view_of "$terminal")"
  forge_hc label "$terminal" "$REVIEW_LABEL=" "$VIEW_LABEL=" >/dev/null 2>&1 \
    || printf 'forgerdr: the terminal keeps its security labels: the inbox may still send its questions to the view\n' >&2
  rm -f "$file"
  if ! listed="$(listed_tab "$tab")"; then
    printf 'forgerdr: the herdr app does not answer: the security view stays open\n' >&2
  elif jq -e "$CLOSABLE" <<<"${listed:-null}" >/dev/null 2>&1; then
    forge_do tab.close --id "$tab" >/dev/null 2>&1 \
      || printf 'forgerdr: the herdr app could not close the security view\n' >&2
  fi
}

forget() {
  local terminal file
  terminal="$(own_terminal)"
  file="$(file_of "$terminal")"
  rm -f "$file"
}

show() {
  local file shown
  file="$(file_of "${1:-}")"
  shown="$(entry "$file" 2>/dev/null)"
  printf '%s\n' "${shown:-null}"
}

command="${1:-}"
[ $# -eq 0 ] || shift
case "$command" in
  launch) launch "$@" ;;
  open) open "${1:-}" ;;
  findings) findings "${1:-}" ;;
  done) finish ;;
  forget) forget ;;
  show) show "${1:-}" ;;
  *) forge_die "usage: forge-security.sh launch [options] | open | findings | done | forget | show" ;;
esac
