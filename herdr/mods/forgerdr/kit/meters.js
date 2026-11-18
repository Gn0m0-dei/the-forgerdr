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
 * @property {boolean} [flame] the heat's flame before it; the first meter of a row has it
 * @property {"heat" | "warn" | "danger"} [band] the window's heat: ember, then the needs colour from 80 %, then the
 *   failed colour from 95 %
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
  band = "heat",
  flame = true,
}) => {
  const k = tokens();
  const lit = Math.round(Math.min(100, Math.max(0, percent)) / 10);
  /** @param {number} i */
  const stepColour = (i) => {
    if (i >= lit) return k.bg3;
    if (band === "danger") return k.failed;
    if (band === "warn") return k.needs;
    return i >= lit - 2 ? BRAND.ember : BRAND.emberDeep;
  };
  return h_flex()
    .flex_none()
    .items_center()
    .gap(8)
    .when(flame, (el) => el.child(icon(ICON.heat, BRAND.ember)))
    .child(text(label, "display", 9, k.muted))
    .child(
      h_flex()
        .flex_none()
        .gap(1)
        .children(
          Array.from({ length: 10 }, (_, i) =>
            div().flex_none().w(6).h(9).bg(stepColour(i)),
          ),
        ),
    )
    .child(text(detail, "ui", 12, k.muted))
    .when(after !== undefined, (el) =>
      el.child(text(after, "display", 9, k.muted)),
    );
};

/**
 * A window's history as bars standing on a line: each bar a stretch of the window, as tall as the use it added, the
 * tallest lit.
 * @param {number[]} values
 * @param {{ height?: number, colour?: Color }} [look]
 */
export const historyBars = (
  values,
  { height = 32, colour = BRAND.emberDeep } = {},
) => {
  const top = Math.max(1, ...values);
  return h_flex()
    .w_full()
    .h(height)
    .items_end()
    .gap(2)
    .children(
      values.map((value) =>
        div()
          .flex_1()
          .h(Math.max(2, Math.round((value / top) * height)))
          .bg(value === top && value > 0 ? BRAND.ember : colour),
      ),
    );
};
