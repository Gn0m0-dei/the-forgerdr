// The forge floor (design 13): every item a Claude session works, forge by forge, with the cells of its flow, which ran
// and how often, its build tasks, what it waits on, its branch and its dev server's port; then the agent sessions that
// report no flow. The flows are bin/forge-flow.sh's (references/flows.md); what herdr knows (the terminals, the panes,
// the inbox's requests) says the rest. Pure: Node tests it (test/herdr-mod.test.mjs).
import { originOf } from "./inbox.js";
import { golemStatus, parentOf } from "./lanes.js";
import { MOOD } from "./parts.js";

/** @typedef {import("herdr").PaneInfo} PaneInfo */
/** @typedef {import("herdr").TabInfo} TabInfo */
/** @typedef {import("./forges.js").Forge} Forge */
/** @typedef {import("./inbox.js").InboxRequest} InboxRequest */
/** @typedef {import("./kit/sprites.js").Mood} Mood */
/** @typedef {import("./lanes.js").LaneTerminal} LaneTerminal */

export const FLOW_CELL = Object.freeze({
  brief: "brief",
  build: "build",
  comment: "comment",
  debug: "debug",
  fix: "fix",
  plan: "plan",
  proposal: "proposal",
  reproduce: "reproduce",
  research: "research",
  review: "review",
  rootCause: "root-cause",
  security: "security",
  ship: "ship",
  spec: "spec",
  verdict: "verdict",
  workitem: "workitem",
});

/** @typedef {typeof FLOW_CELL[keyof typeof FLOW_CELL]} FlowCell */

export const FLOW_TYPE = Object.freeze({
  bug: "bug",
  change: "change",
  content: "content",
  feature: "feature",
});

/** @typedef {typeof FLOW_TYPE[keyof typeof FLOW_TYPE]} FlowType */

export const FLOW_MODE = Object.freeze({ auto: "auto", manual: "manual" });

/** @typedef {typeof FLOW_MODE[keyof typeof FLOW_MODE]} FlowMode */

// A cell's state as bin/forge-flow.sh keeps it.
export const CELL_STATE = Object.freeze({
  done: "done",
  failed: "failed",
  running: "running",
  skipped: "skipped",
  waiting: "waiting",
});

/** @typedef {typeof CELL_STATE[keyof typeof CELL_STATE]} CellState */

// A cell as the strip draws it: its state, or pending when it never ran.
export const STRIP_STATE = Object.freeze({ ...CELL_STATE, pending: "pending" });

/** @typedef {typeof STRIP_STATE[keyof typeof STRIP_STATE]} StripState */

// A build task's mark, as the build skill reports it.
export const TASK_MARK = Object.freeze({
  green: "green",
  red: "red",
  reviewed: "reviewed",
});

/** @typedef {typeof TASK_MARK[keyof typeof TASK_MARK]} TaskMark */

// A build task as the card draws it: its mark, or pending when it has none yet.
export const TASK_CELL = Object.freeze({ ...TASK_MARK, pending: "pending" });

/** @typedef {typeof TASK_CELL[keyof typeof TASK_CELL]} TaskCell */

/**
 * @typedef {object} CellRecord
 * @property {CellState} state
 * @property {number} runs how many times it was launched
 * @property {number} at when its state last changed, in ms
 */

/** @typedef {Partial<Record<FlowCell, CellRecord>>} FlowCells */

/**
 * @typedef {object} FlowTasks
 * @property {number} of
 * @property {(TaskMark | null)[]} marks by task, from the first
 * @property {string} [name] the test the red task is on
 */

/** @typedef {{ number: number, url: string }} FlowPr */

/**
 * A flow as bin/forge-flow.sh keeps it.
 * @typedef {object} Flow
 * @property {string} terminal the herdr terminal of the session that works the item
 * @property {string} [session] the Claude session that works it, when a hook saw it
 * @property {FlowMode} mode
 * @property {FlowType | ""} type none until its brief names it
 * @property {string} key the item's: #12, EXT-12, a change's name, a slug; none until its brief names it
 * @property {string} title
 * @property {string} repo the repository's common folder, as bridges/git.js keys a forge
 * @property {number} created ms
 * @property {number} updated ms
 * @property {FlowCells} cells
 * @property {FlowTasks | null} [tasks]
 * @property {FlowPr | null} [pr]
 */

/** @typedef {{ cell: FlowCell, state: StripState, runs: number }} StripCell */

/**
 * The build tasks as the card draws them: while the build runs, the one at work (the red one, else the next one not
 * done), of how many; each with its mark.
 * @typedef {object} TaskRow
 * @property {boolean} building the build runs now
 * @property {number} at
 * @property {number} of
 * @property {TaskCell[]} marks
 * @property {boolean} red the one at work is red
 * @property {string | undefined} name the test the red task is on
 */

/**
 * An item's progress, pass by pass: the passes done, of the passes its steps have taken or have still to take, and each
 * pass's state in order.
 * @typedef {object} Progress
 * @property {number} done
 * @property {number} of
 * @property {StripState[]} steps
 */

export const CARD_STATUS = Object.freeze({
  cracked: "cracked",
  done: "done",
  ended: "ended",
  forging: "forging",
  waiting: "waiting",
});

/** @typedef {typeof CARD_STATUS[keyof typeof CARD_STATUS]} CardStatus */

// What a card's chip says of each status, before the cell or the gate it names.
/** @type {Readonly<Record<CardStatus, string>>} */
const STATUS_LABEL = Object.freeze({
  cracked: "CRACKED",
  done: "DONE",
  ended: "ENDED",
  forging: "FORGING",
  waiting: "WAITING",
});
/** @typedef {{ kind: CardStatus, label: string }} CardState */

/**
 * @typedef {object} FloorCard
 * @property {string} terminal
 * @property {string} key
 * @property {string} title
 * @property {FlowType | ""} type
 * @property {FlowMode} mode
 * @property {CardState} status
 * @property {string | null} branch
 * @property {number | undefined} port
 * @property {StripCell[]} strip
 * @property {Progress} progress
 * @property {TaskRow | null} tasks
 * @property {FlowPr | null} pr
 * @property {boolean} inbox what it waits on is in the inbox: a request of its session, or of an agent it dispatched
 */

/**
 * An agent session that reports no flow.
 * @typedef {object} Untracked
 * @property {string} terminal
 * @property {string} title
 * @property {string} space
 * @property {string} status what its golem does
 */

/** @typedef {{ waiting: number, forging: number, cracked: number, done: number }} FloorCounts */

/**
 * @typedef {object} FloorForge
 * @property {string} key its repository (a forge's key), or the repository a flow names when its forge is not open
 * @property {Forge | null} forge null when none of its spaces is open
 * @property {string} name
 * @property {FloorCard[]} cards the most urgent first
 * @property {Untracked[]} untracked
 * @property {FloorCounts} counts
 */

/** @typedef {Pick<PaneInfo, "terminal" | "tab" | "branch" | "title" | "program">} FloorPane */

/**
 * What the floor is drawn from.
 * @typedef {object} FloorInput
 * @property {Flow[]} flows
 * @property {Forge[]} forges in the top bar's order
 * @property {FloorPane[]} panes
 * @property {LaneTerminal[]} terminals
 * @property {Pick<InboxRequest, "kind" | "terminal" | "tool_input">[]} requests
 */

/** @type {Readonly<Record<FlowType, readonly FlowCell[]>>} */
export const PIPELINE = Object.freeze({
  bug: [
    FLOW_CELL.brief,
    FLOW_CELL.reproduce,
    FLOW_CELL.rootCause,
    FLOW_CELL.proposal,
    FLOW_CELL.fix,
    FLOW_CELL.review,
    FLOW_CELL.security,
    FLOW_CELL.ship,
  ],
  change: [
    FLOW_CELL.spec,
    FLOW_CELL.plan,
    FLOW_CELL.build,
    FLOW_CELL.review,
    FLOW_CELL.security,
    FLOW_CELL.ship,
  ],
  content: [FLOW_CELL.brief, FLOW_CELL.verdict, FLOW_CELL.comment],
  feature: [
    FLOW_CELL.brief,
    FLOW_CELL.spec,
    FLOW_CELL.research,
    FLOW_CELL.plan,
    FLOW_CELL.build,
    FLOW_CELL.review,
    FLOW_CELL.security,
    FLOW_CELL.ship,
  ],
});

// Before its brief names its type, an auto flow knows only its brief.
/** @type {readonly FlowCell[]} */
const UNNAMED = Object.freeze([FLOW_CELL.brief]);

// Every step a session can launch by hand: what a manual flow always shows.
/** @type {readonly FlowCell[]} */
export const MANUAL_CELLS = Object.freeze([
  FLOW_CELL.workitem,
  FLOW_CELL.spec,
  FLOW_CELL.research,
  FLOW_CELL.debug,
  FLOW_CELL.plan,
  FLOW_CELL.build,
  FLOW_CELL.review,
  FLOW_CELL.security,
  FLOW_CELL.ship,
]);

// What /forgerdr:workitem runs itself, which its one cell stands for in a manual flow.
/** @type {readonly FlowCell[]} */
const WORKITEM_STEPS = Object.freeze([
  FLOW_CELL.workitem,
  FLOW_CELL.brief,
  FLOW_CELL.reproduce,
  FLOW_CELL.rootCause,
  FLOW_CELL.proposal,
  FLOW_CELL.fix,
  FLOW_CELL.verdict,
  FLOW_CELL.comment,
]);

// The agents a review cell counts, and lights up while one works.
export const REVIEW_AGENTS = Object.freeze([
  "forgerdr:reviewer",
  "forgerdr:security-auditor",
  "forgerdr:security-verifier",
]);

// The flows of sessions outside any forge, whose forge cannot be told any more.
const ELSEWHERE = Object.freeze({ key: "elsewhere", name: "elsewhere" });

const DEV_TAB = /^dev :(\d+)$/;
const GATE_HEADER = /^Gate\s+/;

/**
 * The cell records, by cell, that have one.
 * @param {FlowCells} cells
 * @param {readonly FlowCell[]} [among]
 */
const recordsOf = (cells, among = Object.values(FLOW_CELL)) =>
  among.flatMap((cell) => {
    const record = cells[cell];
    return record === undefined ? [] : [{ cell, ...record }];
  });

/**
 * The one of some records that changed last; of two at the same moment, the later in the list (a pipeline's next step).
 * @template {{ at: number }} Record
 * @param {Record[]} records
 * @returns {Record | undefined}
 */
const latestOf = (records) =>
  records.reduce(
    (/** @type {Record | undefined} */ latest, each) =>
      latest === undefined || each.at >= latest.at ? each : latest,
    undefined,
  );

/**
 * The cells a flow shows its states by: as kept in auto; in manual, the work item's cell takes the state of whichever
 * of its own steps changed last, so it runs while its brief does.
 * @param {Pick<Flow, "mode" | "cells">} flow
 * @returns {FlowCells}
 */
const shownCells = (flow) => {
  const steps = recordsOf(flow.cells, WORKITEM_STEPS);
  const latest = latestOf(steps);
  if (flow.mode !== FLOW_MODE.manual || latest === undefined) return flow.cells;
  const rest = Object.fromEntries(
    recordsOf(flow.cells)
      .filter((each) => !WORKITEM_STEPS.includes(each.cell))
      .map(({ cell, ...record }) => [cell, record]),
  );
  return {
    ...rest,
    [FLOW_CELL.workitem]: {
      at: latest.at,
      runs: flow.cells.workitem?.runs ?? 1,
      state: latest.state,
    },
  };
};

/**
 * The cells a flow runs, in order: every manual step in manual, its pipeline in auto, only its brief before the brief
 * names its type.
 * @param {Pick<Flow, "mode" | "type">} flow
 * @returns {readonly FlowCell[]}
 */
const orderOf = (flow) =>
  flow.mode === FLOW_MODE.manual
    ? MANUAL_CELLS
    : flow.type === ""
      ? UNNAMED
      : PIPELINE[flow.type];

/**
 * The cells a flow shows: its pipeline's in auto (and any launched by hand outside it, after them), every manual one in
 * manual; each with its state and how often it ran. The review cell runs while a reviewing agent of the session works.
 * Once the flow is over, a cell that never ran will not: it shows as skipped, not as still to come.
 * @param {Pick<Flow, "mode" | "type" | "cells">} flow
 * @param {boolean} reviewing
 * @param {boolean} [over] the flow is finished, or its session has ended
 * @returns {StripCell[]}
 */
export const stripOf = (flow, reviewing, over = false) => {
  const manual = flow.mode === FLOW_MODE.manual;
  const cells = shownCells(flow);
  const order = orderOf(flow);
  const launched = manual
    ? []
    : MANUAL_CELLS.filter(
        (cell) => !order.includes(cell) && cells[cell] !== undefined,
      );
  return [...order, ...launched].map((cell) => ({
    cell,
    runs: cells[cell]?.runs ?? 0,
    state:
      reviewing && cell === FLOW_CELL.review
        ? STRIP_STATE.running
        : (cells[cell]?.state ??
          (over ? STRIP_STATE.skipped : STRIP_STATE.pending)),
  }));
};

/**
 * An item's progress from its strip, pass by pass: a step counts once for every time it ran (a review run three times
 * is three passes, a build run again two), and once while it is still to come or was skipped; a skipped pass is not
 * done, and of a step at work, at its gate or broken, its last pass is not done yet.
 * @param {StripCell[]} strip
 * @returns {Progress}
 */
export const progressOf = (strip) => {
  const steps = strip.flatMap(({ state, runs }) => {
    if (state === STRIP_STATE.pending || state === STRIP_STATE.skipped)
      return [state];
    const earlier = Array.from(
      { length: Math.max(runs, 1) - 1 },
      () => STRIP_STATE.done,
    );
    return [...earlier, state];
  });
  return {
    done: steps.filter((state) => state === STRIP_STATE.done).length,
    of: steps.length,
    steps,
  };
};

/**
 * @param {FlowTasks | null | undefined} tasks
 * @param {boolean} building the build runs now
 * @returns {TaskRow | null}
 */
export const tasksOf = (tasks, building) => {
  if (tasks === null || tasks === undefined) return null;
  /** @type {TaskCell[]} */
  const marks = Array.from(
    { length: tasks.of },
    (_, index) => tasks.marks[index] ?? TASK_CELL.pending,
  );
  const red = marks.indexOf(TASK_CELL.red);
  const next = marks.indexOf(TASK_CELL.pending);
  const at = red !== -1 ? red + 1 : next !== -1 ? next + 1 : tasks.of;
  return {
    at,
    building,
    marks,
    name: tasks.name,
    of: tasks.of,
    red: red !== -1,
  };
};

/**
 * The port of a dev server forge-worktree.sh started in a space: its tab is named "dev :<port>".
 * @param {Pick<TabInfo, "name">[]} tabs
 * @returns {number | undefined}
 */
export const portOf = (tabs) => {
  const port = tabs.map((tab) => DEV_TAB.exec(tab.name)?.[1]).find(Boolean);
  return port === undefined ? undefined : Number(port);
};

/** A cell as its card names it: ROOT CAUSE. @param {FlowCell} cell */
export const cellLabel = (cell) => cell.replaceAll("-", " ").toUpperCase();

/**
 * The cell a flow is on: the one running, else the last one that changed.
 * @param {FlowCells} cells
 * @returns {FlowCell | undefined}
 */
const currentOf = (cells) => {
  const known = recordsOf(cells);
  return (
    known.find((each) => each.state === CELL_STATE.running) ?? latestOf(known)
  )?.cell;
};

/** @param {FlowCells} cells @param {CellState} state */
const cellIn = (cells, state) =>
  Object.values(FLOW_CELL).find((cell) => cells[cell]?.state === state);

/** What a request asks the human, as a card says it. @type {Readonly<Record<InboxRequest["kind"], (request: Pick<InboxRequest, "tool_input">) => string>>} */
const ASKS = Object.freeze({
  gate: (request) => {
    const [first] = request.tool_input.questions ?? [];
    return `${(first?.header ?? "").replace(GATE_HEADER, "").toUpperCase()} GATE`;
  },
  permission: () => "PERMISSION",
  plan: () => "PLAN",
  question: () => "QUESTION",
});

/** @param {string} label @param {FlowCell | undefined} cell */
const withCell = (label, cell) =>
  cell === undefined ? label : `${label} · ${cellLabel(cell)}`;

// The cells a build's tasks belong to: the build, or a bug's fix.
/** @type {readonly FlowCell[]} */
const BUILDS = Object.freeze([FLOW_CELL.build, FLOW_CELL.fix]);

/**
 * Whether a flow builds now: its tasks then say which one is at work, else how many were done.
 * @param {Pick<Flow, "mode" | "cells">} flow
 */
const building = (flow) => {
  const cells = shownCells(flow);
  return BUILDS.some((cell) => cells[cell]?.state === CELL_STATE.running);
};

/** @typedef {{ holds: boolean, state: () => CardState }} StatusRule */

/**
 * The cell a flow ends with: its pipeline's last in auto, ship in manual; none before its brief names its type.
 * @param {Pick<Flow, "mode" | "type">} flow
 * @returns {FlowCell | undefined}
 */
const finalOf = (flow) =>
  flow.mode === FLOW_MODE.manual || flow.type !== ""
    ? orderOf(flow).at(-1)
    : undefined;

// The states of a cell still under way: an item with one is not finished, whatever its last cell says.
/** @type {readonly CellState[]} */
const UNDER_WAY = Object.freeze([CELL_STATE.running, CELL_STATE.waiting]);

/**
 * Whether a flow is finished: the cell it ends with is done and none is under way (an item at work again after it
 * shipped, on the pull request's comments, is not).
 * @param {Pick<Flow, "mode" | "type" | "cells">} flow
 */
const finished = (flow) => {
  const final = finalOf(flow);
  const cells = shownCells(flow);
  return (
    final !== undefined &&
    cells[final]?.state === CELL_STATE.done &&
    !recordsOf(cells).some((each) => UNDER_WAY.includes(each.state))
  );
};

/**
 * What a card says of its flow, the first that holds: something it waits on the human for (an inbox request, its
 * session blocked in its pane, a cell at its gate), a broken golem or the cell it is on broken, its last cell done, its
 * session gone, or else it forges its item, at work or between two steps of it.
 * @param {Pick<Flow, "mode" | "type" | "cells" | "pr">} flow
 * @param {LaneTerminal | undefined} terminal its session's, while it lives
 * @param {Pick<InboxRequest, "kind" | "tool_input">} [request] what its session, or an agent it dispatched, asks in the
 *   inbox
 * @param {boolean} [agentWaits] an agent the session dispatched waits on the human in its pane
 * @returns {CardState}
 */
export const statusOf = (flow, terminal, request, agentWaits = false) => {
  const cells = shownCells(flow);
  const current = currentOf(cells);
  const gated = cellIn(cells, CELL_STATE.waiting);
  const failed = cellIn(cells, CELL_STATE.failed);
  /** @type {StatusRule[]} */
  const rules = [
    {
      holds: request !== undefined,
      state: () => ({
        kind: CARD_STATUS.waiting,
        label: `${STATUS_LABEL.waiting} · ${request === undefined ? "" : ASKS[request.kind](request)}`,
      }),
    },
    {
      holds: terminal?.status === "blocked" || agentWaits,
      state: () => ({ kind: CARD_STATUS.waiting, label: STATUS_LABEL.waiting }),
    },
    {
      holds: gated !== undefined && terminal !== undefined,
      state: () => ({
        kind: CARD_STATUS.waiting,
        label: `${withCell(STATUS_LABEL.waiting, gated)} GATE`,
      }),
    },
    {
      holds:
        terminal !== undefined &&
        (golemStatus(terminal) === "cracked" ||
          (failed !== undefined && failed === current)),
      state: () => ({
        kind: CARD_STATUS.cracked,
        label: withCell(STATUS_LABEL.cracked, current),
      }),
    },
    {
      holds: finished(flow),
      state: () => ({
        kind: CARD_STATUS.done,
        label: flow.pr
          ? `${STATUS_LABEL.done} · PR #${flow.pr.number}`
          : STATUS_LABEL.done,
      }),
    },
    {
      holds: terminal === undefined,
      state: () => ({ kind: CARD_STATUS.ended, label: STATUS_LABEL.ended }),
    },
  ];
  // Otherwise the session forges its item, at work or between two steps of it.
  return (
    rules.find((rule) => rule.holds)?.state() ?? {
      kind: CARD_STATUS.forging,
      label: withCell(STATUS_LABEL.forging, current),
    }
  );
};

// The most urgent first.
/** @type {readonly CardStatus[]} */
const URGENCY = Object.freeze([
  CARD_STATUS.waiting,
  CARD_STATUS.forging,
  CARD_STATUS.cracked,
  CARD_STATUS.done,
  CARD_STATUS.ended,
]);

/** @param {FloorCard[]} cards @returns {FloorCounts} */
const countsOf = (cards) => {
  const count = (/** @type {CardStatus} */ kind) =>
    cards.filter((card) => card.status.kind === kind).length;
  return {
    cracked: count(CARD_STATUS.cracked),
    done: count(CARD_STATUS.done),
    forging: count(CARD_STATUS.forging),
    waiting: count(CARD_STATUS.waiting),
  };
};

/** The name a group of flows whose forge is not open goes by: its repository's, from its common folder. @param {string} key */
const closedName = (key) =>
  key === ELSEWHERE.key
    ? ELSEWHERE.name
    : (key
        .replace(/\/\.git$/, "")
        .split("/")
        .filter(Boolean)
        .at(-1) ?? key);

// The order of the groups whose forge is not open: by name, case aside; the flows outside any forge last.
/** @param {string} key */
const sortKey = (key) =>
  key === ELSEWHERE.key ? "\uffff" : closedName(key).toLowerCase();

/** @typedef {{ key: string, forge: Forge | null, card: FloorCard }} PlacedCard a card and the group it goes in */
/** @typedef {{ key: string, untracked: Untracked }} PlacedSession a session with no flow and its forge */
/** @typedef {{ key: string, forge: Forge | null }} ForgeSlot a group of the floor, in its order */

/**
 * The floor, forge by forge: the open forges in the top bar's order, then the repositories of flows whose forge is not
 * open, by name; each with its cards, the most urgent first, and its agent sessions that report no flow (sessions of
 * their own, not agents forgerdr dispatched). A forge with neither is left out.
 * @param {FloorInput} input
 * @returns {FloorForge[]}
 */
export const floorOf = ({ flows, forges, panes, terminals, requests }) => {
  const live = terminals.filter((terminal) => terminal.state !== "finished");
  const liveOf = (/** @type {string} */ address) =>
    live.find((terminal) => terminal.address === address);
  // A flow's session lives while its terminal does and still runs its agent: back at a shell, the session has ended.
  const sessionOf = (/** @type {string} */ address) => {
    const pane = panes.find((each) => each.terminal === address);
    return pane?.program?.agent === false ? undefined : liveOf(address);
  };
  const spaceOf = (/** @type {string} */ tab) =>
    forges
      .flatMap((forge) => forge.spaces)
      .find((space) => space.tabs.some((each) => each.id === tab));
  /** @param {Flow} flow @returns {PlacedCard} */
  const placed = (flow) => {
    const terminal = sessionOf(flow.terminal);
    const pane =
      terminal === undefined
        ? undefined
        : panes.find((each) => each.terminal === flow.terminal);
    const forge =
      (terminal === undefined
        ? null
        : originOf(flow.terminal, forges, panes, terminals).forge) ??
      forges.find((each) => each.key === flow.repo) ??
      null;
    // The agents the session dispatched, still live.
    const agents =
      terminal === undefined
        ? []
        : live.filter((each) => parentOf(each) === flow.terminal);
    const reviewing = agents.some(
      (each) =>
        each.status === "working" &&
        REVIEW_AGENTS.includes(each.labels?.["forge.agent"] ?? ""),
    );
    const askers = new Set([
      flow.terminal,
      ...agents.map((each) => each.address),
    ]);
    const strip = stripOf(
      flow,
      reviewing,
      finished(flow) || terminal === undefined,
    );
    const request =
      terminal === undefined
        ? undefined
        : requests.find((each) => askers.has(each.terminal));
    return {
      card: {
        branch: pane?.branch ?? null,
        inbox: request !== undefined,
        key: flow.key,
        mode: flow.mode,
        port:
          pane === undefined
            ? undefined
            : portOf(spaceOf(pane.tab)?.tabs ?? []),
        pr: flow.pr ?? null,
        progress: progressOf(strip),
        status: statusOf(
          flow,
          terminal,
          request,
          agents.some((each) => each.status === "blocked"),
        ),
        strip,
        tasks: tasksOf(flow.tasks, building(flow)),
        terminal: flow.terminal,
        title: flow.title,
        type: flow.type,
      },
      forge,
      key: forge?.key ?? (flow.repo || ELSEWHERE.key),
    };
  };
  // A finished item leaves the floor once its session ends.
  const cards = flows
    .filter((flow) => !finished(flow) || sessionOf(flow.terminal) !== undefined)
    .map(placed);
  const tracked = new Set(flows.map((flow) => flow.terminal));
  /** @type {PlacedSession[]} */
  const untracked = panes.flatMap((pane) => {
    const terminal = pane.terminal === null ? undefined : liveOf(pane.terminal);
    if (
      terminal === undefined ||
      !pane.program?.agent ||
      tracked.has(terminal.address) ||
      parentOf(terminal) !== null
    )
      return [];
    const forge = originOf(terminal.address, forges, panes, terminals).forge;
    if (forge === null) return [];
    return [
      {
        key: forge.key,
        untracked: {
          space: spaceOf(pane.tab)?.name ?? "",
          status: golemStatus(terminal),
          terminal: terminal.address,
          title: pane.title,
        },
      },
    ];
  });
  const closed = [
    ...new Set(
      cards.filter((each) => each.forge === null).map((each) => each.key),
    ),
  ].toSorted((one, other) => {
    const [first, second] = [one, other].map(sortKey);
    return first < second ? -1 : first > second ? 1 : 0;
  });
  /** @type {ForgeSlot[]} */
  const order = [
    ...forges.map((forge) => ({ forge, key: forge.key })),
    ...closed.map((key) => ({ forge: null, key })),
  ];
  return order.flatMap(({ forge, key }) => {
    const mine = cards
      .filter((each) => each.key === key)
      .map((each) => each.card)
      .toSorted(
        (one, other) =>
          URGENCY.indexOf(one.status.kind) - URGENCY.indexOf(other.status.kind),
      );
    const quiet = untracked
      .filter((each) => each.key === key)
      .map((each) => each.untracked);
    if (!mine.length && !quiet.length) return [];
    return [
      {
        cards: mine,
        counts: countsOf(mine),
        forge,
        key,
        name: forge?.main.name ?? closedName(key),
        untracked: quiet,
      },
    ];
  });
};

// A forge's gnome's mood on the floor: someone waiting wins, then a break, then work, then a finished item.
/** @typedef {{ count: keyof FloorCounts, mood: Mood }} CountMood */
/** @type {readonly CountMood[]} */
const MOODS = Object.freeze([
  { count: "waiting", mood: MOOD.needs },
  { count: "cracked", mood: MOOD.error },
  { count: "forging", mood: MOOD.working },
  { count: "done", mood: MOOD.done },
]);

/** @param {FloorCounts} counts @returns {Mood} */
export const floorMood = (counts) =>
  MOODS.find(({ count }) => counts[count] > 0)?.mood ?? MOOD.idle;

/**
 * The counts of the whole floor.
 * @param {FloorForge[]} floor
 * @returns {FloorCounts}
 */
export const floorCounts = (floor) =>
  countsOf(floor.flatMap((forge) => forge.cards));
