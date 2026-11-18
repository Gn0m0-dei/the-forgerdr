// The sidebar's fold, as the app's own chrome does it: the rail goes by the sidebar's width, not a flag, so dragging its
// edge narrows it too, and folding keeps the width it had in the same shared keys the app's mods read.
import { layout, run, setShared, shared } from "herdr";

/** @typedef {{ id?: string, size?: { px?: number }, children?: LayoutNode[] }} LayoutNode */

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

/** The sidebar's width in the shown layout; undefined when it has none or sizes by weight. */
const sidebarWidth = () =>
  // The app documents layout() as unknown; it is the shown layout's JSON, a tree of nodes with ids.
  find(/** @type {LayoutNode} */ (layout()), SIDEBAR.id)?.size?.px;

/** To the rail, or back to the width it had. */
export const foldSidebar = () => {
  const width = sidebarWidth();
  const folded = width !== undefined && width < RAIL;
  if (width !== undefined && !folded) setShared("sidebar.width", width);
  // Mods written before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !folded);
  run("layout.resize", {
    id: SIDEBAR.id,
    px: folded ? (shared("sidebar.width") ?? SIDEBAR.width) : SIDEBAR.rail,
  });
};
