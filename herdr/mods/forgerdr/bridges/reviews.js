// The review view's pull request, through bin/forge-pr.sh (a mod cannot list a folder): the review a session in a herdr
// terminal keeps, read again on every change in its folder, and what the human picks, edits and stamps in the view. The
// format is tested from bash (test/pr.test.sh) and written down in references/reviews.md.
import { exec, home } from "herdr";
import { ROOT } from "../name.js";
import { followFolder } from "./follow.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Task} Task */
/** @typedef {import("../review.js").Draft} Draft */
/** @typedef {import("../review.js").Review} Review */

const SCRIPT = `${ROOT}/bin/forge-pr.sh`;
const TIMEOUT = 10_000;

// forge: the default folder only; a mod cannot read XDG_STATE_HOME or FORGE_REVIEWS_DIR, which forge_reviews_dir
// honours, so with either set the script and the view part ways, as the inbox's do.
const folder = () => `${home()}/.local/state/forgerdr/reviews`;

/** forge-pr.sh show prints the review as it checked it, or null. @type {(text: string) => Review | null} */
const parseReview = JSON.parse;

/**
 * A terminal's review, or null when it keeps none. Throws, saying why, when it cannot be read.
 * @param {string} terminal
 * @returns {Promise<Review | null>}
 */
export const readReview = async (terminal) => {
  const result = await exec("bash", [SCRIPT, "show", terminal], {
    timeout: TIMEOUT,
  });
  if (result.code !== 0)
    throw new Error(
      `forge-pr.sh show: ${result.stderr.trim() || `exit ${result.code}`}`,
    );
  return parseReview(result.stdout);
};

/** forge-pr.sh list prints every review it checked, oldest first. @type {(text: string) => Review[]} */
const parseReviews = JSON.parse;

/**
 * Every review kept, for the sidebar's PULL REQUESTS group. Throws, saying why, when they cannot be read.
 * @returns {Promise<Review[]>}
 */
export const readReviews = async () => {
  const result = await exec("bash", [SCRIPT, "list"], { timeout: TIMEOUT });
  if (result.code !== 0)
    throw new Error(
      `forge-pr.sh list: ${result.stderr.trim() || `exit ${result.code}`}`,
    );
  return parseReviews(result.stdout);
};

/**
 * Reads a terminal's review now and again on every change in the folder, handing each read to `take`, until the copy
 * closes.
 * @param {AsyncContext} cx
 * @param {string} terminal
 * @param {(review: Review | null) => void} take
 * @returns {Task}
 */
export const followReview = (cx, terminal, take) =>
  followFolder(
    cx,
    { folder: folder(), read: () => readReview(terminal), what: "the review" },
    take,
  );

/**
 * Runs one of the mod's commands; what went wrong, or null.
 * @param {string[]} args
 * @returns {Promise<string | null>}
 */
const change = async (args) => {
  try {
    const result = await exec("bash", [SCRIPT, ...args], { timeout: TIMEOUT });
    return result.code === 0
      ? null
      : result.stderr.trim().replace(/^forgerdr: /, "") || "not changed";
  } catch (error) {
    return String(error);
  }
};

/**
 * @param {string} terminal
 * @param {string[]} ids the rows picked
 * @param {string} session the Claude session that asked for them
 */
export const pickRows = (terminal, ids, session) =>
  change(["pick", terminal, JSON.stringify(ids), session]);

/**
 * @param {string} terminal
 * @param {string} id
 * @param {string} body
 */
export const editDraft = (terminal, id, body) =>
  change(["edit", terminal, id, body]);

/**
 * @param {string} terminal
 * @param {string} id
 */
export const dropDraft = (terminal, id) => change(["drop", terminal, id]);

/**
 * Freezes the drafts the view shows, for the session to publish exactly those; refused when the file holds others.
 * @param {string} terminal
 * @param {Draft[]} drafts
 */
export const stampDrafts = (terminal, drafts) =>
  change(["stamp", terminal, JSON.stringify(drafts)]);
