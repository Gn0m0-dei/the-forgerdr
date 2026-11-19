// A forge's menu, opened by a right click on its tab: its gnome's dialog, then what the app's own space menu does on
// the space the tab shows (rename, new, open and remove worktree, close), whose items the app's menu does not let a
// mod add to. ↑ and ↓ move, Enter runs, Esc closes.
import { h_flex, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { closeOverlay, openOverlay, props, run } from "herdr";
import { readSpacesGit } from "../bridges/git.js";
import { readGnomes } from "../bridges/gnomes.js";
import { gnomeLookOf } from "../identity.js";
import { gnome, ICON, icon } from "../kit/sprites.js";
import { text } from "../kit/text.js";
import { tokens } from "../kit/tokens.js";
import { MOD } from "../name.js";
import { openGnome } from "./gnome.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../kit/sprites.js").IconName} IconName */
/** @typedef {import("./role.js").Role} Role */

/**
 * @typedef {object} ForgeTarget
 * @property {string} key the forge's (lookKeyOf)
 * @property {string} name its gnome's, as shown
 * @property {string} forge its name
 * @property {string} main its main checkout's space, which bears the forge's name
 * @property {string} space the space its tab shows
 */

/** @type {() => (Partial<ForgeTarget> & { overlay?: string }) | null} */
const readProps = props;

const ROW = 30;
const RULE = 9;
const PAD = 5;

// The app's worktree dialog, as its space menu opens it.
const WORKTREE = Object.freeze({
  new: { height: 260, width: 440 },
  open: { height: 480, width: 560 },
  remove: { height: 260, width: 440 },
});

/** @param {string} space @param {keyof typeof WORKTREE} action */
const worktree = (space, action) =>
  openOverlay({
    ...WORKTREE[action],
    kind: "dialog",
    mod: "worktree",
    props: { action, space },
  });

/**
 * @typedef {object} MenuItem
 * @property {string} label
 * @property {"gnome" | IconName | null} mark
 * @property {() => void} act
 * @property {boolean} [ruled] a rule above it
 */

/**
 * The menu's items for a forge, the worktree ones only in git and the removal only on a worktree.
 * @param {ForgeTarget} target
 * @returns {MenuItem[]}
 */
const itemsOf = (target) => {
  const git = readSpacesGit()[target.space] ?? null;
  return [
    {
      act: () =>
        openGnome({ forge: target.forge, key: target.key, name: target.name }),
      label: "Edit gnome…",
      mark: "gnome",
    },
    {
      act: () => run("space.rename", { id: target.main }),
      label: "Rename",
      mark: null,
    },
    ...(git === null
      ? []
      : [
          {
            act: () => worktree(target.space, "new"),
            label: "New worktree",
            mark: ICON.branch,
          },
          {
            act: () => worktree(target.space, "open"),
            label: "Open worktree",
            mark: ICON.branch,
          },
        ]),
    ...(git?.linked
      ? [
          {
            act: () => worktree(target.space, "remove"),
            label: "Remove worktree",
            mark: ICON.branch,
          },
        ]
      : []),
    {
      act: () => run("space.close", { id: target.space }),
      label: "Close",
      mark: ICON.close,
      ruled: true,
    },
  ];
};

/**
 * Opens a forge's menu where the pointer is, as tall as its items.
 * @param {ForgeTarget} target
 */
export const openForgeMenu = (target) => {
  const items = itemsOf(target);
  const rules = items.filter((item) => item.ruled).length;
  openOverlay({
    height: items.length * ROW + rules * RULE + PAD * 2 + 4,
    kind: "popup",
    mod: MOD,
    props: { ...target, role: "forge-menu" },
    width: 200,
  });
};

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const forgeMenu = (cx) => {
  const given = readProps() ?? {};
  /** @type {ForgeTarget} */
  const target = {
    forge: given.forge ?? "",
    key: given.key ?? "",
    main: given.main ?? "",
    name: given.name ?? "",
    space: given.space ?? "",
  };
  const items = itemsOf(target);
  const handle = cx.focus_handle();
  handle.focus();
  let at = 0;

  /** @param {number} index */
  const choose = (index) => {
    const item = items[index];
    if (item === undefined) return;
    closeOverlay(given.overlay ?? "");
    item.act();
  };

  /** @param {MenuItem["mark"]} mark */
  const markOf = (mark) => {
    const k = tokens();
    if (mark === "gnome")
      return gnome({
        ...gnomeLookOf(target.key, readGnomes()[target.key]),
        scale: 1,
      });
    return mark === null
      ? div().flex_none().w(16)
      : div()
          .flex_none()
          .w(16)
          .flex()
          .justify_center()
          .child(icon(mark, k.muted));
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    return v_flex()
      .id("forge-menu")
      .track_focus(handle)
      .size_full()
      .p(PAD)
      .bg(k.bg1)
      .border(2)
      .border_color(k.line)
      .on_key_down((event, cx) => {
        if (event.key === "down") at = (at + 1) % items.length;
        else if (event.key === "up")
          at = (at + items.length - 1) % items.length;
        else if (event.key === "enter") choose(at);
        else if (event.key === "escape") closeOverlay(given.overlay ?? "");
        else return;
        cx.notify();
      })
      .children(
        items.map((item, index) =>
          v_flex()
            .when(item.ruled === true, (el) =>
              el.child(div().mx(6).my(4).h(1).bg(k.line)),
            )
            .child(
              h_flex()
                .id(`forge-menu-${index}`)
                .h(ROW)
                .px(8)
                .gap(9)
                .items_center()
                .cursor_pointer()
                .when(index === at, (el) => el.bg(k.bg3))
                .hover((style) => style.bg(k.bg2))
                .on_click(() => choose(index))
                .child(markOf(item.mark))
                .child(text(item.label, "ui", 13, k.fg)),
            ),
        ),
      );
  };

  return {
    close: () => {
      handle.release();
    },
    render,
  };
};
