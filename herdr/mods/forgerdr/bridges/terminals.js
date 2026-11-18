// herdr's terminals() as the forge reads it: the app types each terminal loosely (hc ls --json, plus its report and the
// selection), so this is the one place that says which fields the lanes and the session bar rely on.
import { terminals } from "herdr";

/** @typedef {import("../lanes.js").LaneTerminal} LaneTerminal */

/** @returns {LaneTerminal[]} */
export const readTerminals = () =>
  // Each terminal carries at least these fields (herdr.d.ts: terminals(), "as hc ls --json describes it").
  /** @type {LaneTerminal[]} */ (/** @type {unknown} */ (terminals()));
