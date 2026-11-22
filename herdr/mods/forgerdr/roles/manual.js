// The smith's manual (design 08), over the window: every key the app answers to, from keys(), grouped as manual.js groups
// them, and forgerdr's commands from the cheat sheet /forgerdr:help prints, read from the plugin the mod came from
// (name.js). Typing narrows them; Esc or its close control closes it. The keys are the person's, in keys.json: the
// manual only reads them, since an edit there stops the app adding its new default keys.
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import {
  checking,
  closeOverlay,
  keys,
  openOverlay,
  props,
  readTextFile,
} from "herdr";
import { keyCaps } from "../format.js";
import { kbdHint } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { ICON, icon, iconButton } from "../kit/sprites.js";
import { fill, text, wrapped } from "../kit/text.js";
import { BRAND, tokens } from "../kit/tokens.js";
import { commandRows, filterRows, keyRows, MANUAL_SECTION } from "../manual.js";
import { MOD, ROOT } from "../name.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("../manual.js").ManualRow} ManualRow */
/** @typedef {import("../manual.js").ManualSection} ManualSection */
/** @typedef {import("./role.js").Role} Role */

/** @type {() => { overlay?: string } | null} */
const readProps = props;

/** @type {Readonly<Record<ManualSection, string>>} */
const TITLE = Object.freeze({
  commands: "FORGERDR COMMANDS",
  forge: "THE FORGE",
  forges: "FORGES AND PANES",
  sessions: "GOLEMS AND SESSIONS",
  terminal: "TERMINAL",
});

// The two columns of keys; forgerdr's commands run under both, too wide for one.
const COLUMNS = Object.freeze([
  [MANUAL_SECTION.forges, MANUAL_SECTION.sessions],
  [MANUAL_SECTION.forge, MANUAL_SECTION.terminal],
]);

const COMMAND_WIDTH = 440;

const DIALOG = Object.freeze({ height: 720, kind: "dialog", width: 1040 });

// From ? MANUAL on the status bar, or the forgerdr.manual key the top bar takes.
export const openManual = () =>
  openOverlay({ ...DIALOG, mod: MOD, props: { role: "manual" } });

/** What a plugin.json holds that the manual shows. @type {(text: string) => { version?: string }} */
const parseManifest = JSON.parse;

/**
 * A file of the plugin; null when there is none, or when it cannot be read, which is logged.
 * @param {string} path
 * @returns {Promise<string | null>}
 */
const readOrNull = (path) =>
  readTextFile(path).catch((error) => {
    console.error(`forgerdr: the manual could not read ${path}`, error);
    return null;
  });

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const manual = (cx) => {
  /** @type {ManualRow[]} */
  let commands = [];
  let version = "";
  let query = "";
  const search = InputState.new({ placeholder: "Search keys and commands" });
  search.on("change", (_event, cx) => {
    query = search.value();
    cx.notify();
  });
  const task = checking()
    ? null
    : cx.spawn(async (cx) => {
        search.focus();
        if (ROOT === "") return;
        const [sheet, manifest] = await Promise.all([
          readOrNull(`${ROOT}/references/cheatsheet.txt`),
          readOrNull(`${ROOT}/.claude-plugin/plugin.json`),
        ]);
        commands = commandRows(sheet ?? "");
        try {
          version = parseManifest(manifest ?? "{}").version ?? "";
        } catch (error) {
          console.error(
            "forgerdr: the manual could not read plugin.json",
            error,
          );
        }
        cx.notify();
      });

  /**
   * A binding's keys, a cap each; a numbered run reads first – last, several bindings first / second. A forgerdr
   * command with no key shows the name keys.json binds it by.
   * @param {ManualRow} row
   */
  const bindings = (row) => {
    const k = tokens();
    if (row.keys.length === 0)
      return text(`no key · ${row.detail}`, "mono", 11, k.muted);
    return h_flex()
      .flex_none()
      .items_center()
      .gap(4)
      .children(
        row.keys.flatMap((binding, index) => [
          ...(index === 0
            ? []
            : [text(row.range ? "–" : "/", "ui", 12, k.muted).px(2)]),
          ...keyCaps(binding).map(kbdHint),
        ]),
      );
  };

  /**
   * @param {ManualRow} row
   * @param {boolean} found
   */
  const keyRow = (row, found) => {
    const k = tokens();
    return h_flex()
      .items_center()
      .gap(12)
      .h(34)
      .px(12)
      .border_l(2)
      .border_color(found ? k.accent : k.bg1)
      .when(found, (el) => el.bg(k.bg2))
      .child(fill(row.label, "ui", 14, k.fg))
      .child(bindings(row));
  };

  /** @param {ManualRow} row */
  const commandRow = (row) => {
    const k = tokens();
    return h_flex()
      .items_start()
      .gap(16)
      .px(12)
      .py(6)
      .child(text(row.label, "mono", 12, k.accent).w(COMMAND_WIDTH).truncate())
      .child(wrapped(row.detail, "ui", 13, k.muted).flex_1());
  };

  /**
   * @param {ManualSection} section
   * @param {ManualRow[]} rows
   * @param {boolean} found
   */
  const block = (section, rows, found) =>
    v_flex()
      .gap(2)
      .child(text(TITLE[section], "display", 10, BRAND.forgeGold).pb(8).pl(2))
      .children(
        rows.map((row) =>
          section === MANUAL_SECTION.commands
            ? commandRow(row)
            : keyRow(row, found),
        ),
      );

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const rows = filterRows([...keyRows(keys()), ...commands], query);
    const found = query.trim() !== "";
    /** @param {ManualSection} section */
    const of = (section) => rows.filter((row) => row.section === section);
    /** @param {ManualSection[]} sections */
    const column = (sections) =>
      v_flex()
        .flex_1()
        .min_w(0)
        .gap(28)
        .children(
          sections
            .filter((section) => of(section).length > 0)
            .map((section) => block(section, of(section), found)),
        );
    const listed = of(MANUAL_SECTION.commands);
    return v_flex()
      .size_full()
      .bg(k.bg1)
      .border(2)
      .border_color(k.line)
      .child(
        h_flex()
          .flex_none()
          .items_center()
          .gap(16)
          .px(24)
          .py(18)
          .border_b(2)
          .border_color(k.line)
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(8)
              .child(text("THE SMITH'S MANUAL", "display", 18, k.fg))
              .child(
                text(
                  "Every key the forge answers to, and forgerdr's commands.",
                  "ui",
                  14,
                  k.muted,
                ),
              ),
          )
          .child(
            h_flex()
              .flex_none()
              .w(340)
              .h(36)
              .px(10)
              .gap(8)
              .items_center()
              .bg(k.bg0)
              .border(2)
              .border_color(k.accent)
              .child(icon(ICON.search, k.muted))
              .child(Input.new(search).flex_1().text_size(14).text_color(k.fg)),
          )
          .child(kbdHint("ESC"))
          .child(
            control(iconButton(ICON.close, k.muted), "manual-close", () =>
              closeOverlay(readProps()?.overlay ?? ""),
            ),
          ),
      )
      .child(
        v_flex()
          .id("manual-body")
          .flex_1()
          .min_h(0)
          .px(24)
          .py(20)
          .gap(28)
          .overflow_y_scrollbar()
          .when(rows.length === 0, (el) =>
            el.child(
              text(`Nothing answers to "${query.trim()}".`, "ui", 14, k.muted),
            ),
          )
          .child(
            h_flex()
              .items_start()
              .gap(40)
              .children(COLUMNS.map((sections) => column([...sections]))),
          )
          .when(listed.length > 0, (el) =>
            el.child(block(MANUAL_SECTION.commands, listed, found)),
          ),
      )
      .child(
        h_flex()
          .flex_none()
          .items_center()
          .justify_between()
          .gap(16)
          .px(24)
          .py(12)
          .border_t(2)
          .border_color(k.line)
          .child(
            fill(
              "Keys are yours, in keys.json; /forgerdr:setup adds forgerdr's.",
              "ui",
              13,
              k.muted,
            ),
          )
          .when(version !== "", (el) =>
            el.child(text(`forgerdr ${version}`, "ui", 13, k.muted)),
          ),
      );
  };

  return {
    close: () => {
      task?.cancel();
      search.release();
    },
    render,
  };
};
