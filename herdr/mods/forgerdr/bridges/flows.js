// The forge floor's flows, through bin/forge-flow.sh (a mod cannot list a folder): every flow, read again on every
// change in its folder. The format is tested from bash (test/flow.test.sh); what
// keeps each flow is references/flows.md.
import { exec, home } from "herdr";
import { ROOT } from "../name.js";
import { followFolder } from "./follow.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Task} Task */
/** @typedef {import("../floor.js").Flow} Flow */

const SCRIPT = `${ROOT}/bin/forge-flow.sh`;
const TIMEOUT = 10_000;

// forge: the default folder only; a mod cannot read XDG_STATE_HOME or FORGE_FLOWS_DIR, which forge_flows_dir honours, so
// with either set the script and the floor part ways, as the inbox's do.
const folder = () => `${home()}/.local/state/forgerdr/flows`;

/** forge-flow.sh list prints the flows as it checked them. @type {(text: string) => Flow[]} */
const parseFlows = JSON.parse;

/**
 * Every flow, oldest first. Throws, saying why, when they cannot be read.
 * @returns {Promise<Flow[]>}
 */
export const readFlows = async () => {
  const result = await exec("bash", [SCRIPT, "list"], { timeout: TIMEOUT });
  if (result.code !== 0)
    throw new Error(
      `forge-flow.sh list: ${result.stderr.trim() || `exit ${result.code}`}`,
    );
  return parseFlows(result.stdout);
};

/**
 * Reads the flows now and again on every change in their folder, handing each read to `take`, until the copy closes.
 * @param {AsyncContext} cx
 * @param {(flows: Flow[]) => void} take
 * @returns {Task}
 */
export const followFlows = (cx, take) =>
  followFolder(
    cx,
    { folder: folder(), read: readFlows, what: "the flows" },
    take,
  );
