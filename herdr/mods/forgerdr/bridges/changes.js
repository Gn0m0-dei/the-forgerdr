// What the Changes panel reads and keeps: the shown forge's checkouts and a checkout's diff, through
// bin/forge-changes.sh (its format is tested from bash, test/changes.test.sh); the human's comments, in a file only this
// module writes, so they outlive the panel, the space shown and the app until they are sent; and both published to
// every copy through shared state. The session bar's copy follows the forge (it always shows), so the Changes button
// tells of changes with the panel shut; the panel's copy reads what it publishes.
import {
  exec,
  home,
  readTextFile,
  setShared,
  shared,
  watchFolder,
  window,
  writeTextFile,
} from "herdr";
import { checkoutsOf, parseComments, serializeComments } from "../changes.js";
import { ROOT } from "../name.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Task} Task */
/** @typedef {import("../changes.js").ChangeComment} ChangeComment */
/** @typedef {import("../changes.js").TreeRepo} TreeRepo */

const SCRIPT = `${ROOT}/bin/forge-changes.sh`;
// git status runs in every checkout of the forge, and a diff reads a whole checkout: a big one takes a while.
const TIMEOUT = Object.freeze({ diff: 30_000, tree: 60_000 });

const KEY = Object.freeze({
  comments: "forgerdr.changes.comments",
  tree: "forgerdr.changes",
});

const TIMING = Object.freeze({
  // A slow read is not started again at once: this many times what the last one took, up to the cap.
  backoff: 5,
  cap: 60_000,
  // Without a word from the watches (a folder not watched, an event lost), the forge is read again this often.
  poll: 30_000,
  // Changes that come together (a save, a checkout) are read once.
  settle: 400,
});

// The app keeps 64 folders watched for every mod together: the forge's first checkouts are watched, the rest wait for
// the poll.
const WATCHED = 24;

// forge: the default folder only, as the inbox's (bridges/inbox.js).
const folder = () => `${home()}/.local/state/forgerdr/changes`;
const commentsFile = () => `${folder()}/comments.json`;

/** forge-changes.sh tree prints the forge's repositories. @type {(text: string) => TreeRepo[]} */
const parseTree = JSON.parse;

/** @param {{ code: number, stderr: string }} result */
const failure = (result) =>
  result.stderr.trim().replace(/^forgerdr: /, "") || `exit ${result.code}`;

/**
 * What the session bar's copy read of a forge, and when: a read a change asked for is published even when the
 * checkouts count the same, since a file edited again changes its diff and not this.
 * @typedef {{ forge: string, tree: TreeRepo[], at: number }} ForgeChanges
 */

/** @returns {ForgeChanges | null} */
export const readChanges = () =>
  // Only publishChanges writes the key, always as a ForgeChanges.
  /** @type {ForgeChanges | null} */ (shared(KEY.tree)) ?? null;

/** @param {ForgeChanges} value */
const publishChanges = (value) => setShared(KEY.tree, value);

/** @param {TreeRepo[]} tree whether it is what the forge last published */
const sameTree = (tree) =>
  JSON.stringify(tree) === JSON.stringify(readChanges()?.tree ?? null);

/** @returns {ChangeComment[]} */
export const readComments = () =>
  // Only this module writes the key, always as a list of comments.
  /** @type {ChangeComment[] | null} */ (shared(KEY.comments)) ?? [];

/** @param {ChangeComment[]} comments */
const publishComments = (comments) => {
  if (JSON.stringify(comments) !== JSON.stringify(readComments()))
    setShared(KEY.comments, comments);
};

/**
 * The checkouts of some repositories, with what each changed. Throws, saying why, when they cannot be read.
 * @param {string[]} repos their main checkouts' folders
 * @returns {Promise<TreeRepo[]>}
 */
const readTree = async (repos) => {
  if (repos.length === 0) return [];
  const result = await exec("bash", [SCRIPT, "tree", ...repos], {
    timeout: TIMEOUT.tree,
  });
  if (result.code !== 0)
    throw new Error(`forge-changes.sh tree: ${failure(result)}`);
  return parseTree(result.stdout);
};

/**
 * A checkout's diff from its HEAD, new files included. Throws, saying why.
 * @param {string} top
 */
export const readDiff = async (top) => {
  const result = await exec("bash", [SCRIPT, "diff", top], {
    timeout: TIMEOUT.diff,
  });
  if (result.code !== 0)
    throw new Error(`forge-changes.sh diff: ${failure(result)}`);
  return result.stdout;
};

/** Reads the comments from their file and publishes them; answers the file's text, which the next write must find. */
export const loadComments = async () => {
  const text = await readTextFile(commentsFile());
  publishComments(parseComments(text));
  return text;
};

// How many times a change of the comments is tried: once more when another write came in between.
const WRITE_TRIES = 2;

/**
 * Changes the comments kept: reads them, applies the change and writes them back, again when another write came in
 * between. What went wrong, or null.
 * @param {(comments: ChangeComment[]) => ChangeComment[]} change
 * @returns {Promise<string | null>}
 */
export const changeComments = async (change) => {
  let refused = "";
  try {
    // The user's alone: the comments hold lines of code.
    const owned = await exec("bash", [SCRIPT, "own", folder()]);
    if (owned.code !== 0) return `forge-changes.sh own: ${failure(owned)}`;
    for (let tried = 0; tried < WRITE_TRIES; tried += 1) {
      const before = await readTextFile(commentsFile());
      const next = change(parseComments(before));
      try {
        await writeTextFile(commentsFile(), serializeComments(next), before);
      } catch (error) {
        refused = String(error);
        continue;
      }
      publishComments(next);
      return null;
    }
    console.error("forgerdr: the comments could not be saved", refused);
    return `the comments could not be saved: ${refused}`;
  } catch (error) {
    return String(error);
  }
};

// What ends a wait of the follower: a checkout changed, it was woken (another forge is shown), or the clock.
const WOKEN = Object.freeze({ change: "change", clock: "clock" });

/**
 * Follows the shown forge until the copy closes: reads its checkouts and the comments now, and again when a checkout
 * changes, when `wake` is called (another forge is shown) and every so often; never two reads at once, and a slow read
 * waits longer before the next. A read on the clock that finds the checkouts as they were publishes nothing. A read
 * that fails is logged and the last good one stands.
 * @param {AsyncContext} cx
 * @param {() => { key: string, repos: string[] } | null} forgeNow the shown forge, asked at every read
 * @returns {{ task: Task, wake: () => void }}
 */
export const followChanges = (cx, forgeNow) => {
  // A wake that comes while the forge is being read waits here for the next wait.
  let asked = false;
  /** @type {(() => void) | null} */
  let woken = null;
  const task = cx.spawn(async (cx) => {
    /** @type {string} */
    let why = WOKEN.change;
    for (;;) {
      asked = false;
      const forge = forgeNow();
      const started = Date.now();
      /** @type {TreeRepo[]} */
      let tree = [];
      try {
        await loadComments();
        if (forge !== null) {
          tree = await readTree(forge.repos);
          if (
            why === WOKEN.change ||
            readChanges()?.forge !== forge.key ||
            !sameTree(tree)
          )
            publishChanges({ at: Date.now(), forge: forge.key, tree });
        }
      } catch (error) {
        console.error("forgerdr: the forge's changes could not be read", error);
      }
      const took = Date.now() - started;
      const watches = checkoutsOf(tree)
        .slice(0, WATCHED)
        .map(({ top }) => watchFolder(top));
      // This wait's clock stops with the wait, so none is left running behind it.
      let waiting = true;
      const clock = async () => {
        // A window out of sight is not read on the clock; a change or a wake still gets through.
        do await cx.sleep(TIMING.poll);
        while (waiting && window()?.visible === false);
        return WOKEN.clock;
      };
      try {
        why = asked
          ? WOKEN.change
          : await Promise.race([
              ...watches.map((watch) => watch.then(() => WOKEN.change)),
              clock(),
              new Promise((resolve) => {
                woken = () => resolve(WOKEN.change);
              }),
            ]);
      } catch (error) {
        why = WOKEN.clock;
        console.error("forgerdr: a checkout could not be watched", error);
      }
      waiting = false;
      woken = null;
      for (const watch of watches) watch.cancel();
      await cx.sleep(
        Math.min(TIMING.cap, Math.max(TIMING.settle, TIMING.backoff * took)),
      );
    }
  });
  return {
    task,
    wake: () => {
      asked = true;
      woken?.();
    },
  };
};
