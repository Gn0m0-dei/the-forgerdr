// The security view's own pieces (design 06d); its heads, rows and label-value lines are the review view's
// (kit/review.js). A tone's colour, an opened finding's lines, the toggles that note a finding on the issue or remember
// it, a card of the fix plan and the note that nothing leaves this machine. Plain values in, an element out; the role
// makes them controls.
import { h_flex, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { explainedLine } from "./review.js";
import { ICON, icon } from "./sprites.js";
import { fill, text, wrapped } from "./text.js";
import { tokens } from "./tokens.js";

/** @typedef {import("gpui-kit").Color} Color */
/** @typedef {import("../security.js").DetailLine} DetailLine */
/** @typedef {import("../security.js").SecurityTone} SecurityTone */

/**
 * A security tone's colour: each tone names a colour of the tokens.
 * @param {SecurityTone} tone
 * @returns {Color}
 */
export const securityToneColour = (tone) => {
  /** @type {Record<SecurityTone, Color>} */
  const colours = tokens();
  return colours[tone];
};

/**
 * A finding opened: what its status tells, each text beside its label (WHO, INPUT, CONTROL, PATH, EFFECT, FIX, TEST).
 * @param {DetailLine[]} lines
 */
export const securityDetail = (lines) =>
  v_flex()
    .w_full()
    .gap(10)
    .px(16)
    .pb(12)
    .pt(4)
    .children(lines.map((line) => explainedLine(line.label, line.text)));

/**
 * A small button that is on or off: Note on the issue, Remember; the accent when on.
 * @param {string} label
 * @param {boolean} on
 */
export const actionToggle = (label, on) => {
  const k = tokens();
  return div()
    .flex_none()
    .px(10)
    .py(3)
    .border(1)
    .border_color(on ? k.accent : k.line)
    .child(text(label, "ui", 12, on ? k.accent : k.fg));
};

/**
 * @typedef {object} FixCardProps
 * @property {string} id S1
 * @property {string} title its short title
 * @property {string} test the regression test the fix makes pass
 */

/**
 * A finding picked to fix, in the fix plan: its id and title, and the test under them.
 * @param {FixCardProps} props
 */
export const fixCard = ({ id, title, test }) => {
  const k = tokens();
  return v_flex()
    .w_full()
    .gap(6)
    .p(12)
    .bg(k.bg1)
    .border(2)
    .border_color(k.line)
    .child(
      h_flex()
        .items_center()
        .gap(8)
        .child(text(id, "mono", 13, k.muted))
        .child(fill(title, "ui", 13, k.fg)),
    )
    .child(wrapped(test, "mono", 12, k.muted));
};

/**
 * A note behind a lock: what stays on this machine.
 * @param {string} words
 */
export const lockNote = (words) => {
  const k = tokens();
  return h_flex()
    .w_full()
    .items_start()
    .gap(10)
    .p(12)
    .border(2)
    .border_color(k.line)
    .child(icon(ICON.lock, k.muted))
    .child(
      div()
        .flex_1()
        .min_w(0)
        .child(wrapped(words, "ui", 12, k.muted)),
    );
};
