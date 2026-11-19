// The pieces a dialog's form is made of (design 12–12e): a box to tick (one of many), a radio (the one of a few), a
// choice among a few lined up (HERE | IN WORKTREES), a dialog's tab, a field's label and the chip that says what a row
// of a preview is.
import { h_flex } from "gpui-base";
import { div } from "gpui-kit";
import { ICON, icon } from "./sprites.js";
import { text } from "./text.js";
import { NONE, tokens } from "./tokens.js";

/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("./sprites.js").IconName} IconName */

/**
 * A box to tick: the accent with a tick when ticked.
 * @param {boolean} ticked
 */
export const checkBox = (ticked) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .w(16)
    .h(16)
    .items_center()
    .justify_center()
    .bg(ticked ? k.accent : k.bg0)
    .border(2)
    .border_color(ticked ? k.accent : k.line)
    .when(ticked, (el) => el.child(icon(ICON.ok, k.onAccent)));
};

/**
 * A radio, for the one option of a few: round, with the accent's dot when it is the one.
 * @param {boolean} chosen
 */
export const radio = (chosen) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .w(16)
    .h(16)
    .items_center()
    .justify_center()
    .rounded(8)
    .bg(k.bg0)
    .border(2)
    .border_color(chosen ? k.accent : k.line)
    .when(chosen, (el) => el.child(div().w(6).h(6).rounded(3).bg(k.accent)));
};

/**
 * One choice of a few lined up; the role makes each a control and lines them up with choices().
 * @param {string} label
 * @param {boolean} chosen
 */
export const choice = (label, chosen) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .items_center()
    .h(26)
    .px(10)
    .bg(chosen ? k.accent : NONE)
    .child(
      text(label.toUpperCase(), "display", 9, chosen ? k.onAccent : k.muted),
    );
};

/**
 * The choices of one setting, in one frame.
 * @param {NativeElement[]} each
 */
export const choices = (each) => {
  const k = tokens();
  return h_flex().flex_none().border(2).border_color(k.line).children(each);
};

/**
 * A dialog's tab: its icon and label, lit when shown, quiet when it has nothing for this forge.
 * @param {{ glyph: IconName, label: string, shown: boolean, off: boolean }} tab
 */
export const dialogTab = ({ glyph, label, shown, off }) => {
  const k = tokens();
  const ink = off ? k.line : shown ? k.fg : k.muted;
  return h_flex()
    .flex_none()
    .items_center()
    .gap(8)
    .h(34)
    .px(12)
    .bg(shown ? k.bg1 : NONE)
    .border(2)
    .border_b(0)
    .border_color(shown ? k.line : NONE)
    .child(icon(off ? ICON.lock : glyph, ink))
    .child(text(label, "ui", 13, ink));
};

/**
 * A field's label, in the display face.
 * @param {string} content
 */
export const fieldLabel = (content) =>
  text(content.toUpperCase(), "display", 8, tokens().muted);

/**
 * What a row of a preview is, in a colour of its own: an issue or a change works, a pull request is reviewed, a line
 * skipped failed.
 * @param {"item" | "change" | "pr" | "skip"} kind
 */
export const kindChip = (kind) => {
  const k = tokens();
  const { label, colour } = {
    change: { colour: k.done, label: "CHANGE" },
    item: { colour: k.working, label: "ISSUE" },
    pr: { colour: k.accent, label: "PR" },
    skip: { colour: k.failed, label: "SKIP" },
  }[kind];
  return h_flex()
    .flex_none()
    .w(60)
    .justify_center()
    .py(1)
    .border(1)
    .border_color(colour)
    .child(text(label, "display", 8, colour));
};

/**
 * A note set apart by a bar of its colour, as the design's callouts are.
 * @param {NativeElement} body
 * @param {import("gpui-kit").Color} colour
 */
export const callout = (body, colour) => {
  const k = tokens();
  return h_flex()
    .items_start()
    .gap(10)
    .p(10)
    .bg(k.bg2)
    .border_l(3)
    .border_color(colour)
    .child(div().flex_1().min_w(0).child(body));
};
