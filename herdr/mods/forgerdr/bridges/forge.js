// What forgerdr's scripts know of a forge and the app does not: its origin, project key and mode, its OpenSpec changes
// and stores (bin/forge-start.sh), and its settings (bin/forge-config.sh). Every answer is JSON, an error object when
// something cannot be read or done; the format is tested from bash (test/forge-start.test.sh). Saving a mode bumps a
// shared key, so the sidebar reads the forge again at once.
import { exec, setShared, shared } from "herdr";
import { ROOT } from "../name.js";

/** @typedef {import("../modes.js").ModeInfo} ModeInfo */

const SCRIPT = Object.freeze({
  config: `${ROOT}/bin/forge-config.sh`,
  prompt: `${ROOT}/bin/forge-prompt.sh`,
  start: `${ROOT}/bin/forge-start.sh`,
  timeout: 60_000,
});

// The tab that opens reviews from URLs, as the review key does.
export const REVIEW_PROMPT = SCRIPT.prompt;

const MODES_KEY = "forgerdr.modes.saved";

/**
 * What forge-start.sh info says of a forge.
 * @typedef {ModeInfo & { provider: string, dir: string, root: string, origin: string, key: string, spec: string, host?: string, repo?: string }} ForgeInfo
 */

/** @typedef {{ name: string, done: number, total: number, status: string }} Change */

/**
 * An answer as it loads, or why it could not: its fix, and for a folder without OpenSpec whether a store can be made
 * there.
 * @template T
 * @typedef {{ state: "loading" } | { state: "ready", value: T } | { state: "error", error: string, fix?: string, setup?: boolean }} Loaded
 */

/**
 * Whether an answer is the error object the scripts answer when they cannot read or do something.
 * @param {unknown} value
 * @returns {value is { error: unknown, fix?: unknown, setup?: unknown }}
 */
const isError = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  "error" in value;

/**
 * Runs one of forgerdr's scripts for its JSON answer.
 * @template T
 * @param {string} script
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<Loaded<T>>}
 */
const answer = async (script, args, cwd) => {
  try {
    const result = await exec("bash", [script, ...args], {
      cwd,
      timeout: SCRIPT.timeout,
    });
    if (result.code !== 0)
      return {
        error:
          result.stderr.split("\n").find(Boolean) ??
          `${args[0] ?? script} failed`,
        state: "error",
      };
    /** @type {unknown} */
    const parsed = JSON.parse(result.stdout);
    if (isError(parsed))
      return {
        error: String(parsed.error),
        ...(typeof parsed.fix === "string" ? { fix: parsed.fix } : {}),
        setup: parsed.setup === true,
        state: "error",
      };
    // Otherwise the scripts answer their command's JSON (bin/forge-start.sh, tested from bash).
    return { state: "ready", value: /** @type {T} */ (parsed) };
  } catch (error) {
    return { error: String(error), state: "error" };
  }
};

/**
 * A forge as forgerdr sees it, from where its space is.
 * @param {string} dir
 * @returns {Promise<Loaded<ForgeInfo>>}
 */
export const readForge = (dir) => answer(SCRIPT.start, ["info", dir], dir);

/**
 * The OpenSpec changes of a forge in an OpenSpec mode.
 * @param {string} dir
 * @returns {Promise<Loaded<Change[]>>}
 */
export const readChanges = (dir) => answer(SCRIPT.start, ["changes", dir], dir);

/**
 * The OpenSpec store in a folder, registered when it is not yet.
 * @param {string} folder
 * @returns {Promise<Loaded<{ id: string }>>}
 */
export const registerStore = (folder) =>
  answer(SCRIPT.start, ["register", folder], folder);

/**
 * A new OpenSpec store made in a folder.
 * @param {string} folder
 * @returns {Promise<Loaded<{ id: string }>>}
 */
export const setupStore = (folder) =>
  answer(SCRIPT.start, ["setup", folder], folder);

/**
 * Keeps a forge's mode, and for Azure DevOps its backlog ("-" when it is its repository's); null once kept, else why
 * not.
 * @param {string} key the forge's memory project key
 * @param {string} mode
 * @param {string} [backlog]
 * @returns {Promise<string | null>}
 */
export const keepMode = async (key, mode, backlog) => {
  /** @param {string[]} args */
  const set = async (args) => {
    try {
      const result = await exec("bash", [SCRIPT.config, "set", ...args, key], {
        timeout: SCRIPT.timeout,
      });
      return result.code === 0
        ? null
        : (result.stderr.split("\n").find(Boolean) ?? "forge-config.sh failed");
    } catch (error) {
      return String(error);
    }
  };
  const failed =
    (backlog === undefined ? null : await set(["backlog", backlog])) ??
    (await set(["mode", mode]));
  if (failed === null) setShared(MODES_KEY, Date.now());
  return failed;
};

/**
 * Sets the backlog /azdo:init keeps in a clone's git config to an Azure DevOps project, where the azdospec skills read
 * it; null once set, else why not (a clone /azdo:init did not set up is left alone).
 * @param {string} dir where the forge's space is
 * @param {string} url https://dev.azure.com/<org>/<project>
 * @returns {Promise<string | null>}
 */
export const keepAzdospec = async (dir, url) => {
  const done = await answer(SCRIPT.start, ["azdospec", dir, url], dir);
  return done.state === "error" ? done.error : null;
};

/** @returns {number} when a mode was last kept, 0 before any */
export const modesSaved = () => {
  const saved = shared(MODES_KEY);
  return typeof saved === "number" ? saved : 0;
};
