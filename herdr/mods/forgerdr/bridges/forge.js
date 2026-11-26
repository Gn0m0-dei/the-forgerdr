// What forgerdr's scripts know of a forge and the app does not: its origin, project key and mode, the repositories of a
// parent folder, its indexing, its OpenSpec changes and stores (bin/forge-start.sh), its settings (bin/forge-config.sh), and its worktrees, planned, made and removed
// (bin/forge-worktree.sh, bin/forge-worktree-remove.sh). Every answer is JSON, an error object when something cannot be
// read or done; the format is tested from bash (test/forge-start.test.sh, test/herdr-app.test.sh). Saving a mode bumps
// a shared key, so the sidebar reads the forge again at once.
import { exec, setShared, shared } from "herdr";
import { ROOT } from "../name.js";
import { folderOf, worktreeArgs } from "../worktrees.js";

/** @typedef {import("../modes.js").ModeInfo} ModeInfo */
/** @typedef {import("../worktrees.js").WorktreeForm} WorktreeForm */

const SCRIPT = Object.freeze({
  config: `${ROOT}/bin/forge-config.sh`,
  prompt: `${ROOT}/bin/forge-prompt.sh`,
  remove: `${ROOT}/bin/forge-worktree-remove.sh`,
  start: `${ROOT}/bin/forge-start.sh`,
  timeout: 60_000,
  // Making or removing a worktree fetches, checks out and deletes a whole tree.
  treeTimeout: 600_000,
  worktree: `${ROOT}/bin/forge-worktree.sh`,
});

// The tab that opens reviews from URLs, as the review key does, or a checkout's security session.
export const PROMPT = SCRIPT.prompt;

const MODES_KEY = "forgerdr.modes.saved";

/**
 * What forge-start.sh info says of a forge; for a parent folder of repositories, which has no origin, the origin of
 * each one it holds (repos).
 * @typedef {ModeInfo & { provider: string, dir: string, root: string, origin: string, key: string, spec: string, host?: string, repo?: string, repos?: import("../start.js").Origin[] }} ForgeInfo
 */

/**
 * An OpenSpec change; in a parent folder that reads the changes of its repositories, the repository it is in.
 * @typedef {{ name: string, done: number, total: number, status: string, repo?: string }} Change
 */

/**
 * What forge-worktree.sh --plan says a new worktree would be: its branch, its folder, the base and the ref it starts
 * from, its dev server and port ("" without one) and which worktree of the forge it would be.
 * @typedef {{ branch: string, path: string, base: string, from: string, dev: string, port: string, worktrees: number }} WorktreePlan
 */

/**
 * What forge-worktree.sh made: the branch, the folder, the space it opened and its dev server's port ("" without one).
 * @typedef {{ branch: string, path: string, space: string, port: string }} MadeWorktree
 */

/**
 * What forge-worktree-remove.sh --plan says of the worktree a folder is in: its top, its branch, whether it goes by
 * force (one with submodules, which git removes no other way and without looking inside) and its uncommitted files.
 * @typedef {{ path: string, branch: string, forced: boolean, changes: string[] }} RemovalPlan
 */

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
 * Why a script failed: the first line it wrote to stderr, without the "forgerdr: " its messages start with.
 * @param {string} stderr
 * @param {string} script
 */
const failure = (stderr, script) =>
  stderr
    .split("\n")
    .find(Boolean)
    ?.replace(/^forgerdr: /, "") ?? `${script.split("/").at(-1)} failed`;

/**
 * Runs one of forgerdr's scripts for its JSON answer.
 * @template T
 * @param {string} script
 * @param {string[]} args
 * @param {string} cwd
 * @param {number} [timeout]
 * @returns {Promise<Loaded<T>>}
 */
const answer = async (script, args, cwd, timeout = SCRIPT.timeout) => {
  try {
    const result = await exec("bash", [script, ...args], { cwd, timeout });
    if (result.code !== 0)
      return { error: failure(result.stderr, script), state: "error" };
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
 * The repositories a folder outside git holds, by their main checkout's folder; none for a folder inside git.
 * @param {string} dir
 * @returns {Promise<Loaded<import("../forges.js").Folder>>}
 */
export const readRepos = (dir) => answer(SCRIPT.start, ["repos", dir], dir);

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
 * Runs one of forgerdr's scripts for what it does; null once done, else why not.
 * @param {string} script
 * @param {string[]} args
 * @param {{ cwd?: string, timeout?: number }} [options]
 * @returns {Promise<string | null>}
 */
const ran = async (script, args, options = {}) => {
  try {
    const result = await exec("bash", [script, ...args], {
      timeout: SCRIPT.timeout,
      ...options,
    });
    return result.code === 0 ? null : failure(result.stderr, script);
  } catch (error) {
    return String(error);
  }
};

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
  const set = (args) => ran(SCRIPT.config, ["set", ...args, key]);
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

// How a forge's indexing stands, as forge-start.sh answers it.
export const INDEX_STATE = Object.freeze({
  indexing: "indexing",
  none: "none",
  ready: "ready",
});

/**
 * What forge-start.sh indexed says of a forge's indexing: its state; its root (the parent folder of repositories, else
 * the repository), how many repositories a parent folder holds and how many joined it, whether the code index is
 * installed, its project there, when it was indexed, and what went wrong in its last run (failed, "" when nothing did).
 * @typedef {{ state: typeof INDEX_STATE[keyof typeof INDEX_STATE], root: string, folder: boolean, repos: number, joined: number, code: boolean, project: string, indexed_at: string, failed: string }} IndexInfo
 */

/**
 * How the indexing of the forge a folder is of stands.
 * @param {string} dir
 * @returns {Promise<Loaded<IndexInfo>>}
 */
export const readIndex = (dir) => answer(SCRIPT.start, ["indexed", dir], dir);

/**
 * Starts the indexing of the forge a folder is of and answers how it stands, at once: its repositories join their
 * parent folder and its code is indexed by a run of its own, which takes minutes on a large folder; readIndex says
 * when it ends.
 * @param {string} dir
 * @returns {Promise<Loaded<IndexInfo>>}
 */
export const startIndex = (dir) =>
  answer(SCRIPT.start, ["index-start", dir], dir);

/** A forge was indexed: its repositories take their folder's key and mode, so the modes are read again. */
export const forgeIndexed = () => setShared(MODES_KEY, Date.now());

/** @returns {number} when a mode was last kept, 0 before any */
export const modesSaved = () => {
  const saved = shared(MODES_KEY);
  return typeof saved === "number" ? saved : 0;
};

/**
 * What a new worktree would be, without making it.
 * @param {WorktreeForm} form
 * @returns {Promise<Loaded<WorktreePlan>>}
 */
export const planWorktree = (form) =>
  answer(SCRIPT.worktree, worktreeArgs(form, true), form.repo);

/**
 * Makes a new worktree, opened as a space with a shell (and its dev server unless the form says not).
 * @param {WorktreeForm} form
 * @returns {Promise<Loaded<MadeWorktree>>}
 */
export const makeWorktree = (form) =>
  answer(
    SCRIPT.worktree,
    worktreeArgs(form, false),
    form.repo,
    SCRIPT.treeTimeout,
  );

/**
 * What removing the worktree a folder is in would do.
 * @param {string} folder
 * @returns {Promise<Loaded<RemovalPlan>>}
 */
export const planRemoval = (folder) =>
  answer(SCRIPT.remove, ["--plan", folder], folder);

/**
 * Removes a worktree and closes its spaces; its branch stays. With discard its uncommitted work is thrown away; the
 * script still refuses while an agent is at work in one of its spaces. Null once removed, else why not.
 * @param {string} path its top, as planRemoval says it
 * @param {boolean} discard
 * @returns {Promise<string | null>}
 */
export const removeWorktree = (path, discard) =>
  ran(SCRIPT.remove, [...(discard ? ["--discard"] : []), path], {
    // Never from inside it: the script refuses to remove the folder it runs in.
    cwd: folderOf(path),
    timeout: SCRIPT.treeTimeout,
  });
