// The approval inbox (design 05): what waits on the human's mark, a card each. A card is a request hooks/inbox.sh put in
// the inbox for a Claude Code permission dialog (bin/forge-inbox.sh lists them): a tool's permission, a question, one of
// forgerdr's gates (a question headed "Gate ...") or a plan; or an agent herdr reports blocked with no request, such as
// a session started before forgerdr's hook, which waits in its pane. The answers are the ones hooks/inbox.sh takes.
// Pure: Node tests it (test/herdr-mod.test.mjs).
import { parentOf } from "./lanes.js";

/** @typedef {import("gpui-kit").Point} Point */
/** @typedef {import("gpui-kit").Size} Size */
/** @typedef {import("herdr").PaneInfo} PaneInfo */
/** @typedef {import("herdr").SpaceInfo} SpaceInfo */
/** @typedef {import("./forges.js").Forge} Forge */
/** @typedef {import("./lanes.js").LaneTerminal} LaneTerminal */

export const INBOX_KIND = Object.freeze({
  gate: "gate",
  permission: "permission",
  plan: "plan",
  question: "question",
  waiting: "waiting",
});

/** @typedef {typeof INBOX_KIND[keyof typeof INBOX_KIND]} InboxKind */

// The inbox's tabs, each with the kinds it shows: all of them, waiting agents included, or one.
export const FILTER = Object.freeze({
  all: "all",
  gates: "gates",
  permissions: "permissions",
  plans: "plans",
  questions: "questions",
});

/** @typedef {typeof FILTER[keyof typeof FILTER]} InboxFilter */

// The tabs in the design's order.
/** @type {readonly InboxFilter[]} */
export const FILTER_ORDER = Object.freeze([
  FILTER.all,
  FILTER.permissions,
  FILTER.questions,
  FILTER.plans,
  FILTER.gates,
]);

/** @type {Readonly<Record<InboxFilter, readonly InboxKind[]>>} */
const FILTER_KINDS = Object.freeze({
  all: Object.values(INBOX_KIND),
  gates: [INBOX_KIND.gate],
  permissions: [INBOX_KIND.permission],
  plans: [INBOX_KIND.plan],
  questions: [INBOX_KIND.question],
});

// The mode a plan's session takes once it is approved, as Claude Code's own dialog offers them.
export const PLAN_MODE = Object.freeze({ auto: "auto", manual: "default" });

/** @typedef {typeof PLAN_MODE[keyof typeof PLAN_MODE]} PlanMode */

/**
 * One option of a question, as AskUserQuestion takes it.
 * @typedef {object} QuestionOption
 * @property {string} label
 * @property {string} [description]
 * @property {string} [preview] a draft or a mockup shown beside it
 */

/**
 * @typedef {object} Question
 * @property {string} question
 * @property {string} [header]
 * @property {QuestionOption[]} options
 * @property {boolean} [multiSelect]
 */

/**
 * A request as hooks/inbox.sh writes it.
 * @typedef {object} InboxRequest
 * @property {string} id
 * @property {Exclude<InboxKind, "waiting">} kind
 * @property {string} terminal the herdr terminal its session runs in
 * @property {string} session_id
 * @property {string} agent_type the subagent asking, when one inside the session does
 * @property {string} cwd
 * @property {string} tool_name
 * @property {ToolInput} tool_input
 * @property {number} created ms
 * @property {boolean} [cut] some text was too long to list whole (bin/forge-inbox.sh), so it is never approved here
 */

/**
 * A tool's input as Claude Code sent it: AskUserQuestion's questions, ExitPlanMode's plan, any other tool's own.
 * @typedef {Record<string, unknown> & { questions?: Question[], plan?: string }} ToolInput
 */

/**
 * @typedef {object} InboxCard
 * @property {string} id the request's, or waiting:<terminal>
 * @property {InboxKind} kind
 * @property {string} terminal
 * @property {number} since when it started to wait, in ms
 * @property {InboxRequest | null} request none for an agent waiting in its pane
 */

/**
 * What a card says it asks: its lead line (a command, a file, a question), a detail under it and a note in words.
 * @typedef {object} InboxSummary
 * @property {string} lead
 * @property {string} detail
 * @property {string} note
 */

/**
 * An answer hooks/inbox.sh takes: an allow, a deny with an optional reason, a question's answers or a plan's mode.
 * @typedef {{ behavior: "allow" } | { behavior: "deny", message?: string }
 *   | { behavior: "allow", answers: Record<string, string> } | { behavior: "allow", mode: PlanMode }} InboxAnswer
 */

/** Picked options, by question index: their labels, in the options' order. @typedef {Record<number, string[]>} Picks */
/** What the human typed instead, by question index. @typedef {Record<number, string>} OtherAnswers */

const SECOND = 1000;
const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 3600;
// How long a card is open before a click on it can approve it: a double click, or a card that moved under the pointer,
// never approves what the human did not see.
export const ARM_MS = 500;
const GATE_HEADER = /^Gate /;

/**
 * What the cards are drawn with besides the requests and the terminals.
 * @typedef {object} CardsContext
 * @property {Set<string>} [quiet] terminals whose request has just gone
 * @property {Map<string, number>} [seen] when the inbox first saw each terminal blocked, in ms
 * @property {number} [now] ms: when a blocked terminal not seen yet started to wait
 */

/**
 * The cards, the newest first: a request each while its session's terminal is live, and an agent blocked with none,
 * unless its request has just gone: the app reports it blocked a moment longer, and it would flash up as waiting. An
 * agent has waited since its status changed when the app says so, else since the inbox first saw it blocked.
 * @param {InboxRequest[]} requests
 * @param {LaneTerminal[]} terminals
 * @param {CardsContext} [context]
 * @returns {InboxCard[]}
 */
export const cardsOf = (
  requests,
  terminals,
  { quiet = new Set(), seen = new Map(), now = 0 } = {},
) => {
  const live = terminals.filter((terminal) => terminal.state !== "finished");
  const asked = requests.filter((request) =>
    live.some((terminal) => terminal.address === request.terminal),
  );
  const askers = new Set(asked.map((request) => request.terminal));
  return [
    ...asked.map((request) => ({
      id: request.id,
      kind: request.kind,
      request,
      since: request.created,
      terminal: request.terminal,
    })),
    ...live
      .filter(
        (terminal) =>
          terminal.status === "blocked" &&
          !askers.has(terminal.address) &&
          !quiet.has(terminal.address),
      )
      .map((terminal) => ({
        id: `waiting:${terminal.address}`,
        kind: INBOX_KIND.waiting,
        request: null,
        since: terminal.status_ms ?? seen.get(terminal.address) ?? now,
        terminal: terminal.address,
      })),
  ].sort((one, other) => other.since - one.since);
};

// How long a session whose request went stays out of the waiting cards, while the app catches up with its status.
const QUIET_MS = 3000;

/**
 * The sessions to keep quiet, by terminal and until when: the ones still quiet, and those whose request went between
 * two reads of the inbox.
 * @param {Map<string, number>} quiet
 * @param {InboxRequest[]} before
 * @param {InboxRequest[]} after
 * @param {number} now ms
 * @returns {Map<string, number>}
 */
export const quietAfter = (quiet, before, after, now) => {
  const left = new Set(after.map((request) => request.id));
  /** @type {Map<string, number>} */
  const next = new Map([...quiet].filter(([, until]) => until > now));
  for (const request of before)
    if (!left.has(request.id)) next.set(request.terminal, now + QUIET_MS);
  return next;
};

/**
 * The terminals quiet now.
 * @param {Map<string, number>} quiet
 * @param {number} now ms
 */
export const quietNow = (quiet, now) =>
  new Set(
    [...quiet].filter(([, until]) => until > now).map(([terminal]) => terminal),
  );

/**
 * @param {InboxCard[]} cards
 * @param {InboxFilter} filter
 */
export const shownIn = (cards, filter) =>
  cards.filter((card) => FILTER_KINDS[filter].includes(card.kind));

/**
 * How many cards each tab shows.
 * @param {InboxCard[]} cards
 * @returns {Record<InboxFilter, number>}
 */
export const countsOf = (cards) => ({
  all: shownIn(cards, FILTER.all).length,
  gates: shownIn(cards, FILTER.gates).length,
  permissions: shownIn(cards, FILTER.permissions).length,
  plans: shownIn(cards, FILTER.plans).length,
  questions: shownIn(cards, FILTER.questions).length,
});

/** @param {unknown} value */
const textOf = (value) => (typeof value === "string" ? value : "");

/**
 * The fields of a tool's input the lines above them do not show, whole, so an allow never applies one unseen: a text
 * under its name, anything else as JSON after it.
 * @param {Record<string, unknown>} input
 * @param {readonly string[]} shown
 */
// Characters a text can hide behind, which a card spells out (\u{202E}) instead of drawing: zero-width and joiners, bidi
// controls, soft hyphens, fillers, variation selectors, line and paragraph separators, the byte order mark, tag
// characters, and control characters but a tab and a new line.
const HIDDEN =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it finds, to spell them out
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u061C\u115F-\u1160\u180E\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u206F\u3164\uFEFF\uFFA0\uFFF9-\uFFFB]|\u034F|\uFE00|\uFE01|\uFE02|\uFE03|\uFE04|\uFE05|\uFE06|\uFE07|\uFE08|\uFE09|\uFE0A|\uFE0B|\uFE0C|\uFE0D|\uFE0E|\uFE0F|[\u{E0000}-\u{E007F}]|[\u{E0100}-\u{E01EF}]/gu;

/**
 * A text with nothing invisible in it: what hides is spelt out, so an allow never applies a character it did not show.
 * @param {string} text
 */
export const visible = (text) =>
  text.replace(
    HIDDEN,
    (hidden) =>
      `\\u{${(hidden.codePointAt(0) ?? 0).toString(16).toUpperCase()}}`,
  );

const fieldsOf = (input, shown) =>
  Object.entries(input)
    .filter(([key]) => !shown.includes(key))
    .map(([key, value]) =>
      typeof value === "string"
        ? `${key}:\n${value}`
        : `${key}: ${JSON.stringify(value)}`,
    )
    .join("\n\n");

/**
 * An MCP tool's server and tool: mcp__pencil__execute → ["pencil", "execute"]; null for Claude Code's own tools.
 * @param {string} toolName
 */
const mcpOf = (toolName) => {
  const [prefix, server, ...tool] = toolName.split("__");
  return prefix === "mcp" && server !== undefined && tool.length > 0
    ? [server, tool.join("__")]
    : null;
};

/**
 * The questions a question or a gate asks.
 * @param {InboxRequest} request
 * @returns {Question[]}
 */
export const questionsOf = (request) => {
  const { questions } = request.tool_input;
  return Array.isArray(questions) ? questions : [];
};

// What a review session with a view beside it asks there instead (bin/forge-review.sh, roles/review.js): its picks and
// its comment gate. Its terminal carries the label bin/forge-pr.sh open sets.
export const REVIEW_ASK_HEADER = Object.freeze({
  gate: "Gate comment",
  pick: "Review pick",
});
const REVIEW_LABEL = "forge.review";
// The tab of a review session's view, which bin/forge-review.sh labels the session's terminal with.
const REVIEW_TAB_LABEL = "forge.tab";

/**
 * The tab of the review view a session's terminal was opened for, or "" when it has none.
 * @param {string} terminal
 * @param {LaneTerminal[]} terminals
 */
export const reviewTabOf = (terminal, terminals) =>
  terminals.find((one) => one.address === terminal)?.labels?.[
    REVIEW_TAB_LABEL
  ] ?? "";
/** @type {ReadonlySet<string>} */
const REVIEW_HEADERS = new Set(Object.values(REVIEW_ASK_HEADER));

/**
 * Whether a request waits in a review view rather than in the inbox: a review session's picks or comment gate, from a
 * terminal its view was opened for.
 * @param {InboxRequest} request
 * @param {LaneTerminal[]} terminals
 */
export const reviewAskOf = (request, terminals) => {
  const header = questionsOf(request)[0]?.header ?? "";
  const viewed = terminals.some(
    (terminal) =>
      terminal.address === request.terminal &&
      (terminal.labels?.[REVIEW_LABEL] ?? "") !== "",
  );
  return viewed && REVIEW_HEADERS.has(header);
};

/** @param {string} plan its first line with words, without the heading's marks */
const planTitle = (plan) =>
  (plan.split("\n").find((line) => line.trim() !== "") ?? "")
    .replace(/^#+\s*/, "")
    .trim();

/**
 * Which field of a tool's input is a card's lead line, and which its note in words; every other one is its detail.
 * @typedef {object} ToolFields
 * @property {string} lead
 * @property {string} [note]
 */

/** @type {Readonly<Record<string, ToolFields>>} */
const TOOL_FIELDS = Object.freeze({
  Bash: { lead: "command", note: "description" },
  Edit: { lead: "file_path" },
  Glob: { lead: "pattern" },
  Grep: { lead: "pattern" },
  MultiEdit: { lead: "file_path" },
  NotebookEdit: { lead: "notebook_path" },
  Read: { lead: "file_path" },
  WebFetch: { lead: "url", note: "prompt" },
  WebSearch: { lead: "query" },
  Write: { lead: "file_path" },
});

/** @param {InboxRequest} request */
const planSummary = (request) => {
  const plan = textOf(request.tool_input.plan);
  return { detail: plan, lead: planTitle(plan), note: "" };
};

/** @param {InboxRequest} request */
const questionSummary = (request) => ({
  detail: "",
  lead: questionsOf(request)[0]?.question ?? "",
  note: "",
});

/**
 * A tool's permission: its lead and note from the fields that read as one, every other field in the detail.
 * @param {InboxRequest} request
 * @returns {InboxSummary}
 */
const permissionSummary = (request) => {
  const { tool_input: input, tool_name: tool } = request;
  const fields = TOOL_FIELDS[tool];
  if (fields === undefined) {
    const mcp = mcpOf(tool);
    return {
      detail: fieldsOf(input, []),
      lead: mcp === null ? tool : `${mcp[0]} · ${mcp[1]}`,
      note: "",
    };
  }
  const where =
    tool === "Bash" && request.cwd !== "" ? `cwd ${request.cwd}` : "";
  return {
    detail: [where, fieldsOf(input, [fields.lead, fields.note ?? ""])]
      .filter((part) => part !== "")
      .join("\n\n"),
    lead: textOf(input[fields.lead]),
    note: fields.note === undefined ? "" : textOf(input[fields.note]),
  };
};

/** @type {Readonly<Record<Exclude<InboxKind, "waiting">, (request: InboxRequest) => InboxSummary>>} */
const SUMMARY = Object.freeze({
  gate: questionSummary,
  permission: permissionSummary,
  plan: planSummary,
  question: questionSummary,
});

/**
 * What a request asks, in a line, a detail and a note, with nothing invisible in them.
 * @param {InboxRequest} request
 * @returns {InboxSummary}
 */
export const summaryOf = (request) => {
  const { detail, lead, note } = SUMMARY[request.kind](request);
  return { detail: visible(detail), lead: visible(lead), note: visible(note) };
};

/** @type {Readonly<Record<InboxKind, (request: InboxRequest | null) => string>>} */
const HEADING = Object.freeze({
  gate: (request) =>
    `GATE · ${(questionsOf(request)[0]?.header ?? "").replace(GATE_HEADER, "").toUpperCase()}`,
  permission: (request) =>
    `PERMISSION · ${(mcpOf(request.tool_name)?.[0] ?? request.tool_name).toUpperCase()}`,
  plan: () => "PLAN · EXITPLANMODE",
  question: (request) => {
    const questions = questionsOf(request);
    return questions.length > 1
      ? `QUESTION · ${questions.length} QUESTIONS`
      : `QUESTION · ${questions[0]?.options.length ?? 0} OPTIONS`;
  },
  waiting: () => "WAITING · IN ITS PANE",
});

/** @param {InboxCard} card */
export const headingOf = (card) => HEADING[card.kind](card.request);

/**
 * The picks after the human picks option `option` of question `index`: the only one of a single-select question, or
 * one more or one less of a multi-select one, kept in the options' order.
 * @param {Question[]} questions
 * @param {Picks} picks
 * @param {number} index
 * @param {number} option
 * @returns {Picks}
 */
export const pickOption = (questions, picks, index, option) => {
  const question = questions[index];
  const label = question.options[option].label;
  const before = picks[index] ?? [];
  const picked = !question.multiSelect
    ? [label]
    : question.options
        .map((each) => each.label)
        .filter((each) =>
          each === label ? !before.includes(each) : before.includes(each),
        );
  return { ...picks, [index]: picked };
};

/**
 * The answers to send, by question text: what the human typed, else the options picked; null while one is unanswered.
 * @param {Question[]} questions
 * @param {Picks} picks
 * @param {OtherAnswers} others
 * @returns {Record<string, string> | null}
 */
export const answersOf = (questions, picks, others) => {
  const answers = questions.map((question, index) => {
    const typed = (others[index] ?? "").trim();
    const picked = (picks[index] ?? []).join(", ");
    return [question.question, typed === "" ? picked : typed];
  });
  return questions.length > 0 && answers.every(([, answer]) => answer !== "")
    ? Object.fromEntries(answers)
    : null;
};

/** @returns {InboxAnswer} */
export const permissionAnswer = () => ({ behavior: "allow" });

/**
 * @param {string} reason
 * @returns {InboxAnswer}
 */
export const denyAnswer = (reason) =>
  reason.trim() === ""
    ? { behavior: "deny" }
    : { behavior: "deny", message: reason.trim() };

/**
 * @param {Record<string, string>} answers
 * @returns {InboxAnswer}
 */
export const questionAnswer = (answers) => ({ answers, behavior: "allow" });

/**
 * @param {PlanMode} mode
 * @returns {InboxAnswer}
 */
export const planAnswer = (mode) => ({ behavior: "allow", mode });

// The stamp an answer gets (design 05b, after the mark): the gnomemark in gold for a yes, in red for a no.
export const MARK = Object.freeze({ no: "no", yes: "yes" });

/** @typedef {typeof MARK[keyof typeof MARK]} Mark */

/**
 * Whether an answer is a yes: an allow of a permission or a plan, an answer to a question, and on a gate its first
 * option, which forgerdr's gates make the yes (standards, Gates); a deny, or a gate answered any other way, is a no.
 * @param {InboxCard} card
 * @param {InboxAnswer} answer
 * @returns {Mark}
 */
export const markOf = (card, answer) => {
  if (answer.behavior === "deny") return MARK.no;
  if (card.kind !== INBOX_KIND.gate || !("answers" in answer)) return MARK.yes;
  const [first] = questionsOf(card.request);
  return answer.answers[first?.question ?? ""] === first?.options[0]?.label
    ? MARK.yes
    : MARK.no;
};

/**
 * When a card was answered, on the local clock: answered 16:42. No Intl in the app, so by hand.
 * @param {number} at ms
 */
export const markedAt = (at) => {
  const date = new Date(at);
  const two = (/** @type {number} */ value) => String(value).padStart(2, "0");
  return `answered ${two(date.getHours())}:${two(date.getMinutes())}`;
};

/**
 * A box drawn in the window, in window px (layout px times the app's zoom): an element's bounds as a pointer event
 * gives them (gpui-shell's ElementBounds, whose x and y its declaration loses to the type check).
 * @typedef {Point & Size} WindowBox
 */

/**
 * Where a card answered with a click was drawn at the press, and the stamp it gets.
 * @typedef {object} StampLanding
 * @property {WindowBox} card the card's frame: scrolled, its top can be far above the list's
 * @property {WindowBox} list the list's visible box
 * @property {number} stamp the landed stamp's height, in layout px
 * @property {number} scale window px per layout px: the app's zoom, since a press gives window px
 */

/**
 * How far down its card a stamp lands, in layout px: over the middle of what shows of the card in the list, so a long
 * card scrolled to its buttons gets it where the human looks and one shown whole gets it in its middle; never out of
 * the card, and at its top when the card is shorter than the stamp.
 * @param {StampLanding} landing
 */
export const stampTop = ({ card, list, stamp, scale }) => {
  const drawn = stamp * scale;
  const shownTop = Math.max(card.y, list.y);
  const shownBottom = Math.min(card.y + card.height, list.y + list.height);
  const middle = (shownTop + shownBottom) / 2 - card.y;
  return Math.max(0, Math.min(middle - drawn / 2, card.height - drawn)) / scale;
};

/**
 * Whether a card can be approved here: a request listed whole. An agent waiting in its pane, or a request with a text
 * too long to list whole, is only denied here or answered in its pane.
 * @param {InboxCard} card
 */
export const approvable = (card) =>
  card.request !== null && card.request.cut !== true;

/**
 * The card to keep open: the one open while it still waits, else the first. Kept by id, so a newer request, which
 * comes first, never takes the place of the one being read.
 * @param {InboxCard[]} cards
 * @param {string} open
 */
export const openCardOf = (cards, open) =>
  cards.some((card) => card.id === open) ? open : (cards[0]?.id ?? "");

/**
 * The cards shown above one, by id: when they change, the card has moved under the pointer and is armed again.
 * @param {InboxCard[]} cards
 * @param {string} id
 */
export const aboveOf = (cards, id) => {
  const at = cards.findIndex((card) => card.id === id);
  return at === -1
    ? ""
    : cards
        .slice(0, at)
        .map((card) => card.id)
        .join(" ");
};

/**
 * Whether a card waits shut for a stamp below it: opening, it would grow and push the stamped card and its stamp down
 * the list, out of sight. It opens once every stamp below it has gone (its card closing).
 * @param {InboxCard[]} cards as the drawer lists them, those under their stamp included
 * @param {string} id
 * @param {ReadonlySet<string>} stamping the cards whose stamp still shows
 */
export const heldShut = (cards, id, stamping) => {
  const at = cards.findIndex((card) => card.id === id);
  return at !== -1 && cards.slice(at + 1).some((card) => stamping.has(card.id));
};

/**
 * When a card was opened, and which: an approval counts only on it, and only once it has been open a moment.
 * @typedef {object} Opened
 * @property {string} id
 * @property {number} at ms
 * @property {string} [above] the cards shown above it then (aboveOf): when they change, it moved
 */

/**
 * @param {Opened} opened
 * @param {string} id the card clicked
 * @param {number} now ms
 */
export const armed = (opened, id, now) =>
  opened.id === id && now - opened.at >= ARM_MS;

/**
 * The card shown open, and since when: the same as before while it is the same card under the same cards, else from
 * now. A card held shut (heldShut) is no card shown open, so every end of a hold arms the card that opens again.
 * @param {Opened} opened
 * @param {string} id the card shown open, or "" when none is
 * @param {string} above the cards shown above it (aboveOf)
 * @param {number} now ms
 * @returns {Opened}
 */
export const openedNow = (opened, id, above, now) =>
  id === opened.id && above === opened.above ? opened : { above, at: now, id };

/**
 * How long a card has waited: 0:42, 3:10, then 2h 14m.
 * @param {number} since ms
 * @param {number} now ms
 */
export const waitedFor = (since, now) => {
  const seconds = Math.max(0, Math.floor((now - since) / SECOND));
  const hours = Math.floor(seconds / HOUR_SECONDS);
  const minutes = Math.floor((seconds % HOUR_SECONDS) / MINUTE_SECONDS);
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${minutes}:${String(seconds % MINUTE_SECONDS).padStart(2, "0")}`;
};

/**
 * Where a card comes from: its forge, whose gnome and name it shows, and the path under it.
 * @typedef {object} CardOrigin
 * @property {Forge | null} forge none when no space of the app shows its terminal or its session's
 * @property {string[]} path the forge's name, the branch and the session (its tab), then a pane-less agent's title
 */

/**
 * Where a card comes from: the forge of the space its terminal shows in, the branch there and the session (the tab);
 * an agent with no pane comes from its session's, under its own title; a terminal nothing knows, from its address.
 * @param {string} address
 * @param {Forge[]} forges
 * @param {Pick<PaneInfo, "terminal" | "tab" | "branch">[]} panes
 * @param {LaneTerminal[]} terminals
 * @param {Set<string>} [seen] the terminals already gone through, so two that name each other end
 * @returns {CardOrigin}
 */
export const originOf = (
  address,
  forges,
  panes,
  terminals,
  seen = new Set(),
) => {
  const pane = panes.find((each) => each.terminal === address);
  const tabOf = (/** @type {Pick<SpaceInfo, "tabs">} */ space) =>
    space.tabs.find((tab) => tab.id === pane?.tab);
  const forge = forges.find((each) =>
    each.spaces.some((space) => tabOf(space) !== undefined),
  );
  if (pane !== undefined && forge !== undefined) {
    const tab = forge.spaces.map(tabOf).find((each) => each !== undefined);
    return {
      forge,
      path: [forge.main.name, pane.branch ?? "", tab?.name ?? ""].filter(
        (part) => part !== "",
      ),
    };
  }
  const terminal = terminals.find((each) => each.address === address);
  const parent = terminal === undefined ? null : parentOf(terminal);
  if (parent === null || seen.has(address))
    return { forge: null, path: [address] };
  const above = originOf(
    parent,
    forges,
    panes,
    terminals,
    new Set([...seen, address]),
  );
  return {
    forge: above.forge,
    path: [...above.path, terminal?.title ?? address],
  };
};
