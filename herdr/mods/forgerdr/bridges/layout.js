// The shown layout as the roles read it, and the sidebar's fold as the app's own chrome does it: the rail goes by the
// sidebar's width, not a flag, so dragging its edge narrows it too, and folding keeps the width it had in the same shared
// keys the app's mods read.
import { layout, run, setShared, settings, shared } from "herdr";
import { PANEL_MAXIMIZED, wantsMaximized } from "../sessions.js";

/**
 * @typedef {{ id?: string, type?: string, active?: string, hidden?: boolean, size?: { px?: number }, content?: unknown, children?: LayoutNode[] }} LayoutNode
 */
/** @typedef {import("../sessions.js").SidePanel} SidePanel */

const SIDEBAR = Object.freeze({ id: "sidebar", rail: 44, width: 268 });

// Narrower than this, the sidebar is a rail.
export const RAIL = 160;

/**
 * A node of a layout's tree, by id.
 * @param {LayoutNode | undefined} node
 * @param {string} id
 * @returns {LayoutNode | undefined}
 */
export const nodeIn = (node, id) =>
  node?.id === id
    ? node
    : (node?.children ?? []).reduce(
        (found, child) => found ?? nodeIn(child, id),
        undefined,
      );

/** The shown layout, with its clicks: read it once for several of its nodes. */
export const shownLayout = () =>
  // The app documents layout() as unknown; it is the shown layout's JSON, a tree of nodes with ids.
  /** @type {LayoutNode} */ (layout());

/**
 * A node of the shown layout, by id: its size, whether it is hidden, the child a stack shows.
 * @param {string} id
 */
export const layoutNode = (id) => nodeIn(shownLayout(), id);

/** The side panels the human keeps on the session bar (the app's welcome and settings set them). */
export const enabledPanels = () =>
  // The app's own mods write this key, always as a list of panel ids.
  /** @type {string[] | null} */ (shared("workspace.panels")) ?? [
    "files",
    "changes",
  ];

/**
 * Window px per layout px: the app's zoom, which settings() carries. A press's place and a measured size come in
 * window px; what a script writes (`h`, `w`, a scroll offset) is in layout ones.
 * @returns {number}
 */
export const zoomOf = () => {
  const { zoom } = settings();
  return typeof zoom === "number" ? zoom : 1;
};

// The side panel (the IDE, Changes) and the panes beside it; the width the panel had before it took the panes' place.
const PANEL = Object.freeze({
  body: "panel-body",
  id: "panel",
  key: "forgerdr.panel.width",
  panes: "work-view",
  width: 368,
});

/**
 * The side panel on show, by its block's id; null with none, or in a layout without one.
 * @param {LayoutNode} [tree] the shown layout, when it was read already
 * @returns {string | null}
 */
export const panelOnShow = (tree = shownLayout()) => {
  const panel = nodeIn(tree, PANEL.id);
  return panel === undefined || panel.hidden
    ? null
    : (nodeIn(tree, PANEL.body)?.active ?? null);
};

/**
 * Whether the human wants a side panel in the panes' place whenever it shows, each panel as they last said for it (the
 * IDE until they say, Changes not): kept through the panel shutting and the app restarting.
 * @param {string | null} panel
 */
export const panelWantsMaximized = (panel) => wantsMaximized(panel, shared);

/**
 * Keeps how the human wants a side panel, and shows it so.
 * @param {SidePanel} panel
 * @param {boolean} on
 */
export const keepPanelMaximized = (panel, on) => {
  setShared(PANEL_MAXIMIZED[panel].key, on);
  maximizePanel(on);
};

/** Shuts the side panel; its switch on the session bar shows it again. */
export const hidePanel = () => run("layout.hide", { id: PANEL.id });

/** @param {string | null} id the side panel to show, by its block's id; null to shut it */
export const showPanel = (id) => {
  if (id === null) {
    hidePanel();
    return;
  }
  run("layout.select", { child: id, stack: PANEL.body });
  run("layout.show", { id: PANEL.id });
};

/** Whether the side panel takes the panes' place too. */
export const panelMaximized = () => layoutNode(PANEL.panes)?.hidden === true;

/**
 * Gives the side panel the panes' place, between the sidebar and the inbox, or back the width it had beside them.
 * @param {boolean} on
 */
export const maximizePanel = (on) => {
  if (on === panelMaximized()) return;
  if (on) {
    setShared(PANEL.key, layoutNode(PANEL.id)?.size?.px ?? PANEL.width);
    run("layout.hide", { id: PANEL.panes });
    run("layout.resize", { id: PANEL.id, weight: 1 });
    return;
  }
  run("layout.show", { id: PANEL.panes });
  run("layout.resize", { id: PANEL.id, px: shared(PANEL.key) ?? PANEL.width });
};

/** To the rail, or back to the width it had. */
export const foldSidebar = () => {
  const width = layoutNode(SIDEBAR.id)?.size?.px;
  const folded = width !== undefined && width < RAIL;
  if (width !== undefined && !folded) setShared("sidebar.width", width);
  // Mods written before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !folded);
  run("layout.resize", {
    id: SIDEBAR.id,
    px: folded ? (shared("sidebar.width") ?? SIDEBAR.width) : SIDEBAR.rail,
  });
};
