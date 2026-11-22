// Special sessions, each parked behind a view of its own: one reviewing a pull request (bin/forge-review.sh) and one
// triaging a security review (bin/forge-security.sh). A review session is drawn as the reviewer golem and the sidebar
// lists it in its PULL REQUESTS group; a security session is drawn as the warden, under the session that launched it,
// reading TRIAGE. Each view's tab in the session bar carries the view's icon instead of the terminal's.
// Pure: Node tests it (test/herdr-specials.test.mjs).
import { counted } from "./format.js";
import { REVIEW_VIEW } from "./inbox.js";
import { FORGE_LABEL, GOLEM_KIND, parentOf, spaceOfTerminal } from "./lanes.js";

/** @typedef {import("./kit/sprites.js").GolemRole} GolemRole */
/** @typedef {import("./kit/sprites.js").IconName} IconName */
/** @typedef {import("./lanes.js").Lane} Lane */
/** @typedef {import("./lanes.js").LaneTerminal} LaneTerminal */
/** @typedef {import("./review.js").Review} Review */
/** @typedef {import("./review.js").ReviewKind} ReviewKind */
/** @typedef {import("herdr").AgentInfo} AgentInfo */
/** @typedef {import("herdr").SpaceInfo} SpaceInfo */

export const SPECIAL = Object.freeze({
  mine: "mine",
  review: "review",
  security: "security",
});

/** @typedef {typeof SPECIAL[keyof typeof SPECIAL]} Special */

/**
 * How a special session is drawn: its golem, the chip of its row in the sidebar (a review's in the PULL REQUESTS group, a
 * security session's in the tree and its lane) and its view's tab's icon.
 * @typedef {object} SpecialLook
 * @property {GolemRole} golem
 * @property {IconName} icon
 * @property {string} chip
 */

// The values of kit/sprites.js's GOLEM and ICON, which Node cannot load (it imports gpui-kit): the Record checks them.
/** @type {Readonly<Record<Special, Readonly<SpecialLook>>>} */
export const SPECIAL_LOOK = Object.freeze({
  mine: Object.freeze({
    chip: "THREADS",
    golem: "reviewer",
    icon: "pull-request",
  }),
  review: Object.freeze({
    chip: "TRIAGE",
    golem: "reviewer",
    icon: "pull-request",
  }),
  security: Object.freeze({ chip: "TRIAGE", golem: "warden", icon: "shield" }),
});

// The golem of a Claude session of its own.
/** @type {GolemRole} */
export const SESSION_GOLEM = "iron";

// The state herdr gives a terminal whose session ended (LaneTerminal.state).
const FINISHED = "finished";

// What a review's row shows for an author the pull request does not tell.
const UNKNOWN_AUTHOR = "?";

/** @type {ReadonlyMap<string, Special>} */
const SPECIAL_OF_VIEW = new Map([
  [REVIEW_VIEW.other, SPECIAL.review],
  [REVIEW_VIEW.own, SPECIAL.mine],
  [REVIEW_VIEW.security, SPECIAL.security],
]);

// The label that names the tab a special session's view lives in.
/** @type {Readonly<Record<Special, string>>} */
const TAB_LABEL = Object.freeze({
  mine: FORGE_LABEL.tab,
  review: FORGE_LABEL.tab,
  security: FORGE_LABEL.view,
});

/** @type {ReadonlySet<Special>} */
const REVIEWS = new Set([SPECIAL.mine, SPECIAL.review]);

/**
 * What special session a terminal holds, from its review label; null for any other.
 * @param {LaneTerminal | undefined} terminal
 * @returns {Special | null}
 */
export const specialOf = (terminal) =>
  SPECIAL_OF_VIEW.get(terminal?.labels?.[FORGE_LABEL.review] ?? "") ?? null;

/**
 * The golem a session is drawn as: a special session's (the reviewer, the warden) in place of its own, iron or stone; a
 * session that is not special keeps its role, and so does a subagent inside one (clay), which carries no labels.
 * @param {GolemRole} role
 * @param {Special | null} special
 * @returns {GolemRole}
 */
export const golemOf = (role, special) =>
  special === null || role === GOLEM_KIND.clay
    ? role
    : SPECIAL_LOOK[special].golem;

/**
 * The golem a terminal's session is drawn as: stone for an agent another session dispatched or launched (parentOf),
 * else iron, either in a special session's look (golemOf).
 * @param {LaneTerminal | undefined} terminal
 * @returns {GolemRole}
 */
export const terminalGolem = (terminal) =>
  golemOf(
    terminal !== undefined && parentOf(terminal)
      ? GOLEM_KIND.stone
      : SESSION_GOLEM,
    specialOf(terminal),
  );

/**
 * What the chip of a session's row in the agent tree and of its lane reads in place of its status: TRIAGE for a security
 * session; undefined, its status, for any other (a review's chip shows in the PULL REQUESTS group only).
 * @param {LaneTerminal | undefined} terminal
 * @returns {string | undefined}
 */
export const terminalChip = (terminal) =>
  specialOf(terminal) === SPECIAL.security
    ? SPECIAL_LOOK.security.chip
    : undefined;

/**
 * How a session's row in the agent tree, or its lane, is drawn: its golem and what its chip reads in place of its status.
 * @typedef {object} RowLook
 * @property {GolemRole} role
 * @property {string | undefined} chip undefined: its status
 */

/**
 * How a terminal's row in the agent tree is drawn: its golem (terminalGolem) and its chip (terminalChip), the warden
 * reading TRIAGE for a security session.
 * @param {LaneTerminal | undefined} terminal
 * @returns {RowLook}
 */
export const rowLook = (terminal) => ({
  chip: terminalChip(terminal),
  role: terminalGolem(terminal),
});

/**
 * How a lane is drawn: its terminal's row look (rowLook) for an agent in a terminal of its own; its own golem (clay) and
 * its status for a subagent inside a session, which has no terminal.
 * @param {Pick<Lane, "golem">} lane
 * @param {LaneTerminal | undefined} terminal
 * @returns {RowLook}
 */
export const laneLook = (lane, terminal) =>
  terminal === undefined
    ? { chip: undefined, role: lane.golem }
    : rowLook(terminal);

/**
 * @typedef {object} SpecialTab
 * @property {Special} special
 * @property {LaneTerminal} terminal
 */

/**
 * The special session whose view lives in a tab; null for no tab or a tab with no such view. A finished session's
 * terminal keeps its special: the view outlives its session.
 * @param {string} tab
 * @param {LaneTerminal[]} terminals
 * @returns {SpecialTab | null}
 */
export const specialTabOf = (tab, terminals) =>
  terminals
    .map((terminal) => ({ special: specialOf(terminal), terminal }))
    .find(
      ({ special, terminal }) =>
        tab !== "" &&
        special !== null &&
        terminal.labels?.[TAB_LABEL[special]] === tab,
    ) ?? null;

/** @type {Readonly<Record<ReviewKind, (review: Pick<Review, "pr" | "threads">) => string>>} */
const REVIEW_LINE = Object.freeze({
  other: ({ pr }) => `#${pr.number} review · @${pr.author || UNKNOWN_AUTHOR}`,
  own: ({ pr, threads }) =>
    `#${pr.number} mine · ${counted(threads.length, "thread")}`,
});

/**
 * A review's row in the PULL REQUESTS group: another's pull request and its author, or the user's own and its threads.
 * @param {Pick<Review, "kind" | "pr" | "threads">} review
 */
export const reviewLine = (review) => REVIEW_LINE[review.kind](review);

/** @type {Readonly<Record<ReviewKind, Special>>} */
const SPECIAL_OF_KIND = Object.freeze({
  other: SPECIAL.review,
  own: SPECIAL.mine,
});

/**
 * How a review's row in the PULL REQUESTS group is drawn: the look of its kind's special session.
 * @param {Pick<Review, "kind">} review
 */
export const reviewLook = (review) =>
  SPECIAL_LOOK[SPECIAL_OF_KIND[review.kind]];

/**
 * Whether a terminal holds a review session parked behind its view, which the sidebar lists in its PULL REQUESTS group,
 * not in the agent tree: a review's label (other, own) and its view's tab. A session whose label was cleared
 * (bin/forge-pr.sh results, a new session in the terminal) while the tab stays is back in the agent tree.
 * @param {LaneTerminal} terminal
 */
export const isParkedReview = (terminal) =>
  REVIEWS.has(specialOf(terminal)) &&
  Boolean(terminal.labels?.[FORGE_LABEL.tab]);

/**
 * The reviews whose session is parked behind its view in one of some spaces, in the order given; a review whose
 * session is unknown, finished, no longer parked (isParkedReview) or whose view's tab is gone is left out.
 * @param {Review[]} reviews
 * @param {LaneTerminal[]} terminals
 * @param {Pick<SpaceInfo, "id" | "tabs">[]} spaces
 * @param {string[]} spaceIds
 * @returns {Review[]}
 */
export const reviewsOfSpaces = (reviews, terminals, spaces, spaceIds) => {
  const byAddress = new Map(
    terminals.map((terminal) => [terminal.address, terminal]),
  );
  const shown = new Set(spaceIds);
  return reviews.filter((review) => {
    const terminal = byAddress.get(review.terminal);
    return (
      terminal !== undefined &&
      terminal.state !== FINISHED &&
      isParkedReview(terminal) &&
      shown.has(spaceOfTerminal(terminal, spaces))
    );
  });
};

/**
 * The sessions the agent tree shows of some: all but those the PULL REQUESTS group shows. A review session parked behind
 * its view whose review was not read yet, or is gone, stays in the tree, so it always shows somewhere.
 * @template {Pick<AgentInfo, "address">} Agent
 * @param {Agent[]} leads
 * @param {Pick<Review, "terminal">[]} pullRequests the group's rows (reviewsOfSpaces)
 * @returns {Agent[]}
 */
export const treeLeads = (leads, pullRequests) => {
  const grouped = new Set(pullRequests.map((review) => review.terminal));
  return leads.filter((lead) => !grouped.has(lead.address));
};
