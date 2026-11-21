// The approval inbox (design 05): a drawer at the window's right, under the top bar, with what waits on the human's
// mark, a card each (inbox.js), the newest first: a tool's permission, a question, one of forgerdr's gates, a plan, or
// an agent waiting in its pane. Each card shows the gnome and the name of the forge it comes from, then the branch and
// the session. A click opens a card, or one above a stamp still showing once the stamp goes: Allow once and Deny with
// reason for a permission; the options, an answer of one's own and Answer (Stamp on a gate) for a question; the plan,
// the mode its session takes after it, Approve and Revise for a plan; and Discuss on every card, which goes to the
// agent's pane and leaves the card open. Everything is a click; the text field alone takes Enter. An answer goes
// through bin/forge-inbox.sh to the hook that waits on it (hooks/inbox.sh); the pane's own dialog stays open meanwhile,
// whichever answers first wins, and a card answered in the pane goes. An answer stamps its card with the gnomemark
// (design 05b, after the mark), gold for a yes and red for a no, over what showed of the card when it was clicked: it
// comes down with a thump and the stamp's sound, stays a moment and slides off right with the card; with the motion
// off the card just goes, to the same sound. Anything running as the user could write an answer too, as it could type
// in a pane: the foot says so.
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { checking, panes, run, settings, spaces } from "herdr";
import { readSpacesGit } from "../bridges/git.js";
import { readGnomes } from "../bridges/gnomes.js";
import {
  answerInbox,
  followInbox,
  inboxOpen,
  toggleInbox,
} from "../bridges/inbox.js";
import { playStamp } from "../bridges/sounds.js";
import { readTerminals } from "../bridges/terminals.js";
import { groupForges, lookKeyOf } from "../forges.js";
import { gnomeLookOf } from "../identity.js";
import {
  ARM_MS,
  aboveOf,
  answersOf,
  approvable,
  armed,
  cardsOf,
  countsOf,
  denyAnswer,
  FILTER,
  FILTER_ORDER,
  headingOf,
  heldShut,
  INBOX_KIND,
  MARK,
  markedAt,
  markOf,
  openCardOf,
  openedNow,
  originOf,
  PLAN_MODE,
  permissionAnswer,
  pickOption,
  planAnswer,
  questionAnswer,
  questionsOf,
  quietAfter,
  quietNow,
  reviewAskOf,
  reviewTabOf,
  shownIn,
  stampTop,
  summaryOf,
  visible,
  waitedFor,
} from "../inbox.js";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { choice, choices } from "../kit/forms.js";
import { emptyState } from "../kit/panels.js";
import {
  gnome,
  ICON,
  icon,
  iconButton,
  STAMP_ART,
  stampLayers,
} from "../kit/sprites.js";
import { fill, text, wrapped } from "../kit/text.js";
import { motionOn, NONE, tokens, withAlpha } from "../kit/tokens.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("gpui-kit").MouseButtonEvent} MouseButtonEvent */
/** @typedef {import("../inbox.js").InboxAnswer} InboxAnswer */
/** @typedef {import("../inbox.js").InboxCard} InboxCard */
/** @typedef {import("../inbox.js").InboxFilter} InboxFilter */
/** @typedef {import("../inbox.js").InboxKind} InboxKind */
/** @typedef {import("../inbox.js").InboxRequest} InboxRequest */
/** @typedef {import("../inbox.js").Mark} Mark */
/** @typedef {import("../inbox.js").Opened} Opened */
/** @typedef {import("../inbox.js").OtherAnswers} OtherAnswers */
/** @typedef {import("../inbox.js").Picks} Picks */
/** @typedef {import("../inbox.js").PlanMode} PlanMode */
/** @typedef {import("../inbox.js").WindowBox} WindowBox */
/** @typedef {import("../kit/buttons.js").KeyButtonKind} KeyButtonKind */
/** @typedef {import("../kit/sprites.js").IconName} IconName */
/** @typedef {import("./role.js").Role} Role */

// How often the cards' times move while the drawer shows; hidden, it only looks whether it opened.
const TIMING = Object.freeze({ armed: 20, open: 1000, shut: 2000 });

// The stamp's life, in ms: raised over the card, it lands a moment later with a thump (a spring from its raised size
// down to its own, which overshoots a little), stays while it is read, then slides off to the right with the card, and
// the cards below rise into its place.
const STAMP = Object.freeze({
  // The card goes to the background under the blow: a veil of the drawer's colour comes over it, this fast and this
  // thick; the stamp's own body is the darkest colour, nearly whole.
  body: 0.85,
  // The room it leaves closes this fast.
  close: 220,
  hold: 750,
  land: 40,
  // It slides off to the right this fast, this far: past the drawer's edge.
  leave: 380,
  raised: 1.5,
  scale: 1.6,
  // The card trembles under the blow, side to side, a few pixels, while the stamp lands.
  shake: { from: -4, period: 100, to: 4 },
  shaking: 300,
  slide: 640,
  spring: { damping: 0.5, response: 170 },
  veil: 150,
  veiled: 0.78,
});

// The landed stamp's height: where it lands is worked out with it (stampTop), and the band it lands in is this tall.
const STAMP_HEIGHT = STAMP_ART.height * STAMP.scale;

const STAMP_PHASE = Object.freeze({
  closing: "closing",
  landed: "landed",
  leaving: "leaving",
  raised: "raised",
  shaking: "shaking",
});

// The room between cards, inside each card's slot, so a slot closing takes its room with it.
const CARD_GAP = 10;

/** @typedef {typeof STAMP_PHASE[keyof typeof STAMP_PHASE]} StampPhase */

/**
 * A card stamped: the card as it was answered, kept while its stamp shows, after its request is gone, so it stays the
 * same under the stamp: open, with what was picked, and the words in its field when it was answered with them.
 * @typedef {object} Marked
 * @property {InboxCard} card
 * @property {Mark} mark
 * @property {number} at when it was answered, in ms
 * @property {StampPhase} phase
 * @property {string | null} words in its text field, when it was answered from it
 * @property {number | null} top how far down the card its stamp lands, when it was answered with a click on it
 *   (inbox.js stampTop); null lands it in the card's middle
 */

/**
 * The open card as the last press on it found it: which card, and where its frame was drawn then.
 * @typedef {object} Pressed
 * @property {string} id
 * @property {WindowBox | null} card in the window; null when it had not been drawn yet
 */

/** @type {Readonly<Record<InboxKind, IconName>>} */
const KIND_ICON = Object.freeze({
  gate: ICON.gnomemark,
  permission: ICON.lock,
  plan: ICON.board,
  question: ICON.idea,
  waiting: ICON.notify,
});

/** @type {Readonly<Record<InboxFilter, string>>} */
const FILTER_LABEL = Object.freeze({
  all: "ALL",
  gates: "GATES",
  permissions: "PERMISSIONS",
  plans: "PLANS",
  questions: "QUESTIONS",
});

/**
 * What the text field under a card is for, so the words go where the human means them: a deny's reason or a plan sent
 * back is sent with it, in the failed colour; an answer of one's own is kept for the question, to answer with.
 * @typedef {object} FieldPurpose
 * @property {string} label
 * @property {string} send its button
 * @property {boolean} refusal
 */

/** @type {Readonly<Record<InboxKind, FieldPurpose>>} */
const FIELD = Object.freeze({
  gate: { label: "YOUR OWN ANSWER", refusal: false, send: "Keep it" },
  permission: {
    label: "DENY THIS PERMISSION · WHY",
    refusal: true,
    send: "Deny",
  },
  plan: {
    label: "SEND THE PLAN BACK · WHAT TO CHANGE",
    refusal: true,
    send: "Send back",
  },
  question: { label: "YOUR OWN ANSWER", refusal: false, send: "Keep it" },
  waiting: { label: "", refusal: false, send: "" },
});

// An answer the hook did not take leaves its request in the inbox; after this long, its card shows again.
const UNTAKEN_MS = 3000;

const FOOT =
  "A convenience, not a lock: anything running as you can answer here, as it can type in a pane.";

/**
 * Window px per layout px: the app's zoom, which settings() carries; a press gives window px, a stamp is placed in
 * layout ones.
 * @returns {number}
 */
const zoomOf = () => {
  const { zoom } = settings();
  return typeof zoom === "number" ? zoom : 1;
};

/**
 * Where a press's element was drawn, in the window: its size, and its corner where the press is in the window less
 * where it is in the element; null when it has not been drawn yet.
 * @param {MouseButtonEvent} event
 * @returns {WindowBox | null}
 */
const boxOf = ({ bounds, local_position: local, position }) =>
  bounds === undefined || local === undefined
    ? null
    : {
        height: bounds.height,
        width: bounds.width,
        x: position.x - local.x,
        y: position.y - local.y,
      };

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const inbox = (cx) => {
  const typed = InputState.new({ placeholder: "" });
  /** @type {InboxRequest[]} */
  let requests = [];
  /** @type {InboxFilter} */
  let filter = FILTER.all;
  let selected = "";
  /** @type {Opened} the card shown open, and since when: an approval counts only on it, once it has shown a moment */
  let opened = { at: 0, id: "" };
  // The card whose text field is open, if any.
  let typing = "";
  // What went wrong with an answer, and the card it was for: it goes with the card.
  let failed = { id: "", text: "" };
  /** @type {Record<string, Picks>} by card */
  const picks = {};
  /** @type {Record<string, OtherAnswers>} by card */
  const others = {};
  /** @type {Record<string, PlanMode>} by card */
  const modes = {};
  /** @type {Set<string>} cards being discussed in their panes */
  const discussing = new Set();
  /** @type {Map<string, number>} cards answered here, and when: gone at once, before their hook takes their request */
  const answered = new Map();
  /** @type {Map<string, Marked>} the cards whose stamp shows, by card */
  const marks = new Map();
  /** @type {Map<string, number>} sessions whose request just went, until when: not shown waiting meanwhile */
  let quiet = new Map();
  /** @type {Map<string, number>} when the drawer first saw each session blocked: how long it has waited in its pane */
  const blockedSince = new Map();
  /** @type {Map<string, number>} each card's height with its room below, as last drawn: a stamped one closes from it */
  const heights = new Map();
  // Where the open card and the list were drawn at the last press on them, as the press gives them (the card scrolled
  // with the list): an answer clicked there stamps the card over what showed of it.
  /** @type {Pressed} */
  let pressed = { card: null, id: "" };
  /** @type {WindowBox | null} */
  let listBox = null;

  const following = checking()
    ? null
    : followInbox(cx, (read) => {
        quiet = quietAfter(quiet, requests, read, Date.now());
        requests = read;
        const ids = new Set(read.map((request) => request.id));
        for (const id of answered.keys()) if (!ids.has(id)) answered.delete(id);
        untaken(Date.now());
        // A card under its stamp keeps what it shows until the stamp is gone.
        const gone = (/** @type {string} */ id) =>
          !ids.has(id) && !marks.has(id);
        for (const store of [picks, others, modes])
          for (const id of Object.keys(store)) if (gone(id)) delete store[id];
        for (const id of discussing) if (gone(id)) discussing.delete(id);
        for (const id of heights.keys()) if (gone(id)) heights.delete(id);
        if (failed.id !== "" && gone(failed.id)) failed = { id: "", text: "" };
        pin();
      });
  const clock = checking()
    ? null
    : cx.spawn(async (cx) => {
        for (;;) {
          const open = inboxOpen();
          const now = Date.now();
          const blocked = readTerminals().filter(
            (terminal) => terminal.status === "blocked",
          );
          for (const terminal of blocked)
            if (!blockedSince.has(terminal.address))
              blockedSince.set(terminal.address, now);
          for (const address of blockedSince.keys())
            if (!blocked.some((terminal) => terminal.address === address))
              blockedSince.delete(address);
          untaken(now);
          if (open) pin();
          if (open && (allCards().length > 0 || marks.size > 0)) cx.notify();
          // While the open card is not armed yet, it looks again the moment it is, so its buttons light up then.
          const arming = opened.at + ARM_MS - Date.now();
          await cx.sleep(
            !open
              ? TIMING.shut
              : arming > 0
                ? Math.min(TIMING.open, arming + TIMING.armed)
                : TIMING.open,
          );
        }
      });

  const allCards = () =>
    cardsOf(requests, readTerminals(), {
      now: Date.now(),
      quiet: quietNow(quiet, Date.now()),
      seen: blockedSince,
    }).filter((card) => !answered.has(card.id));
  const shownCards = () => shownIn(allCards(), filter);
  /** The cards whose stamp still shows: until their card closes. */
  const stamping = () =>
    new Set(
      [...marks]
        .filter(([, marked]) => marked.phase !== STAMP_PHASE.closing)
        .map(([id]) => id),
    );
  // forge: a card that arrives above a stamp still showing, or goes from there, still moves the stamped card by its
  // closed height; holding back from listed() the cards that arrive above a showing stamp until it closes would keep
  // it still.
  /**
   * The open card: the one clicked while it still waits, else the first; none while that one is listed above a stamp
   * that still shows, which opening it would push down out of sight (inbox.js heldShut). It opens as the stamped card
   * closes.
   */
  const current = () => {
    const cards = shownCards();
    const card = cards.find((each) => each.id === selected) ?? cards[0];
    return card === undefined || heldShut(listed(), card.id, stamping())
      ? undefined
      : card;
  };
  /** The cards as the drawer lists them: those waiting and those under their stamp, the newest first. */
  const listed = () =>
    [
      ...shownCards(),
      ...shownIn(
        [...marks.values()].map((marked) => marked.card),
        filter,
      ),
    ].sort((one, other) => other.since - one.since);
  /**
   * Keeps the open card open by its id, and notes since when the card shown open has shown (inbox.js openedNow): when
   * it changes, the cards above it change so it moved under the pointer, or a card held shut under a stamp opens, it
   * is armed again (openCardOf, aboveOf, armed).
   */
  const pin = () => {
    selected = openCardOf(shownCards(), selected);
    const shown = current()?.id ?? "";
    opened = openedNow(opened, shown, aboveOf(listed(), shown), Date.now());
  };
  /**
   * An answer the hook did not take leaves its request in the inbox: after a while, its card shows again, saying so.
   * @param {number} now
   */
  const untaken = (now) => {
    for (const [id, at] of answered)
      if (
        now - at > UNTAKEN_MS &&
        requests.some((request) => request.id === id)
      ) {
        answered.delete(id);
        marks.delete(id);
        failed = {
          id,
          text: "Its session did not take that answer: the card waits again.",
        };
      }
  };

  /** @param {Context} cx */
  const stopTyping = (cx) => {
    typing = "";
    typed.set_value("");
    cx.notify();
  };

  /** @param {InboxCard} card @param {Context} cx */
  const startTyping = (card, cx) => {
    typing = card.id;
    typed.set_value("");
    typed.focus();
    cx.notify();
  };

  /**
   * How far down a card clicked to answer its stamp lands: over what showed of the card at the press, which the click
   * follows; null when no press on it gave where it was.
   * @param {InboxCard} card
   */
  const landingOf = (card) =>
    pressed.id === card.id && pressed.card !== null && listBox !== null
      ? stampTop({
          card: pressed.card,
          list: listBox,
          scale: zoomOf(),
          stamp: STAMP_HEIGHT,
        })
      : null;

  /**
   * Stamps a card answered: raised, landed with its sound and the card trembling, still, fading, gone. With the motion
   * off, the sound alone.
   * @param {InboxCard} card
   * @param {Mark} mark
   * @param {string | null} words in its text field, when it was answered from it
   * @param {number | null} top how far down the card the stamp lands (landingOf), else in its middle
   * @param {Context} cx
   */
  const stampCard = (card, mark, words, top, cx) => {
    if (!motionOn()) {
      playStamp();
      return;
    }
    marks.set(card.id, {
      at: Date.now(),
      card,
      mark,
      phase: STAMP_PHASE.raised,
      top,
      words,
    });
    /** @param {StampPhase} phase */
    const turn = (phase) => {
      const marked = marks.get(card.id);
      if (marked !== undefined) marks.set(card.id, { ...marked, phase });
    };
    cx.timer.after(STAMP.land, (task) => {
      turn(STAMP_PHASE.shaking);
      playStamp();
      task.notify();
    });
    cx.timer.after(STAMP.land + STAMP.shaking, (task) => {
      turn(STAMP_PHASE.landed);
      task.notify();
    });
    cx.timer.after(STAMP.land + STAMP.hold, (task) => {
      turn(STAMP_PHASE.leaving);
      task.notify();
    });
    cx.timer.after(STAMP.land + STAMP.hold + STAMP.leave, (task) => {
      turn(STAMP_PHASE.closing);
      // A card held shut above it opens now (pin), and the card below rises into the room: either is armed again once
      // the room has closed.
      pin();
      opened = { ...opened, at: Date.now() + STAMP.close };
      task.notify();
    });
    cx.timer.after(
      STAMP.land + STAMP.hold + STAMP.leave + STAMP.close,
      (task) => {
        marks.delete(card.id);
        heights.delete(card.id);
        pin();
        task.notify();
      },
    );
  };

  // The card goes at once and the one below it opens, before the hook takes the request away; the one above, when it is
  // the last, opens once its stamp is gone (current).
  /**
   * @param {InboxCard} card
   * @param {InboxAnswer} answer
   * @param {number | null} top how far down the card its stamp lands (landingOf), else in its middle
   * @param {Context} cx
   */
  const send = (card, answer, top, cx) => {
    if (card.request === null || answered.has(card.id)) return;
    const cards = shownCards();
    const at = cards.findIndex((each) => each.id === card.id);
    selected = (cards[at + 1] ?? cards[at - 1])?.id ?? "";
    answered.set(card.id, Date.now());
    failed = { id: "", text: "" };
    const words = typing === card.id ? typed.value() : null;
    typing = "";
    typed.set_value("");
    stampCard(card, markOf(card, answer), words, top, cx);
    // After the stamp is noted: a card it holds shut above is no card shown open, so its hold's end arms it afresh.
    pin();
    cx.spawn(async (task) => {
      const refused = await answerInbox(card.id, answer);
      if (refused !== null) {
        answered.delete(card.id);
        marks.delete(card.id);
        failed = { id: card.id, text: refused };
        // Its stamp gone, a card held shut above it opens: armed again from now.
        pin();
      }
      task.notify();
    });
    cx.notify();
  };

  /** @param {InboxCard} card */
  const answersFor = (card) =>
    card.request === null
      ? null
      : answersOf(
          questionsOf(card.request),
          picks[card.id] ?? {},
          others[card.id] ?? {},
        );

  /** The first question of a card no option or text answers yet, else its last. @param {InboxCard} card */
  const openQuestion = (card) => {
    const questions = card.request === null ? [] : questionsOf(card.request);
    const index = questions.findIndex(
      (_question, at) =>
        (picks[card.id]?.[at] ?? []).length === 0 &&
        (others[card.id]?.[at] ?? "") === "",
    );
    return index === -1 ? Math.max(0, questions.length - 1) : index;
  };

  /** @param {InboxCard} card @param {number} question @param {number} option @param {Context} cx */
  const pick = (card, question, option, cx) => {
    const questions = questionsOf(card.request);
    picks[card.id] = pickOption(
      questions,
      picks[card.id] ?? {},
      question,
      option,
    );
    cx.notify();
  };

  /** @param {InboxCard} card @param {Context} cx */
  const discuss = (card, cx) => {
    discussing.add(card.id);
    // agent.focus reaches an agent's pane, or brings up one that has none, such as a subagent's.
    run("agent.focus", { terminal: card.terminal });
    cx.notify();
  };

  // The review's tab, where its view answers; a session whose view's tab is not known goes to its pane.
  /** @param {InboxCard} card @param {Context} cx */
  const openReview = (card, cx) => {
    const tab = reviewTabOf(card.terminal, readTerminals());
    if (tab === "") {
      discuss(card, cx);
      return;
    }
    run("tab.select", { id: tab });
    cx.notify();
  };

  /** @param {InboxCard} card */
  const questionReply = (card) => {
    const answers = answersFor(card);
    return answers === null ? null : questionAnswer(answers);
  };
  /** What each card's first button answers; null while it has nothing to send. */
  /** @type {Readonly<Record<InboxKind, (card: InboxCard) => InboxAnswer | null>>} */
  const APPROVAL = Object.freeze({
    gate: questionReply,
    permission: () => permissionAnswer(),
    plan: (card) => planAnswer(modes[card.id] ?? PLAN_MODE.auto),
    question: questionReply,
    waiting: () => null,
  });

  /** Whether a click on a card counts: the card open a moment, and one listed whole. @param {InboxCard} card */
  // Pinned again at the click: a card that moved since the last look (another session's card came or went above it) is
  // armed again, and this click does not count.
  const clickCounts = (card) => {
    pin();
    return armed(opened, card.id, Date.now());
  };

  /** The card's first button, clicked. @param {InboxCard} card @param {Context} cx */
  const approve = (card, cx) => {
    const answer = APPROVAL[card.kind](card);
    if (answer !== null && approvable(card) && clickCounts(card))
      send(card, answer, landingOf(card), cx);
  };

  /**
   * The field's button, or Enter in it: the deny or the plan sent back with its words, or the answer kept.
   * @param {number | null} top where a refusal's stamp lands: where its button was clicked (landingOf); Enter lands it
   *   in the card's middle
   * @param {Context} cx
   */
  const submitTyped = (top, cx) => {
    const card = current();
    if (card === undefined || card.id !== typing || !clickCounts(card)) return;
    if (FIELD[card.kind].refusal) {
      send(card, denyAnswer(typed.value()), top, cx);
      return;
    }
    others[card.id] = {
      ...others[card.id],
      [openQuestion(card)]: typed.value(),
    };
    stopTyping(cx);
  };
  typed.on("submit", (_event, cx) => submitTyped(null, cx));

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const all = allCards();
    const counts = countsOf(all);
    const cards = listed();
    const card = current();
    const now = Date.now();
    // A button that approves lights up once its card is armed (inbox.js armed): until then a click on it does nothing.
    const armedNow = (/** @type {InboxCard} */ each) =>
      armed(opened, each.id, now);
    const terminals = readTerminals();
    const forges = groupForges(spaces(), readSpacesGit());
    const gnomes = readGnomes();
    const shownPanes = panes();

    /**
     * @param {KeyButtonKind} kind
     * @param {string} label
     * @param {string} id
     * @param {(cx: Context) => void} action
     */
    const button = (kind, label, id, action) =>
      control(keyButton(kind, label), id, action);

    /**
     * A button that answers its card, like a control (kit/control.js) but for its press, which goes on to the card and
     * the list: they note where they are drawn then, so the stamp lands over what shows of the card (landingOf).
     * Nothing above them acts on a press; the click stops here, as a control's does.
     * @param {KeyButtonKind} kind
     * @param {string} label
     * @param {string} id
     * @param {(cx: Context) => void} action
     */
    const answerButton = (kind, label, id, action) =>
      keyButton(kind, label)
        .id(id)
        .cursor_pointer()
        .on_click((_event, cx) => {
          cx.stop_propagation();
          action(cx);
        });

    /** @param {InboxCard} each */
    const discussButton = (each) =>
      button(
        KEY_BUTTON.secondary,
        "Discuss",
        `inbox-discuss-${each.id}`,
        (cx) => discuss(each, cx),
      );

    /** @param {InboxFilter} each */
    const filterTab = (each) =>
      control(
        h_flex()
          .flex_none()
          .items_center()
          .h(24)
          .px(8)
          .border(2)
          .border_color(each === filter ? k.fg : k.line)
          .bg(each === filter ? k.bg2 : NONE)
          .child(
            text(
              `${FILTER_LABEL[each]} ${counts[each]}`,
              "display",
              9,
              each === filter ? k.fg : k.muted,
            ),
          ),
        `inbox-filter-${each}`,
        (cx) => {
          filter = each;
          pin();
          cx.notify();
        },
      );

    const header = v_flex()
      .flex_none()
      .gap(12)
      .px(16)
      .pt(14)
      .pb(12)
      .border_b(2)
      .border_color(k.line)
      .child(
        h_flex()
          .items_center()
          .gap(10)
          .child(icon(ICON.inbox, k.needs, 2))
          .child(text("INBOX", "display", 16, k.fg))
          .child(
            fill(
              all.length === 0
                ? "nothing waits on your mark"
                : `${all.length} waiting on your mark`,
              "ui",
              14,
              all.length === 0 ? k.muted : k.needs,
            ),
          )
          .child(
            control(iconButton(ICON.close, k.muted), "inbox-close", () =>
              toggleInbox(),
            ),
          ),
      )
      .child(h_flex().flex_wrap().gap(6).children(FILTER_ORDER.map(filterTab)));

    /** The text field under a card, while one is typed: what it is for, its words and its buttons. @param {InboxCard} each */
    const field = (each) => {
      const purpose = FIELD[each.kind];
      return v_flex()
        .gap(8)
        .child(
          text(
            purpose.label,
            "display",
            8,
            purpose.refusal ? k.failed : k.muted,
          ),
        )
        .child(
          Input.new(typed)
            .h(32)
            .px(10)
            .border(2)
            .border_color(purpose.refusal ? k.failed : k.accent)
            .bg(k.bg0)
            .text_size(13)
            .text_color(k.fg),
        )
        .child(
          h_flex()
            .gap(8)
            .child(
              answerButton(
                purpose.refusal ? KEY_BUTTON.warn : KEY_BUTTON.primary,
                purpose.send,
                `inbox-field-send-${each.id}`,
                (cx) => submitTyped(landingOf(each), cx),
              ),
            )
            .child(
              button(
                KEY_BUTTON.ghost,
                "Cancel",
                `inbox-field-cancel-${each.id}`,
                stopTyping,
              ),
            ),
        );
    };

    /**
     * A card's text field as it was when the card was answered from it, still, under the stamp: the same size as the
     * field, so the card does not change under it.
     * @param {InboxCard} each
     * @param {string} words
     */
    const stillField = (each, words) => {
      const purpose = FIELD[each.kind];
      return v_flex()
        .gap(8)
        .child(
          text(
            purpose.label,
            "display",
            8,
            purpose.refusal ? k.failed : k.muted,
          ),
        )
        .child(
          h_flex()
            .h(32)
            .px(10)
            .items_center()
            .border(2)
            .border_color(purpose.refusal ? k.failed : k.accent)
            .bg(k.bg0)
            .child(fill(words, "ui", 13, k.fg)),
        )
        .child(
          h_flex()
            .gap(8)
            .child(
              keyButton(
                purpose.refusal ? KEY_BUTTON.warn : KEY_BUTTON.primary,
                purpose.send,
              ),
            )
            .child(keyButton(KEY_BUTTON.ghost, "Cancel")),
        );
    };

    /**
     * A card's buttons, or its text field while one is typed. What approves or answers shows only on a card listed
     * whole; a refusal and Discuss always do.
     * @param {InboxCard} each
     * @param {NativeElement[]} approving
     * @param {NativeElement[]} refusing
     */
    const actions = (each, approving, refusing) => {
      const words = marks.get(each.id)?.words ?? null;
      if (typing === each.id) return field(each);
      if (words !== null) return stillField(each, words);
      return v_flex()
        .gap(8)
        .when(!approvable(each), (el) =>
          el.child(
            wrapped(
              refusing.length > 0
                ? "Too long to show whole here: deny it, or see it in its pane with Discuss."
                : "Too long to show whole here: answer it in its pane, with Discuss.",
              "ui",
              12,
              k.needs,
            ),
          ),
        )
        .child(
          h_flex()
            .gap(8)
            .children(approvable(each) ? approving : [])
            .children(refusing)
            .child(div().flex_1())
            .child(discussButton(each)),
        );
    };

    /** A permission's body: what it runs, where, and why. @param {InboxCard} each */
    const permissionBody = (each) => {
      const summary = summaryOf(each.request);
      return v_flex()
        .gap(10)
        .child(
          // Every field the allow applies, whole: the card grows with it, so its buttons always come after its last line.
          v_flex()
            .id(`inbox-input-${each.id}`)
            .gap(8)
            .p(12)
            .bg(k.bg0)
            .border(2)
            .border_color(k.line)
            .child(wrapped(summary.lead, "mono", 14, k.fg))
            .when(summary.detail !== "", (el) =>
              el.child(wrapped(summary.detail, "mono", 11, k.muted)),
            ),
        )
        .when(summary.note !== "", (el) =>
          el.child(wrapped(summary.note, "ui", 13, k.fg)),
        )
        .child(
          actions(
            each,
            [
              answerButton(
                KEY_BUTTON.primary,
                "Allow once",
                `inbox-allow-${each.id}`,
                (cx) => approve(each, cx),
              ).opacity(armedNow(each) ? 1 : 0.5),
            ],
            [
              button(
                KEY_BUTTON.secondary,
                "Deny with reason",
                `inbox-deny-${each.id}`,
                (cx) => startTyping(each, cx),
              ),
            ],
          ),
        );
    };

    /** A question's or a gate's body: each question with its options, and an answer of one's own. @param {InboxCard} each */
    const questionBody = (each) => {
      const questions = questionsOf(each.request);
      const ready = answersFor(each) !== null;
      const gate = each.kind === INBOX_KIND.gate;
      return v_flex()
        .gap(12)
        .children(
          questions.map((question, at) => {
            const picked = picks[each.id]?.[at] ?? [];
            const own = others[each.id]?.[at] ?? "";
            const preview = question.options.find(
              (option) =>
                picked.includes(option.label) && (option.preview ?? "") !== "",
            )?.preview;
            return v_flex()
              .gap(6)
              .child(wrapped(visible(question.question), "ui", 14, k.fg))
              .children(
                question.options.map((option, index) =>
                  control(
                    h_flex()
                      .items_start()
                      .gap(10)
                      .p(8)
                      .border(2)
                      .border_color(
                        picked.includes(option.label) ? k.needs : k.line,
                      )
                      .bg(picked.includes(option.label) ? k.bg2 : NONE)
                      .child(
                        v_flex()
                          .flex_1()
                          .min_w(0)
                          .gap(2)
                          .child(
                            wrapped(visible(option.label), "mono", 13, k.fg),
                          )
                          .when((option.description ?? "") !== "", (el) =>
                            el.child(
                              wrapped(
                                visible(option.description ?? ""),
                                "ui",
                                11,
                                k.muted,
                              ),
                            ),
                          ),
                      ),
                    `inbox-option-${each.id}-${at}-${index}`,
                    (cx) => pick(each, at, index, cx),
                  ),
                ),
              )
              .when(preview !== undefined, (el) =>
                el.child(
                  div()
                    .p(10)
                    .bg(k.bg0)
                    .border(2)
                    .border_color(k.line)
                    .child(wrapped(visible(preview ?? ""), "mono", 12, k.fg)),
                ),
              )
              .when(own !== "", (el) =>
                el.child(wrapped(`Your own answer: ${own}`, "ui", 12, k.needs)),
              );
          }),
        )
        .child(
          actions(
            each,
            [
              answerButton(
                gate ? KEY_BUTTON.stamp : KEY_BUTTON.primary,
                gate ? "Stamp" : "Answer",
                `inbox-answer-${each.id}`,
                (cx) => approve(each, cx),
              ).opacity(ready && armedNow(each) ? 1 : 0.5),
              button(
                KEY_BUTTON.secondary,
                "Other…",
                `inbox-other-${each.id}`,
                (cx) => startTyping(each, cx),
              ),
            ],
            [],
          ),
        );
    };

    /** A plan's body: the plan as plain text, the mode after it and its buttons. @param {InboxCard} each */
    const planBody = (each) => {
      const mode = modes[each.id] ?? PLAN_MODE.auto;
      /** @param {PlanMode} option @param {string} label */
      const modeChoice = (option, label) =>
        control(
          choice(label, mode === option),
          `inbox-mode-${each.id}-${option}`,
          (cx) => {
            modes[each.id] = option;
            cx.notify();
          },
        );
      return v_flex()
        .gap(10)
        .child(
          div()
            .id(`inbox-plan-${each.id}`)
            .p(12)
            .bg(k.bg0)
            .border(2)
            .border_color(k.line)
            // Plain text: an agent's markdown never fetches, links or runs anything here.
            .child(wrapped(summaryOf(each.request).detail, "mono", 12, k.fg)),
        )
        .child(
          h_flex()
            .items_center()
            .gap(10)
            .child(text("THEN", "display", 8, k.muted))
            .child(
              choices([
                modeChoice(PLAN_MODE.auto, "auto mode"),
                modeChoice(PLAN_MODE.manual, "approve edits"),
              ]),
            ),
        )
        .child(
          actions(
            each,
            [
              answerButton(
                KEY_BUTTON.primary,
                "Approve plan",
                `inbox-approve-${each.id}`,
                (cx) => approve(each, cx),
              ).opacity(armedNow(each) ? 1 : 0.5),
            ],
            [
              button(
                KEY_BUTTON.secondary,
                "Revise",
                `inbox-revise-${each.id}`,
                (cx) => startTyping(each, cx),
              ),
            ],
          ),
        );
    };

    /** @param {InboxCard} each */
    const waitingBody = (each) =>
      v_flex()
        .gap(10)
        .child(
          wrapped(
            "It waits in its pane, where only its own dialog answers it.",
            "ui",
            13,
            k.muted,
          ),
        )
        .child(
          h_flex().child(
            button(
              KEY_BUTTON.primary,
              "Go to its pane",
              `inbox-go-${each.id}`,
              (cx) => discuss(each, cx),
            ),
          ),
        );

    // A review session's picks and comment gate are answered in its view, where the findings and the drafts are: the
    // card takes the human there.
    /** @param {InboxCard} each */
    const reviewBody = (each) =>
      v_flex()
        .gap(10)
        .child(
          wrapped(
            "Its review view answers this, where the findings and the drafts are.",
            "ui",
            13,
            k.muted,
          ),
        )
        .child(
          h_flex().child(
            button(
              KEY_BUTTON.primary,
              "Open the review",
              `inbox-review-${each.id}`,
              (cx) => openReview(each, cx),
            ),
          ),
        );

    /** @type {Readonly<Record<InboxKind, (each: InboxCard) => NativeElement>>} */
    const BODY = {
      gate: questionBody,
      permission: permissionBody,
      plan: planBody,
      question: questionBody,
      waiting: waitingBody,
    };

    /**
     * Where a card comes from: its forge's gnome and name, then the branch and the session; and a time.
     * @param {InboxCard} each
     * @param {string} time
     */
    const originRow = (each, time) => {
      const { forge, path } = originOf(
        each.terminal,
        forges,
        shownPanes,
        terminals,
      );
      const key = forge === null ? "" : lookKeyOf(forge);
      return h_flex()
        .items_center()
        .gap(8)
        .when(forge !== null, (el) =>
          el.child(gnome({ ...gnomeLookOf(key, gnomes[key]), scale: 1 })),
        )
        .child(fill(path.join(" › "), "ui", 12, k.muted))
        .child(text(time, "mono", 12, k.muted));
    };

    /**
     * A card's frame: its kind, what it asks or (open) its body, where it comes from and a time.
     * @param {InboxCard} each
     * @param {boolean} open
     * @param {string} time how long it has waited, or when it was answered
     */
    const frameOf = (each, open, time) => {
      const lead =
        each.request === null
          ? (terminals.find((terminal) => terminal.address === each.terminal)
              ?.title ?? each.terminal)
          : summaryOf(each.request).lead;
      return v_flex()
        .gap(10)
        .p(14)
        .border(2)
        .border_color(open ? k.needs : k.line)
        .bg(open ? k.bg1 : NONE)
        .child(
          h_flex()
            .items_center()
            .gap(8)
            .child(icon(KIND_ICON[each.kind], k.needs))
            .child(fill(headingOf(each), "display", 10, k.needs))
            .when(discussing.has(each.id), (el) =>
              el.child(
                div()
                  .px(6)
                  .border(1)
                  .border_color(k.working)
                  .child(text("DISCUSSING", "display", 8, k.working)),
              ),
            ),
        )
        .when(!open || each.kind === INBOX_KIND.waiting, (el) =>
          // A command or a path reads in the mono face, as it is typed; a question in words.
          el.child(
            wrapped(
              lead,
              each.kind === INBOX_KIND.permission ? "mono" : "ui",
              14,
              k.fg,
            ),
          ),
        )
        .child(originRow(each, time))
        .when(open, (el) =>
          el.child(
            each.request !== null && reviewAskOf(each.request, readTerminals())
              ? reviewBody(each)
              : BODY[each.kind](each),
          ),
        );
    };

    /**
     * A card answered, under its stamp: the card as it was, the same size, its time now when it was answered, and the
     * gnomemark coming down over what showed of it when it was clicked (else over its middle), the card trembling under
     * the blow and going to the background, its colours veiled so the stamp stands out; then both slide off to the
     * right. Nothing under the stamp takes a click.
     * @param {InboxCard} each
     * @param {Marked} marked
     */
    const markedCard = (each, marked) => {
      const raised = marked.phase === STAMP_PHASE.raised;
      const size = STAMP.scale * (raised ? STAMP.raised : 1);
      const gone =
        marked.phase === STAMP_PHASE.leaving ||
        marked.phase === STAMP_PHASE.closing;
      return div()
        .id(`inbox-marked-${each.id}`)
        .relative()
        .left(gone ? STAMP.slide : 0)
        .transition("left", { duration: STAMP.leave, easing: "ease-in" })
        .when(marked.phase === STAMP_PHASE.shaking, (el) =>
          el.loop("left", STAMP.shake),
        )
        .child(frameOf(each, true, markedAt(marked.at)))
        .child(
          div()
            .id(`inbox-veil-${each.id}`)
            .absolute()
            .top(0)
            .left(0)
            .size_full()
            .bg(withAlpha(k.bg1, STAMP.veiled))
            .opacity(raised ? 0 : 1)
            .transition("opacity", STAMP.veil),
        )
        .child(
          v_flex()
            .id(`inbox-stamp-over-${each.id}`)
            .absolute()
            .top(0)
            .left(0)
            .size_full()
            // As far down the card as it lands (landingOf), else in its middle.
            .pt(marked.top ?? 0)
            .when(marked.top === null, (el) => el.justify_center())
            .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
            .on_click((_event, cx) => cx.stop_propagation())
            .child(
              // A band the landed stamp's height: the raised one, bigger, grows around its middle and lands into it.
              h_flex()
                .flex_none()
                .w_full()
                .h(STAMP_HEIGHT)
                .items_center()
                .justify_center()
                .child(
                  div()
                    .id(`inbox-stamp-${each.id}`)
                    .flex_none()
                    .relative()
                    .w(STAMP_ART.width * size)
                    .h(STAMP_ART.height * size)
                    .spring("width", STAMP.spring)
                    .spring("height", STAMP.spring)
                    .opacity(raised ? 0 : 1)
                    .transition("opacity", STAMP.land)
                    .children(
                      stampLayers(
                        marked.mark === MARK.yes ? k.done : k.failed,
                        withAlpha(k.bg0, STAMP.body),
                      ).map((layer) =>
                        layer.absolute().top(0).left(0).size_full(),
                      ),
                    ),
                ),
            ),
        );
    };

    /**
     * A card's slot in the list: the card and the room below it, its height noted as it is drawn. A stamped card's slot
     * keeps that height while the card slides off, then closes, so the cards below rise smoothly into its place.
     * @param {InboxCard} each
     */
    const slotOf = (each) => {
      const marked = marks.get(each.id);
      const height = heights.get(each.id);
      const closing =
        marked?.phase === STAMP_PHASE.leaving ||
        marked?.phase === STAMP_PHASE.closing;
      return div()
        .id(`inbox-slot-${each.id}`)
        .flex_none()
        .pb(CARD_GAP)
        .on_size_change((size) => {
          if (marked === undefined) heights.set(each.id, size.height);
        })
        .when(closing && height !== undefined, (el) =>
          el
            .overflow_hidden()
            .h(marked?.phase === STAMP_PHASE.closing ? 0 : (height ?? 0))
            .transition("height", {
              duration: STAMP.close,
              easing: "ease-out",
            }),
        )
        .child(marked === undefined ? cardOf(each) : markedCard(each, marked));
    };

    /** @param {InboxCard} each */
    const cardOf = (each) => {
      const open = each.id === card?.id;
      const frame = frameOf(each, open, waitedFor(each.since, now));
      // An open card's controls take their own clicks, and it notes where it is drawn at each press on it, an answer's
      // included (answerButton); a closed one opens on a click anywhere.
      return open
        ? frame.id(`inbox-card-${each.id}`).on_mouse_down("left", (event) => {
            pressed = { card: boxOf(event), id: each.id };
          })
        : control(frame, `inbox-card-${each.id}`, (cx) => {
            selected = each.id;
            pin();
            typing = "";
            cx.notify();
          });
    };

    const body =
      cards.length === 0
        ? div()
            .flex_1()
            .p(16)
            .child(
              emptyState({
                caption: "empty inbox",
                sub: "Your gnome will knock when a golem needs you.",
                title: "Nothing waits on your mark.",
              }),
            )
        : // The list scrolls inside a frame that does not: a scrolling element's bounds move with its scroll, so what
          // shows of the cards is the frame's box, noted at a press on one after the card's own (landingOf).
          v_flex()
            .id("inbox-cards-shown")
            .flex_1()
            .min_h(0)
            .on_mouse_down("left", (event) => {
              listBox = boxOf(event);
            })
            .child(
              v_flex()
                .id("inbox-cards")
                .size_full()
                .overflow_y_scroll()
                .p(14)
                .children(cards.map(slotOf)),
            );

    const foot = v_flex()
      .flex_none()
      .gap(8)
      .px(16)
      .py(12)
      .border_t(2)
      .border_color(k.line)
      .when(failed.text !== "", (el) =>
        el.child(wrapped(failed.text, "ui", 12, k.failed)),
      )
      .child(
        h_flex()
          .items_start()
          .gap(8)
          .child(icon(ICON.lock, k.muted))
          .child(wrapped(FOOT, "ui", 12, k.muted)),
      );

    return v_flex()
      .id("inbox")
      .size_full()
      .bg(k.chrome)
      .border_l(2)
      .border_color(k.line)
      .child(header)
      .child(body)
      .child(foot);
  };

  return {
    close: () => {
      typed.release();
      following?.cancel();
      clock?.cancel();
    },
    render,
  };
};
