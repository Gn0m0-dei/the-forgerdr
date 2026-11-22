// The security view (design 06d), the triage's tab: bin/forge-security.sh opens it for the security session that
// audits a change, parked out of sight behind it, and tells it the session's terminal. It shows the audit and what it
// found as the session reports them (bridges/security.js) and answers the session's "Security fix" question through
// the inbox with the picks: the confirmed findings to fix and the ones that need validation to note on the issue or to
// remember, each picked one by one, never all at once, and none for the human (a critical finding is only tagged).
// While the session audits, the golem thinks; once the stamp goes through, the view stays while it fixes the picks one
// at a time, and the session closes the tab when it is done (bin/forge-security.sh done). Discuss peeks at the session
// over the tab, from the header or under every state that waits on it.
import { h_flex, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { checking, props, run } from "herdr";
import { answerInbox, followInbox } from "../bridges/inbox.js";
import { followSecurity } from "../bridges/security.js";
import { playStamp } from "../bridges/sounds.js";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { checkBox } from "../kit/forms.js";
import { emptyState, thinkingState } from "../kit/panels.js";
import {
  findingFrame,
  findingRow,
  groupHead,
  metaItem,
  sectionTitle,
  stillBox,
  thinkingLine,
  viewTitle,
} from "../kit/review.js";
import {
  actionToggle,
  fixCard,
  lockNote,
  securityDetail,
  securityToneColour,
} from "../kit/security.js";
import { ICON } from "../kit/sprites.js";
import { landStamp, STAMP_PHASE, stampOver } from "../kit/stamp.js";
import { wrapped } from "../kit/text.js";
import { tokens } from "../kit/tokens.js";
import {
  auditLine,
  detailOf,
  FINDING_STATUS,
  fixAnswer,
  fixReply,
  pendingFix,
  pickedFindings,
  pickedNothing,
  placeOf,
  recommended,
  securityGroups,
  stampedWords,
  stampWords,
  triageKey,
  verdictTag,
  verdictTone,
  verifierLine,
} from "../security.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../inbox.js").InboxRequest} InboxRequest */
/** @typedef {import("../kit/review.js").RowTag} RowTag */
/** @typedef {import("../kit/stamp.js").StampPhase} StampPhase */
/** @typedef {import("../security.js").FindingStatus} FindingStatus */
/** @typedef {import("../security.js").PendingFix} PendingFix */
/** @typedef {import("../security.js").SecurityFinding} SecurityFinding */
/** @typedef {import("../security.js").SecurityGroup} SecurityGroup */
/** @typedef {import("../security.js").Triage} Triage */
/** @typedef {import("../security.js").TriagePicks} TriagePicks */
/** @typedef {import("./role.js").Role} Role */

/** @typedef {keyof TriagePicks} PickKind */
/** @typedef {Exclude<PickKind, "fix">} MarkKind what a finding that needs validation can be picked for */
/** @typedef {Record<PickKind, Set<string>>} PickSets the finding ids picked, by what for */

/** @type {() => { terminal?: string } | null} */
const readProps = props;

// The status of the findings each pick takes; a pick of any other finding is never made.
/** @type {Readonly<Record<PickKind, FindingStatus>>} */
const PICK_STATUS = Object.freeze({
  fix: FINDING_STATUS.confirmed,
  note: FINDING_STATUS.needsValidation,
  remember: FINDING_STATUS.needsValidation,
});

/** @type {Readonly<Record<MarkKind, string>>} */
const MARK_LABEL = Object.freeze({
  note: "Note on the issue",
  remember: "Remember",
});

// A finding that needs validation's toggles, in their order.
/** @type {readonly MarkKind[]} */
const MARK_KINDS = Object.freeze(["note", "remember"]);

// What the header says the session does, or what the view waits on.
const STATUS = Object.freeze({
  auditing: "the golem is auditing",
  stamped: "stamped · the golem works on your picks",
  waiting: "waiting on your stamp",
  working: "the golem is working",
});

/** @returns {PickSets} */
const noPicks = () => ({
  fix: new Set(),
  note: new Set(),
  remember: new Set(),
});

/**
 * The finding that shows opened until the human opens or closes one: the first the view lists, unless it is rejected.
 * @param {SecurityGroup[]} groups
 */
const firstOpened = (groups) => {
  const first = groups.at(0)?.findings.at(0);
  return first?.status === FINDING_STATUS.rejected ? undefined : first;
};

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const security = (cx) => {
  const terminal = readProps()?.terminal ?? "";
  /** @type {Triage | null} */
  let triage = null;
  let loaded = false;
  // A triage was read: a null read before one (the tab opens before the file is written) is still opening.
  let seen = false;
  /** @type {InboxRequest[]} */
  let requests = [];
  let picks = noPicks();
  // The triage the view's picks rest on (triageKey): another starts the view over.
  let picksOf = "";
  /** @type {Set<string>} the finding rows opened */
  const opened = new Set();
  let touched = false;
  let busy = false;
  let failed = "";
  /** @type {StampPhase} */
  let stamp = STAMP_PHASE.none;
  // This view's answer went through: the golem fixes the picks, and the session closes the tab once it is done.
  let stamped = false;
  // The triage went after it showed (bin/forge-security.sh done removes it; open rewrites it, never removes it) and the
  // tab stayed: it holds more, is its space's last, or the app did not close it (no answer, or tab.close failed).
  let gone = false;

  /** @param {Triage | null} read */
  const take = (read) => {
    // Gone, the view is over, stamped or not: a later /forgerdr:security in the same session opens a tab of its own, and
    // this one must not start over on that triage, which both could stamp.
    // forge: later reads are ignored, not stopped; cancel the follow if a task can end itself from its own callback.
    if (gone) return;
    loaded = true;
    if (read === null) {
      gone = seen;
      // Stamped, the view keeps the triage it stamped, and says so until the tab closes.
      if (!stamped) triage = null;
      return;
    }
    triage = read;
    seen = true;
    const key = triageKey(read);
    if (key !== picksOf) {
      picksOf = key;
      picks = noPicks();
      opened.clear();
      touched = false;
      failed = "";
      stamped = false;
    }
  };

  const following =
    checking() || terminal === "" ? null : followSecurity(cx, terminal, take);
  const inbox =
    checking() || terminal === ""
      ? null
      : followInbox(cx, (read) => {
          requests = read;
        });

  /** The fix question the session waits on the view for, or null. @returns {PendingFix | null} */
  const waiting = () =>
    triage === null ? null : pendingFix(requests, terminal, triage.sent);

  const tickable = () => waiting() !== null && !busy && !stamped;

  /**
   * The findings picked for a kind, in the order the view lists them.
   * @param {Triage} shown
   * @param {PickKind} kind
   */
  const pickedOf = (shown, kind) =>
    pickedFindings(picks[kind], PICK_STATUS[kind], shown.findings);

  /** @returns {TriagePicks} */
  const pickedNow = () => ({
    fix: [...picks.fix],
    note: [...picks.note],
    remember: [...picks.remember],
  });

  /** @param {PickKind} kind @param {string} id @param {Context} cx */
  const toggle = (kind, id, cx) => {
    if (!tickable()) return;
    const chosen = picks[kind];
    if (chosen.has(id)) chosen.delete(id);
    else chosen.add(id);
    cx.notify();
  };

  /** @param {string} id @param {SecurityFinding | undefined} first @param {Context} cx */
  const toggleOpen = (id, first, cx) => {
    if (!touched && first !== undefined) opened.add(first.id);
    touched = true;
    if (opened.has(id)) opened.delete(id);
    else opened.add(id);
    cx.notify();
  };

  // The stamp: the gnomemark lands and the session's fix question gets the picks. Refused, the view says why and can
  // be stamped again.
  /** @param {Context} cx */
  const stampNow = (cx) => {
    const pending = waiting();
    if (triage === null || pending === null || busy || stamped) return;
    const answer = fixReply(pending, fixAnswer(pickedNow(), triage.findings));
    busy = true;
    failed = "";
    landStamp(
      cx,
      (phase) => {
        stamp = phase;
      },
      playStamp,
    );
    cx.spawn(async (task) => {
      const refused = await answerInbox(pending.request.id, answer);
      busy = false;
      stamped = refused === null;
      failed = refused ?? "";
      task.notify();
    });
    cx.notify();
  };

  // The session works out of sight: Discuss peeks at it over the tab, with keep-as-tab and close.
  const discussButton = () =>
    control(
      keyButton(KEY_BUTTON.secondary, "Discuss with the golem", {
        icon: ICON.golem,
      }),
      "security-discuss",
      () => run("terminal.peek", { terminal }),
    );

  /**
   * A state the session works behind, with Discuss under it to watch the session at work.
   * @param {NativeElement} state
   */
  const withDiscuss = (state) =>
    v_flex()
      .size_full()
      .child(state)
      .child(
        h_flex().flex_none().justify_center().p(12).child(discussButton()),
      );

  /** @param {Triage} shown @param {PendingFix | null} pending */
  const statusOf = (shown, pending) =>
    STATUS[
      !shown.sent
        ? "auditing"
        : stamped
          ? "stamped"
          : pending
            ? "waiting"
            : "working"
    ];

  /** @param {Triage} shown @param {PendingFix | null} pending */
  const header = (shown, pending) => {
    const k = tokens();
    return v_flex()
      .flex_none()
      .gap(10)
      .px(20)
      .py(14)
      .border_b(2)
      .border_color(k.line)
      .child(
        h_flex()
          .items_center()
          .gap(12)
          .child(
            viewTitle(
              `Security review · ${shown.audit.title}`,
              shown.audit.scope,
              {
                colour: k.failed,
                glyph: ICON.shield,
              },
            ),
          )
          .child(discussButton()),
      )
      .child(
        h_flex()
          .flex_wrap()
          .gap(18)
          .child(metaItem(ICON.search, auditLine(shown.findings)))
          .child(metaItem(ICON.ok, verifierLine(shown.findings)))
          .child(metaItem(ICON.lock, "stays on this machine"))
          .child(metaItem(ICON.golem, statusOf(shown, pending))),
      )
      .when(failed !== "", (el) =>
        el.child(wrapped(failed, "ui", 12, k.failed)),
      );
  };

  /**
   * A finding that needs validation's toggles: Note on the issue, when the audit is for one, and Remember.
   * @param {SecurityFinding} finding
   * @param {Triage} shown
   * @param {boolean} ticking
   */
  const marksOf = (finding, shown, ticking) => {
    const kinds = MARK_KINDS.filter(
      (kind) => kind !== "note" || shown.audit.item !== "",
    );
    return kinds.map((kind) => {
      const toggleButton = actionToggle(
        MARK_LABEL[kind],
        picks[kind].has(finding.id),
      );
      return ticking
        ? control(toggleButton, `security-${kind}-${finding.id}`, (cx) =>
            toggle(kind, finding.id, cx),
          )
        : toggleButton.opacity(0.5);
    });
  };

  /** @param {SecurityFinding} finding */
  const tagsOf = (finding) => {
    const k = tokens();
    const verdict = verdictTag(finding);
    /** @type {RowTag[]} */
    const tags = [
      ...(recommended(finding)
        ? [{ colour: k.failed, text: "RECOMMENDED" }]
        : []),
      ...(verdict === ""
        ? []
        : [
            { colour: securityToneColour(verdictTone(finding)), text: verdict },
          ]),
    ];
    return tags;
  };

  /**
   * A confirmed finding's box: ticked to fix it while the session asks, still otherwise.
   * @param {string} id
   * @param {boolean} picked
   * @param {boolean} ticking
   */
  const tickOf = (id, picked, ticking) =>
    ticking
      ? control(checkBox(picked), `security-fix-${id}`, (cx) =>
          toggle("fix", id, cx),
        )
      : stillBox(picked);

  /**
   * @param {SecurityFinding} finding
   * @param {SecurityGroup} group
   * @param {Triage} shown
   * @param {boolean} ticking
   * @param {SecurityFinding | undefined} first
   */
  const findingOf = (finding, group, shown, ticking, first) => {
    const colour = securityToneColour(group.tone);
    const isOpen = opened.has(finding.id) || (!touched && finding === first);
    const fixable = finding.status === FINDING_STATUS.confirmed;
    const picked = fixable && picks.fix.has(finding.id);
    const line = control(
      findingRow({
        actions:
          finding.status === FINDING_STATUS.needsValidation
            ? marksOf(finding, shown, ticking)
            : [],
        colour,
        label: finding.id,
        open: isOpen,
        picked,
        place:
          finding.status === FINDING_STATUS.rejected ? "" : placeOf(finding),
        tags: tagsOf(finding),
        tick: fixable ? tickOf(finding.id, picked, ticking) : null,
        title: finding.title,
      }),
      `security-row-${finding.id}`,
      (cx) => toggleOpen(finding.id, first, cx),
    );
    return findingFrame(
      line,
      isOpen ? securityDetail(detailOf(finding)) : null,
      colour,
    );
  };

  /** @param {Triage} shown */
  const findingsColumn = (shown) => {
    const groups = securityGroups(shown.findings);
    const first = firstOpened(groups);
    const ticking = tickable();
    return div()
      .flex_1()
      .min_w(0)
      .h_full()
      .child(
        v_flex()
          .id("security-findings")
          .size_full()
          .gap(8)
          .p(16)
          .overflow_y_scrollbar()
          .when(!shown.sent, (el) =>
            el.child(thinkingLine("auditing the change")),
          )
          .when(Boolean(shown.sent) && !shown.findings.length, (el) =>
            el.child(
              wrapped(
                "The audit found nothing to triage.",
                "ui",
                13,
                tokens().muted,
              ),
            ),
          )
          .children(
            groups.flatMap((group) => [
              groupHead(
                group.label,
                group.findings.length,
                securityToneColour(group.tone),
              ),
              ...group.findings.map((finding) =>
                findingOf(finding, group, shown, ticking, first),
              ),
            ]),
          ),
      );
  };

  /** @param {Triage} shown @param {PendingFix | null} pending */
  const planColumn = (shown, pending) => {
    const k = tokens();
    const fixes = pickedOf(shown, "fix");
    const stampButton = keyButton(
      KEY_BUTTON.stamp,
      stampWords(pickedNow(), shown.findings),
      { icon: ICON.gnomemark },
    )
      .w_full()
      .justify_center();
    return div()
      .flex_none()
      .w(420)
      .h_full()
      .border_l(2)
      .border_color(k.line)
      .child(
        v_flex()
          .id("security-plan")
          .size_full()
          .gap(12)
          .p(16)
          .overflow_y_scrollbar()
          .child(sectionTitle(`FIX PLAN · ${fixes.length} PICKED`))
          .child(
            wrapped(
              "One at a time: regression test red, minimal fix at the boundary, test green.",
              "ui",
              12,
              k.muted,
            ),
          )
          .children(
            fixes.map((finding) =>
              fixCard({
                id: finding.id,
                test: finding.test,
                title: finding.title,
              }),
            ),
          )
          .children(
            MARK_KINDS.flatMap((kind) => {
              const ids = pickedOf(shown, kind).map((finding) => finding.id);
              return ids.length
                ? [
                    sectionTitle(
                      `${MARK_LABEL[kind].toUpperCase()} · ${ids.join(", ")}`,
                      k.muted,
                    ),
                  ]
                : [];
            }),
          )
          .child(
            pending !== null && !busy && !stamped
              ? control(stampButton, "security-stamp", stampNow)
              : stampButton.opacity(0.45),
          )
          .child(
            lockNote(
              "Findings never leave this machine. Nothing here can be published: a note on the issue is a separate draft you stamp.",
            ),
          ),
      );
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const root = v_flex().id("security").relative().size_full().bg(k.bg0);
    if (terminal === "")
      return root.child(
        emptyState({
          caption: "security",
          sub: "A security view opens with the session that audits a change, from /forgerdr:security.",
          title: "no triage here",
        }),
      );
    if (!loaded || (triage === null && !seen))
      return root.child(
        withDiscuss(
          thinkingState({
            caption: "security",
            sub: "The audit and its findings show here as soon as the golem reports them.",
            title: "opening the triage",
          }),
        ),
      );
    if (stamped && stamp === STAMP_PHASE.none && triage !== null)
      return root.child(
        gone
          ? emptyState({
              action: discussButton(),
              caption: "security",
              sub: "The golem is done. Close this tab when you like.",
              title: stampedWords(pickedNow(), triage.findings),
            })
          : withDiscuss(
              thinkingState({
                caption: "security",
                sub: pickedNothing(pickedNow(), triage.findings)
                  ? "Nothing picked: the golem closes this tab once it reports."
                  : "The golem works on your picks, one at a time, and closes this tab when it is done.",
                title: stampedWords(pickedNow(), triage.findings),
              }),
            ),
      );
    if (triage === null)
      return root.child(
        emptyState({
          action: discussButton(),
          caption: "security",
          sub: "Its session closed it: nothing here waits on you.",
          title: "the triage is over",
        }),
      );
    const pending = waiting();
    return root
      .child(header(triage, pending))
      .child(
        h_flex()
          .flex_1()
          .min_h(0)
          .child(findingsColumn(triage))
          .child(planColumn(triage, pending)),
      )
      .when(stamp !== STAMP_PHASE.none, (el) =>
        el.child(stampOver("security-stamp", stamp)),
      );
  };

  return {
    // The view never ends its session: the session closes the view once the triage is over.
    close: () => {
      following?.cancel();
      inbox?.cancel();
    },
    render,
  };
};
