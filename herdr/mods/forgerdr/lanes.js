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
 * @property {string} [state] live or finished
 * @property {string | null} [parent]
 * @property {string | null} [title]
 * @property {number} [created_ms]
 * @property {number} [status_ms] when its status last changed
 * @property {string} [status] working, blocked, done, idle
 * @property {Record<string, string>} [labels]
 * @property {{ msg?: string | null }} [report] what the agent says it is doing
 * @property {Record<string, { state?: string, title?: string }>} [records] its in-session subagents, by id
 */

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
 * @param {Lane[]} lanes
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
const rootOf = (terminal, byAddress) => {
  let at = terminal;
  for (let depth = 0; depth < 8; depth += 1) {
    const up = byAddress.get(parentOf(at) ?? "");
    if (up === undefined) return at;
    at = up;
  }
  return at;
};

/**
 * Every lane of a space, most urgent first: the golems of each of its sessions, wherever their panes are.
 * @param {string} spaceId
 * @param {LaneTerminal[]} terminals
 * @param {Record<string, { used: number }>} contexts by terminal
 * @param {Record<string, number>} seen when each in-session subagent was first seen, in ms, by lane id
 */
export const spaceLanes = (spaceId, terminals, contexts, seen) => {
  const byAddress = new Map(
    terminals.map((terminal) => [terminal.address, terminal]),
  );
  const sessions = terminals.filter(
    (terminal) =>
      terminal.state !== "finished" &&
      rootOf(terminal, byAddress).labels?.["herdr.space"] === spaceId,
  );
  const seenLanes = new Set();
  return byUrgency(
    sessions
      .flatMap((session) => lanesOf(session, terminals, contexts, seen))
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
