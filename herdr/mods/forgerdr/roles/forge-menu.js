// A forge's menu, opened by a right click on its tab, on its gnome or on a checkout's row of the sidebar: Start work and
// its gnome's dialog, then what the app's own space menu does on the space the tab or the row shows (rename, new, open
// and remove worktree, close), whose items the app's menu does not let a mod add to. New and Remove worktree are
// forgerdr's own dialogs (roles/new-worktree.js, roles/remove-worktree.js) on this machine, the app's on another, where
// forgerdr's scripts do not run; Remove worktree asks first about the files its IDE ttt holds unsaved
// (roles/ide-leave.js). On a row of the sidebar on this machine, it opens the row's folder in each editor installed
// (bin/forge-ide.sh editors). ↑ and ↓ move, Enter runs, Esc closes.
import { h_flex, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { closeOverlay, openOverlay, props, run, spaces } from "herdr";
import { readFolders, readSpacesGit } from "../bridges/git.js";
import { readGnomes } from "../bridges/gnomes.js";
import { openInEditor, readEditors } from "../bridges/ide.js";
import { placeOf } from "../bridges/places.js";
import { groupForges } from "../forges.js";
import { gnomeLookOf } from "../identity.js";
import { gnome, ICON, icon } from "../kit/sprites.js";
import { text } from "../kit/text.js";
import { tokens } from "../kit/tokens.js";
import { MOD } from "../name.js";
import { openGnome } from "./gnome.js";
import { removeWorktreeAsking } from "./ide-leave.js";
import { openMode } from "./mode.js";
import { openNewWorktree } from "./new-worktree.js";
import { openStart } from "./start.js";

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
 * @property {string} rename the space Rename renames: the main checkout's, which bears the forge's name, from its tab
 * and its gnome; a checkout's own from its row
 * @property {string} [path] the folder of the sidebar's row it was opened on, on this machine, which the editors open
 * @property {boolean} [unopened] the row is a repository with no space open: only the forge's own items and the editors,
 * none that acts on a space
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
const appWorktree = (space, action) =>
  openOverlay({
    ...WORKTREE[action],
    kind: "dialog",
    mod: "worktree",
    props: { action, space },
  });

/**
 * Opens the New worktree dialog of the forge a space is of.
 * @param {import("herdr").SpaceInfo} space
 * @param {string} forge its forge's name
 */
export const newWorktreeOn = (space, forge) =>
  space.machine === null
    ? openNewWorktree({ dir: placeOf(space), forge })
    : appWorktree(space.id, "new");

/**
 * Opens the Remove worktree dialog of the worktree a space shows; on this machine, once the files its IDE ttt holds
 * unsaved are saved or given up.
 * @param {import("herdr").SpaceInfo} space
 * @param {string} forge its forge's name
 */
export const removeWorktreeOn = (space, forge) =>
  space.machine === null
    ? removeWorktreeAsking(space, forge)
    : appWorktree(space.id, "remove");

/**
 * @typedef {object} MenuItemLook
 * @property {string} label
 * @property {"gnome" | IconName | null} mark
 * @property {boolean} [ruled] a rule above it
 */

/**
 * An item, and what it does: once the menu has closed (act), or in the menu's own task, the menu closing once it is done
 * (work), so a failure it reports is still said, as an editor that cannot open a path.
 * @typedef {MenuItemLook & ({ act: () => void } | { work: () => Promise<void> })} MenuItem
 */

/**
 * The items that open a sidebar row's folder in each editor installed; none on a forge's tab or its gnome.
 * @param {string | undefined} path
 * @returns {MenuItem[]}
 */
const editorItems = (path) =>
  path === undefined
    ? []
    : readEditors().map((editor) => ({
        label: `Open in ${editor.name}`,
        mark: null,
        work: () => openInEditor(editor, path),
      }));

/**
 * The menu's items for a forge, the worktree ones only in git and the removal only on a worktree.
 * @param {ForgeTarget} target
 * @returns {MenuItem[]}
 */
const itemsOf = (target) => {
  const git = readSpacesGit()[target.space] ?? null;
  /** @param {(space: import("herdr").SpaceInfo, forge: string) => void} open */
  const onShown = (open) => () => {
    const shown = spaces().find((space) => space.id === target.space);
    if (shown !== undefined) open(shown, target.forge);
  };
  /** @type {MenuItem[]} */
  const forgeItems = [
    {
      act: () => {
        const all = spaces();
        const forge = groupForges(all, readSpacesGit(), readFolders()).find(
          (one) => one.main.id === target.main,
        );
        const shown = all.find((space) => space.id === target.space);
        if (forge !== undefined && shown !== undefined) openStart(forge, shown);
      },
      label: "Start work…",
      mark: ICON.hammer,
    },
    {
      act: () => {
        const shown = spaces().find((space) => space.id === target.space);
        if (shown !== undefined)
          openMode({ dir: placeOf(shown), forge: target.forge });
      },
      label: "Forge mode…",
      mark: ICON.settings,
    },
    {
      act: () =>
        openGnome({ forge: target.forge, key: target.key, name: target.name }),
      label: "Edit gnome…",
      mark: "gnome",
    },
  ];
  if (target.unopened === true)
    return [...forgeItems, ...editorItems(target.path)];
  return [
    ...forgeItems,
    {
      act: () => run("space.rename", { id: target.rename }),
      label: "Rename",
      mark: null,
    },
    ...(git === null
      ? []
      : [
          {
            act: onShown(newWorktreeOn),
            label: "New worktree…",
            mark: ICON.worktreeAdd,
          },
          {
            act: () => appWorktree(target.space, "open"),
            label: "Open worktree",
            mark: ICON.branch,
          },
        ]),
    ...(git?.linked
      ? [
          {
            act: onShown(removeWorktreeOn),
            label: "Remove worktree…",
            mark: ICON.trash,
          },
        ]
      : []),
    ...editorItems(target.path),
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
    rename: given.rename ?? given.main ?? "",
    space: given.space ?? "",
    ...(given.path === undefined ? {} : { path: given.path }),
    ...(given.unopened === true ? { unopened: true } : {}),
  };
  const items = itemsOf(target);
  const handle = cx.focus_handle();
  handle.focus();
  let at = 0;

  const close = () => closeOverlay(given.overlay ?? "");
  // Whether an item that works in the menu's own task is at it.
  let working = false;

  /**
   * @param {number} index
   * @param {Context} cx
   */
  const choose = (index, cx) => {
    const item = items[index];
    // While an item works, the menu waits for it: a second Enter or click does nothing.
    if (item === undefined || working) return;
    if ("act" in item) {
      close();
      item.act();
      return;
    }
    working = true;
    const work = item.work();
    cx.spawn(async () => {
      await work;
      close();
    });
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
        else if (event.key === "enter") choose(at, cx);
        else if (event.key === "escape") close();
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
                .id(`forge-menu-${item.label}`)
                .h(ROW)
                .px(8)
                .gap(9)
                .items_center()
                .cursor_pointer()
                .when(index === at, (el) => el.bg(k.bg3))
                .hover((style) => style.bg(k.bg2))
                .on_click((_event, cx) => choose(index, cx))
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
