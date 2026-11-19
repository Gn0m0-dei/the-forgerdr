// The forgerdr manual over the window, until the design's own (M12): the plugin's cheat sheet, the one /forgerdr:help
// prints, read from the plugin the mod came from (name.js). Esc or its close control closes it.
import { h_flex, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { checking, closeOverlay, props, readTextFile } from "herdr";
import { control } from "../kit/control.js";
import { ICON, iconButton } from "../kit/sprites.js";
import { text } from "../kit/text.js";
import { BRAND, FONT, tokens } from "../kit/tokens.js";
import { ROOT } from "../name.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("./role.js").Role} Role */

/** @type {() => { overlay?: string } | null} */
const readProps = props;

const MISSING =
  "The manual is not here: run /forgerdr:setup to install the forgerdr look again.";

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const manual = (cx) => {
  let sheet = "";
  const task = checking()
    ? null
    : cx.spawn(async (cx) => {
        const found =
          ROOT === ""
            ? null
            : await readTextFile(`${ROOT}/references/cheatsheet.txt`).catch(
                () => null,
              );
        sheet = found ?? MISSING;
        cx.notify();
      });

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    return v_flex()
      .size_full()
      .bg(k.bg1)
      .border(2)
      .border_color(k.line)
      .child(
        h_flex()
          .flex_none()
          .items_center()
          .justify_between()
          .px(16)
          .py(10)
          .border_b(2)
          .border_color(k.line)
          .child(text("THE SMITH'S MANUAL", "display", 10, BRAND.forgeGold))
          .child(
            control(iconButton(ICON.close, k.muted), "manual-close", () =>
              closeOverlay(readProps()?.overlay ?? ""),
            ),
          ),
      )
      .child(
        v_flex()
          .id("manual-sheet")
          .flex_1()
          .min_h(0)
          .p(16)
          .overflow_y_scrollbar()
          .font_family(FONT.mono)
          .text_size(12)
          .text_color(k.fg)
          // One line a row, each kept whole: the sheet lines up in columns of spaces.
          .children(
            sheet.split("\n").map((line) =>
              div()
                .whitespace_nowrap()
                .child(line === "" ? " " : line),
            ),
          ),
      );
  };

  return { close: () => task?.cancel(), render };
};
