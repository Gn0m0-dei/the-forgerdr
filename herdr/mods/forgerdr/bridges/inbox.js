// The approval inbox's requests, answers and dismissals, through bin/forge-inbox.sh (a mod cannot list a folder), and
// whether its drawer shows: its block in the layout, which the top bar's INBOX and forgerdr.inbox toggle, with the
// state and when it last opened in shared, so the drawer knows when it opened whichever copy opened it. The requests
// are hooks/inbox.sh's (forge_inbox_dir); the format is tested from bash (test/inbox.test.sh).
import { exec, home, run, setShared, shared } from "herdr";
import { ROOT } from "../name.js";
import { followFolder } from "./follow.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Task} Task */
/** @typedef {import("../inbox.js").InboxAnswer} InboxAnswer */
/** @typedef {import("../inbox.js").InboxRequest} InboxRequest */

const SCRIPT = `${ROOT}/bin/forge-inbox.sh`;
const TIMEOUT = 10_000;
const OPEN_KEY = "forgerdr.inbox.open";
const SHOWN_KEY = "forgerdr.inbox.shown";

// The drawer's block in herdr/layouts/forgerdr.json.
export const INBOX_BLOCK = "inbox";

// forge: the default folder only; a mod cannot read XDG_STATE_HOME or FORGE_INBOX_DIR, which forge_inbox_dir honours, so
// with either set the hook and the drawer part ways. Have forge-inbox.sh print its folder if that ever matters.
const folder = () => `${home()}/.local/state/forgerdr/inbox`;

/** forge-inbox.sh list prints the requests as their hook wrote them. @type {(text: string) => InboxRequest[]} */
const parseRequests = JSON.parse;

/**
 * What waits in the inbox, oldest first. Throws, saying why, when it cannot be read.
 * @returns {Promise<InboxRequest[]>}
 */
export const readInbox = async () => {
  const result = await exec("bash", [SCRIPT, "list"], { timeout: TIMEOUT });
  if (result.code !== 0)
    throw new Error(
      `forge-inbox.sh list: ${result.stderr.trim() || `exit ${result.code}`}`,
    );
  return parseRequests(result.stdout);
};

/**
 * Runs forge-inbox.sh with `args`, for an answer or a dismissal: what went wrong, or null.
 * @param {string[]} args
 * @param {string} failure what it says when the script fails without a word
 * @returns {Promise<string | null>}
 */
const tellInbox = async (args, failure) => {
  try {
    const result = await exec("bash", [SCRIPT, ...args], { timeout: TIMEOUT });
    return result.code === 0 ? null : result.stderr.trim() || failure;
  } catch (error) {
    return String(error);
  }
};

/**
 * Hands an answer to the hook waiting on request `id`; what went wrong, or null.
 * @param {string} id
 * @param {InboxAnswer} answer
 */
export const answerInbox = (id, answer) =>
  tellInbox(["answer", id, JSON.stringify(answer)], "not answered");

/**
 * Takes request `id` out of the inbox with no answer: its pane's own dialog still asks it. What went wrong, or null.
 * @param {string} id
 */
export const dismissInbox = (id) => tellInbox(["dismiss", id], "not dismissed");

/**
 * Reads the inbox now and again on every change in its folder, handing each read to `take`, until the copy closes.
 * @param {AsyncContext} cx
 * @param {(requests: InboxRequest[]) => void} take
 * @returns {Task}
 */
export const followInbox = (cx, take) =>
  followFolder(
    cx,
    { folder: folder(), read: readInbox, what: "the inbox" },
    take,
  );

export const inboxOpen = () => shared(OPEN_KEY) === true;

/** When the drawer last opened, in ms (kept across restarts, as shared is); 0 when it never has. */
export const inboxShownAt = () => {
  const at = shared(SHOWN_KEY);
  return typeof at === "number" ? at : 0;
};

export const toggleInbox = () => {
  const open = !inboxOpen();
  if (open) setShared(SHOWN_KEY, Date.now());
  setShared(OPEN_KEY, open);
  run(open ? "layout.show" : "layout.hide", { id: INBOX_BLOCK });
};
