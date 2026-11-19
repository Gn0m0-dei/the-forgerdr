// What the New and Remove worktree dialogs (roles/new-worktree.js, roles/remove-worktree.js) work out from the app's
// live data: the spaces open on a worktree, the panes that close with it, the golems that keep it, whether it is still as
// last looked at, the item a new one is for and what bin/forge-worktree.sh is given. Pure: Node tests it
// (test/herdr-mod.test.mjs).
import { golemStatus, rootOf } from "./lanes.js";
import { MODE, modeKind } from "./modes.js";
import { cleanTitle, paneLabel, programKind, tabLabel } from "./sessions.js";
import { linkOf, workRows } from "./start.js";

/** @typedef {import("./lanes.js").LaneTerminal} LaneTerminal */
/** @typedef {import("./sessions.js").ProgramKind} ProgramKind */

/** @typedef {import("herdr").SpaceInfo} SpaceInfo */
/** @typedef {import("herdr").TabInfo} TabInfo */
/** @typedef {import("herdr").PaneInfo} PaneInfo */
/** @typedef {Pick<SpaceInfo, "id" | "folder" | "machine">} PlacedSpace */
/** @typedef {Pick<SpaceInfo, "id"> & { tabs: Pick<TabInfo, "id" | "name" | "named" | "panes">[] }} TabbedSpace */
/** @typedef {Pick<PaneInfo, "pane" | "tab" | "title" | "terminal" | "program">} ClosingPaneInfo */
/** @typedef {import("./bridges/forge.js").RemovalPlan} RemovalPlan */

// What a new worktree is for: its branch's kind, as Conventional Branch names them. A hotfix starts from the production
// branch, the others from the base (bin/forge-worktree.sh); a release is named by its version.
export const WORKTREE_KIND = Object.freeze({
  chore: "chore",
  feature: "feature",
  fix: "fix",
  hotfix: "hotfix",
  release: "release",
});

/** @typedef {typeof WORKTREE_KIND[keyof typeof WORKTREE_KIND]} WorktreeKind */

// The kinds as the dialog offers them, the everyday ones first.
/** @type {readonly WorktreeKind[]} */
export const WORKTREE_KINDS = Object.freeze([
  WORKTREE_KIND.feature,
  WORKTREE_KIND.fix,
  WORKTREE_KIND.chore,
  WORKTREE_KIND.hotfix,
  WORKTREE_KIND.release,
]);

/**
 * A pane that closes with a worktree, as the dialog lists it.
 * @typedef {{ id: string, label: string, kind: ProgramKind }} ClosingPane
 */

/**
 * A golem that keeps a worktree: at work or waiting on the human.
 * @typedef {{ id: string, name: string, status: "working" | "blocked" }} BusyGolem
 */

/**
 * What a new worktree is made from, as the dialog's form holds it.
 * @typedef {object} WorktreeForm
 * @property {string} repo where the forge's space is: its repository, or one of its worktrees
 * @property {string} item what itemArg made of the item field: a URL, an id, or "" for none
 * @property {string} title
 * @property {WorktreeKind} kind
 * @property {boolean} dev whether its dev server starts
 */

const AT_WORK = new Set(["working", "blocked"]);

// An id as a human types it: 12, #12, AB#12, AB12, or EXT-12 for an item of an external backlog.
const BARE_ID = /^(?:(?:AB)?#?|EXT-)\d+$/i;

const NOT_AN_ITEM =
  "not an id (#12, AB#12, EXT-12, 12) or an issue or work item URL";

/**
 * Whether a folder is a worktree's top or inside it.
 * @param {string} folder
 * @param {string} path the worktree's top
 */
const within = (folder, path) =>
  folder === path || folder.startsWith(`${path}/`);

/**
 * The folder a path is in.
 * @param {string} path
 */
export const folderOf = (path) => path.slice(0, path.lastIndexOf("/")) || "/";

/**
 * The spaces of this machine open on a worktree: on its folder or inside it, as bin/forge-worktree-remove.sh closes
 * them.
 * @template {PlacedSpace} S
 * @param {string} path the worktree's top
 * @param {S[]} spaces
 * @returns {S[]}
 */
export const spacesOn = (path, spaces) =>
  spaces.filter(
    (space) => space.machine === null && within(space.folder, path),
  );

/**
 * The terminals whose pane went into a worktree, wherever their space is: a shell of the main checkout's space that cd'ed
 * there, say. The removal does not close their spaces, but an agent in one works in the worktree.
 * @param {string} path the worktree's top
 * @param {Pick<PaneInfo, "cwd" | "terminal">[]} panes
 * @returns {string[]}
 */
export const terminalsIn = (path, panes) =>
  panes.flatMap((pane) =>
    pane.terminal !== null && pane.cwd !== null && within(pane.cwd, path)
      ? [pane.terminal]
      : [],
  );

/**
 * The panes of some spaces, in their order: a tab of one pane by its tab's name (a dev server's is "dev :3000"), a pane
 * of a tab of several by its own.
 * @param {TabbedSpace[]} spaces
 * @param {ClosingPaneInfo[]} panes
 * @returns {ClosingPane[]}
 */
export const closingPanes = (spaces, panes) =>
  spaces.flatMap((space) =>
    space.tabs.flatMap((tab) =>
      panes
        .filter((pane) => pane.tab === tab.id)
        .map((pane) => ({
          id: pane.pane,
          kind: programKind(pane.program),
          label: tab.panes === 1 ? tabLabel(tab, pane) : paneLabel(pane),
        })),
    ),
  );

/**
 * What a golem that keeps a worktree is doing: waiting on the human, or at work.
 * @param {LaneTerminal} terminal
 * @returns {BusyGolem["status"]}
 */
const busyStatus = (terminal) =>
  golemStatus(terminal) === "blocked" ? "blocked" : "working";

/**
 * The golems at work or waiting on the human in some spaces: the sessions there and every agent they dispatched,
 * wherever its pane is, any agent whose pane is there, wherever its session is (a subagent dispatched into a worktree's
 * space), and the terminals named, whose pane went into the worktree; the one waiting first.
 * @param {string[]} spaceIds
 * @param {LaneTerminal[]} terminals
 * @param {string[]} [inside] terminals whose pane is in the worktree (terminalsIn)
 * @returns {BusyGolem[]}
 */
export const golemsAtWork = (spaceIds, terminals, inside = []) => {
  const ids = new Set(spaceIds);
  const there = new Set(inside);
  const byAddress = new Map(
    terminals.map((terminal) => [terminal.address, terminal]),
  );
  return terminals
    .filter(
      (terminal) =>
        terminal.state !== "finished" &&
        AT_WORK.has(golemStatus(terminal)) &&
        (there.has(terminal.address) ||
          [terminal, rootOf(terminal, byAddress)].some((one) =>
            ids.has(one.labels?.["herdr.space"] ?? ""),
          )),
    )
    .map((terminal) => ({
      id: terminal.address,
      name: cleanTitle(terminal.title) || terminal.address,
      status: busyStatus(terminal),
    }))
    .toSorted(
      (a, b) => Number(b.status === "blocked") - Number(a.status === "blocked"),
    );
};

/**
 * Whether a worktree is still as the human last looked at it, to remove it: its plan answered again and lists no file
 * the one shown did not. A plan that cannot be read removes nothing.
 * @param {import("./bridges/forge.js").Loaded<RemovalPlan>} fresh
 * @param {RemovalPlan} known
 */
export const stillRemovable = (fresh, known) =>
  fresh.state === "ready" &&
  fresh.value.changes.every((file) => known.changes.includes(file));

// What a forge's backlog tells of the item field only names the line it reads; a way of working does not matter here.
/** @type {import("./start.js").Way} */
const ANY_WAY = Object.freeze({ dev: true, flow: "manual", where: "here" });

/**
 * The item a new worktree is for, as bin/forge-worktree.sh takes it, or why the field cannot be: with a backlog
 * (GitHub, GitLab, Azure DevOps) an id or a URL of it, an id completed with it, as Start work reads them; without one
 * (Chat, OpenSpec) any issue or work item URL, or an id as it is. An empty field is no item.
 * @param {string} text
 * @param {import("./modes.js").ModeInfo & import("./start.js").Origin & { host?: string }} info
 * @returns {{ value: string } | { error: string }}
 */
export const itemArg = (text, info) => {
  const given = text.trim();
  if (given === "") return { value: "" };
  const kind = modeKind(info.mode);
  if (kind === MODE.chat || kind === MODE.openspec) {
    const link = linkOf(given);
    if (link.kind === "item") return { value: link.url };
    if (link.kind === "pr")
      return { error: "a pull request: review it in Review" };
    return BARE_ID.test(given) ? { value: given } : { error: NOT_AN_ITEM };
  }
  const [row] = workRows(given, info, ANY_WAY);
  if (row?.kind === "item") return { value: row.value ?? given };
  if (BARE_ID.test(given)) return { value: given };
  return {
    error:
      row === undefined || row.action.startsWith("not ")
        ? NOT_AN_ITEM
        : row.action,
  };
};

/**
 * What bin/forge-worktree.sh is given to plan or make a new worktree: a shell in its space, no agent.
 * @param {WorktreeForm} form
 * @param {boolean} plan
 * @returns {string[]}
 */
export const worktreeArgs = (form, plan) => [
  ...(plan ? ["--plan"] : []),
  "--repo",
  form.repo,
  "--no-agent",
  ...(form.dev ? [] : ["--no-dev"]),
  "--kind",
  form.kind,
  "--title",
  form.title,
  form.item,
];
