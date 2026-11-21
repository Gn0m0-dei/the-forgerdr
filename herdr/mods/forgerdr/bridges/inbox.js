// The approval inbox's requests and answers, through bin/forge-inbox.sh (a mod cannot list a folder), and whether its
// drawer shows: its block in the layout, which the top bar's INBOX and forgerdr.inbox toggle, with the state in shared
// so the drawer knows when it opened. The requests are hooks/inbox.sh's (forge_inbox_dir); the format is tested from
// bash (test/inbox.test.sh).
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
 * Hands an answer to the hook waiting on request `id`; what went wrong, or null.
 * @param {string} id
 * @param {InboxAnswer} answer
 * @returns {Promise<string | null>}
 */
export const answerInbox = async (id, answer) => {
  try {
    const result = await exec(
      "bash",
      [SCRIPT, "answer", id, JSON.stringify(answer)],
      { timeout: TIMEOUT },
    );
    return result.code === 0 ? null : result.stderr.trim() || "not answered";
  } catch (error) {
    return String(error);
  }
};

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

export const toggleInbox = () => {
  const open = !inboxOpen();
  setShared(OPEN_KEY, open);
  run(open ? "layout.show" : "layout.hide", { id: INBOX_BLOCK });
};
