// The geometry of a row of tabs that scrolls sideways, in pixels: where each tab sits, whether the row overflows, where
// the app's scroll_to_item leaves it (the least scroll that shows a tab) and which tab each arrow brings in. Pure: Node
// tests it (test/herdr-mod.test.mjs).

/**
 * @typedef {object} StripState
 * @property {boolean} overflows the tabs are wider than the strip
 * @property {number} position how far the strip is scrolled, within its bounds
 * @property {number[]} lefts each tab's left edge
 * @property {number[]} rights each tab's right edge
 * @property {number} visible the strip's width
 * @property {(index: number) => number} after where showing a tab leaves the strip
 * @property {(x: number) => number} clamp a scroll within the strip's bounds
 */

// Less than this many pixels is the edge's rounding, not a hidden tab.
const SLACK = 0.5;

/**
 * @param {number[]} widths each tab's, in order
 * @param {number} visible the strip's width
 * @param {number} scrolled how far it was scrolled last
 * @returns {StripState}
 */
export const stripState = (widths, visible, scrolled) => {
  const lefts = widths.map((_, i) =>
    widths.slice(0, i).reduce((sum, width) => sum + width, 0),
  );
  const rights = widths.map((width, i) => lefts[i] + width);
  const total = rights.at(-1) ?? 0;
  const max = Math.max(0, total - visible);
  const clamp = (/** @type {number} */ x) => Math.min(max, Math.max(0, x));
  const position = clamp(scrolled);
  const after = (/** @type {number} */ index) => {
    if (lefts[index] === undefined) return position;
    if (lefts[index] < position) return clamp(lefts[index]);
    if (rights[index] > position + visible)
      return clamp(rights[index] - visible);
    return position;
  };
  return {
    after,
    clamp,
    lefts,
    overflows: visible > 0 && total > visible + SLACK,
    position,
    rights,
    visible,
  };
};

/**
 * The tab an arrow brings in: on the left the nearest tab cut off by the left edge, on the right the nearest cut off by
 * the right edge; null when nothing is hidden on that side.
 * @param {StripState} state
 * @param {"left" | "right"} side
 * @returns {number | null}
 */
export const scrollTarget = (state, side) => {
  if (side === "left") {
    const index = state.lefts.findLastIndex(
      (left) => left < state.position - SLACK,
    );
    return index === -1 ? null : index;
  }
  const index = state.rights.findIndex(
    (right) => right > state.position + state.visible + SLACK,
  );
  return index === -1 ? null : index;
};

/**
 * Where a wheel event leaves the strip: GPUI scrolls a row that only scrolls sideways by the wheel's sideways distance,
 * or by its vertical one when there is none (a mouse wheel), within the row's bounds. Positive is towards the start.
 * @param {StripState} state
 * @param {{ x: number, y: number }} delta the event's, in the same pixels as the widths
 */
export const wheeled = (state, { x, y }) =>
  state.clamp(state.position - (x === 0 ? y : x));

/**
 * What a strip's arrows bring in, the left one's tab and the right one's, to tell when they change.
 * @param {StripState} state
 */
export const arrowsOf = (state) =>
  `${scrollTarget(state, "left")} ${scrollTarget(state, "right")}`;
