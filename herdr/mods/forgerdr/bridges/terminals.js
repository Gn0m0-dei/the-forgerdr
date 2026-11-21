// herdr's terminals() as the forge reads it: the app types each terminal loosely (hc ls --json, plus its report and the
// selection), so this is the one place that says which fields the lanes and the session bar rely on.
import { agents, spaces, terminals } from "herdr";
import { withParkedAgents } from "../lanes.js";

/** @typedef {import("herdr").AgentInfo} AgentInfo */
/** @typedef {import("../lanes.js").LaneTerminal} LaneTerminal */

/** @returns {LaneTerminal[]} */
export const readTerminals = () =>
  // Each terminal carries at least these fields (herdr.d.ts: terminals(), "as hc ls --json describes it").
  /** @type {LaneTerminal[]} */ (/** @type {unknown} */ (terminals()));

/**
 * herdr's agents, with the review sessions parked behind their views among them (lanes.js withParkedAgents), so the
 * sidebar, the top bar and the lanes count them as golems of their view's forge.
 * @returns {AgentInfo[]}
 */
export const readAgents = () =>
  withParkedAgents(agents(), readTerminals(), spaces());
