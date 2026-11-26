// The forge's notifications, in place of the app's toast (the layout's "toast"): the app opens this mod with the
// notification as its props ({title, body, level, icon, action, overlay}). The gnome of the forge it is about tells it
// (the forge of the agent its action goes to, else the forge on show), in the level's colour and mood. It comes in
// three 90 ms steps; a click runs its action and it steps out the same way. It never takes the keyboard.
import { agents, checking, closeOverlay, props, run, spaces } from "herdr";
import { readFolders, readSpacesGit } from "../bridges/git.js";
import { readGnomes } from "../bridges/gnomes.js";
import { readNames } from "../bridges/names.js";
import { groupForges, lookKeyOf } from "../forges.js";
import { gnomeLookOf, nameOf } from "../identity.js";
import { control } from "../kit/control.js";
import { toast as toastPiece } from "../kit/panels.js";
import { motionOn } from "../kit/tokens.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("../kit/sprites.js").Mood} Mood */
/** @typedef {import("../kit/tokens.js").Tone} Tone */
/** @typedef {import("./role.js").Role} Role */

/**
 * A notification, as the app gives it.
 * @typedef {object} Notification
 * @property {string} [title]
 * @property {string} [body]
 * @property {"info" | "success" | "warning" | "error"} [level]
 * @property {{ name: string, args?: Record<string, unknown> }} [action]
 * @property {string} [overlay]
 */

/** @type {() => Notification | null} */
const readProps = props;

// Three steps in and out, 90 ms each (design 11, TOAST IN / OUT).
const STEP = Object.freeze({ count: 3, ms: 90 });

/** @type {Record<string, { tone: Tone, mood: Mood }>} */
const LEVEL = {
  error: { mood: "error", tone: "failed" },
  info: { mood: "idle", tone: "working" },
  success: { mood: "done", tone: "done" },
  warning: { mood: "needs", tone: "needs" },
};

/**
 * The forge a notification is about: its action's agent's, else the one on show.
 * @param {Notification} note
 */
const forgeOf = (note) => {
  const all = spaces();
  const target = note.action?.args?.terminal;
  const agent = agents().find((one) => one.address === target);
  const forges = groupForges(all, readSpacesGit(), readFolders());
  return (
    forges.find((forge) =>
      forge.spaces.some((space) => space.id === agent?.space),
    ) ?? forges.find((forge) => forge.spaces.some((space) => space.active))
  );
};

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const toast = (cx) => {
  const note = readProps() ?? {};
  const moving = motionOn() && !checking();
  // How far in it is: 0 (not drawn) to STEP.count (whole).
  let step = moving ? 1 : STEP.count;
  let leaving = false;

  // Steps towards whole, or towards gone once it leaves; it draws again only when it takes a step.
  const steps = moving
    ? cx.timer.every(STEP.ms, (cx) => {
        const target = leaving ? 0 : STEP.count;
        if (step === target) {
          if (leaving) {
            steps?.cancel();
            closeOverlay(note.overlay ?? "");
          }
          return;
        }
        step += leaving ? -1 : 1;
        cx.notify();
      })
    : null;

  const dismiss = () => {
    if (note.action?.name) run(note.action.name, note.action.args ?? {});
    if (moving) leaving = true;
    else closeOverlay(note.overlay ?? "");
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const forge = forgeOf(note);
    const key = forge === undefined ? "" : lookKeyOf(forge);
    const level = LEVEL[note.level ?? "info"] ?? LEVEL.info;
    const from =
      forge === undefined
        ? "the forge"
        : `${nameOf(key, readNames())} · ${forge.main.name}`;
    const message = [note.title, note.body].filter(Boolean).join(" · ");
    return control(
      toastPiece({
        from,
        look: {
          ...(forge === undefined ? {} : gnomeLookOf(key, readGnomes()[key])),
          mood: level.mood,
        },
        message,
        tone: level.tone,
      })
        .size_full()
        .opacity(step / STEP.count),
      "forge-toast",
      dismiss,
    );
  };

  return { close: () => steps?.cancel(), render };
};
