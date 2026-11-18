// The work area with no space left (design 04c): the sleeping gnome and the button that opens a folder as a forge, with
// the system's folder picker. The session bar shows it in place of the panes (roles/sessions.js).
import { v_flex } from "gpui-base";
import { pickFolder, run } from "herdr";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { emptyState } from "../kit/panels.js";
import { tokens } from "../kit/tokens.js";

/** @typedef {import("./role.js").Role} Role */

const CARD = Object.freeze({ height: 420, width: 640 });

const openFolder = () =>
  void pickFolder({ prompt: "Light a forge" }).then((folder) => {
    if (folder !== null) run("space.new", { folder, machine: "" });
  });

/** @returns {Role} */
export const empty = () => ({
  render: () =>
    v_flex()
      .size_full()
      .items_center()
      .justify_center()
      .bg(tokens().bg0)
      .child(
        emptyState({
          action: control(
            keyButton(KEY_BUTTON.primary, "Open a folder…"),
            "no-forge-open",
            openFolder,
          ),
          caption: "No forge yet",
          sub: "Each folder becomes a forge with its own gnome, worktrees and golems.",
          title: "Open a folder to light a forge",
        })
          .w(CARD.width)
          .h(CARD.height),
      ),
});
