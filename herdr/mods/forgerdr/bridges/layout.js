// The shown layout as the roles read it, and the sidebar's fold as the app's own chrome does it: the rail goes by the
// sidebar's width, not a flag, so dragging its edge narrows it too, and folding keeps the width it had in the same shared
// keys the app's mods read.
import { layout, run, setShared, settings, shared } from "herdr";

/**
 * @typedef {{ id?: string, active?: string, hidden?: boolean, size?: { px?: number }, children?: LayoutNode[] }} LayoutNode
 */

const SIDEBAR = Object.freeze({ id: "sidebar", rail: 44, width: 268 });

// Narrower than this, the sidebar is a rail.
export const RAIL = 160;

/**
 * @param {LayoutNode | undefined} node
 * @param {string} id
 * @returns {LayoutNode | undefined}
 */
const find = (node, id) =>
  node?.id === id
    ? node
    : (node?.children ?? []).reduce(
        (found, child) => found ?? find(child, id),
        undefined,
      );

/**
 * A node of the shown layout, by id: its size, whether it is hidden, the child a stack shows.
 * @param {string} id
 */
export const layoutNode = (id) =>
  // The app documents layout() as unknown; it is the shown layout's JSON, a tree of nodes with ids.
  find(/** @type {LayoutNode} */ (layout()), id);

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

// The side panel (Files, Changes) and the panes beside it; the width the panel had before it took the panes' place.
const PANEL = Object.freeze({
  body: "panel-body",
  changes: "changes",
  id: "panel",
  key: "forgerdr.panel.width",
  maximized: "forgerdr.changes.maximized",
  panes: "work-view",
  width: 368,
});

/** Whether the Changes panel is the side panel on show. */
export const changesShowing = () =>
  layoutNode(PANEL.id)?.hidden !== true &&
  layoutNode(PANEL.body)?.active === PANEL.changes;

/**
 * Whether the human wants the Changes panel in the panes' place whenever it shows: kept through the panel shutting and
 * the app restarting, until they say otherwise.
 */
export const changesMaximized = () => shared(PANEL.maximized) === true;

/** Keeps how the human wants the Changes panel, and shows it so. @param {boolean} on */
export const keepChangesMaximized = (on) => {
  setShared(PANEL.maximized, on);
  maximizePanel(on);
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
