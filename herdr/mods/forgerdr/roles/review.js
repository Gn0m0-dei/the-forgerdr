// The review view (designs 06b and 06c), the pull request's tab: bin/forge-review.sh opens it with the review session
// beside it parked out of sight, and tells it the session's terminal. It shows the pull request as the session reports
// it (bridges/reviews.js) and answers what the session asks it through the inbox: the findings or threads to act on
// (its "Review pick" question) and the stamp on the drafts (its comment gate). While the session works, the gnome
// thinks. Discuss peeks at the session over the tab; closing the view ends the session with it.
// - Another's pull request: the findings by severity, each row opening to its rule, what happens, what to change, the
//   code and the sketch; ticked one by one, never all at once; then the drafts, edited in place, and the stamp.
// - The user's own: a card per open thread with what to do about it (fix, reply, ask) and its reply's draft; this
//   round's fixes and replies, the stamp that publishes the replies and resolves the fixed threads, and where each
//   thread stands after it.
// A draft that names AI or its tools, or an empty one, keeps the stamp back. The stamp freezes the drafts the view shows
// (bin/forge-pr.sh stamp) before it answers, so the session publishes exactly those.
import { h_flex, Scrollbar, Textarea, TextareaState, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { checking, panes, props, run, spaces } from "herdr";
import { answerInbox, followInbox } from "../bridges/inbox.js";
import {
  dropDraft,
  editDraft,
  followReview,
  pickRows,
  stampDrafts,
} from "../bridges/reviews.js";
import { playDone, playStamp } from "../bridges/sounds.js";
import { readTerminals } from "../bridges/terminals.js";
import { counted } from "../format.js";
import { reviewAskOf, reviewTabOf } from "../inbox.js";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { checkBox } from "../kit/forms.js";
import { emptyState, thinkingState } from "../kit/panels.js";
import {
  checkLine,
  draftCard,
  findingDetail,
  findingFrame,
  findingRow,
  groupHead,
  metaItem,
  sectionTitle,
  severityChip,
  severityColour,
  stillBox,
  stillText,
  thinkingLine,
  threadCard,
  viewTitle,
} from "../kit/review.js";
import { ICON, icon, iconButton } from "../kit/sprites.js";
import { landStamp, STAMP_PHASE, stampOver } from "../kit/stamp.js";
import { fill, text, wrapped } from "../kit/text.js";
import { tokens } from "../kit/tokens.js";
import {
  ANSWER,
  ASK,
  askAnswer,
  closableReviewTab,
  findingCounts,
  findingGroups,
  locationLabel,
  locationPath,
  locationsLabel,
  moreAnswer,
  ownRows,
  PROPOSAL,
  pendingAsk,
  pickAnswer,
  REVIEW_KIND,
  ROW_STATE,
  SEVERITY_ORDER,
  stampBlockers,
  turnOver,
} from "../review.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../inbox.js").InboxRequest} InboxRequest */
/** @typedef {import("../review.js").Draft} Draft */
/** @typedef {import("../review.js").FindingRow} FindingRow */
/** @typedef {import("../review.js").PendingAsk} PendingAsk */
/** @typedef {import("../review.js").Review} Review */
/** @typedef {import("../review.js").RowState} RowState */
/** @typedef {import("../kit/stamp.js").StampPhase} StampPhase */
/** @typedef {import("./role.js").Role} Role */

/** @type {() => { terminal?: string } | null} */
const readProps = props;

// Under this width, in pixels, the two columns take turns behind a toggle.
const NARROW = 900;
const DRAFT_ROWS = Object.freeze({ max: 12, min: 2 });
// Once every thread is published, the tab closes by itself: when the session's turn is over (checked this often, this
// many times at most; past them the view stays), after a moment to read it.
const CLOSE = Object.freeze({ linger: 1500, poll: 1000, tries: 60 });

/** @type {Record<RowState, string>} */
const ROW_LABEL = {
  duplicate: "duplicate",
  failed: "failed",
  open: "open, waits",
  pending: "pending",
  published: "published",
  resolved: "resolved",
  unacted: "not acted",
};

/**
 * A draft's field and the text last saved from it.
 * @typedef {object} DraftField
 * @property {TextareaState} state
 * @property {string} saved
 */

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const review = (cx) => {
  const terminal = readProps()?.terminal ?? "";
  /** @type {Review | null} */
  let current = null;
  let loaded = false;
  /** @type {InboxRequest[]} */
  let requests = [];
  /** @type {Set<string>} the rows or threads ticked, by id */
  let picks = new Set();
  // Which review the picks belong to: another one starts from what it keeps.
  let picksOf = "";
  /** @type {Set<string>} the finding rows opened */
  const opened = new Set();
  // Until the human opens or closes a finding, the first one shows opened.
  let touched = false;
  /** @type {Map<string, DraftField>} */
  const fields = new Map();
  // The Claude session the view saw ask for the picks, for a review that does not keep it yet.
  let seenSession = "";
  let width = 0;
  let showSide = false;
  let busy = false;
  let failed = "";
  /** @type {StampPhase} */
  let stamp = STAMP_PHASE.none;
  // Every thread published, the tab is about to close; or the session still works past the wait, and the view stays.
  let closing = false;
  let stayed = false;
  // The view saw the session publish (stamped, nothing published yet): only then does it close by itself, so a review
  // published before the view opened (after a restart) just shows.
  let sawPublishing = false;
  /** @type {() => void} */
  let allPublished = () => {};
  const published = new Promise((resolve) => {
    allPublished = () => resolve(undefined);
  });

  /** @param {string} id @param {Context} cx */
  const save = (id, cx) => {
    const field = fields.get(id);
    if (field === undefined || field.state.value() === field.saved) return;
    const body = field.state.value();
    cx.spawn(async (task) => {
      const refused = await editDraft(terminal, id, body);
      if (refused === null) field.saved = body;
      failed = refused ?? "";
      task.notify();
    });
  };

  // A field per draft, made as the drafts arrive; one the session rewrote takes its new text unless the human is
  // editing it, and one whose draft went is released.
  /** @param {Draft[]} drafts */
  const syncFields = (drafts) => {
    for (const draft of drafts) {
      const field = fields.get(draft.id);
      if (field === undefined) {
        const state = TextareaState.new({ value: draft.body });
        state.set_auto_grow(DRAFT_ROWS.min, DRAFT_ROWS.max);
        state.on("change", (_event, cx) => cx.notify());
        state.on("blur", (_event, cx) => save(draft.id, cx));
        fields.set(draft.id, { saved: draft.body, state });
      } else if (
        field.saved !== draft.body &&
        field.state.value() === field.saved
      ) {
        field.state.set_value(draft.body);
        field.saved = draft.body;
      }
    }
    const kept = new Set(drafts.map((draft) => draft.id));
    for (const [id, field] of fields)
      if (!kept.has(id)) {
        field.state.release();
        fields.delete(id);
      }
  };

  /** @param {Review | null} read */
  const take = (read) => {
    current = read;
    loaded = true;
    if (read === null) return;
    const of = [
      read.kind,
      read.pr.url,
      ...read.findings.map((one) => one.id),
      ...read.threads.map((one) => one.id),
    ].join(" ");
    if (of !== picksOf) {
      picksOf = of;
      picks = new Set(read.picked);
    }
    syncFields(read.drafts);
    if (read.stamped !== null && read.results.length === 0)
      sawPublishing = true;
    if (
      sawPublishing &&
      read.stamped !== null &&
      read.results.length > 0 &&
      !read.results.some((one) => one.status === ROW_STATE.failed)
    )
      allPublished();
  };

  const following =
    checking() || terminal === "" ? null : followReview(cx, terminal, take);
  const inbox =
    checking() || terminal === ""
      ? null
      : followInbox(cx, (read) => {
          requests = read;
          // The session that asks for the picks is the review's: only its comment gate is answered here.
          const picking = pendingAsk(read, terminal, null);
          if (picking?.kind === ASK.pick)
            seenSession = picking.request.session_id;
        });

  // Every thread published (none failed): once the session's turn is over (idle or done, nothing of it waiting in the
  // inbox), the tab closes, and the sidebar ends the session whose review's tab is gone (lanes.js orphanedReviews);
  // when the tab holds anything else or is its space's last, only the session ends. A thread that failed keeps the
  // view, to say why, and so does a session still at work, or waiting on the human, past the wait.
  const closer =
    checking() || terminal === ""
      ? null
      : cx.spawn(async (task) => {
          await published;
          let over = false;
          for (let tries = 0; tries < CLOSE.tries && !over; tries += 1) {
            over =
              turnOver(
                readTerminals().find((one) => one.address === terminal),
              ) && !requests.some((one) => one.terminal === terminal);
            if (!over) await task.sleep(CLOSE.poll);
          }
          if (!over) {
            stayed = true;
            task.notify();
            return;
          }
          closing = true;
          playDone();
          task.notify();
          await task.sleep(CLOSE.linger);
          const tab = reviewTabOf(terminal, readTerminals());
          if (closableReviewTab(tab, panes(), spaces()))
            run("tab.close", { id: tab });
          else run("terminal.kill", { terminal });
        });

  // Only while the terminal is still the review's (bin/forge-pr.sh open labels it; results and a new session unlabel it).
  /** @returns {PendingAsk | null} */
  const ask = () => {
    const waiting = pendingAsk(requests, terminal, current, seenSession);
    return waiting !== null && reviewAskOf(waiting.request, readTerminals())
      ? waiting
      : null;
  };

  /** The ids ticked, in the order the view lists them. @param {Review} shown */
  const orderedPicks = (shown) =>
    (shown.kind === REVIEW_KIND.own
      ? shown.threads.map((one) => one.id)
      : findingGroups(shown.findings).flatMap((group) =>
          group.rows.map((row) => row.id),
        )
    ).filter((id) => picks.has(id));

  // The rows can be ticked while the session asks for the picks, and while its comment gate waits on drafts not stamped
  // yet: a row ticked then is drafted too (Draft N more), a row unticked loses its draft.
  /** @param {PendingAsk | null} waiting */
  const tickable = (waiting) =>
    !busy &&
    current !== null &&
    (waiting?.kind === ASK.pick ||
      (waiting?.kind === ASK.gate && current.stamped === null));

  /** The rows ticked that have no draft yet. @param {Review} shown */
  const additions = (shown) =>
    orderedPicks(shown).filter(
      (id) => !shown.drafts.some((draft) => draft.id === id),
    );

  /** Keeps the picks, for the session that asks for them. @param {string} session @param {Context} cx */
  const keepPicks = (session, cx) => {
    if (current === null) return;
    const ids = orderedPicks(current);
    cx.spawn(async (task) => {
      const refused = await pickRows(terminal, ids, session);
      failed = refused ?? "";
      task.notify();
    });
  };

  /** @param {string} id @param {Context} cx */
  const togglePick = (id, cx) => {
    const waiting = ask();
    if (current === null || waiting === null || !tickable(waiting)) return;
    const drafted = current.drafts.some((draft) => draft.id === id);
    if (picks.has(id)) picks.delete(id);
    else picks.add(id);
    if (drafted && !picks.has(id)) drop(id, cx);
    keepPicks(waiting.request.session_id, cx);
    cx.notify();
  };

  /** Answers what the session asks with a text. @param {string} text @param {Context} cx */
  const answerWith = (text, cx) => {
    const waiting = ask();
    if (waiting === null || busy) return;
    busy = true;
    cx.spawn(async (task) => {
      const refused = await answerInbox(
        waiting.request.id,
        askAnswer(waiting, text),
      );
      busy = false;
      failed = refused ?? "";
      task.notify();
    });
    cx.notify();
  };

  /** @param {Context} cx */
  const answerPick = (cx) => {
    if (current === null || ask()?.kind !== ASK.pick) return;
    answerWith(pickAnswer(orderedPicks(current)), cx);
  };

  /** The rows ticked after the drafts go to the session to draft too. @param {Context} cx */
  const draftMore = (cx) => {
    if (current === null || ask()?.kind !== ASK.gate) return;
    answerWith(moreAnswer(additions(current)), cx);
  };

  /** With every draft dropped, nothing is published. @param {Context} cx */
  const publishNothing = (cx) => {
    if (ask()?.kind !== ASK.gate) return;
    answerWith(ANSWER.hold, cx);
  };

  /** A draft taken away, and its row unticked. @param {string} id @param {Context} cx */
  const drop = (id, cx) => {
    const session = ask()?.request.session_id ?? "";
    picks.delete(id);
    if (session !== "") keepPicks(session, cx);
    cx.spawn(async (task) => {
      const refused = await dropDraft(terminal, id);
      failed = refused ?? "";
      task.notify();
    });
    cx.notify();
  };

  /** @param {string} id @param {Context} cx */
  const toggleOpen = (id, cx) => {
    if (!touched && current !== null) {
      const first = findingGroups(current.findings)[0]?.rows[0];
      if (first !== undefined) opened.add(first.id);
    }
    touched = true;
    if (opened.has(id)) opened.delete(id);
    else opened.add(id);
    cx.notify();
  };

  /** @param {Context} cx */
  const land = (cx) =>
    landStamp(
      cx,
      (phase) => {
        stamp = phase;
      },
      playStamp,
    );

  /** The drafts as their fields hold them now. @param {Review} shown */
  const draftsNow = (shown) =>
    shown.drafts.map((draft) => ({
      ...draft,
      body: fields.get(draft.id)?.state.value() ?? draft.body,
    }));

  /** Whether drafts can be stamped: some, none empty, none naming AI or its tools. @param {Draft[]} drafts */
  const stampable = (drafts) =>
    drafts.length > 0 &&
    drafts.every((draft) => draft.body.trim() !== "") &&
    stampBlockers(drafts).length === 0;

  // The stamp: the fields edited and not saved yet are saved, the drafts the view shows frozen, and the comment gate
  // answered yes. Stamped already, with the gate still waiting (its answer failed), the gate is answered again.
  /** @param {Context} cx */
  const stampNow = (cx) => {
    const waiting = ask();
    if (current === null || waiting?.kind !== ASK.gate || busy) return;
    const drafts = draftsNow(current);
    const restamp = current.stamped !== null;
    if (!restamp && !stampable(drafts)) return;
    busy = true;
    failed = "";
    land(cx);
    cx.spawn(async (task) => {
      for (const draft of restamp ? [] : drafts) {
        const field = fields.get(draft.id);
        if (field === undefined || field.state.value() === field.saved)
          continue;
        const refused = await editDraft(terminal, draft.id, draft.body);
        if (refused !== null) {
          busy = false;
          failed = refused;
          task.notify();
          return;
        }
        field.saved = draft.body;
      }
      const refused =
        (await stampDrafts(
          terminal,
          restamp ? (current?.stamped?.drafts ?? []) : drafts,
        )) ??
        (await answerInbox(
          waiting.request.id,
          askAnswer(waiting, ANSWER.publish),
        ));
      busy = false;
      failed = refused ?? "";
      task.notify();
    });
    cx.notify();
  };

  /**
   * What the stamp says: the stamp to come; once stamped, the publish to give again while the gate still waits.
   * @param {boolean} stamped
   * @param {boolean} publishing
   * @param {string} stampWords
   * @param {string} what
   */
  const stampLabel = (stamped, publishing, stampWords, what) =>
    ({
      fresh: stampWords,
      republish: `Publish the stamped ${what}`,
      stamped: "Stamped",
    })[!stamped ? "fresh" : publishing ? "republish" : "stamped"];

  /** What the view waits on, or what the session does, in words. @param {Review} shown @param {PendingAsk | null} waiting */
  const statusOf = (shown, waiting) => {
    if (waiting?.kind === ASK.pick) return "waiting on your picks";
    if (waiting?.kind === ASK.gate) return "waiting on your stamp";
    if (shown.results.length > 0)
      return counted(
        shown.results.filter((one) => one.status !== ROW_STATE.failed).length,
        "thread done",
        "threads done",
      );
    if (shown.stamped !== null) return "stamped · publishing…";
    return "the golem is working";
  };

  /** @param {Review} shown @param {PendingAsk | null} waiting */
  const header = (shown, waiting) => {
    const k = tokens();
    const { pr } = shown;
    const own = shown.kind === REVIEW_KIND.own;
    const facts = [
      metaItem(ICON.hammer, own ? "yours" : `@${pr.author || "?"}`),
      ...(own
        ? [
            metaItem(
              ICON.book,
              counted(shown.threads.length, "open thread", "open threads"),
            ),
          ]
        : pr.items.map((item) => metaItem(ICON.book, `${item} · linked`))),
      metaItem(
        ICON.board,
        `${counted(pr.files, "file")} · +${pr.additions} -${pr.deletions}`,
      ),
      ...(pr.checks === "" ? [] : [metaItem(ICON.ok, `checks ${pr.checks}`)]),
      metaItem(ICON.golem, statusOf(shown, waiting)),
    ];
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
              `#${pr.number} ${pr.title}`,
              pr.source === "" ? "" : `${pr.source} → ${pr.target}`,
            ),
          )
          .child(discussButton()),
      )
      .child(h_flex().flex_wrap().gap(18).children(facts))
      .when(failed !== "", (el) =>
        el.child(wrapped(failed, "ui", 12, k.failed)),
      );
  };

  // The session works out of sight: Discuss peeks at it over the tab, with keep-as-tab and close.
  const discussButton = () =>
    control(
      keyButton(KEY_BUTTON.secondary, "Discuss with the golem", {
        icon: ICON.golem,
      }),
      "review-discuss",
      () => run("terminal.peek", { terminal }),
    );

  /** A field to edit a draft in, or its text once it cannot be edited. @param {Draft} draft @param {boolean} editable */
  const draftBody = (draft, editable) => {
    const k = tokens();
    const field = fields.get(draft.id);
    return editable && field !== undefined
      ? Textarea.new(field.state)
          .w_full()
          .px(8)
          .py(6)
          .border(2)
          .border_color(k.accent)
          .bg(k.bg0)
          .text_size(13)
          .text_color(k.fg)
      : stillText(draft.body);
  };

  /** @param {boolean} active @param {NativeElement} button @param {string} id @param {(cx: Context) => void} action */
  const maybe = (active, button, id, action) => {
    const wide = button.w_full().justify_center();
    return active ? control(wide, id, action) : wide.opacity(0.45);
  };

  /** @param {FindingRow} row @param {PendingAsk | null} waiting @param {FindingRow | undefined} first */
  const findingOf = (row, waiting, first) => {
    const picked = picks.has(row.id);
    const isOpen = opened.has(row.id) || (!touched && row === first);
    const lead = row.findings[0];
    const tick = tickable(waiting)
      ? control(checkBox(picked), `review-pick-${row.id}`, (cx) =>
          togglePick(row.id, cx),
        )
      : stillBox(picked);
    const note = {
      discarded: "USUALLY DISCARDED",
      group: `GROUP · ${row.findings.length}`,
      single: "",
    }[
      row.discarded ? "discarded" : row.findings.length > 1 ? "group" : "single"
    ];
    const line = control(
      findingRow({
        id: row.id,
        note,
        open: isOpen,
        picked,
        place: locationsLabel(row.findings),
        severity: row.severity,
        tick,
        title: lead.title,
      }),
      `review-row-${row.id}`,
      (cx) => toggleOpen(row.id, cx),
    );
    const { context } = lead;
    return findingFrame(
      line,
      isOpen
        ? findingDetail({
            change: lead.change,
            context:
              context === null
                ? []
                : context.lines.map((each, at) => ({
                    mark: context.start + at === context.mark,
                    number: context.start + at,
                    text: each,
                  })),
            happens: lead.happens,
            refactor: lead.refactor,
            rule: lead.rule,
            where:
              row.findings.length > 1 ? row.findings.map(locationPath) : [],
          })
        : null,
      severityColour(row.severity),
    );
  };

  /**
   * The picks' bar under a column, out of its scroll, so it is always at hand: the rows ticked and Draft N comments
   * while the session asks for them; Draft N more while its gate waits and rows were ticked after the drafts.
   * @param {Review} shown
   * @param {PendingAsk | null} waiting
   * @param {string} what what a row becomes: comment, reply
   * @returns {NativeElement | null}
   */
  const actionBar = (shown, waiting, what) => {
    const k = tokens();
    const picking = waiting?.kind === ASK.pick && !busy;
    const ticked = orderedPicks(shown).length;
    const more = tickable(waiting) && !picking ? additions(shown).length : 0;
    if (!picking && more === 0) return null;
    const [label, id, action, hint] = picking
      ? [
          ticked > 0 ? `Draft ${counted(ticked, what)}` : `No ${what}s`,
          "review-answer-pick",
          answerPick,
          "Tick each one, one by one; the golem drafts them.",
        ]
      : [
          `Draft ${counted(more, `more ${what}`)}`,
          "review-draft-more",
          draftMore,
          "Ticked after the drafts: the golem drafts them too.",
        ];
    return h_flex()
      .flex_none()
      .items_center()
      .gap(12)
      .px(16)
      .py(10)
      .bg(k.bg1)
      .border_t(2)
      .border_color(k.line)
      .child(control(keyButton(KEY_BUTTON.primary, label), id, action))
      .child(
        div()
          .flex_1()
          .min_w(0)
          .child(wrapped(hint, "ui", 12, k.muted)),
      );
  };

  /**
   * A column's list that scrolls, and its bar under it, out of the scroll. The list is laid absolutely in the room the
   * bar leaves: a list made a scroll area wraps itself, and its flex size would never reach the column (as herdr's
   * changes mod finds).
   * @param {string} id
   * @param {NativeElement} list
   * @param {NativeElement | null} bar
   */
  const withBar = (id, list, bar) =>
    v_flex()
      .flex_1()
      .min_w(0)
      .h_full()
      .child(
        div()
          .flex_1()
          .min_h(0)
          .relative()
          .child(list.id(id).absolute().inset_0().overflow_y_scroll())
          .child(Scrollbar.vertical(id).absolute().inset_0()),
      )
      .when(bar !== null, (el) => el.child(bar ?? div()));

  /** @param {Review} shown @param {PendingAsk | null} waiting */
  const findingsColumn = (shown, waiting) => {
    const groups = findingGroups(shown.findings);
    const counts = findingCounts(shown.findings);
    const first = groups[0]?.rows[0];
    return withBar(
      "review-findings",
      v_flex()
        .gap(8)
        .p(16)
        .child(
          h_flex()
            .flex_wrap()
            .items_center()
            .gap(8)
            .child(sectionTitle("FINDINGS"))
            .children(
              SEVERITY_ORDER.map((one) => severityChip(one, counts[one])),
            ),
        )
        .when(shown.findings.length === 0, (el) =>
          el.child(thinkingLine("analyzing the pull request")),
        )
        .children(
          groups.flatMap((group) => [
            groupHead(
              group.severity,
              group.rows.reduce((sum, row) => sum + row.findings.length, 0),
            ),
            ...group.rows.map((row) => findingOf(row, waiting, first)),
          ]),
        ),
      actionBar(shown, waiting, "comment"),
    );
  };

  /** @param {Review} shown */
  const resultsList = (shown) => {
    const k = tokens();
    return v_flex()
      .gap(6)
      .child(sectionTitle("PUBLISHED"))
      .children(
        shown.results.map((result) =>
          h_flex()
            .items_center()
            .gap(10)
            .child(
              text(
                result.status.toUpperCase(),
                "display",
                9,
                result.status === ROW_STATE.failed ? k.failed : k.ok,
              ),
            )
            .child(fill(locationPath(result), "mono", 12, k.fg))
            .when(result.reason !== "", (el) =>
              el.child(text(result.reason, "ui", 11, k.muted)),
            )
            .when(result.url !== "", (el) =>
              el.child(
                control(
                  text("open", "ui", 12, k.accent),
                  `review-open-${result.id}-${result.path}-${result.line}`,
                  (cx) => cx.open_url(result.url),
                ),
              ),
            ),
        ),
      );
  };

  /** Whether the session is drafting: the picks answered, nothing drafted yet. @param {Review} shown @param {PendingAsk | null} waiting */
  const drafting = (shown, waiting) =>
    waiting === null &&
    shown.picked.length > 0 &&
    shown.drafts.length === 0 &&
    shown.results.length === 0;

  /** @param {Review} shown @param {PendingAsk | null} waiting */
  const draftsColumn = (shown, waiting) => {
    const k = tokens();
    const stamped = shown.stamped !== null;
    const editable = waiting?.kind === ASK.gate && !stamped && !busy;
    const drafts = stamped ? (shown.stamped?.drafts ?? []) : draftsNow(shown);
    const blockers = stampBlockers(drafts);
    const threads = drafts.reduce((sum, one) => sum + one.locations.length, 0);
    const publishing = waiting?.kind === ASK.gate && !busy;
    const ready = publishing && (stamped || stampable(drafts));
    return v_flex()
      .id("review-drafts")
      .size_full()
      .gap(10)
      .p(16)
      .overflow_y_scrollbar()
      .child(
        sectionTitle(`DRAFTS · ${counted(threads, "COMMENT", "COMMENTS")}`),
      )
      .child(
        text("Signed by you. Edit or drop before stamping.", "ui", 12, k.muted),
      )
      .when(drafting(shown, waiting), (el) =>
        el.child(thinkingLine("drafting the comments")),
      )
      .when(drafts.length === 0 && !drafting(shown, waiting), (el) =>
        el.child(
          wrapped(
            "The golem drafts a comment for each finding you pick.",
            "ui",
            12,
            k.muted,
          ),
        ),
      )
      .when(
        drafts.length === 0 &&
          waiting?.kind === ASK.gate &&
          !busy &&
          additions(shown).length === 0,
        (el) =>
          el.child(
            h_flex().child(
              control(
                keyButton(KEY_BUTTON.secondary, "Publish nothing"),
                "review-publish-nothing",
                publishNothing,
              ),
            ),
          ),
      )
      .children(
        drafts.map((draft) =>
          draftCard({
            body: draftBody(draft, editable),
            drop: editable
              ? control(
                  iconButton(ICON.trash, k.muted),
                  `review-drop-${draft.id}`,
                  (cx) => drop(draft.id, cx),
                )
              : null,
            flagged: blockers.find((one) => one.id === draft.id)?.words ?? [],
            label: `[${draft.id}]`,
            place: draft.locations.map(locationPath).join(" · "),
            suggestion: draft.suggestion,
            threads: draft.locations.length,
          }),
        ),
      )
      .when(drafts.length > 0, (el) =>
        el
          .child(
            checkLine(
              blockers.length === 0,
              blockers.length === 0
                ? "no tooling mentions in any draft"
                : `${counted(blockers.length, "draft names", "drafts name")} AI or its tools`,
            ),
          )
          .when(
            drafts.some((draft) => draft.body.trim() === ""),
            (line) =>
              line.child(
                checkLine(false, "a draft is empty: write it or drop it"),
              ),
          )
          .when(!stamped && additions(shown).length > 0, (line) =>
            line.child(
              checkLine(
                false,
                `${counted(additions(shown).length, "finding is", "findings are")} ticked with no draft: Draft them, or the stamp leaves them out`,
              ),
            ),
          )
          .child(
            maybe(
              ready,
              keyButton(
                KEY_BUTTON.stamp,
                stampLabel(
                  stamped,
                  publishing,
                  `Stamp gnomemark and publish ${threads}`,
                  "drafts",
                ),
                { icon: ICON.gnomemark },
              ),
              "review-stamp",
              stampNow,
            ),
          )
          .child(
            wrapped(
              `Publishes ${counted(threads, "thread")} on the pull request through its CLI, as you. Never a vote, an approval or a status change.`,
              "ui",
              11,
              k.muted,
            ),
          ),
      )
      .when(stamped && shown.results.length === 0 && !publishing, (el) =>
        el.child(thinkingLine("publishing")),
      )
      .when(shown.results.length > 0, (el) => el.child(resultsList(shown)));
  };

  /** @param {Review} shown @param {PendingAsk | null} waiting */
  const threadsColumn = (shown, waiting) => {
    const k = tokens();
    const editable =
      waiting?.kind === ASK.gate && shown.stamped === null && !busy;
    return withBar(
      "review-threads",
      v_flex()
        .gap(12)
        .p(16)
        .child(
          h_flex()
            .items_center()
            .gap(12)
            .child(sectionTitle(`OPEN THREADS · ${shown.threads.length}`))
            .child(text("resolved threads are skipped", "ui", 12, k.muted)),
        )
        .when(shown.threads.length === 0, (el) =>
          el.child(thinkingLine("reading the threads")),
        )
        .children(
          shown.threads.map((thread) => {
            const picked = picks.has(thread.id);
            const draft = (shown.stamped?.drafts ?? draftsNow(shown)).find(
              (one) => one.id === thread.id,
            );
            return threadCard({
              author: thread.author,
              commit:
                thread.commit === ""
                  ? ""
                  : [thread.commit, thread.subject, thread.tests]
                      .filter((part) => part !== "")
                      .join(" · "),
              detail: thread.detail,
              picked,
              place: locationLabel(thread),
              proposal: thread.proposal,
              reply: draft === undefined ? null : draftBody(draft, editable),
              request: thread.request,
              tick: tickable(waiting)
                ? control(checkBox(picked), `review-pick-${thread.id}`, (cx) =>
                    togglePick(thread.id, cx),
                  )
                : stillBox(picked),
            });
          }),
        ),
      actionBar(shown, waiting, "reply"),
    );
  };

  /** @param {string} title @param {NativeElement[]} lines */
  const roundBox = (title, lines) => {
    const k = tokens();
    return v_flex()
      .w_full()
      .gap(8)
      .p(12)
      .bg(k.bg1)
      .border(2)
      .border_color(k.line)
      .child(text(title, "display", 10, k.fg))
      .children(lines);
  };

  /** @param {Review} shown @param {PendingAsk | null} waiting */
  const roundColumn = (shown, waiting) => {
    const k = tokens();
    const stamped = shown.stamped !== null;
    const drafts = stamped ? (shown.stamped?.drafts ?? []) : draftsNow(shown);
    const blockers = stampBlockers(drafts);
    const resolving = drafts.filter((one) => one.resolve).length;
    const fixes = shown.threads.filter(
      (one) =>
        picks.has(one.id) && one.proposal === PROPOSAL.fix && one.commit !== "",
    );
    const publishing = waiting?.kind === ASK.gate && !busy;
    const ready = publishing && (stamped || stampable(drafts));
    return v_flex()
      .id("review-round")
      .size_full()
      .gap(12)
      .p(16)
      .overflow_y_scrollbar()
      .child(sectionTitle("THIS ROUND"))
      .when(drafting(shown, waiting), (el) =>
        el.child(thinkingLine("fixing and drafting the replies")),
      )
      .child(
        roundBox(
          `1 · FIXES · ${fixes.length}`,
          fixes.length === 0
            ? [text("No fix pushed yet.", "ui", 12, k.muted)]
            : fixes.map((one) =>
                h_flex()
                  .items_center()
                  .gap(8)
                  .child(icon(ICON.gnomemark, k.done))
                  .child(
                    fill(`${one.commit} · ${one.subject}`, "mono", 12, k.muted),
                  ),
              ),
        ),
      )
      .child(
        roundBox(`2 · REPLIES · ${counted(drafts.length, "DRAFT")}`, [
          checkLine(
            blockers.length === 0,
            blockers.length === 0
              ? "no tooling mentions"
              : `${counted(blockers.length, "reply names", "replies name")} AI or its tools`,
          ),
          ...(drafts.some((draft) => draft.body.trim() === "")
            ? [checkLine(false, "a reply is empty: write it")]
            : []),
        ]),
      )
      .child(
        maybe(
          ready,
          keyButton(
            KEY_BUTTON.stamp,
            stampLabel(
              stamped,
              publishing,
              `Stamp: ${counted(drafts.length, "reply", "replies")}, resolve ${resolving}`,
              "replies",
            ),
            { icon: ICON.gnomemark },
          ),
          "review-stamp",
          stampNow,
        ),
      )
      .child(sectionTitle("AFTER THE STAMP", k.muted))
      .child(
        v_flex()
          .w_full()
          .border(2)
          .border_color(k.line)
          .children(
            ownRows(shown).map((row) =>
              h_flex()
                .w_full()
                .items_center()
                .gap(10)
                .px(10)
                .py(6)
                .border_b(1)
                .border_color(k.line)
                .child(fill(locationLabel(row.location), "mono", 12, k.fg))
                .child(
                  div()
                    .flex_none()
                    .w(50)
                    .child(text(row.action || "—", "ui", 12, k.muted)),
                )
                .child(
                  div()
                    .flex_none()
                    .w(70)
                    .child(text(row.commit || "—", "mono", 12, k.muted)),
                )
                .child(
                  div()
                    .flex_none()
                    .w(90)
                    .child(
                      text(
                        ROW_LABEL[row.state],
                        "ui",
                        12,
                        {
                          failed: k.failed,
                          resolved: k.ok,
                        }[row.state] ?? k.accent,
                      ),
                    ),
                )
                .when(row.url !== "", (el) =>
                  el.child(
                    control(
                      text("open", "ui", 12, k.accent),
                      `review-open-${row.id}`,
                      (cx) => cx.open_url(row.url),
                    ),
                  ),
                ),
            ),
          ),
      );
  };

  /**
   * The two columns side by side, or one at a time behind a toggle when the pane is narrow.
   * @param {NativeElement} main
   * @param {NativeElement} side
   * @param {string} mainLabel
   * @param {string} sideLabel
   */
  const columns = (main, side, mainLabel, sideLabel) => {
    const k = tokens();
    if (width === 0 || width >= NARROW)
      return h_flex()
        .flex_1()
        .min_h(0)
        .child(main)
        .child(
          div()
            .flex_none()
            .w(420)
            .h_full()
            .border_l(2)
            .border_color(k.line)
            .child(side),
        );
    const toggle = (
      /** @type {boolean} */ onSide,
      /** @type {string} */ label,
    ) =>
      control(
        div()
          .flex_none()
          .px(10)
          .py(3)
          .bg(showSide === onSide ? k.accent : k.bg2)
          .child(
            text(
              label,
              "display",
              9,
              showSide === onSide ? k.onAccent : k.muted,
            ),
          ),
        `review-show-${onSide ? "side" : "main"}`,
        (cx) => {
          showSide = onSide;
          cx.notify();
        },
      );
    return v_flex()
      .flex_1()
      .min_h(0)
      .child(
        h_flex()
          .flex_none()
          .gap(2)
          .px(16)
          .pt(10)
          .child(toggle(false, mainLabel))
          .child(toggle(true, sideLabel)),
      )
      .child(
        div()
          .flex_1()
          .min_h(0)
          .child(showSide ? side : main),
      );
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const root = v_flex()
      .id("review")
      .relative()
      .size_full()
      .bg(k.bg0)
      .on_size_change((size, cx) => {
        const narrow = width > 0 && width < NARROW;
        width = size.width;
        if (narrow !== width < NARROW) cx.notify();
      });
    if (terminal === "")
      return root.child(
        emptyState({
          caption: "review",
          sub: "A review view opens with the session that reviews a pull request, from Start work's Review tab.",
          title: "no review here",
        }),
      );
    if (current === null)
      return root.child(
        v_flex()
          .size_full()
          .child(
            thinkingState({
              caption: "review",
              sub: "Its findings, or the threads of your pull request, show here as soon as the golem reports them.",
              title: loaded
                ? "analyzing the pull request"
                : "opening the review",
            }),
          )
          .child(
            h_flex().flex_none().justify_center().p(12).child(discussButton()),
          ),
      );
    const waiting = ask();
    // Stamped and its gate answered, the session publishes: the gnome works over the view until every thread is up.
    const publishing =
      current.stamped !== null &&
      waiting?.kind !== ASK.gate &&
      !stayed &&
      (closing ||
        current.results.length === 0 ||
        !current.results.some((one) => one.status === ROW_STATE.failed));
    if (publishing)
      return root
        .child(
          thinkingState({
            caption: "review",
            sub: closing
              ? "Every thread is up on the pull request; the review closes."
              : "Each thread goes up on the pull request as you; the review closes once they are all up and the golem is done.",
            title:
              current.results.length > 0
                ? `${counted(current.results.length, "thread")} published`
                : current.kind === REVIEW_KIND.own
                  ? "publishing the replies"
                  : "publishing the comments",
          }),
        )
        .when(stamp !== STAMP_PHASE.none, (el) =>
          el.child(stampOver("review-stamp", stamp)),
        );
    return root
      .child(header(current, waiting))
      .child(
        current.kind === REVIEW_KIND.own
          ? columns(
              threadsColumn(current, waiting),
              roundColumn(current, waiting),
              "THREADS",
              "THIS ROUND",
            )
          : columns(
              findingsColumn(current, waiting),
              draftsColumn(current, waiting),
              "FINDINGS",
              "DRAFTS",
            ),
      )
      .when(stamp !== STAMP_PHASE.none, (el) =>
        el.child(stampOver("review-stamp", stamp)),
      );
  };

  return {
    // The view and its session go together: closing the view ends the session working out of sight.
    close: () => {
      following?.cancel();
      inbox?.cancel();
      closer?.cancel();
      for (const field of fields.values()) field.state.release();
      fields.clear();
      // The session is not ended here: herdr closes the view on quit too, and a review must outlive a restart. The
      // sidebar ends it once its tab is gone (lanes.js orphanedReviews).
    },
    render,
  };
};
