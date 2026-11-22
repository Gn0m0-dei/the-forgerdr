// What the session bar and the pane headers tell of a terminal, as the app's own tab bar and pane header tell it: a
// tab's and a pane's name, which kind of program runs there, how a special session's view's tab is drawn, its folder,
// and where a wheel swipe on the bar goes. Pure: Node tests it (test/herdr-mod.test.mjs).
import { golemStatus } from "./lanes.js";
import { SPECIAL_LOOK, specialTabOf } from "./specials.js";

/** @typedef {import("herdr").AgentInfo} AgentInfo */
/** @typedef {import("herdr").PaneInfo} PaneInfo */
/** @typedef {import("herdr").Program} Program */
/** @typedef {import("herdr").Status} Status */
/** @typedef {import("./kit/sprites.js").IconName} IconName */
/** @typedef {import("./lanes.js").LaneTerminal} LaneTerminal */

/**
 * What a terminal tells of itself: its title, its address and the program in it.
 * @typedef {object} Lead
 * @property {string} title
 * @property {string | null} terminal
 * @property {Program | undefined} program
 */

export const PROGRAM_KIND = Object.freeze({
  agent: "agent",
  program: "program",
  shell: "shell",
});

/** @typedef {typeof PROGRAM_KIND[keyof typeof PROGRAM_KIND]} ProgramKind */

/**
 * A title without the status glyph an agent puts before it, keeping a leading bracket or quote, as the app's lists show
 * it.
 * @param {string | null | undefined} title
 */
export const cleanTitle = (title) =>
  (title ?? "")
    .replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "")
    .replace(/^\[ [!.] \] /, "")
    .trim();

/**
 * What an agent calls itself now, when its title tells something: not a path, an address, its program's name or its
 * terminal's.
 * @param {Lead} lead
 * @returns {string | undefined}
 */
const liveTitle = ({ title, terminal, program }) => {
  const live = cleanTitle(title);
  // cleanTitle would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test(
    (title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""),
  );
  const telling =
    live !== "" &&
    live !== terminal &&
    live !== program?.name &&
    !path &&
    !live.includes("@") &&
    live.toLowerCase() !== program?.key;
  return telling ? live : undefined;
};

/**
 * A tab's name: one the human gave stays; one the app gave (none, or its program's) follows its agent's live title.
 * @param {{ name: string, named: boolean }} tab
 * @param {Lead | undefined} lead the agent in it, else its first pane
 */
export const tabLabel = (tab, lead) => {
  const program = lead?.program;
  const base = tab.named ? tab.name : (program?.name ?? "Terminal");
  if (lead === undefined || !program?.agent) return base;
  const live = liveTitle(lead);
  return (tab.name === program.name || !tab.named) && live !== undefined
    ? live
    : base;
};

/**
 * A pane's name in its header: an agent's live title, else its program's; a shell's program; another program's title.
 * @param {Lead} pane
 */
export const paneLabel = (pane) => {
  const { program } = pane;
  if (program?.agent) return liveTitle(pane) ?? program.name;
  if (program?.shell) return program.name;
  return pane.title || program?.name || "shell";
};

/** @param {Program | undefined} program what runs in front: an agent, a shell, or a program such as a dev server */
export const programKind = (program) => {
  if (program?.agent) return PROGRAM_KIND.agent;
  return program === undefined || program.shell
    ? PROGRAM_KIND.shell
    : PROGRAM_KIND.program;
};

/**
 * How the bar draws a tab that holds a special session's view alone, with no terminal: the view's icon, and the status
 * of the session the view belongs to, failed while its golem is cracked.
 * @typedef {object} SpecialTabLook
 * @property {IconName} icon
 * @property {Status | "failed" | null} status null when herdr lists the session as no agent
 */

/**
 * A tab's look when it holds a special session's view (specials.js) and no terminal; null for any other tab, which
 * draws as what runs in it.
 * @param {string} tab
 * @param {Pick<PaneInfo, "tab" | "terminal">[]} panes every pane; a mod pane has no terminal
 * @param {LaneTerminal[]} terminals
 * @param {Pick<AgentInfo, "address" | "status">[]} agents herdr's, the parked review and security sessions among them
 *   (readAgents)
 * @returns {SpecialTabLook | null}
 */
export const specialTabLook = (tab, panes, terminals, agents) => {
  const view = specialTabOf(tab, terminals);
  if (
    view === null ||
    panes.some((pane) => pane.tab === tab && pane.terminal !== null)
  )
    return null;
  const { address } = view.terminal;
  const agent = agents.find((one) => one.address === address);
  const cracked = golemStatus(view.terminal) === "cracked";
  return {
    icon: SPECIAL_LOOK[view.special].icon,
    status: agent === undefined ? null : cracked ? "failed" : agent.status,
  };
};

/**
 * A folder as the human reads it: under the home folder as ~.
 * @param {string | null} cwd
 * @param {string} home
 */
export const folderLabel = (cwd, home) => {
  if (!cwd) return "";
  if (cwd === home) return "~";
  return cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd;
};

// One tab per wheel notch. A touchpad or a smooth-scrolling mouse sends many small events per gesture: a short swipe or
// one smoothed notch switches one tab, a longer swipe keeps going a tab per `next` px, at most one every `every` ms so
// each shows. A pause or a turn starts a new gesture.
export const SWIPE = Object.freeze({
  every: 100,
  first: 20,
  next: 60,
  pause: 250,
});

/** @typedef {{ acc: number, at: number, last: number, steps: number }} Swipe */

/** @returns {Swipe} */
export const newSwipe = () => ({ acc: 0, at: 0, last: 0, steps: 0 });

/**
 * Where one wheel event on the bar goes: the previous tab (scrolled up), the next, or nowhere yet.
 * @param {Swipe} swipe the gesture so far
 * @param {{ dy: number, lines?: number, started: boolean }} wheel pixels down, lines when the device counts them
 * @param {number} now
 * @returns {{ go: "prev" | "next" | null, swipe: Swipe }}
 */
export const swipeTab = (swipe, { dy, lines, started }, now) => {
  if (lines !== undefined) {
    return { go: lines === 0 ? null : lines > 0 ? "prev" : "next", swipe };
  }
  const fresh = started || now - swipe.at > SWIPE.pause || dy * swipe.acc < 0;
  const acc = (fresh ? 0 : swipe.acc) + dy;
  const steps = fresh ? 0 : swipe.steps;
  const need = steps > 0 ? SWIPE.next : SWIPE.first;
  if (Math.abs(acc) < need || now - swipe.last < SWIPE.every) {
    return { go: null, swipe: { ...swipe, acc, at: now, steps } };
  }
  return {
    go: dy > 0 ? "prev" : "next",
    swipe: {
      acc: acc - Math.sign(acc) * need,
      at: now,
      last: now,
      steps: steps + 1,
    },
  };
};
