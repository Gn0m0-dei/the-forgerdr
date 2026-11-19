// A pane's header (design 04), for the layout's pane frames: what runs in it and where, and its golem's status, or
// RUNNING for a program that is not a shell. A click focuses the pane; while the pointer is on it, a ✕ closes it. The
// session bar has the controls that split and zoom. The app makes one copy per pane and tells it which in its props.
import { div } from "gpui-kit";
import { home, panes, props, run } from "herdr";
import { control } from "../kit/control.js";
import { paneHeader } from "../kit/panels.js";
import { ICON, iconButton } from "../kit/sprites.js";
import { tokens, toneOf } from "../kit/tokens.js";
import {
  folderLabel,
  PROGRAM_KIND,
  paneLabel,
  programKind,
} from "../sessions.js";

/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("./role.js").Role} Role */

/** @type {() => { pane?: string } | null} */
const readProps = props;

/** @returns {Role} */
export const pane = () => {
  let hovered = false;

  /** @param {Context} _cx */
  const render = (_cx) => {
    const id = readProps()?.pane;
    const me = panes().find((one) => one.pane === id);
    if (me === undefined) return div();
    return paneHeader({
      close: hovered
        ? control(
            iconButton(ICON.close, tokens().muted),
            `pane-close-${me.pane}`,
            () => run("pane.close", { pane: me.pane }),
          )
        : undefined,
      folder: folderLabel(me.cwd, home()),
      running: programKind(me.program) === PROGRAM_KIND.program,
      title: paneLabel(me),
      tone: me.status ? toneOf(me.status) : undefined,
    })
      .id(`pane-head-${me.pane}`)
      .on_hover((over, cx) => {
        hovered = over;
        cx.notify();
      })
      .on_click(() => run("pane.focus", { pane: me.pane }));
  };

  return { render };
};
