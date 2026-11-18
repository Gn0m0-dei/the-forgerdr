// The shown layout as the roles read it, and the sidebar's fold as the app's own chrome does it: the rail goes by the
// sidebar's width, not a flag, so dragging its edge narrows it too, and folding keeps the width it had in the same shared
// keys the app's mods read.
import { layout, run, setShared, shared } from "herdr";

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
