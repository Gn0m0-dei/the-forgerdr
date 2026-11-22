import { h_flex, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { ICON, icon } from "./sprites.js";
import { text } from "./text.js";
import { BRAND, tokens } from "./tokens.js";

/** @typedef {import("./sprites.js").IconName} IconName */

export const KEY_BUTTON = Object.freeze({
  ghost: "ghost",
  primary: "primary",
  secondary: "secondary",
  stamp: "stamp",
  warn: "warn",
});

/** @typedef {typeof KEY_BUTTON[keyof typeof KEY_BUTTON]} KeyButtonKind */

/**
 * @typedef {object} KeyButtonExtra
 * @property {string} [key] the key that also does it; a ghost button shows none
 * @property {IconName} [icon]
 */

/**
 * primary is the accent, stamp the human's mark in forge gold, warn what throws work away; secondary shows the key that
 * also does it.
 * @param {KeyButtonKind} kind
 * @param {string} label
 * @param {KeyButtonExtra} [extra]
 */
export const keyButton = (kind, label, { key, icon: glyph } = {}) => {
  const k = tokens();
  const look = {
    ghost: {
      bg: k.bg2,
      border: k.line,
      ink: k.fg,
      keyBorder: k.line,
      keyInk: k.muted,
    },
    primary: {
      bg: k.accent,
      border: k.accent,
      ink: k.onAccent,
      keyBorder: k.onAccent,
      keyInk: k.onAccent,
    },
    secondary: {
      bg: k.bg2,
      border: k.line,
      ink: k.fg,
      keyBorder: k.line,
      keyInk: k.muted,
    },
    stamp: {
      bg: k.done,
      border: k.done,
      ink: k.onAccent,
      keyBorder: BRAND.inkSoft,
      keyInk: k.onAccent,
    },
    warn: {
      bg: k.needs,
      border: k.needs,
      ink: k.onAccent,
      keyBorder: BRAND.inkSoft,
      keyInk: k.onAccent,
    },
  }[kind];
  const primary = kind === KEY_BUTTON.primary;
  return h_flex()
    .flex_none()
    .items_center()
    .gap(primary ? 6 : 8)
    .px(primary ? 14 : 12)
    .py(primary ? 7 : 6)
    .bg(look.bg)
    .border(2)
    .border_color(look.border)
    .when(glyph !== undefined, (el) => el.child(icon(glyph, look.ink)))
    .child(text(label, "ui", 13, look.ink))
    .when(key !== undefined && kind !== KEY_BUTTON.ghost, (el) =>
      el.child(
        div()
          .flex_none()
          .px(4)
          .border(1)
          .border_color(look.keyBorder)
          .child(text(key, "display", 9, look.keyInk)),
      ),
    );
};

/** @param {string} key */
export const kbdHint = (key) => {
  const k = tokens();
  return div()
    .flex_none()
    .px(5)
    .py(1)
    .bg(k.bg2)
    .border(1)
    .border_b(2)
    .border_color(k.line)
    .child(text(key, "mono", 12, k.fg));
};

/** @param {string} [shortcut] */
export const paletteHint = (shortcut = "⌘K") => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .items_center()
    .px(10)
    .py(6)
    .border(2)
    .border_color(k.line)
    .child(text(shortcut, "display", 11, k.muted));
};

/** The way into a forge's Start work, under its gnome, in forge gold. */
export const startButton = () => {
  const k = tokens();
  return h_flex()
    .items_center()
    .justify_center()
    .gap(8)
    .px(10)
    .py(6)
    .bg(k.bg2)
    .border(2)
    .border_color(BRAND.forgeGold)
    .child(icon(ICON.hammer, BRAND.forgeGold))
    .child(text("START WORK", "display", 11, BRAND.forgeGold));
};

// The line under the top bar, which the open inbox's button covers.
export const BAR_LINE = 2;

/**
 * Quiet when nothing waits on the human's mark. While its drawer is open its words light up (in forge gold, or in the
 * needs colour while something waits) and it is part of the drawer: on its grey, edged in its line, open at the bottom;
 * run down to the bar's line, it covers the line under it, so it opens into the drawer below.
 * @param {number} count
 * @param {boolean} [open] the drawer shows
 */
export const inboxButton = (count, open = false) => {
  const k = tokens();
  const colour = count > 0 ? k.needs : open ? BRAND.forgeGold : k.muted;
  // Its icon and words keep their row, centred on each other, whether it is open (and taller) or not.
  const label = h_flex()
    .items_center()
    .gap(8)
    .child(icon(ICON.inbox, colour))
    .child(text(count > 0 ? `INBOX ${count}` : "INBOX", "display", 11, colour));
  return v_flex()
    .flex_none()
    .px(10)
    .py(6)
    .bg(open ? k.chrome : k.bg2)
    .border_t(2)
    .border_l(2)
    .border_r(2)
    .border_color(count > 0 && !open ? colour : k.line)
    .when(!open, (el) => el.border_b(2))
    .when(open, (el) =>
      el
        .relative()
        .child(
          div()
            .absolute()
            .left(-2)
            .right(-2)
            .bottom(-BAR_LINE)
            .h(BAR_LINE)
            .bg(k.chrome)
            .border_l(2)
            .border_r(2)
            .border_color(k.line),
        ),
    )
    .child(label);
};

/**
 * The forge floor: how many items wait on the human, quiet when none does.
 * @param {number} waiting
 */
export const floorButton = (waiting) => {
  const k = tokens();
  const colour = waiting > 0 ? k.needs : k.muted;
  return h_flex()
    .flex_none()
    .items_center()
    .gap(8)
    .px(10)
    .py(6)
    .bg(k.bg2)
    .border(2)
    .border_color(k.line)
    .child(icon(ICON.board, colour))
    .child(
      text(waiting > 0 ? `FLOOR ${waiting}` : "FLOOR", "display", 11, colour),
    );
};

/**
 * A new Herdr is ready: a click restarts into it.
 * @param {string} version
 */
export const updateChip = (version) =>
  h_flex()
    .flex_none()
    .items_center()
    .px(10)
    .py(3)
    .border(1)
    .border_color(BRAND.forgeGold)
    .child(text(`v${version} forged · restart`, "ui", 12, BRAND.forgeGold));

/**
 * A new forgerdr is out, beside Herdr's chip and in its gold: a click opens the gnome's notice. Putting it in that
 * failed shows in the failed colour.
 * @param {string} label FORGERDR x.y.z, and how putting it in goes
 * @param {boolean} failed
 */
export const forgerdrChip = (label, failed) => {
  const colour = failed ? tokens().failed : BRAND.forgeGold;
  return h_flex()
    .flex_none()
    .items_center()
    .px(10)
    .py(3)
    .border(1)
    .border_color(colour)
    .child(text(label, "ui", 12, colour));
};

/**
 * A button that is only its words, quiet until it is needed: ? MANUAL.
 * @param {string} label
 */
export const quietButton = (label) =>
  div()
    .flex_none()
    .child(text(label.toUpperCase(), "display", 9, tokens().muted));
