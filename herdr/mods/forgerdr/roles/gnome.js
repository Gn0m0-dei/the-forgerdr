// The dialog of a forge's gnome (design 14h): its name and its parts, which the human turns one by one, rolls anew or
// gives back to the ones the forge's key rolls, so each project keeps a face of its own that is quick to tell apart.
// Opened from the sidebar's gnome (a double click on its head) and from a forge's menu (a right click on its tab).
// Enter or KEEP keeps it, CANCEL or Esc leaves the gnome as it was; an empty name gives it back its brother's.
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { closeOverlay, openOverlay, props } from "herdr";
import { keepGnome, readGnomes } from "../bridges/gnomes.js";
import { renameForge } from "../bridges/names.js";
import {
  brotherOf,
  gnomeLookOf,
  PARTS_DOWN,
  rerolled,
  turnPart,
} from "../identity.js";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { gnome, ICON, icon } from "../kit/sprites.js";
import { fill, text } from "../kit/text.js";
import { BRAND, tokens } from "../kit/tokens.js";
import { MOD } from "../name.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("../identity.js").GnomeChoice} GnomeChoice */
/** @typedef {import("../identity.js").GnomePart} GnomePart */
/** @typedef {import("./role.js").Role} Role */

/**
 * @typedef {object} GnomeProps
 * @property {string} key the forge's (lookKeyOf)
 * @property {string} name its gnome's, as shown
 * @property {string} forge its name
 */

/** @type {() => (Partial<GnomeProps> & { overlay?: string }) | null} */
const readProps = props;

const DIALOG = Object.freeze({ height: 372, kind: "dialog", width: 560 });

const PREVIEW = Object.freeze({ box: 132, scale: 6 });

/**
 * Opens the dialog of a forge's gnome.
 * @param {GnomeProps} forge
 */
export const openGnome = (forge) =>
  openOverlay({ ...DIALOG, mod: MOD, props: { ...forge, role: "gnome" } });

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const gnomeDialog = (cx) => {
  const given = readProps() ?? {};
  const key = given.key ?? "";
  /** @type {GnomeChoice} */
  let choice = readGnomes()[key] ?? {};
  const input = InputState.new({ value: given.name ?? "" });
  if (given.name)
    input.set_selected_range({ end: given.name.length, start: 0 });
  const close = () => closeOverlay(given.overlay ?? "");
  const keep = () => {
    if (key !== "") {
      // The brother's own name is no name of the human's: it stays the key's.
      const name = input.value().trim();
      renameForge(key, name === brotherOf(key) ? "" : name);
      keepGnome(key, choice);
    }
    close();
  };
  input.on("submit", keep);
  input.focus();
  // The dialog takes the keyboard a moment after it opens.
  cx.timer.after(300, () => input.focus());

  /**
   * @param {GnomeChoice} next
   * @param {Context} cx
   */
  const choose = (next, cx) => {
    choice = next;
    input.focus();
    cx.notify();
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const look = gnomeLookOf(key, choice);
    const custom = Object.keys(choice).length > 0;
    /**
     * A part's row: its name, then its option between the arrows that turn it; a part the human picked shows in gold.
     * @param {GnomePart} part
     */
    const partRow = (part) => {
      /** @param {1 | -1} step */
      const turn = (step) => (/** @type {Context} */ cx) =>
        choose(turnPart(key, choice, part, step), cx);
      return h_flex()
        .h(24)
        .items_center()
        .gap(6)
        .child(
          div()
            .w(96)
            .child(text(part, "ui", 13, k.accent)),
        )
        .child(
          control(
            div().p(4).child(icon(ICON.chevronLeft, k.muted)),
            `gnome-${part}-back`,
            turn(-1),
          ),
        )
        .child(
          control(
            h_flex()
              .w(112)
              .justify_center()
              .child(
                text(
                  look[part],
                  "ui",
                  13,
                  choice[part] === undefined ? k.fg : BRAND.forgeGold,
                ),
              ),
            `gnome-${part}`,
            turn(1),
          ),
        )
        .child(
          control(
            div().p(4).child(icon(ICON.chevronRight, k.muted)),
            `gnome-${part}-on`,
            turn(1),
          ),
        );
    };
    return v_flex()
      .id("gnome-dialog")
      .size_full()
      .gap(14)
      .p(18)
      .bg(k.bg1)
      .border(2)
      .border_color(k.line)
      .child(
        h_flex().child(
          fill(
            `THE GNOME OF ${(given.forge ?? "").toUpperCase()}`,
            "display",
            10,
            BRAND.forgeGold,
          ),
        ),
      )
      .child(
        h_flex()
          .flex_1()
          .min_h(0)
          .items_start()
          .gap(20)
          .child(
            v_flex()
              .flex_none()
              .items_center()
              .gap(8)
              .child(
                h_flex()
                  .w(PREVIEW.box)
                  .h(PREVIEW.box)
                  .items_center()
                  .justify_center()
                  .bg(k.bg0)
                  .border(2)
                  .border_color(k.line)
                  .child(gnome({ ...look, scale: PREVIEW.scale })),
              )
              .child(
                text(
                  custom ? "YOUR OWN" : "ROLLED FROM THE KEY",
                  "display",
                  8,
                  k.muted,
                ),
              ),
          )
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(6)
              .child(text("NAME", "display", 8, k.muted))
              .child(
                Input.new(input)
                  .h(34)
                  .px(10)
                  .border(2)
                  .border_color(k.accent)
                  .bg(k.bg0)
                  .text_size(13)
                  .text_color(k.fg),
              )
              .child(
                text(
                  "Empty gives it back its brother's name.",
                  "ui",
                  11,
                  k.muted,
                ),
              )
              .child(div().h(4))
              .children(PARTS_DOWN.map(partRow)),
          ),
      )
      .child(
        h_flex()
          .items_center()
          .gap(10)
          .child(
            control(
              keyButton(KEY_BUTTON.secondary, "Re-roll"),
              "gnome-reroll",
              (cx) => choose(rerolled(key, choice), cx),
            ),
          )
          .when(custom, (el) =>
            el.child(
              control(
                keyButton(KEY_BUTTON.ghost, "Back to the key's"),
                "gnome-reset",
                (cx) => choose({}, cx),
              ),
            ),
          )
          .child(div().flex_1())
          .child(
            control(
              text("CANCEL", "display", 9, k.muted),
              "gnome-cancel",
              close,
            ),
          )
          .child(
            control(
              keyButton(KEY_BUTTON.primary, "Keep", { key: "↵" }),
              "gnome-keep",
              keep,
            ),
          ),
      );
  };

  return { render };
};
