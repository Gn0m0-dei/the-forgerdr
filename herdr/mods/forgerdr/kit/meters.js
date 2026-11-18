import { h_flex } from "gpui-base";
import { div } from "gpui-kit";
import { ICON, icon } from "./sprites.js";
import { text } from "./text.js";
import { BRAND, tokens } from "./tokens.js";

/** @typedef {import("gpui-kit").Color} Color */

/**
 * @typedef {object} SteppedBarProps
 * @property {number} share 0..1; the steps past it stay dark
 * @property {number} steps
 * @property {Color} colour of the lit steps
 * @property {number} [width] of a step
 * @property {number} [height]
 * @property {number} [gap]
 */

/** @param {SteppedBarProps} props */
export const steppedBar = ({
  share,
  steps,
  colour,
  width = 8,
  height = 10,
  gap = 2,
}) => {
  const lit = Math.round(Math.min(1, Math.max(0, share)) * steps);
  const dark = tokens().bg3;
  return h_flex()
    .flex_none()
    .gap(gap)
    .children(
      Array.from({ length: steps }, (_, i) =>
        div()
          .flex_none()
          .w(width)
          .h(height)
          .bg(i < lit ? colour : dark),
      ),
    );
};

/**
 * @typedef {object} HeatMeterProps
 * @property {string} label the window's, as 5H
 * @property {number} percent used
 * @property {string} [detail] beside the steps; the percent by default
 * @property {string} [after] after it, as WEEK 41%
 */

/**
 * A subscription window as forge heat: the two hottest steps sit at the head of the fire.
 * @param {HeatMeterProps} props
 */
export const heatMeter = ({
  label,
  percent,
  detail = `${Math.round(percent)}%`,
  after,
}) => {
  const k = tokens();
  const lit = Math.round(Math.min(100, Math.max(0, percent)) / 10);
  return h_flex()
    .flex_none()
    .items_center()
    .gap(8)
    .child(icon(ICON.heat, BRAND.ember))
    .child(text(label, "display", 9, k.muted))
    .child(
      h_flex()
        .flex_none()
        .gap(1)
        .children(
          Array.from({ length: 10 }, (_, i) =>
            div()
              .flex_none()
              .w(6)
              .h(9)
              .bg(
                i >= lit ? k.bg3 : i >= lit - 2 ? BRAND.ember : BRAND.emberDeep,
              ),
          ),
        ),
    )
    .child(text(detail, "ui", 12, k.muted))
    .when(after !== undefined, (el) =>
      el.child(text(after, "display", 9, k.muted)),
    );
};
