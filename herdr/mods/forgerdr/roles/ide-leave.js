// Remove worktree goes through here: when the live ttt open on the worktree holds unsaved files, or its state cannot be
// read (removalNeedsAsk), a dialog asks first, since the removal stops that ttt. Save orders it to save them all and
// waits for its answer (the order's id in its state): a file still listed is one ttt asks about, which the human answers
// in the IDE, shown in the worktree's space, and nothing else happens. Discard stops that ttt, losing them. Cancel leaves
// everything as it was. What follows a Save or a Discard, the Remove worktree dialog, travels in the dialog's props as
// plain data, run by a lookup table. A change of checkout never comes here: each checkout's ttt lives on, unsaved files
// and all.
import { h_flex, v_flex } from "gpui-base";
import {
  closeOverlay,
  home,
  notify,
  openOverlay,
  props,
  run,
  spaces,
} from "herdr";
import { readSpacesGit } from "../bridges/git.js";
import {
  ideStateFolder,
  keepPick,
  orderSave,
  readIdeUnsaved,
  readPicks,
  stopIde,
  waitSaved,
} from "../bridges/ide.js";
import { showPanel } from "../bridges/layout.js";
import { placeOf } from "../bridges/places.js";
import { readTerminals } from "../bridges/terminals.js";
import {
  afterActions,
  IDE_AFTER,
  ideOn,
  inCheckout,
  liveIdes,
  parseIdeAfter,
  removalNeedsAsk,
} from "../ide.js";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { ICON, icon } from "../kit/sprites.js";
import { fill, text, wrapped } from "../kit/text.js";
import { tokens } from "../kit/tokens.js";
import { MOD } from "../name.js";
import { folderLabel, SIDE_PANEL } from "../sessions.js";
import { openRemoveWorktree } from "./remove-worktree.js";

/** @typedef {import("herdr").SpaceInfo} SpaceInfo */
/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("../ide.js").IdeAfter} IdeAfter */
/** @typedef {import("../ide.js").IdeAfterFields} IdeAfterFields */
/** @typedef {import("../ide.js").IdeAfterKind} IdeAfterKind */
/** @typedef {import("../ide.js").SaveAnswerFields} SaveAnswerFields */
/** @typedef {import("../ide.js").SaveKind} SaveKind */
/** @typedef {import("./role.js").Role} Role */

/**
 * What the dialog asks about: the worktree's checkout, its ttt by name, the files it holds unsaved, the worktree's space,
 * and what follows.
 * @typedef {object} IdeLeaveTarget
 * @property {string} checkout its folder
 * @property {string} name its ttt's
 * @property {string[] | null} unsaved by their paths; null when its state cannot be read
 * @property {string} space the worktree's, where the IDE shows that ttt for a file ttt asks about to be answered there
 * @property {IdeAfter} after
 */

/** @type {() => (Partial<Omit<IdeLeaveTarget, "after">> & { after?: unknown, overlay?: string }) | null} */
const readProps = props;

// Modal: a click beside it never closes it, above all while it saves or discards.
const DIALOG = Object.freeze({
  height: 360,
  kind: "dialog",
  modal: true,
  width: 560,
});

// How many unsaved files the dialog names before it counts the rest.
const SHOWN = 8;

// What the dialog is doing: nothing yet, saving, or stopping the ttt.
const BUSY = Object.freeze({
  discarding: "discarding",
  idle: "idle",
  saving: "saving",
});

/** @typedef {typeof BUSY[keyof typeof BUSY]} Busy */

/** @type {Readonly<Record<Busy, string>>} */
const BUSY_LABEL = Object.freeze({
  discarding: "Closing ttt…",
  idle: "",
  saving: "Saving…",
});

const AFTER = afterActions({ openRemoval: openRemoveWorktree });

/**
 * @template {IdeAfterKind} K
 * @param {{ kind: K } & IdeAfterFields[K]} after
 */
const runAfter = (after) => AFTER[after.kind](after);

/**
 * Opens the dialog that asks what becomes of a ttt's unsaved files.
 * @param {IdeLeaveTarget} target
 */
const openIdeLeave = (target) =>
  openOverlay({
    ...DIALOG,
    mod: MOD,
    props: { ...target, role: "ide-leave" },
  });

/**
 * Opens the Remove worktree dialog on the worktree a space of this machine shows, first asking about the files the live
 * ttt open on it holds unsaved, shown in the IDE or not, or about it when its state cannot be read.
 * @param {SpaceInfo} space
 * @param {string} forge its forge's name
 */
export const removeWorktreeAsking = (space, forge) => {
  const top = readSpacesGit()[space.id]?.top ?? null;
  const on =
    top === null
      ? null
      : ideOn(liveIdes(readTerminals()), readIdeUnsaved(), top);
  /** @type {IdeAfter} */
  const after = { dir: placeOf(space), forge, kind: IDE_AFTER.remove };
  if (top !== null && on !== null && removalNeedsAsk(on))
    openIdeLeave({
      after,
      checkout: top,
      name: on.name,
      space: space.id,
      unsaved: on.unsaved,
    });
  else runAfter(after);
};

/** @param {unknown} error */
const reasonOf = (error) =>
  Error.isError(error) ? error.message : String(error);

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const ideLeave = (cx) => {
  const given = readProps() ?? {};
  const after = parseIdeAfter(given.after);
  const checkout = given.checkout ?? "";
  const name = given.name ?? "";
  const space = given.space ?? "";
  // null: its state cannot be read, so what it holds is unknown and only Discard or Cancel answer.
  const unsaved = given.unsaved ?? null;
  const close = () => closeOverlay(given.overlay ?? "");
  const handle = cx.focus_handle();
  handle.focus();
  /** @type {Busy} */
  let busy = BUSY.idle;
  let failed = "";

  if (after === null)
    console.error(
      "forgerdr: the IDE's unsaved-files dialog was given nothing that reads to follow",
      given.after,
    );

  /** Runs what follows, and closes the dialog. */
  const goOn = () => {
    if (after !== null) runAfter(after);
    close();
  };

  /**
   * Shows the ttt that asks about a file in the IDE, in the worktree's space, picked there when a pick of that space
   * shows another checkout, and says so: nothing follows.
   * @param {string} asked the file
   */
  const answerInIde = (asked) => {
    const shown = spaces().find((one) => one.id === space);
    if (shown !== undefined) {
      if (!shown.active) run("space.select", { id: space });
      const picked = readPicks()[space];
      if (picked !== undefined && picked !== checkout)
        keepPick(space, checkout);
    }
    showPanel(SIDE_PANEL.ide);
    close();
    notify({
      body: "Answer it in the IDE: nothing else was done.",
      level: "warning",
      title: `ttt is asking about ${inCheckout(checkout, asked)}`,
    });
  };

  /** @type {{ readonly [K in SaveKind]: (answer: SaveAnswerFields[K]) => void }} */
  const ANSWERED = Object.freeze({
    asking: ({ file }) => answerInIde(file),
    pending: () => {
      throw new Error(
        "ttt did not answer the order to save: look at it in the IDE",
      );
    },
    saved: () => goOn(),
  });

  /**
   * @template {SaveKind} K
   * @param {{ kind: K } & SaveAnswerFields[K]} answer
   */
  const onAnswer = (answer) => ANSWERED[answer.kind](answer);

  /**
   * Starts one of the dialog's answers, which says why it failed and lets the human answer again.
   * @param {Busy} step
   * @param {(cx: AsyncContext) => Promise<void>} work
   * @param {Context} cx
   */
  const answer = (step, work, cx) => {
    if (busy !== BUSY.idle) return;
    busy = step;
    failed = "";
    cx.spawn(async (task) => {
      try {
        await work(task);
      } catch (error) {
        console.error(`forgerdr: the unsaved files of ${checkout}`, error);
        busy = BUSY.idle;
        failed = reasonOf(error);
        task.notify();
      }
    });
    cx.notify();
  };

  /** @param {Context} cx */
  const save = (cx) =>
    answer(
      BUSY.saving,
      async (task) => {
        const folder = await ideStateFolder();
        const order = await orderSave(checkout);
        onAnswer(await waitSaved(task, folder, name, order));
      },
      cx,
    );

  /** @param {Context} cx */
  const discard = (cx) =>
    answer(
      BUSY.discarding,
      async () => {
        await stopIde(checkout);
        goOn();
      },
      cx,
    );

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const files = unsaved ?? [];
    const more = files.length - SHOWN;
    const one = files.length === 1;
    const words =
      unsaved === null
        ? {
            hint: "Discard closes this checkout's ttt and loses whatever it holds unsaved.",
            lead: "ttt's state cannot be read here, so what it holds unsaved is unknown.",
          }
        : {
            hint: one
              ? "Save writes it before the worktree goes. Discard closes this checkout's ttt and loses it."
              : "Save writes them all before the worktree goes. Discard closes this checkout's ttt and loses them.",
            lead: `ttt holds ${one ? "a file" : `${files.length} files`} unsaved here:`,
          };
    return v_flex()
      .id("ide-leave")
      .track_focus(handle)
      .size_full()
      .bg(k.bg1)
      .border(2)
      .border_color(k.line)
      .on_key_down((event, cx) => {
        if (event.key !== "enter" || unsaved === null) return;
        cx.stop_propagation();
        save(cx);
      })
      .child(
        h_flex()
          .items_center()
          .gap(14)
          .px(20)
          .py(14)
          .border_b(2)
          .border_color(k.line)
          .child(icon(ICON.warn, k.needs, 2))
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(4)
              .child(fill("UNSAVED IN THE IDE", "display", 13, k.fg))
              .child(fill(folderLabel(checkout, home()), "mono", 12, k.muted)),
          ),
      )
      .child(
        v_flex()
          .id("ide-leave-body")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .gap(8)
          .px(20)
          .py(16)
          .child(wrapped(words.lead, "ui", 14, k.fg))
          .children(
            files
              .slice(0, SHOWN)
              .map((path) =>
                fill(inCheckout(checkout, path), "mono", 13, k.fg),
              ),
          )
          .when(more > 0, (el) =>
            el.child(text(`and ${more} more`, "ui", 12, k.muted)),
          )
          .child(wrapped(words.hint, "ui", 12, k.muted))
          // Why the last answer failed, in full: it says what to do next.
          .when(failed !== "", (el) =>
            el.child(wrapped(failed, "ui", 13, k.failed)),
          ),
      )
      .child(
        h_flex()
          .items_center()
          .gap(12)
          .px(20)
          .py(12)
          .border_t(2)
          .border_color(k.line)
          .child(fill(BUSY_LABEL[busy], "ui", 13, k.muted))
          .child(
            control(
              keyButton(KEY_BUTTON.ghost, "Cancel"),
              "ide-leave-cancel",
              // While it works, the dialog stays: closing it would drop what it says.
              () => busy !== BUSY.idle || close(),
            ),
          )
          .child(
            control(
              keyButton(KEY_BUTTON.warn, "Discard"),
              "ide-leave-discard",
              discard,
            ),
          )
          .when(unsaved !== null, (el) =>
            el.child(
              control(
                keyButton(KEY_BUTTON.primary, "Save", { key: "↵" }),
                "ide-leave-save",
                save,
              ),
            ),
          ),
      );
  };

  return {
    close: () => {
      handle.release();
    },
    render,
  };
};
