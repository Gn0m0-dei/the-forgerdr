// What bin/forge-update.sh keeps in ~/.local/state/forgerdr/update (state.json and the release notes, notes.md), read
// again on every change in the folder, the script run to look for a release or to apply it, and the plugin's installer
// opened in a tab to finish what an apply left needing the person's password. The format is tested from bash
// (test/update.test.sh) and its reading from Node (test/herdr-mod.test.mjs).
import { exec, home, readTextFile, run } from "herdr";
import { ROOT } from "../name.js";
import { parseUpdate } from "../update.js";
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

// The plugin's install.sh in a tab of its own, where it asks for the password that the apply's install.sh --update never
// asks for.
const FINISH = Object.freeze({
  argv: ["bash", `${ROOT}/install.sh`],
  name: "forgerdr install",
});

// What the script is told for each command, and how long it may take: a look is two small requests; an apply returns
// once it is under way and goes on detached, past herdr's longest exec.
const COMMAND = Object.freeze({
  apply: Object.freeze({ args: ["apply", "--detach"], timeout: 30_000 }),
  check: Object.freeze({ args: ["check"], timeout: 60_000 }),
});

/** @typedef {keyof typeof COMMAND} UpdateCommand */

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
export const readUpdate = async () => {
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
 * An apply goes on by itself once under way, outliving the copy that started it (it replaces this mod mid-run).
 * @param {UpdateCommand} command
 * @returns {Promise<boolean>}
 */
const runScript = async (command) => {
  const { args, timeout } = COMMAND[command];
  const result = await exec("bash", [SCRIPT, ...args], { timeout });
  if (result.code !== 0)
    console.error(
      `forgerdr: forge-update.sh ${command}: ${result.stderr.trim() || `exit ${result.code}`}`,
    );
  return result.code === 0;
};

export const checkUpdate = () => runScript("check");
export const applyUpdate = () => runScript("apply");
export const finishInTab = () => run("tab.new", FINISH);
