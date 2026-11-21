// The forge floor's pieces (design 13): a forge's header in the accordion, an item's card with its strip of cells and
// its build tasks, and a session that reports no flow. They take what floor.js works out and draw it; the actions are
// the role's (roles/floor.js).
import { h_flex, v_flex } from "gpui-base";
import { cellLabel, FLOW_MODE, STRIP_STATE, TASK_CELL } from "../floor.js";
import { tag } from "./chips.js";
import { gnome, ICON, icon } from "./sprites.js";
import { text } from "./text.js";
import { BRAND, TONE, tokens, toneColour } from "./tokens.js";

/** @typedef {import("gpui-kit").Color} Color */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../floor.js").CardStatus} CardStatus */
/** @typedef {import("../floor.js").FloorCounts} FloorCounts */
/** @typedef {import("../floor.js").FlowMode} FlowMode */
/** @typedef {import("../floor.js").FlowType} FlowType */
/** @typedef {import("../floor.js").StripCell} StripCell */
/** @typedef {import("../floor.js").StripState} StripState */
/** @typedef {import("../floor.js").TaskCell} TaskCell */
/** @typedef {import("../floor.js").Progress} Progress */
/** @typedef {import("../floor.js").TaskRow} TaskRow */
/** @typedef {import("../floor.js").Untracked} Untracked */
/** @typedef {import("./sprites.js").GnomeLook} GnomeLook */
/** @typedef {import("./tokens.js").Tone} Tone */

/**
 * @typedef {object} ForgeHeaderProps
 * @property {GnomeLook} look
 * @property {string} forge its name, as its tab bears it
 * @property {string} brother its gnome's name
 * @property {FloorCounts} counts
 * @property {boolean} open its cards show
 */

/** @type {Readonly<Record<CardStatus, Tone>>} */
export const STATUS_TONE = Object.freeze({
  cracked: TONE.failed,
  done: TONE.done,
  ended: TONE.quiet,
  forging: TONE.working,
  waiting: TONE.needs,
});

// The counts in the order the floor's bar and each forge's header say them, with their tones.
/** @typedef {{ count: keyof FloorCounts, tone: Tone }} CountTone */
/** @type {readonly CountTone[]} */
const COUNTS = Object.freeze([
  { count: "waiting", tone: TONE.needs },
  { count: "forging", tone: TONE.working },
  { count: "cracked", tone: TONE.failed },
  { count: "done", tone: TONE.done },
]);

/** @type {Readonly<Record<StripState, () => Color>>} */
const CELL_COLOUR = Object.freeze({
  done: () => BRAND.forgeGold,
  failed: () => tokens().failed,
  pending: () => tokens().line,
  running: () => tokens().working,
  skipped: () => tokens().muted,
  waiting: () => tokens().needs,
});

/** @type {Readonly<Record<TaskCell, () => Color>>} */
const MARK_COLOUR = Object.freeze({
  green: () => tokens().ok,
  pending: () => tokens().bg2,
  red: () => tokens().failed,
  reviewed: () => BRAND.forgeGold,
});

// What a cell's label opens with: ✓ for a step done, ✕ for one that will not run.
/** @type {Readonly<Partial<Record<StripState, string>>>} */
const MARK = Object.freeze({ done: "✓ ", skipped: "✕ " });

// The states a cell is at work in, underlined.
/** @type {readonly StripState[]} */
const AT_WORK = Object.freeze([STRIP_STATE.running, STRIP_STATE.waiting]);

/**
 * The counts that are not zero, each in its tone: 2 WAITING · 1 FORGING.
 * @param {FloorCounts} counts
 * @param {number} size
 */
export const countsLine = (counts, size) =>
  h_flex()
    .flex_none()
    .items_center()
    .gap(14)
    .children(
      COUNTS.filter(({ count }) => counts[count] > 0).map(({ count, tone }) =>
        text(
          `${counts[count]} ${count.toUpperCase()}`,
          "display",
          size,
          toneColour(tone),
        ),
      ),
    );

/**
 * The top of a forge's section in the floor's accordion: its gnome, its name and its brother's, as the sidebar says
 * them, its counts and the chevron that folds it; a line under it while its cards show.
 * @param {ForgeHeaderProps} props
 */
export const forgeHeader = ({ look, forge, brother, counts, open }) => {
  const k = tokens();
  return h_flex()
    .items_center()
    .gap(12)
    .px(14)
    .py(10)
    .bg(k.bg2)
    .when(open, (el) => el.border_b(2).border_color(k.line))
    .child(gnome({ ...look, scale: 2 }))
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .gap(2)
        .child(text(`FORGE · ${forge.toUpperCase()}`, "display", 9, k.muted))
        .child(text(brother, "ui", 15, k.fg)),
    )
    .child(countsLine(counts, 9))
    .child(icon(open ? ICON.chevronDown : ICON.chevronRight, k.muted));
};

/**
 * A forge's section of the floor: one frame for its header and, while it is open, its cards inside it.
 * @param {NativeElement} header
 * @param {NativeElement[]} body
 * @param {boolean} open
 */
export const forgeSection = (header, body, open) => {
  const k = tokens();
  return v_flex()
    .flex_none()
    .bg(k.bg0)
    .border(2)
    .border_color(k.line)
    .child(header)
    .when(open && body.length > 0, (el) =>
      el.child(v_flex().gap(10).p(12).children(body)),
    );
};

/**
 * One cell of an item's strip: done ✓ in gold, running in the working colour, at its gate in the needs one, broken in
 * the failed one, still to come in grey, and ✕ for a step that will not run (skipped, or never launched once the flow
 * is over); ×N when it ran more than once.
 * @param {StripCell} cell
 */
export const stageCell = ({ cell, state, runs }) => {
  const k = tokens();
  const colour = CELL_COLOUR[state]();
  const mark = MARK[state] ?? "";
  const count = runs > 1 ? ` ×${runs}` : "";
  return h_flex()
    .flex_1()
    .min_w(0)
    .justify_center()
    .py(6)
    .border(2)
    .border_color(colour)
    .when(AT_WORK.includes(state), (el) => el.border_b(4))
    .child(
      text(
        `${mark}${cellLabel(cell)}${count}`,
        "display",
        9,
        state === STRIP_STATE.pending ? k.muted : colour,
      ),
    );
};

// A step's square as its state colours it, like its cell in the strip: done in green, at work, at its gate or broken
// in their colours, still to come in grey, and ✕ for one that will not run.
/** @type {Readonly<Record<StripState, () => Color>>} */
const STEP_FILL = Object.freeze({
  done: () => tokens().ok,
  failed: () => tokens().failed,
  pending: () => tokens().bg2,
  running: () => tokens().working,
  skipped: () => tokens().bg2,
  waiting: () => tokens().needs,
});

// The squares that are only an outline: nothing in them yet, or nothing to come.
/** @type {readonly StripState[]} */
const HOLLOW = Object.freeze([STRIP_STATE.pending, STRIP_STATE.skipped]);

/**
 * One numbered square of a row: filled in its colour, or an outline with its number in grey.
 * @param {string} label
 * @param {Color} fill
 * @param {boolean} hollow
 */
const square = (label, fill, hollow) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .w(22)
    .h(20)
    .items_center()
    .justify_center()
    .bg(fill)
    .border(1)
    .border_color(hollow ? k.line : fill)
    .child(text(label, "display", 8, hollow ? k.muted : BRAND.ink));
};

/**
 * While the build runs, its tasks: TASK n OF m, a numbered square each in its mark, and the test the red one is on.
 * @param {TaskRow} tasks
 * @returns {NativeElement[]}
 */
const buildTasks = ({ at, of, marks, red, name }) => {
  const k = tokens();
  return [
    h_flex().flex_none().w(1).h(16).bg(k.line),
    text(`BUILD · TASK ${at} OF ${of}`, "display", 9, k.fg),
    h_flex()
      .flex_none()
      .gap(4)
      .children(
        marks.map((mark, index) =>
          square(
            String(index + 1),
            MARK_COLOUR[mark](),
            mark === TASK_CELL.pending,
          ),
        ),
      ),
    ...(red && name !== undefined
      ? [text(`red · ${name}`, "mono", 12, k.failed)]
      : []),
  ];
};

/**
 * Where an item stands: its steps done of its pipeline's, a square each in its state, and, while the build runs, its
 * tasks.
 * @param {Progress} progress
 * @param {TaskRow | null} tasks
 */
export const progressRow = ({ done, of, steps }, tasks) => {
  const k = tokens();
  return h_flex()
    .items_center()
    .gap(12)
    .px(14)
    .py(10)
    .bg(k.bg0)
    .border(1)
    .border_color(k.line)
    .child(text(`${done} OF ${of} DONE`, "display", 9, k.fg))
    .child(
      h_flex()
        .flex_none()
        .gap(4)
        .children(
          steps.map((state, index) =>
            square(
              state === STRIP_STATE.skipped ? "✕" : String(index + 1),
              STEP_FILL[state](),
              HOLLOW.includes(state),
            ),
          ),
        ),
    )
    .children(tasks?.building ? buildTasks(tasks) : []);
};

/**
 * A card's tags: its type and its mode, AUTO in the accent.
 * @param {FlowType | ""} type none until its brief names it
 * @param {FlowMode} mode
 */
export const flowTags = (type, mode) =>
  h_flex()
    .flex_none()
    .gap(6)
    .when(type !== "", (el) => el.child(tag(type.toUpperCase())))
    .child(
      tag(
        mode.toUpperCase(),
        mode === FLOW_MODE.auto ? tokens().accent : undefined,
      ),
    );

/**
 * The frame of an item's card, its lines one under the other.
 * @param {NativeElement[]} lines
 */
export const cardFrame = (lines) => {
  const k = tokens();
  return v_flex()
    .gap(10)
    .p(14)
    .bg(k.bg1)
    .border(2)
    .border_color(k.line)
    .children(lines);
};

/**
 * A session that reports no flow: its name and space, UNTRACKED, and what its golem does.
 * @param {Pick<Untracked, "title" | "space" | "status">} session
 */
export const untrackedRow = ({ title, space, status }) => {
  const k = tokens();
  return h_flex()
    .items_center()
    .gap(12)
    .px(14)
    .py(10)
    .bg(k.bg1)
    .border(2)
    .border_color(k.line)
    .child(
      text(space === "" ? title : `${title} · ${space}`, "ui", 14, k.muted),
    )
    .child(tag("UNTRACKED"))
    .child(text(`no flow reports · golem ${status}`, "ui", 12, k.muted));
};
