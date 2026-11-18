import { h_flex } from "gpui-base";
import { div } from "gpui-kit";
import { sign } from "./motion.js";
import { text } from "./text.js";
import { AGENT_LABEL, CHIP_LABEL, tokens, toneColour } from "./tokens.js";

/** @typedef {import("gpui-kit").Color} Color */
/** @typedef {import("./motion.js").SignName} SignName */
/** @typedef {import("./tokens.js").Tone} Tone */

/**
 * @param {Tone} tone
 * @param {string} [label]
 */
export const statusChip = (tone, label = CHIP_LABEL[tone]) => {
  const colour = toneColour(tone);
  return h_flex()
    .flex_none()
    .items_center()
    .gap(6)
    .px(8)
    .py(4)
    .bg(tokens().bg2)
    .border(2)
    .border_color(colour)
    .child(div().flex_none().w(8).h(8).bg(colour))
    .child(text(label, "display", 11, colour));
};

/**
 * @param {Tone} tone
 * @param {string} [label]
 */
export const agentChip = (tone, label = AGENT_LABEL[tone]) => {
  const colour = toneColour(tone);
  return div()
    .flex_none()
    .px(5)
    .py(1)
    .border(1)
    .border_color(colour)
    .child(text(label, "display", 9, colour));
};

/**
 * @param {string} content
 * @param {Tone} tone
 */
export const badge = (content, tone) => {
  const colour = toneColour(tone);
  return div()
    .flex_none()
    .px(5)
    .py(1)
    .bg(tokens().bg2)
    .border(1)
    .border_color(colour)
    .child(text(content, "display", 10, colour));
};

/**
 * A badge that shows a moving sign instead of text: the needs-you "!" that blinks on a forge's tab.
 * @param {SignName} name
 * @param {Tone} tone
 */
export const signBadge = (name, tone) =>
  div()
    .flex_none()
    .px(3)
    .py(3)
    .bg(tokens().bg2)
    .border(1)
    .border_color(toneColour(tone))
    .child(sign(name, 1));

/**
 * Quiet unless given a colour: #42 beside a worktree, DEV :3001 in the working colour.
 * @param {string} content
 * @param {Color} [colour]
 */
export const tag = (content, colour) => {
  const k = tokens();
  return div()
    .flex_none()
    .px(5)
    .py(1)
    .border(1)
    .border_color(colour ?? k.line)
    .child(text(content, "display", 9, colour ?? k.muted));
};
