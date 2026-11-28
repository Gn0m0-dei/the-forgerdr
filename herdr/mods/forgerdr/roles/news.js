// The gnome's update notice (design 10b), over the window: a newer forgerdr is out, told by the gnome of the forge on
// show, with its release notes from GitHub below. Update now applies it (bin/forge-update.sh apply --detach, which goes on
// by itself): the notice follows it from the state file, since the apply replaces this mod as it installs the new look,
// with each piece as it is checked, and says when it is in, with what its pieces went through, or why it stopped. When a
// piece is missing because it needs the person's password, Finish in a tab opens the plugin's install.sh, which asks for
// it. Later, Esc or a click beside it closes it; FORGERDR x.y.z on the status bar opens it again, and so does the
// manual's Check for updates when it finds the release.
import { h_flex, TextView, v_flex } from "gpui-base";
import { checking, closeOverlay, openOverlay, props, spaces } from "herdr";
import { readFolders, readSpacesGit } from "../bridges/git.js";
import { readGnomes } from "../bridges/gnomes.js";
import { readNames } from "../bridges/names.js";
import { applyUpdate, finishInTab, followUpdate } from "../bridges/update.js";
import { groupForges, lookKeyOf } from "../forges.js";
import { gnomeLookOf, nameOf } from "../identity.js";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { gnome } from "../kit/sprites.js";
import { text, wrapped } from "../kit/text.js";
import { BRAND, TONE, tokens, toneColour } from "../kit/tokens.js";
import { MOD } from "../name.js";
import { phaseOf, pieceName, piecesSummary, UPDATE_PHASE } from "../update.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../kit/sprites.js").Mood} Mood */
/** @typedef {import("../kit/tokens.js").Tone} Tone */
/** @typedef {import("../update.js").PiecesSummary} PiecesSummary */
/** @typedef {import("../update.js").UpdatePhase} UpdatePhase */
/** @typedef {import("../update.js").UpdateState} UpdateState */
/** @typedef {import("./role.js").Role} Role */

/** @type {() => { overlay?: string } | null} */
const readProps = props;

/** @type {Readonly<Record<UpdatePhase, Mood>>} */
const MOOD_OF = Object.freeze({
  applied: "done",
  applying: "working",
  available: "needs",
  failed: "error",
  none: "idle",
});

/**
 * What the gnome says in each phase.
 * @type {Readonly<Record<UpdatePhase, (state: UpdateState) => string>>}
 */
const SAYS = Object.freeze({
  applied: ({ installed }) =>
    `forgerdr ${installed} is in the forge. Open new sessions to load its rules and hooks; the open ones keep the old ones until they restart.`,
  applying: ({ latest }) =>
    `Swapping the anvil for forgerdr ${latest}. The forge's look reloads as it goes in.`,
  available: ({ latest }) =>
    `Psst, master. forgerdr ${latest} is forged. Say the word and I'll swap the anvil: the forge's look changes at once, and the sessions you open after take its rules and hooks.`,
  failed: ({ latest, error }) =>
    `The swap to forgerdr ${latest} stopped: ${error ?? "it never finished"}. Nothing after that step changed.`,
  none: ({ installed }) => `forgerdr ${installed} is the newest there is.`,
});

// What the notice says of the pieces the apply's install.sh --update checks.
const PIECES_SAY = Object.freeze({
  /**
   * @param {string} name the piece just checked
   * @param {number} done how many are done
   */
  checked: (name, done) => `${name} checked · ${done} done`,
  failed: "Failed",
  finish: "Finish in a tab",
  installed: "Installed",
  missing: "Missing",
  refreshed: "Refreshed",
  removed: "Removed on purpose",
  updated: "Updated",
});

/**
 * A line of the summary, in the tone of what it tells.
 * @typedef {object} SummaryLine
 * @property {string} line
 * @property {Tone} tone
 */

/**
 * One line naming every piece of a list, none for an empty one.
 * @param {string} label
 * @param {string[]} names
 * @param {Tone} tone
 * @returns {SummaryLine[]}
 */
const listed = (label, names, tone) =>
  names.length > 0 ? [{ line: `${label}: ${names.join(", ")}`, tone }] : [];

/**
 * What the apply's pieces went through: a line a list, and one for each piece left missing or failed, with why.
 * @param {PiecesSummary} summary
 * @returns {SummaryLine[]}
 */
const summaryLines = (summary) => [
  ...listed(PIECES_SAY.updated, summary.updated, TONE.done),
  ...listed(PIECES_SAY.installed, summary.installed, TONE.done),
  ...listed(PIECES_SAY.refreshed, summary.refreshed, TONE.done),
  ...summary.missing.map(({ name, why }) => ({
    line: `${PIECES_SAY.missing}: ${name} — ${why}`,
    tone: TONE.needs,
  })),
  ...summary.failed.map(({ name, why }) => ({
    line: `${PIECES_SAY.failed}: ${name} — ${why}`,
    tone: TONE.failed,
  })),
  ...listed(PIECES_SAY.removed, summary.removed, TONE.quiet),
];

const DIALOG = Object.freeze({ height: 600, kind: "dialog", width: 720 });

export const openNews = () =>
  openOverlay({ ...DIALOG, mod: MOD, props: { role: "news" } });

const close = () => closeOverlay(readProps()?.overlay ?? "");

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const news = (cx) => {
  /** @type {UpdateState | null} */
  let update = null;
  let notes = "";
  // Update now was pressed and the state does not say so yet: the button goes at once, so a second click starts nothing.
  let starting = false;
  const following = checking()
    ? null
    : followUpdate(cx, (read) => {
        update = read.state;
        notes = read.notes;
        if (update?.applying != null || update?.error != null) starting = false;
      });

  /** @param {Context} cx */
  const start = (cx) => {
    starting = true;
    // A failure the state does not tell (the script could not run, or refused) gives the buttons back. Once under way the
    // apply goes on by itself, and the state tells the rest.
    cx.spawn(async (task) => {
      const ok = await applyUpdate().catch((error) => {
        console.error("forgerdr: forge-update.sh apply could not run", error);
        return false;
      });
      starting = starting && ok;
      task.notify();
    });
    cx.notify();
  };

  // The gnome of the forge on show, and its brother's name.
  const teller = () => {
    const forge = groupForges(spaces(), readSpacesGit(), readFolders()).find(
      (one) => one.spaces.some((space) => space.active),
    );
    const key = forge === undefined ? "" : lookKeyOf(forge);
    return {
      look: forge === undefined ? {} : gnomeLookOf(key, readGnomes()[key]),
      name:
        forge === undefined ? "the forge's gnome" : nameOf(key, readNames()),
    };
  };

  // forge: the summary stays as the apply left it after Finish in a tab, until the next release's apply: install.sh does
  // not write the update's state; it would need to for the notice to follow it.
  const finish = () => {
    finishInTab();
    close();
  };

  /**
   * @param {UpdatePhase} phase
   * @param {boolean} password whether a piece is left for the person's password
   */
  const buttons = (phase, password) => {
    /**
     * @param {string} id
     * @param {NativeElement} look
     * @param {(cx: Context) => void} action
     */
    const button = (id, look, action) => control(look, id, action);
    /** @type {Readonly<Record<UpdatePhase, NativeElement[]>>} */
    const each = {
      applied: password
        ? [
            button(
              "news-finish",
              keyButton(KEY_BUTTON.primary, PIECES_SAY.finish),
              finish,
            ),
            button("news-done", keyButton(KEY_BUTTON.ghost, "Got it"), close),
          ]
        : [button("news-done", keyButton(KEY_BUTTON.primary, "Got it"), close)],
      applying: [],
      available: [
        button(
          "news-update",
          keyButton(KEY_BUTTON.primary, "Update now"),
          start,
        ),
        button("news-later", keyButton(KEY_BUTTON.ghost, "Later"), close),
      ],
      failed: [
        button("news-retry", keyButton(KEY_BUTTON.primary, "Try again"), start),
        button("news-later", keyButton(KEY_BUTTON.ghost, "Later"), close),
      ],
      none: [
        button("news-done", keyButton(KEY_BUTTON.primary, "Got it"), close),
      ],
    };
    return h_flex().gap(10).children(each[phase]);
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    if (update === null)
      return v_flex()
        .size_full()
        .p(24)
        .bg(k.bg1)
        .child(text("Looking for forgerdr's news…", "ui", 14, k.muted));
    const state = update;
    const phase = starting ? UPDATE_PHASE.applying : phaseOf(state, Date.now());
    const { look, name } = teller();
    const offered =
      phase !== UPDATE_PHASE.applied && phase !== UPDATE_PHASE.none;
    const meta =
      offered && state.latest !== state.installed
        ? `v${state.installed} → v${state.latest}`
        : `v${state.installed}`;
    const summary = piecesSummary(state.pieces);
    const lines = phase === UPDATE_PHASE.applied ? summaryLines(summary) : [];
    const step =
      phase === UPDATE_PHASE.applying && state.step !== null
        ? PIECES_SAY.checked(pieceName(state.step), state.pieces.length)
        : "";
    return v_flex()
      .size_full()
      .gap(20)
      .p(24)
      .bg(k.bg1)
      .border(2)
      .border_color(k.line)
      .child(
        h_flex()
          .flex_none()
          .items_start()
          .gap(20)
          .child(gnome({ ...look, mood: MOOD_OF[phase], scale: 4 }))
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(14)
              .p(18)
              .bg(k.bg0)
              .border(2)
              .border_color(BRAND.coin)
              .child(text(name.toUpperCase(), "display", 10, BRAND.coin))
              .child(wrapped(SAYS[phase](state), "ui", 15, k.fg))
              .when(step !== "", (el) =>
                el.child(wrapped(step, "ui", 13, toneColour(TONE.working))),
              )
              .when(lines.length > 0, (el) =>
                el.child(
                  v_flex()
                    .gap(4)
                    .children(
                      lines.map(({ line, tone }) =>
                        wrapped(line, "ui", 13, toneColour(tone)),
                      ),
                    ),
                ),
              )
              .child(text(`forgerdr · ${meta}`, "ui", 12, k.muted))
              .child(
                buttons(
                  phase,
                  phase === UPDATE_PHASE.applied && summary.password,
                ),
              ),
          ),
      )
      .when(offered && notes !== "", (el) =>
        el.child(
          v_flex()
            .flex_1()
            .min_h(0)
            .gap(10)
            .child(text("RELEASE NOTES", "display", 10, BRAND.forgeGold))
            .child(
              TextView.markdown("news-notes", notes)
                .scrollable(true)
                .flex_1()
                .min_h(0)
                .text_size(13)
                .text_color(k.fg),
            ),
        ),
      )
      .child(
        wrapped(
          "Nothing updates by itself. The update changes forgerdr's plugin and the forge's look, and installs or updates what forgerdr needs, short of what asks for your password; your keys, your settings and what you changed by hand stay.",
          "ui",
          12,
          k.muted,
        ).flex_none(),
      );
  };

  return { close: () => following?.cancel(), render };
};
