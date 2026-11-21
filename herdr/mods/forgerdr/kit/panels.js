import { h_flex, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { agentChip, tag } from "./chips.js";
import { SIGN, sign } from "./motion.js";
import { gnome, ICON, icon, MOOD } from "./sprites.js";
import { fill, text } from "./text.js";
import { BRAND, motionOn, tokens, toneColour } from "./tokens.js";

/** @typedef {import("./sprites.js").GnomeLook} GnomeLook */
/** @typedef {import("./motion.js").SignName} SignName */
/** @typedef {import("./tokens.js").Tone} Tone */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */

/**
 * @typedef {object} PaneHeaderProps
 * @property {string} title
 * @property {string} [folder] where it is, after its title
 * @property {Tone} [tone] its golem's, when an agent runs in it
 * @property {boolean} [running] a program that is not a shell runs in it, such as a dev server
 * @property {NativeElement} [review] the control that reviews what its agent changed, before the close
 * @property {NativeElement} [close] the control that closes the pane, last on its header
 */

/** @param {PaneHeaderProps} props */
export const paneHeader = ({
  title,
  folder,
  tone,
  running = false,
  review,
  close,
}) => {
  const k = tokens();
  return h_flex()
    .size_full()
    .min_h(26)
    .items_center()
    .gap(8)
    .px(10)
    .bg(k.bg2)
    .border_b(2)
    .border_color(k.line)
    .child(text(title, "ui", 12, k.fg).max_w(260).truncate())
    .child(fill(folder ? `— ${folder}` : "", "ui", 12, k.muted))
    .when(tone !== undefined, (el) => el.child(agentChip(tone)))
    .when(tone === undefined && running, (el) => el.child(tag("RUNNING", k.ok)))
    .when(review !== undefined, (el) => el.child(review))
    .when(close !== undefined, (el) => el.child(close));
};

export const splitControls = () => {
  const muted = tokens().muted;
  return h_flex()
    .flex_none()
    .items_center()
    .gap(10)
    .child(icon(ICON.splitRight, muted))
    .child(icon(ICON.splitDown, muted))
    .child(icon(ICON.zoom, muted));
};

/**
 * @typedef {object} GnomeHeaderProps
 * @property {string} forge
 * @property {string} name
 * @property {Tone} tone
 * @property {string} mood what its golems do, as "working · 3 golems"
 * @property {GnomeLook} [look]
 * @property {SignName} [sign] what its golems do, moving beside the gnome: the flame, the "!", the spark, the zZ
 * @property {NativeElement} [action] what the forge offers to do, under its gnome
 */

/** @param {GnomeHeaderProps} props */
export const gnomeHeader = ({
  forge,
  name,
  tone,
  mood,
  look = {},
  sign: mark,
  action,
}) => {
  const k = tokens();
  const colour = toneColour(tone);
  const gnomeRow = h_flex()
    .items_center()
    .gap(12)
    .child(
      div()
        .relative()
        .flex_none()
        .child(gnome({ ...look, scale: 3 }))
        .when(mark !== undefined, (el) =>
          el.child(sign(mark, 2).absolute().top(-4).right(-12)),
        ),
    )
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .gap(4)
        .child(text(`FORGE · ${forge.toUpperCase()}`, "display", 10, k.muted))
        .child(fill(name, "ui", 16, k.fg))
        .child(
          h_flex()
            .items_center()
            .gap(6)
            .child(div().flex_none().w(6).h(6).bg(colour))
            .child(text(mood, "ui", 12, colour)),
        ),
    );
  return v_flex()
    .gap(12)
    .p(16)
    .border_b(2)
    .border_color(k.line)
    .child(gnomeRow)
    .when(action !== undefined, (el) => el.child(action));
};

/**
 * @typedef {object} EmptyStateProps
 * @property {string} caption
 * @property {string} title
 * @property {string} sub what will wake the gnome
 * @property {GnomeLook} [look]
 * @property {NativeElement} [action] the button that wakes it, under its words
 */

/** @param {EmptyStateProps} props */
export const emptyState = ({ caption, title, sub, look = {}, action }) => {
  const k = tokens();
  return v_flex()
    .size_full()
    .gap(12)
    .p(16)
    .bg(k.bg1)
    .border(2)
    .border_color(k.line)
    .child(text(caption.toUpperCase(), "display", 10, k.muted))
    .child(
      v_flex()
        .flex_1()
        .items_center()
        .justify_center()
        .gap(14)
        .child(
          h_flex()
            .items_start()
            .child(gnome({ ...look, mood: MOOD.asleep, scale: 5 }))
            .child(sign(SIGN.zz, 2)),
        )
        .child(text(title, "ui", 16, k.fg))
        .child(text(sub, "ui", 12, k.muted))
        .when(action !== undefined, (el) => el.child(action)),
    );
};

// The dots after a thinking gnome's words, a frame each, natively stepped.
const THINKING = Object.freeze({ dots: ["", ".", "..", "..."], ms: 450 });

/**
 * @typedef {object} ThinkingProps
 * @property {string} caption
 * @property {string} title what the golem is doing: analyzing the pull request
 * @property {string} sub
 * @property {GnomeLook} [look]
 */

/**
 * A gnome at work while its golem thinks: its words with dots that step after them (still with the motion off), and a
 * line under them.
 * @param {ThinkingProps} props
 */
export const thinkingState = ({ caption, title, sub, look = {} }) => {
  const k = tokens();
  const dots = text("...", "ui", 16, k.fg).w(28);
  return v_flex()
    .size_full()
    .gap(12)
    .p(16)
    .bg(k.bg1)
    .border(2)
    .border_color(k.line)
    .child(text(caption.toUpperCase(), "display", 10, k.muted))
    .child(
      v_flex()
        .flex_1()
        .items_center()
        .justify_center()
        .gap(14)
        .child(
          h_flex()
            .items_start()
            .child(gnome({ ...look, mood: MOOD.working, scale: 5 }))
            .child(sign(SIGN.flame, 2)),
        )
        .child(
          h_flex()
            .items_end()
            .child(text(title, "ui", 16, k.fg))
            .child(
              motionOn()
                ? text("", "ui", 16, k.fg)
                    .w(28)
                    .frames(THINKING.dots, THINKING.ms)
                : dots,
            ),
        )
        .child(text(sub, "ui", 12, k.muted)),
    );
};

/**
 * @typedef {object} ToastProps
 * @property {string} from the gnome and its forge
 * @property {string} message
 * @property {GnomeLook} [look]
 * @property {Tone} [tone] how much it matters: its border and its sender
 */

/** @param {ToastProps} props */
export const toast = ({ from, message, look = {}, tone = "needs" }) => {
  const k = tokens();
  const colour = toneColour(tone);
  return h_flex()
    .items_center()
    .gap(12)
    .p(12)
    .bg(k.bg2)
    .border(2)
    .border_color(colour)
    .child(gnome({ ...look, scale: 2 }))
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .gap(3)
        .child(text(from.toUpperCase(), "display", 9, colour))
        .child(fill(message, "ui", 13, k.fg)),
    );
};

/**
 * The foot of a forge's sidebar: how the forge works, its mode, and where the mode points ("owner/repo"); where the
 * work comes from elsewhere than the code, both, a line each. The role opens the mode's dialog from it.
 * @param {{ name: string, detail: string, code?: string }} mode
 */
export const forgeMode = ({ name, detail, code }) => {
  const k = tokens();
  /**
   * @param {string} label
   * @param {string} value
   */
  const line = (label, value) =>
    h_flex()
      .gap(6)
      .items_center()
      .child(text(label, "display", 8, BRAND.ash))
      .child(fill(value, "ui", 12, k.muted));
  return h_flex()
    .flex_none()
    .items_center()
    .gap(10)
    .px(14)
    .py(12)
    .bg(BRAND.glow)
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .gap(4)
        .child(text(`MODE · ${name.toUpperCase()}`, "display", 9, BRAND.ember))
        .when(code === undefined, (el) =>
          el.child(fill(detail, "ui", 12, k.muted)),
        )
        .when(code !== undefined, (el) =>
          el.child(line("CODE", code ?? "")).child(line("BACKLOG", detail)),
        ),
    )
    .child(icon(ICON.settings, k.muted));
};
