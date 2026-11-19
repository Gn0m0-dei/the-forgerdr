import { div } from "gpui-kit";
import { FONT } from "./tokens.js";

/** @typedef {import("gpui-kit").Color} Color */
/** @typedef {import("./tokens.js").Face} Face */

/**
 * @param {string} content
 * @param {Face} face
 * @param {number} size
 * @param {Color} colour
 */
export const text = (content, face, size, colour) =>
  div()
    .flex_none()
    .whitespace_nowrap()
    .font_family(FONT[face])
    .text_size(size)
    .text_color(colour)
    .child(content);

/**
 * Takes the room left and cuts itself short with an ellipsis.
 * @param {string} content
 * @param {Face} face
 * @param {number} size
 * @param {Color} colour
 */
export const fill = (content, face, size, colour) =>
  div()
    .flex_1()
    .min_w(0)
    .truncate()
    .font_family(FONT[face])
    .text_size(size)
    .text_color(colour)
    .child(content);

/**
 * Words that wrap within the room they are given, for a sentence or two.
 * @param {string} content
 * @param {Face} face
 * @param {number} size
 * @param {Color} colour
 */
export const wrapped = (content, face, size, colour) =>
  div()
    .min_w(0)
    .font_family(FONT[face])
    .text_size(size)
    .text_color(colour)
    .child(content);
