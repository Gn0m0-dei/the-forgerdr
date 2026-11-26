// The gnome's update notice (design 10b), over the window: a newer forgerdr is out, told by the gnome of the forge on
// show, with its release notes from GitHub below. Update now applies it (bin/forge-update.sh apply): the notice follows it
// from the state file, since the apply replaces this mod as it installs the new look, and says when it is in, or why it
// stopped. Later, Esc or a click beside it closes it; FORGERDR x.y.z on the status bar opens it again, and so does the
// manual's Check for updates when it finds the release.
import { h_flex, TextView, v_flex } from "gpui-base";
import { checking, closeOverlay, openOverlay, props, spaces } from "herdr";
import { readFolders, readSpacesGit } from "../bridges/git.js";
import { readGnomes } from "../bridges/gnomes.js";
import { readNames } from "../bridges/names.js";
import { applyUpdate, followUpdate } from "../bridges/update.js";
import { groupForges, lookKeyOf } from "../forges.js";
import { gnomeLookOf, nameOf } from "../identity.js";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { gnome } from "../kit/sprites.js";
import { text, wrapped } from "../kit/text.js";
import { BRAND, tokens } from "../kit/tokens.js";
import { MOD } from "../name.js";
import { phaseOf, UPDATE_PHASE } from "../update.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../kit/sprites.js").Mood} Mood */
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
    // A failure the state does not tell (the script could not run, or refused) gives the buttons back. The copy that
    // started it may be gone by then, replaced by the new mod with the state that tells it all; the process lives on.
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

  /**
   * @param {UpdatePhase} phase
   */
  const buttons = (phase) => {
    /**
     * @param {string} id
     * @param {NativeElement} look
     * @param {(cx: Context) => void} action
     */
    const button = (id, look, action) => control(look, id, action);
    /** @type {Readonly<Record<UpdatePhase, NativeElement[]>>} */
    const each = {
      applied: [
        button("news-done", keyButton(KEY_BUTTON.primary, "Got it"), close),
      ],
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
              .child(text(`forgerdr · ${meta}`, "ui", 12, k.muted))
              .child(buttons(phase)),
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
          "Nothing updates by itself. The update changes forgerdr's plugin and the forge's look; your keys, your settings and what you changed by hand stay.",
          "ui",
          12,
          k.muted,
        ).flex_none(),
      );
  };

  return { close: () => following?.cancel(), render };
};
