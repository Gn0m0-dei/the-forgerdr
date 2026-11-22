// What bin/forge-update.sh keeps in ~/.local/state/forgerdr/update (state.json and the release notes, notes.md), read
// again on every change in the folder, and the script run to look for a release or to apply it. The format is tested
// from bash (test/update.test.sh) and its reading from Node (test/herdr-mod.test.mjs).
import { exec, home, readTextFile } from "herdr";
import { ROOT } from "../name.js";
import { parseUpdate, UPDATE_TIMING } from "../update.js";
import { followFolder } from "./follow.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Task} Task */
/** @typedef {import("../update.js").UpdateState} UpdateState */

/**
 * What the folder holds: the state, null before the first look, and the release notes of the release offered.
 * @typedef {object} UpdateRead
 * @property {UpdateState | null} state
 * @property {string} notes markdown, empty when there are none
 */

const SCRIPT = `${ROOT}/bin/forge-update.sh`;

// How long each command may take: a look is two small requests; an apply, as long as it may run before it counts as
// dead.
const TIMEOUT = Object.freeze({ apply: UPDATE_TIMING.stuck, check: 60_000 });

/** @typedef {keyof typeof TIMEOUT} UpdateCommand */

// forge: the default folder only; a mod cannot read XDG_STATE_HOME or FORGE_UPDATE_DIR, which the script honours.
const folder = () => `${home()}/.local/state/forgerdr/update`;

/**
 * A file of the folder; null when there is none, or when it cannot be read, which is logged.
 * @param {string} name
 * @returns {Promise<string | null>}
 */
const readOrNull = (name) =>
  readTextFile(`${folder()}/${name}`).catch((error) => {
    console.error(`forgerdr: the update's ${name} could not be read`, error);
    return null;
  });

/**
 * @param {string} text state.json
 * @returns {UpdateState | null}
 */
const stateOf = (text) => {
  const state = parseUpdate(text);
  if (state === null)
    console.error("forgerdr: the update's state.json is not in its shape");
  return state;
};

/** @returns {Promise<UpdateRead>} */
const readUpdate = async () => {
  const [state, notes] = await Promise.all([
    readOrNull("state.json"),
    readOrNull("notes.md"),
  ]);
  return {
    notes: notes ?? "",
    state: state === null ? null : stateOf(state),
  };
};

/**
 * Reads the folder now and again on every change in it, handing each read to `take`, until the copy closes.
 * @param {AsyncContext} cx
 * @param {(read: UpdateRead) => void} take
 * @returns {Task}
 */
export const followUpdate = (cx, take) =>
  followFolder(
    cx,
    { folder: folder(), read: readUpdate, what: "the update" },
    take,
  );

/**
 * Runs the script, resolving whether it succeeded; what it finds lands in the folder, so a failure is only logged here.
 * The process outlives the copy that started it (an apply replaces this mod mid-run), so nothing else waits on it.
 * @param {UpdateCommand} command
 * @returns {Promise<boolean>}
 */
const run = async (command) => {
  const result = await exec("bash", [SCRIPT, command], {
    timeout: TIMEOUT[command],
  });
  if (result.code !== 0)
    console.error(
      `forgerdr: forge-update.sh ${command}: ${result.stderr.trim() || `exit ${result.code}`}`,
    );
  return result.code === 0;
};

export const checkUpdate = () => run("check");
export const applyUpdate = () => run("apply");
