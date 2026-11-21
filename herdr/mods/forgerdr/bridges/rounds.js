// Review rounds of an agent's work, through bin/forge-round.sh: a terminal's rounds and comments, read again on every
// change in their folder, a round's diff, and what the human does in the round's view; the feedback goes to the agent's
// terminal with hc send, as typed there. The format is tested from bash (test/round.test.sh).
import { exec, hc, home, panes } from "herdr";
import { ROOT } from "../name.js";
import { sendableTo } from "../round.js";
import { followFolder } from "./follow.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Task} Task */
/** @typedef {import("../round.js").Round} Round */
/** @typedef {import("../round.js").RoundsState} RoundsState */
/** @typedef {import("../round.js").Side} Side */

const SCRIPT = `${ROOT}/bin/forge-round.sh`;
// A snapshot adds the whole worktree to a copy of the index: a big repository takes a while.
const TIMEOUT = Object.freeze({ change: 10_000, diff: 30_000, snap: 60_000 });
// forge-round.sh snap's exit when nothing changed since the last round.
const NOTHING_NEW = 3;

// forge: the default folder only, as the inbox's (bridges/inbox.js).
const folder = () => `${home()}/.local/state/forgerdr/rounds`;

/** forge-round.sh show prints the state, or null. @type {(text: string) => RoundsState | null} */
const parseRounds = JSON.parse;

/** forge-round.sh snap prints the round it made. @type {(text: string) => Round} */
const parseRound = JSON.parse;

/**
 * @param {string[]} args
 * @param {number} timeout
 */
const run = (args, timeout) => exec("bash", [SCRIPT, ...args], { timeout });

/** @param {{ code: number, stderr: string }} result */
const failure = (result) =>
  result.stderr.trim().replace(/^forgerdr: /, "") || `exit ${result.code}`;

/**
 * A terminal's rounds, or null when it has none. Throws, saying why, when they cannot be read.
 * @param {string} terminal
 * @returns {Promise<RoundsState | null>}
 */
export const readRounds = async (terminal) => {
  const result = await run(["show", terminal], TIMEOUT.change);
  if (result.code !== 0)
    throw new Error(`forge-round.sh show: ${failure(result)}`);
  return parseRounds(result.stdout);
};

/**
 * @param {AsyncContext} cx
 * @param {string} terminal
 * @param {(state: RoundsState | null) => void} take
 * @returns {Task}
 */
export const followRounds = (cx, terminal, take) =>
  followFolder(
    cx,
    { folder: folder(), read: () => readRounds(terminal), what: "the rounds" },
    take,
  );

/**
 * A round's unified diff: from the round before it, or from the base with `all`. Throws, saying why.
 * @param {string} terminal
 * @param {number} round
 * @param {boolean} all
 */
export const readRoundDiff = async (terminal, round, all) => {
  const result = await run(
    ["diff", terminal, String(round), ...(all ? ["all"] : [])],
    TIMEOUT.diff,
  );
  if (result.code !== 0)
    throw new Error(`forge-round.sh diff: ${failure(result)}`);
  return result.stdout;
};

/**
 * A snap's outcome: a new round; nothing new, with the last round when there is one; or a failure.
 * @typedef {{ kind: "made", round: Round } | { kind: "nothing", message: string, last: Round | null }
 *   | { kind: "failed", message: string }} Snapped
 */

/**
 * A new round of what the terminal's worktree holds now.
 * @param {string} terminal
 * @param {string} folder where its agent works, for a terminal with no base yet
 * @returns {Promise<Snapped>}
 */
export const snapRound = async (terminal, folder) => {
  try {
    const result = await run(["snap", terminal, folder], TIMEOUT.snap);
    if (result.code === 0)
      return { kind: "made", round: parseRound(result.stdout) };
    if (result.code === NOTHING_NEW)
      return {
        kind: "nothing",
        last: result.stdout.trim() === "" ? null : parseRound(result.stdout),
        message: failure(result),
      };
    return { kind: "failed", message: failure(result) };
  } catch (error) {
    return { kind: "failed", message: String(error) };
  }
};

/**
 * Runs one of the human's commands; what went wrong, or null.
 * @param {string[]} args
 * @returns {Promise<string | null>}
 */
const change = async (args) => {
  try {
    const result = await run(args, TIMEOUT.change);
    return result.code === 0 ? null : failure(result);
  } catch (error) {
    return String(error);
  }
};

/**
 * @typedef {object} NewComment
 * @property {number} round
 * @property {string} path
 * @property {Side} side
 * @property {number} line
 * @property {string} text the line's text
 * @property {string} body
 */

/**
 * @param {string} terminal
 * @param {NewComment} comment
 */
export const addComment = (terminal, comment) =>
  change(["comment", terminal, JSON.stringify(comment)]);

/**
 * @param {string} terminal
 * @param {string} id
 */
export const resolveComment = (terminal, id) =>
  change(["resolve", terminal, id]);

/**
 * @param {string} terminal
 * @param {string} id
 */
export const dropComment = (terminal, id) =>
  change(["uncomment", terminal, id]);

/**
 * @param {string} terminal
 * @param {number} round
 * @param {string} path
 * @param {boolean} on
 */
export const markViewed = (terminal, round, path, on) =>
  change(["viewed", terminal, String(round), path, on ? "on" : "off"]);

/**
 * @param {string} terminal
 * @param {number} round
 */
export const approveRound = (terminal, round) =>
  change(["approve", terminal, String(round)]);

/**
 * Types the feedback into the agent's terminal, as the human would, only while an agent is at its prompt there: a shell
 * would run it, a dialog would take its Enter as an answer. What went wrong, or null.
 * @param {string} terminal
 * @param {string} prompt
 */
export const sendToAgent = async (terminal, prompt) => {
  if (!sendableTo(panes().find((pane) => pane.terminal === terminal)))
    return "the agent is not at its prompt (it left, or it waits on you): nothing was sent";
  try {
    const result = await hc(["send", terminal, prompt]);
    return result.code === 0
      ? null
      : result.stderr.trim() || "the agent did not get it";
  } catch (error) {
    return String(error);
  }
};

/**
 * Sends a round's open comments to its agent and marks the round's changes requested; what went wrong, or null.
 * @param {string} terminal
 * @param {number} round
 * @param {string} prompt
 */
export const requestChanges = async (terminal, round, prompt) =>
  (await sendToAgent(terminal, prompt)) ??
  change(["request", terminal, String(round)]);
