// A dialog that renames a forge's gnome, opened from the sidebar's gnome (a double click on its head). Enter keeps the
// name, Esc leaves it as it was; an empty name gives the gnome back its brother's.
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import { closeOverlay, props } from "herdr";
import { renameForge } from "../bridges/names.js";
import { control } from "../kit/control.js";
import { text } from "../kit/text.js";
import { BRAND, tokens } from "../kit/tokens.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("./role.js").Role} Role */

/** @type {() => { key?: string, value?: string, overlay?: string } | null} */
const readProps = props;

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const rename = (cx) => {
  const given = readProps() ?? {};
  const input = InputState.new({ value: given.value ?? "" });
  if (given.value)
    input.set_selected_range({ end: given.value.length, start: 0 });
  const close = () => closeOverlay(given.overlay ?? "");
  const keep = () => {
    if (given.key !== undefined) renameForge(given.key, input.value());
    close();
  };
  input.on("submit", keep);
  input.focus();
  // The dialog takes the keyboard a moment after it opens.
  cx.timer.after(300, () => input.focus());

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    return v_flex()
      .id("rename")
      .size_full()
      .gap(12)
      .p(18)
      .bg(k.bg1)
      .border(2)
      .border_color(k.line)
      .child(text("RENAME THE GNOME", "display", 10, BRAND.forgeGold))
      .child(
        Input.new(input)
          .h(36)
          .px(10)
          .border(2)
          .border_color(k.accent)
          .bg(k.bg0)
          .text_size(13)
          .text_color(k.fg),
      )
      .child(text("Empty gives it back its brother's name.", "ui", 11, k.muted))
      .child(
        h_flex()
          .justify_end()
          .gap(10)
          .child(
            control(
              text("CANCEL", "display", 9, k.muted),
              "rename-cancel",
              close,
            ),
          )
          .child(
            control(text("KEEP", "display", 9, k.accent), "rename-keep", keep),
          ),
      );
  };

  return { render };
};
