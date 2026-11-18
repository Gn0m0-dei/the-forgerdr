import { h_flex } from "gpui-base";
import { div } from "gpui-kit";
import { badge } from "./chips.js";
import { gnome, ICON, icon } from "./sprites.js";
import { text } from "./text.js";
import { BRAND, NONE, TONE, tokens, toneColour } from "./tokens.js";

/** @typedef {import("./sprites.js").GnomeLook} GnomeLook */
/** @typedef {import("./sprites.js").IconName} IconName */
/** @typedef {import("./tokens.js").Tone} Tone */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */

/**
 * @typedef {object} ForgeTabProps
 * @property {string} name
 * @property {boolean} [active]
 * @property {GnomeLook} [look]
 * @property {{ content: string, tone: Tone }} [badge] what the forge's golems do
 * @property {NativeElement} [close] the control that closes it, last on the tab
 */

/**
 * The active forge sits on the window, with an ember along its top.
 * @param {ForgeTabProps} props
 */
export const forgeTab = ({
  name,
  active = false,
  look = {},
  badge: mark,
  close,
}) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .relative()
    .items_center()
    .gap(8)
    .px(14)
    .h(36)
    .bg(active ? k.bg1 : k.bg0)
    .border_t(2)
    .border_l(2)
    .border_r(2)
    .border_color(active ? k.line : NONE)
    .child(gnome({ ...look, scale: 2 }))
    .child(text(name, "ui", 14, active ? k.fg : k.muted))
    .when(mark !== undefined, (el) => el.child(badge(mark.content, mark.tone)))
    .when(close !== undefined, (el) => el.child(close))
    .when(active, (el) =>
      el.child(div().absolute().top(0).left(0).w_full().h(2).bg(BRAND.ember)),
    );
};

export const addTab = () =>
  h_flex()
    .flex_none()
    .items_center()
    .px(10)
    .h(36)
    .child(text("+", "display", 16, tokens().muted));

/**
 * @typedef {object} SessionTabProps
 * @property {string} label
 * @property {IconName} icon the program's
 * @property {boolean} [active]
 * @property {Tone} [tone] the active tab's icon colour
 */

/** @param {SessionTabProps} props */
export const sessionTab = ({
  label,
  icon: glyph,
  active = false,
  tone = TONE.working,
}) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .items_center()
    .gap(6)
    .px(12)
    .h(30)
    .bg(active ? k.bg1 : NONE)
    .border_t(2)
    .border_l(2)
    .border_r(2)
    .border_color(active ? k.line : NONE)
    .child(icon(glyph, active ? toneColour(tone) : k.muted))
    .child(text(label, "ui", 13, active ? k.fg : k.muted));
};

/**
 * An arrow that scrolls a row of tabs; quiet when nothing is left on its side.
 * @param {"left" | "right"} side
 * @param {boolean} enabled
 */
export const scrollArrow = (side, enabled) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .items_center()
    .justify_center()
    .w(20)
    .h(36)
    .child(
      icon(
        side === "left" ? ICON.chevronLeft : ICON.chevronRight,
        enabled ? k.fg : k.bg3,
      ),
    );
};

/**
 * Where a dragged tab will land: a line in the accent along one edge of the tab under it.
 * @param {"left" | "right"} side
 */
export const dropMark = (side) =>
  div()
    .absolute()
    .top(0)
    .bottom(0)
    .w(2)
    .bg(tokens().accent)
    .when(side === "left", (el) => el.left(0))
    .when(side === "right", (el) => el.right(0));
