// Where a space is: what the app does not tell of it, read from its panes. The folder the app gives a space is where its
// new terminals start, not where it is.
import { panes } from "herdr";

/**
 * Where a space is now: its first terminal's live folder, else where its terminals start.
 * @param {import("herdr").SpaceInfo} space
 */
export const placeOf = (space) => {
  const tabs = new Set(space.tabs.map((tab) => tab.id));
  return (
    panes().find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd ?? space.folder
  );
};
