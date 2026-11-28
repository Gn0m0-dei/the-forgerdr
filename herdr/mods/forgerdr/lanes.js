// The golem lanes (design 04): the golems the sessions of a space spawned, each with what it is doing now, how full its
// context is, how long it has been at it and its status, the most urgent first. Two kinds: an agent in a herdr terminal
// of its own, tied to the session that dispatched it (parentOf), and a subagent running inside a session, which Claude
// Code reports as one of its terminal's records. Pure: Node tests it (test/herdr-mod.test.mjs).

// A lane's golem: stone for an agent in a terminal of its own (a teammate), clay for a subagent inside its session.
export const GOLEM_KIND = Object.freeze({ clay: "clay", stone: "stone" });

/** @typedef {typeof GOLEM_KIND[keyof typeof GOLEM_KIND]} GolemKind */

/**
 * What the lanes read of a terminal (herdr's terminals()).
 * @typedef {object} LaneTerminal
 * @property {string} address
 * @property {string} [name] what herdr-core calls it, when it was started with one (an IDE's ttt: forge-ide.sh name)
 * @property {string} [state] live or finished
 * @property {string | null} [parent]
 * @property {string | null} [title]
 * @property {number} [created_ms]
 * @property {number} [status_ms] when its status last changed
 * @property {string} [status] working, blocked, done, idle
 * @property {Record<string, string>} [labels]
 * @property {{ msg?: string | null }} [report] what the agent says it is doing
 * @property {Record<string, { state?: string, title?: string }>} [records] its in-session subagents, by id
 * @property {import("herdr").Program} [program] what runs in front in it
 */

/** @typedef {import("herdr").AgentInfo} AgentInfo */
/** @typedef {import("herdr").SpaceInfo} SpaceInfo */
/** @typedef {import("herdr").Status} Status */

/**
 * The labels the forge scripts set on the terminal of a session parked behind a view of its own: `review`, which view
 * answers its questions (bin/forge-pr.sh writes a review's kind, bin/forge-security.sh "security"; inbox.js
 * REVIEW_VIEW); `tab`, the tab of the view it is parked behind (bin/forge-review.sh for a review session, `launch` of
 * bin/forge-security.sh for a security one), which keeps it in that tab's space once it loses herdr's space label;
 * `view`, the tab of its security view (`open` of bin/forge-security.sh, inside the session `launch` opened: the same
 * tab as its `tab`).
 */
export const FORGE_LABEL = Object.freeze({
  review: "forge.review",
  tab: "forge.tab",
  view: "forge.view",
});

/** @type {Readonly<Record<string, Status>>} */
const AGENT_STATUS = Object.freeze({
  blocked: "blocked",
  done: "done",
  idle: "idle",
  working: "working",
});

/**
 * The space a terminal shows in: its herdr space label, or, for a session parked behind its view (a review session, the
 * security session bin/forge-security.sh launch opens), the space of the view's tab; null when neither says.
 * @param {LaneTerminal} terminal
 * @param {Pick<SpaceInfo, "id" | "tabs">[]} spaces
 * @returns {string | null}
 */
export const spaceOfTerminal = (terminal, spaces) => {
  const labelled = terminal.labels?.["herdr.space"] ?? "";
  if (labelled !== "") return labelled;
  const tab = terminal.labels?.[FORGE_LABEL.tab] ?? "";
  if (tab === "") return null;
  return (
    spaces.find((space) => space.tabs.some((one) => one.id === tab))?.id ?? null
  );
};

/**
 * The sessions parked behind a view whose tab is gone (a review session, the security session bin/forge-security.sh
 * launch opens): their view was closed, so they end too. Only a tab seen alive in an earlier sweep counts as gone, so a
 * start, before the app lists its spaces, ends none; and only a terminal carrying a parked view's tab, so a terminal
 * that took an old address is never one. Answers them and the tabs seen alive so far, for the next sweep.
 * @param {LaneTerminal[]} terminals
 * @param {Pick<SpaceInfo, "id" | "tabs">[]} spaces
 * @param {Set<string>} seen the tabs seen alive in the sweeps before
 * @returns {{ orphans: string[], seen: Set<string> }}
 */
export const orphanedReviews = (terminals, spaces, seen) => {
  const live = new Set(
    spaces.flatMap((space) => space.tabs.map((tab) => tab.id)),
  );
  const orphans = terminals
    .filter((terminal) => {
      const tab = terminal.labels?.[FORGE_LABEL.tab] ?? "";
      return (
        terminal.state !== "finished" &&
        tab !== "" &&
        seen.has(tab) &&
        !live.has(tab)
      );
    })
    .map((terminal) => terminal.address);
  return { orphans, seen: new Set([...seen, ...live]) };
};

/**
 * herdr's agents, with the sessions parked behind their views among them (the review sessions, the security sessions
 * bin/forge-security.sh launch opens), in the space and tab of their view, so the forge counts them as its golems.
 * @param {AgentInfo[]} listed
 * @param {LaneTerminal[]} terminals
 * @param {Pick<SpaceInfo, "id" | "tabs">[]} spaces
 * @returns {AgentInfo[]}
 */
export const withParkedAgents = (listed, terminals, spaces) => {
  const known = new Set(listed.map((agent) => agent.address));
  /** @type {AgentInfo[]} */
  const parked = terminals.flatMap((terminal) => {
    const tab = terminal.labels?.[FORGE_LABEL.tab] ?? "";
    const space = spaceOfTerminal(terminal, spaces);
    const status = AGENT_STATUS[terminal.status ?? ""];
    if (
      known.has(terminal.address) ||
      terminal.state === "finished" ||
      tab === "" ||
      space === null ||
      status === undefined ||
      terminal.program === undefined
    )
      return [];
    return [
      {
        address: terminal.address,
        app: null,
        focused: false,
        pane: "",
        pane_name: null,
        pinned: false,
        program: terminal.program,
        seq: 0,
        space,
        space_name: "",
        status,
        tab,
        tab_index: 0,
        tab_name: "",
        title: terminal.title ?? "",
      },
    ];
  });
  return [...listed, ...parked];
};

/**
 * @typedef {object} Lane
 * @property {string} id
 * @property {string} name
 * @property {string} activity what it is doing now, or what it last did
 * @property {number | undefined} context its session's context used, in percent, when it has a session of its own
 * @property {number | undefined} since when it started, in ms
 * @property {number | undefined} until when it stopped working, in ms; undefined while it works
 * @property {string} status working, blocked, done, idle or cracked
 * @property {GolemKind} golem its golem (GOLEM_KIND)
 */

/**
 * A terminal's status as the forge tells it: cracked while hooks/golem-state.sh has marked it, else herdr's.
 * @param {LaneTerminal} terminal
 */
export const golemStatus = (terminal) =>
  terminal.labels?.["forge.state"] === "cracked"
    ? "cracked"
    : (terminal.status ?? "idle");

/**
 * The session a terminal's golem belongs to: hc's parent, else the one that dispatched it (forge.parent, which
 * hooks/golem-state.sh sets from hooks/agent-dispatch.sh's FORGE_PARENT_TERMINAL); null for a session of its own.
 * @param {LaneTerminal} terminal
 */
export const parentOf = (terminal) =>
  terminal.parent ?? terminal.labels?.["forge.parent"] ?? null;

/**
 * A time hooks/golem-state.sh keeps on a terminal (forge.started, forge.stopped), in ms.
 * @param {LaneTerminal} terminal
 * @param {string} label
 */
const labelMs = (terminal, label) => {
  const ms = Number(terminal.labels?.[label]);
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
};

/**
 * The lanes of a session: its agents in terminals of their own, then its subagents inside it.
 * @param {LaneTerminal} lead
 * @param {LaneTerminal[]} terminals
 * @param {Record<string, { used: number }>} contexts by terminal
 * @param {Record<string, number>} seen when each in-session subagent was first seen, in ms, by lane id
 * @returns {Lane[]}
 */
export const lanesOf = (lead, terminals, contexts, seen) => [
  ...terminals
    .filter(
      (terminal) =>
        parentOf(terminal) === lead.address && terminal.state !== "finished",
    )
    .map((terminal) => ({
      activity: terminal.report?.msg ?? "",
      context: contexts[terminal.address]?.used,
      golem: GOLEM_KIND.stone,
      id: terminal.address,
      name: terminal.title || terminal.address,
      since: labelMs(terminal, "forge.started") ?? terminal.created_ms,
      status: golemStatus(terminal),
      until:
        golemStatus(terminal) === "working"
          ? undefined
          : (labelMs(terminal, "forge.stopped") ?? terminal.status_ms),
    })),
  ...Object.entries(lead.records ?? {}).map(([key, record]) => {
    const id = `${lead.address}/${key}`;
    return {
      activity: "",
      context: undefined,
      golem: GOLEM_KIND.clay,
      id,
      name: record.title || "subagent",
      since: seen[id],
      status: record.state ?? "working",
      until: undefined,
    };
  }),
];

/**
 * How long a lane has been at it: 1m 12s, 1h 3m, 0m 55s.
 * @param {number | undefined} since ms
 * @param {number} now ms
 */
export const elapsed = (since, now) => {
  if (since === undefined) return "";
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds % 60}s`;
};

// Most urgent first: a golem broken or waiting on the human, then one at work, then one done or idle.
/** @type {Record<string, number>} */
const URGENCY = { blocked: 1, cracked: 0, done: 3, idle: 4, working: 2 };

/**
 * The lanes most urgent first and, at the same urgency, the latest started first.
 * @template {Pick<Lane, "status" | "since">} L
 * @param {L[]} lanes
 * @returns {L[]}
 */
export const byUrgency = (lanes) =>
  lanes.toSorted(
    (a, b) =>
      (URGENCY[a.status] ?? 5) - (URGENCY[b.status] ?? 5) ||
      (b.since ?? 0) - (a.since ?? 0),
  );

/**
 * The session a terminal comes from in the end: up its parents to the one that has none.
 * @param {LaneTerminal} terminal
 * @param {Map<string, LaneTerminal>} byAddress
 */
export const rootOf = (terminal, byAddress) => {
  let at = terminal;
  for (let depth = 0; depth < 8; depth += 1) {
    const up = byAddress.get(parentOf(at) ?? "");
    if (up === undefined) return at;
    at = up;
  }
  return at;
};

/**
 * Every lane of some spaces, most urgent first: the golems of each of their sessions, wherever their panes are. A
 * parent folder's forge shows the lanes of all its spaces together (forges.js lanesSpacesOf).
 * @param {string[]} spaceIds
 * @param {LaneTerminal[]} terminals
 * @param {Record<string, { used: number }>} contexts by terminal
 * @param {Record<string, number>} seen when each in-session subagent was first seen, in ms, by lane id
 * @param {Pick<SpaceInfo, "id" | "tabs">[]} [spaces] for the review sessions parked behind their views
 * @returns {(Lane & { space: string })[]} each with the space its session is in
 */
export const forgeLanes = (
  spaceIds,
  terminals,
  contexts,
  seen,
  spaces = [],
) => {
  const ids = new Set(spaceIds);
  const byAddress = new Map(
    terminals.map((terminal) => [terminal.address, terminal]),
  );
  /** @param {LaneTerminal} terminal the space its session is in */
  const spaceOf = (terminal) =>
    spaceOfTerminal(rootOf(terminal, byAddress), spaces) ?? "";
  const sessions = terminals.filter(
    (terminal) => terminal.state !== "finished" && ids.has(spaceOf(terminal)),
  );
  const seenLanes = new Set();
  return byUrgency(
    sessions
      .flatMap((session) =>
        lanesOf(session, terminals, contexts, seen).map((lane) => ({
          ...lane,
          space: spaceOf(session),
        })),
      )
      .filter((lane) => !seenLanes.has(lane.id) && seenLanes.add(lane.id)),
  );
};

// The lanes' block: one line folded (or with no lane); unfolded, its head and a row a lane, up to the rows it grows to
// before it scrolls.
export const LANES_SIZE = Object.freeze({ head: 34, maxRows: 5, row: 34 });

/**
 * @param {number} count lanes
 * @param {boolean} open unfolded
 */
export const lanesHeight = (count, open) =>
  open && count > 0
    ? LANES_SIZE.head + Math.min(count, LANES_SIZE.maxRows) * LANES_SIZE.row + 2
    : LANES_SIZE.row + 2;
