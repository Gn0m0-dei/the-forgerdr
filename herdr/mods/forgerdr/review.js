// The review view (designs 06b and 06c): a pull request as the review session beside it reports it through
// bin/forge-pr.sh (references/reviews.md), and what the view answers that session. A review of another's pull request
// is findings to pick, grouped by severity, and comments drafted from them; a review of the user's own is its open
// threads, each with what to do about it, and the replies drafted. The session asks for the picks with a question
// headed "Review pick" and for the publishing with its comment gate; the view answers both through the inbox.
// Pure: Node tests it (test/herdr-review.test.mjs).
import { questionAnswer, questionsOf, REVIEW_ASK_HEADER } from "./inbox.js";

/** @typedef {import("./inbox.js").InboxAnswer} InboxAnswer */
/** @typedef {import("./inbox.js").InboxRequest} InboxRequest */
/** @typedef {import("./inbox.js").Question} Question */
/** @typedef {import("./lanes.js").LaneTerminal} LaneTerminal */
/** @typedef {import("herdr").PaneInfo} PaneInfo */
/** @typedef {import("herdr").SpaceInfo} SpaceInfo */

export const REVIEW_KIND = Object.freeze({ other: "other", own: "own" });

/** @typedef {typeof REVIEW_KIND[keyof typeof REVIEW_KIND]} ReviewKind */

export const SEVERITY = Object.freeze({
  blocker: "blocker",
  info: "info",
  nit: "nit",
  question: "question",
  should: "should",
});

/** @typedef {typeof SEVERITY[keyof typeof SEVERITY]} Severity */

// The severities in the order the view groups them, the most serious first.
/** @type {readonly Severity[]} */
export const SEVERITY_ORDER = Object.freeze([
  SEVERITY.blocker,
  SEVERITY.should,
  SEVERITY.nit,
  SEVERITY.question,
  SEVERITY.info,
]);

export const PROPOSAL = Object.freeze({
  ask: "ask",
  fix: "fix",
  reply: "reply",
});

/** @typedef {typeof PROPOSAL[keyof typeof PROPOSAL]} Proposal */

export const RESULT = Object.freeze({
  duplicate: "duplicate",
  failed: "failed",
  open: "open",
  published: "published",
  resolved: "resolved",
});

/** @typedef {typeof RESULT[keyof typeof RESULT]} ResultStatus */

// Where a thread of the user's own pull request stands after the stamp: what publishing did with it, or not done yet
// though picked, or not acted on this round.
export const ROW_STATE = Object.freeze({
  ...RESULT,
  pending: "pending",
  unacted: "unacted",
});

/** @typedef {typeof ROW_STATE[keyof typeof ROW_STATE]} RowState */

// What the session waits on the view for: the findings or threads picked, or the stamp on its drafts.
export const ASK = Object.freeze({ gate: "gate", pick: "pick" });

/** @typedef {typeof ASK[keyof typeof ASK]} AskKind */

/** @type {Readonly<Record<string, AskKind>>} */
const ASK_OF_HEADER = Object.freeze({
  [REVIEW_ASK_HEADER.gate]: ASK.gate,
  [REVIEW_ASK_HEADER.pick]: ASK.pick,
});

// The answers the session reads (references/reviews.md): the picks or none; at the comment gate, the yes, nothing to
// publish, or more rows to draft.
export const ANSWER = Object.freeze({
  hold: "Not yet",
  more: "Draft also: ",
  none: "None",
  picked: "Picked: ",
  publish: "Publish",
});

/**
 * @typedef {object} PullRequest
 * @property {string} url
 * @property {string} number
 * @property {string} title
 * @property {string} source
 * @property {string} target
 * @property {string} author
 * @property {string[]} items
 * @property {number} files
 * @property {number} additions
 * @property {number} deletions
 * @property {string} checks
 */

/**
 * @typedef {object} FindingContext
 * @property {number} start the first line's number
 * @property {string[]} lines
 * @property {number} mark the line the finding is on
 */

/**
 * @typedef {object} Finding
 * @property {string} id
 * @property {Severity} severity
 * @property {string} path "" for the pull request itself
 * @property {number | null} line
 * @property {string} title
 * @property {string} rule
 * @property {string} happens
 * @property {string} change
 * @property {string} refactor
 * @property {FindingContext | null} context
 * @property {string} group findings with the same rule and fix share it
 * @property {boolean} discarded the human usually discards its rule
 */

/**
 * @typedef {object} Thread
 * @property {string} id
 * @property {string} author
 * @property {string} path
 * @property {number | null} line
 * @property {string} request
 * @property {Proposal} proposal
 * @property {string} detail
 * @property {string} commit
 * @property {string} subject
 * @property {string} tests
 */

/**
 * @typedef {object} Location
 * @property {string} path
 * @property {number | null} line
 */

/**
 * @typedef {object} Draft
 * @property {string} id
 * @property {Location[]} locations
 * @property {string} body
 * @property {string} suggestion
 * @property {boolean} resolve
 */

/**
 * @typedef {object} Result
 * @property {string} id
 * @property {string} path
 * @property {number | null} line
 * @property {ResultStatus} status
 * @property {string} url
 * @property {string} reason
 * @property {string} action
 * @property {string} commit
 */

/**
 * A terminal's review, as bin/forge-pr.sh show prints it.
 * @typedef {object} Review
 * @property {string} terminal
 * @property {ReviewKind} kind
 * @property {number} updated
 * @property {PullRequest} pr
 * @property {Finding[]} findings
 * @property {Thread[]} threads
 * @property {string[]} picked
 * @property {Draft[]} drafts
 * @property {number} drafted when the drafts were sent, in ms; 0 before any
 * @property {string} session the Claude session that asked for the picks, "" until the view saw it
 * @property {{ at: number, drafts: Draft[] } | null} stamped
 * @property {Result[]} results
 */

/**
 * One row to pick: a finding, or the findings that share a rule and a fix, which publish a thread each.
 * @typedef {object} FindingRow
 * @property {string} id its findings' ids, joined by "-"
 * @property {Severity} severity
 * @property {Finding[]} findings
 * @property {boolean} discarded
 */

/** @typedef {{ severity: Severity, rows: FindingRow[] }} FindingGroup */

/**
 * The findings as rows grouped by severity, the most serious first, each group in the order the skill reported them;
 * findings sharing a group are one row, where the first of them stands. The rows the human usually discards go last
 * in their group. Severities with no finding are left out.
 * @param {Finding[]} findings
 * @returns {FindingGroup[]}
 */
export const findingGroups = (findings) =>
  SEVERITY_ORDER.map((severity) => {
    /** @type {Map<string, Finding[]>} */
    const rows = new Map();
    for (const finding of findings.filter((one) => one.severity === severity)) {
      const key =
        finding.group === "" ? `id:${finding.id}` : `group:${finding.group}`;
      rows.set(key, [...(rows.get(key) ?? []), finding]);
    }
    const all = [...rows.values()].map((members) => ({
      discarded: members.every((one) => one.discarded),
      findings: members,
      id: members.map((one) => one.id).join("-"),
      severity,
    }));
    return {
      rows: [
        ...all.filter((row) => !row.discarded),
        ...all.filter((row) => row.discarded),
      ],
      severity,
    };
  }).filter((group) => group.rows.length > 0);

/**
 * @param {Finding[]} findings
 * @returns {Record<Severity, number>}
 */
export const findingCounts = (findings) => ({
  blocker: findings.filter((one) => one.severity === SEVERITY.blocker).length,
  info: findings.filter((one) => one.severity === SEVERITY.info).length,
  nit: findings.filter((one) => one.severity === SEVERITY.nit).length,
  question: findings.filter((one) => one.severity === SEVERITY.question).length,
  should: findings.filter((one) => one.severity === SEVERITY.should).length,
});

/**
 * The answer to the comment gate when rows were ticked after the drafts: draft these too, then ask again.
 * @param {string[]} ids
 */
export const moreAnswer = (ids) => `${ANSWER.more}${ids.join(", ")}`;

/**
 * The answer to the session's "Review pick": the rows picked, by id, or none.
 * @param {string[]} ids
 */
export const pickAnswer = (ids) =>
  ids.length > 0 ? `${ANSWER.picked}${ids.join(", ")}` : ANSWER.none;

// Words that name AI or its tools: nothing published on a pull request may (the review skills' hard limit). The
// capitalised ones are matched as written, so "ai" in code or "aid" never count.
const TOOLING = Object.freeze([
  /\b(?:AI|LLMs?)\b/g,
  /\b(?:ChatGPT|GPT(?:-\d+(?:\.\d+)?)?|Claude|Anthropic|Copilot|OpenAI|Gemini|language models?|generated by|co-authored-by)\b/gi,
]);

/**
 * The words of a text that name AI or its tools, in the order they appear, each once.
 * @param {string} text
 * @returns {string[]}
 */
export const toolingMentions = (text) => {
  const found = TOOLING.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => ({
      at: match.index ?? 0,
      word: match[0],
    })),
  ).sort((one, other) => one.at - other.at);
  return [...new Set(found.map((one) => one.word))];
};

/**
 * The drafts that cannot be stamped, with the words that keep them back: nothing published may name AI or its tools
 * (the review skills' hard limit).
 * @param {Pick<Draft, "id" | "body" | "suggestion">[]} drafts
 * @returns {{ id: string, words: string[] }[]}
 */
export const stampBlockers = (drafts) =>
  drafts
    .map((draft) => ({
      id: draft.id,
      words: toolingMentions(`${draft.body}\n${draft.suggestion}`),
    }))
    .filter((blocked) => blocked.words.length > 0);

/**
 * @typedef {object} PendingAsk
 * @property {AskKind} kind
 * @property {InboxRequest} request
 * @property {Question} question
 */

/**
 * Whether a comment gate was asked for the drafts the review holds (none, when the human dropped them all): by the
 * session that asked for the picks, nothing published yet, after they were drafted and, once stamped, before the stamp
 * (its answer failed and is given again). A gate asked for anything else (another session resumed in the terminal, a comment on a work
 * item) is never answered from the view; with no session known, none is.
 * @param {InboxRequest} request
 * @param {Pick<Review, "drafts" | "drafted" | "stamped" | "results" | "session"> | null} review
 * @param {string} seen the session the view saw ask for the picks, when the review does not keep it
 */
const gateForDrafts = (request, review, seen) =>
  review !== null &&
  (review.session || seen) !== "" &&
  request.session_id === (review.session || seen) &&
  review.results.length === 0 &&
  request.created >= review.drafted &&
  (review.stamped === null || request.created <= review.stamped.at);

/**
 * What the review session in a terminal waits on the view for: its oldest question headed "Review pick", or its
 * comment gate when it was asked for the drafts the view shows; null when it waits for neither.
 * @param {InboxRequest[]} requests
 * @param {string} terminal
 * @param {Pick<Review, "drafts" | "drafted" | "stamped" | "results" | "session"> | null} review
 * @param {string} [seen] the session the view saw ask for the picks
 * @returns {PendingAsk | null}
 */
export const pendingAsk = (requests, terminal, review, seen = "") => {
  for (const request of [...requests].sort(
    (one, other) => one.created - other.created,
  )) {
    const question = questionsOf(request)[0];
    const kind = ASK_OF_HEADER[question?.header ?? ""];
    if (
      request.terminal === terminal &&
      kind !== undefined &&
      question !== undefined &&
      (kind === ASK.pick || gateForDrafts(request, review, seen))
    )
      return { kind, question, request };
  }
  return null;
};

/**
 * The inbox answer that gives the session's question a text.
 * @param {PendingAsk} ask
 * @param {string} text
 * @returns {InboxAnswer}
 */
export const askAnswer = (ask, text) =>
  questionAnswer({ [ask.question.question]: text });

/**
 * A location as the view names it: its file and line, or the pull request itself.
 * @param {Location} location
 */
export const locationLabel = ({ path, line }) => {
  if (path === "") return "pull request";
  const file = path.split("/").at(-1) ?? path;
  return line === null ? file : `${file}:${line}`;
};

/**
 * Several locations in a line, file by file in the order they come, the lines of one file together: a grouped finding's
 * places, which would not fit one after the other.
 * @param {Location[]} locations
 */
export const locationsLabel = (locations) => {
  /** @type {Map<string, number[]>} */
  const byFile = new Map();
  for (const { path, line } of locations) {
    const lines = byFile.get(path) ?? [];
    byFile.set(path, line === null ? lines : [...lines, line]);
  }
  return [...byFile]
    .map(([path, lines]) =>
      path === "" || lines.length === 0
        ? locationLabel({ line: null, path })
        : `${locationLabel({ line: null, path })}:${lines.join(", ")}`,
    )
    .join(" · ");
};

/**
 * A location whole, as a draft publishes it: its path and line, or the pull request itself.
 * @param {Location} location
 */
export const locationPath = ({ path, line }) => {
  if (path === "") return "pull request";
  return line === null ? path : `${path}:${line}`;
};

/**
 * @typedef {object} OwnRow
 * @property {string} id
 * @property {Location} location
 * @property {Proposal | ""} action what was done, "" when the thread was not picked
 * @property {string} commit
 * @property {RowState} state
 * @property {string} url
 */

/**
 * The threads of the user's own pull request after the stamp: for each, what was done, its commit and where it
 * stands, from what publishing reported.
 * @param {Pick<Review, "threads" | "picked" | "results">} review
 * @returns {OwnRow[]}
 */
export const ownRows = ({ threads, picked, results }) =>
  threads.map((thread) => {
    const result = results.find((one) => one.id === thread.id);
    const acted = picked.includes(thread.id);
    return {
      action: acted ? thread.proposal : "",
      commit: result?.commit ?? (acted ? thread.commit : ""),
      id: thread.id,
      location: { line: thread.line, path: thread.path },
      state: result?.status ?? (acted ? ROW_STATE.pending : ROW_STATE.unacted),
      url: result?.url ?? "",
    };
  });

/**
 * Whether the review may close its tab once every thread is published: the tab holds its view alone (no terminal the
 * human opened beside it) and is not the last of its space, which would close the space too.
 * @param {string} tab
 * @param {Pick<PaneInfo, "tab" | "terminal">[]} panes
 * @param {{ id: string, tabs: { id: string }[] }[]} spaces
 */
export const closableReviewTab = (tab, panes, spaces) => {
  if (tab === "") return false;
  const inTab = panes.filter((pane) => pane.tab === tab);
  const space = spaces.find((one) => one.tabs.some((each) => each.id === tab));
  return (
    inTab.length === 1 &&
    inTab.every((pane) => pane.terminal === null) &&
    space !== undefined &&
    space.tabs.length > 1
  );
};

// A session's turn is over: it waits for the next prompt, or finished it while nobody was looking.
const TURN_OVER = new Set(["idle", "done"]);

/**
 * Whether the review session's turn is over: idle or done, or its terminal gone; never while it works or waits on the
 * human (a permission, a question).
 * @param {LaneTerminal | undefined} terminal
 */
export const turnOver = (terminal) =>
  terminal === undefined ||
  terminal.state === "finished" ||
  TURN_OVER.has(terminal.status ?? "");
