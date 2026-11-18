import { h_flex, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { agentChip } from "./chips.js";
import { gnome, ICON, icon, MOOD, zz } from "./sprites.js";
import { fill, text } from "./text.js";
import { tokens, toneColour } from "./tokens.js";

/** @typedef {import("./sprites.js").GnomeLook} GnomeLook */
/** @typedef {import("./tokens.js").Tone} Tone */

/**
 * @typedef {object} PaneHeaderProps
 * @property {string} title
 * @property {Tone} [tone] its golem's, when an agent runs in it
 */

/** @param {PaneHeaderProps} props */
export const paneHeader = ({ title, tone }) => {
  const k = tokens();
  return h_flex()
    .items_center()
    .gap(8)
    .px(10)
    .h(26)
    .bg(k.bg2)
    .border_b(2)
    .border_color(k.line)
    .child(fill(title, "ui", 12, k.fg))
    .when(tone !== undefined, (el) => el.child(agentChip(tone)));
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
 */

/** @param {GnomeHeaderProps} props */
export const gnomeHeader = ({ forge, name, tone, mood, look = {} }) => {
  const k = tokens();
  const colour = toneColour(tone);
  return h_flex()
    .items_center()
    .gap(12)
    .p(16)
    .border_b(2)
    .border_color(k.line)
    .child(gnome({ ...look, scale: 3 }))
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
};

/**
 * @typedef {object} EmptyStateProps
 * @property {string} caption
 * @property {string} title
 * @property {string} sub what will wake the gnome
 * @property {GnomeLook} [look]
 */

/** @param {EmptyStateProps} props */
export const emptyState = ({ caption, title, sub, look = {} }) => {
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
            .child(zz(2)),
        )
        .child(text(title, "ui", 16, k.fg))
        .child(text(sub, "ui", 12, k.muted)),
    );
};

/**
 * @typedef {object} ToastProps
 * @property {string} from the gnome and its forge
 * @property {string} message
 * @property {GnomeLook} [look]
 */

/** @param {ToastProps} props */
export const toast = ({ from, message, look = {} }) => {
  const k = tokens();
  return h_flex()
    .items_center()
    .gap(12)
    .p(12)
    .bg(k.bg2)
    .border(2)
    .border_color(k.needs)
    .child(gnome({ ...look, scale: 2 }))
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .gap(3)
        .child(text(from.toUpperCase(), "display", 9, k.needs))
        .child(fill(message, "ui", 13, k.fg)),
    );
};
