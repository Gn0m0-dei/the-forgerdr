import { h_flex } from "gpui-base";
import { div } from "gpui-kit";
import { badge, signBadge } from "./chips.js";
import { SIGN } from "./motion.js";
import { gnome, ICON, icon } from "./sprites.js";
import { text } from "./text.js";
import { BRAND, NONE, TONE, tokens, toneColour } from "./tokens.js";

/** @typedef {import("./sprites.js").GnomeLook} GnomeLook */
/** @typedef {import("./sprites.js").IconName} IconName */
/** @typedef {import("./tokens.js").Tone} Tone */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */

// How tall each row of tabs is, which its arrows take.
export const TAB_HEIGHT = Object.freeze({ forge: 36, session: 30 });

/**
 * @typedef {object} ForgeTabProps
 * @property {string} name
 * @property {boolean} [active]
 * @property {GnomeLook} [look]
 * @property {{ content: string, tone: Tone }} [badge] what the forge's golems do
 * @property {NativeElement} [close] the control that closes it, last on the tab
 */

/**
 * The active forge sits on its forge's frame, in the frame's colour, with an ember along its top.
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
    .h(TAB_HEIGHT.forge)
    .bg(active ? k.chrome : k.bg0)
    .border_t(2)
    .border_l(2)
    .border_r(2)
    .border_color(active ? k.line : NONE)
    .child(gnome({ ...look, scale: 2 }))
    .child(text(name, "ui", 14, active ? k.fg : k.muted))
    .when(mark !== undefined, (el) =>
      el.child(
        mark.tone === TONE.needs
          ? signBadge(SIGN.needs, mark.tone)
          : badge(mark.content, mark.tone),
      ),
    )
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
 * @property {Tone} [tone] what its golem does, which colours its icon
 * @property {boolean} [zoomed] one of its panes fills it
 * @property {NativeElement} [close] the control that closes it, last on the tab
 */

/**
 * A session of the shown forge: the active one sits on its panes.
 * @param {SessionTabProps} props
 */
export const sessionTab = ({
  label,
  icon: glyph,
  active = false,
  tone,
  zoomed = false,
  close,
}) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .items_center()
    .gap(6)
    .px(12)
    .h(TAB_HEIGHT.session)
    .bg(active ? k.bg1 : NONE)
    .border_t(2)
    .border_l(2)
    .border_r(2)
    .border_color(active ? k.line : NONE)
    .child(
      icon(
        glyph,
        tone === undefined ? (active ? k.fg : k.muted) : toneColour(tone),
      ),
    )
    .child(
      text(label, "ui", 13, active ? k.fg : k.muted)
        .max_w(200)
        .truncate(),
    )
    .when(zoomed, (el) => el.child(icon(ICON.zoom, k.muted)))
    .when(close !== undefined, (el) => el.child(close));
};

/**
 * What a side panel's switch tells with the panel shut: how many it holds, and whether something there waits on the
 * human (Changes: the files changed, and comments written and not sent).
 * @typedef {{ count: number, waiting: boolean }} PanelMark
 */

/**
 * The switch of a side panel on the session bar (IDE, Changes): lit while it shows.
 * @param {string} label
 * @param {boolean} on
 * @param {PanelMark} [mark] nothing told at zero
 */
export const panelToggle = (label, on, mark) => {
  const k = tokens();
  const count = mark?.count ?? 0;
  return h_flex()
    .flex_none()
    .items_center()
    .gap(6)
    .h(26)
    .px(8)
    .bg(on ? k.bg2 : NONE)
    .border(2)
    .border_color(on ? k.line : NONE)
    .child(text(label.toUpperCase(), "display", 10, on ? k.fg : k.muted))
    .when(count > 0 || mark?.waiting === true, (el) =>
      el.child(
        text(
          String(count),
          "mono",
          11,
          mark?.waiting === true ? k.needs : k.accent,
        ),
      ),
    );
};

/**
 * An arrow that scrolls a row of tabs; quiet when nothing is left on its side. As tall as the tabs it scrolls.
 * @param {"left" | "right"} side
 * @param {boolean} enabled
 * @param {number} [height] the tabs', the forge tabs' unless given
 */
export const scrollArrow = (side, enabled, height = TAB_HEIGHT.forge) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .items_center()
    .justify_center()
    .w(20)
    .h(height)
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
