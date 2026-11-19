// The window's top bar (design 04): a forge tab per repository (its main checkout and its worktrees, which the sidebar
// lists; a space outside git is a forge of its own) with its gnome and what its golems do, the tab that opens a space,
// the inbox of what waits on the human and the command palette. The bar drags the window; its controls do not. A forge tab does what the app's own space list does, on the space it shows (the open one, else the last one shown,
// else its main checkout's): a click shows it, its ✕ or a middle click closes it (the app confirms), and a right click
// opens its menu: the dialog of its gnome (roles/gnome.js), then what the app's space menu does (rename, worktrees,
// close). A double click renames the forge, which bears its main checkout's name, and dragging a forge onto another
// moves its spaces there together. When the tabs do not fit, the strip scrolls under the trackpad and with the arrows
// beside it.
import { h_flex, ScrollHandle } from "gpui-base";
import { agents, checking, keys, nextCommand, run, spaces } from "herdr";
import { readSpacesGit } from "../bridges/git.js";
import { readGnomes } from "../bridges/gnomes.js";
import { toggleLanes } from "../bridges/lanes.js";
import { toggleMotion } from "../bridges/motion.js";
import { readNames } from "../bridges/names.js";
import { placeOf } from "../bridges/places.js";
import { readTerminals } from "../bridges/terminals.js";
import { forgeMoves, forgeState, groupForges, lookKeyOf } from "../forges.js";
import { keyLabel } from "../format.js";
import { gnomeLookOf, nameOf } from "../identity.js";
import { inboxButton, paletteHint } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { ICON, icon } from "../kit/sprites.js";
import { addTab, dropMark, forgeTab, scrollArrow } from "../kit/tabs.js";
import { tokens } from "../kit/tokens.js";
import { scrollTarget, stripState } from "../strip.js";
import {
  newWorktreeOn,
  openForgeMenu,
  removeWorktreeOn,
} from "./forge-menu.js";
import { openMode } from "./mode.js";
import { openStart } from "./start.js";

/** @typedef {import("herdr").AgentInfo} AgentInfo */
/** @typedef {import("herdr").SpaceInfo} SpaceInfo */
/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../forges.js").Forge} Forge */
/** @typedef {import("./role.js").Role} Role */

// Room for macOS's window buttons, which the layout draws over at traffic_lights.
const WINDOW_BUTTONS = 84;

const ADD_TAB = "forge-add";

/** @param {string} id */
const closeSpace = (id) => run("space.close", { id });

// The first agent that waits on the human: its pane, or a peek at it when it has none.
/** @param {AgentInfo[]} waiting */
const openInbox = (waiting) => {
  const [first] = waiting;
  if (first === undefined) return;
  if (first.pane) run("pane.focus", { terminal: first.address });
  else run("terminal.peek", { terminal: first.address });
};

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const topbar = (cx) => {
  const strip = ScrollHandle.new();
  // The mod's own key commands come here, the one copy that is always shown: forgerdr.motion turns the motion off or on,
  // forgerdr.lanes folds or unfolds the golem lanes, forgerdr.start opens Start work on the forge shown,
  // forgerdr.mode its mode, and forgerdr.worktree-new and forgerdr.worktree-remove its worktree dialogs.
  /** @type {Readonly<Record<string, () => void>>} */
  const handlers = Object.freeze({
    lanes: toggleLanes,
    mode: () => modeShown(),
    motion: toggleMotion,
    start: () => startShown(),
    "worktree-new": () => worktreeShown(newWorktreeOn, false),
    "worktree-remove": () => worktreeShown(removeWorktreeOn, true),
  });
  const commands = checking()
    ? null
    : cx.spawn(async (cx) => {
        for (;;) {
          handlers[await nextCommand()]?.();
          cx.notify();
        }
      });
  // What a copy knows of its strip: each tab's width, the strip's width and how far it is scrolled, kept in step with
  // the trackpad, the arrows and the active forge, since the app's scroll handle tells neither.
  /** @type {Map<string, number>} by forge key */
  const widths = new Map();
  let visible = 0;
  let scrolled = 0;
  let shownActive = "";
  /** @type {{ from: string | null, over: string | null }} forge keys */
  const drag = { from: null, over: null };
  /** @type {Map<string, string>} the space each forge showed last, by forge key */
  const lastShown = new Map();

  /**
   * @param {string} id
   * @param {number} width
   * @param {Context} cx
   */
  const measure = (id, width, cx) => {
    if (widths.get(id) === width) return;
    widths.set(id, width);
    cx.notify();
  };

  /** @param {string[]} order */
  const geometry = (order) =>
    stripState(
      order.map((id) => widths.get(id) ?? 0),
      visible,
      scrolled,
    );

  /**
   * Scrolls the strip to show a tab, as the app's handle does (the least scroll), and follows where it lands.
   * @param {string[]} order
   * @param {number} index
   */
  const reveal = (order, index) => {
    strip.scroll_to_item(index);
    scrolled = geometry(order).after(index);
  };

  /**
   * The space a forge's tab acts on: the open one, else the last one shown, else its main checkout's.
   * @param {Forge} forge
   */
  const shownIn = (forge) =>
    forge.spaces.find((space) => space.active) ??
    forge.spaces.find((space) => space.id === lastShown.get(forge.key)) ??
    forge.main;

  // The forge shown, if any.
  const forgeShown = () =>
    groupForges(spaces(), readSpacesGit()).find((one) =>
      one.spaces.some((space) => space.active),
    );

  // Start work on the forge shown, on the space it shows.
  const startShown = () => {
    const forge = forgeShown();
    if (forge !== undefined) openStart(forge, shownIn(forge));
  };

  // The mode of the forge shown.
  const modeShown = () => {
    const forge = forgeShown();
    if (forge !== undefined)
      openMode({ dir: placeOf(shownIn(forge)), forge: forge.main.name });
  };

  /**
   * A worktree dialog of the forge shown, on the space it shows: in git, and Remove only on a worktree's.
   * @param {(space: import("herdr").SpaceInfo, forge: string) => void} open
   * @param {boolean} onWorktree
   */
  const worktreeShown = (open, onWorktree) => {
    const forge = forgeShown();
    const shown = forge === undefined ? undefined : shownIn(forge);
    const git =
      shown === undefined ? null : (readSpacesGit()[shown.id] ?? null);
    if (
      forge !== undefined &&
      shown !== undefined &&
      git !== null &&
      (git.linked || !onWorktree)
    )
      open(shown, forge.main.name);
  };

  /**
   * @param {Forge} forge
   * @param {Forge[]} forges
   * @param {AgentInfo[]} everyone
   * @param {string[]} order the spaces' ids, in the app's order
   * @param {Set<string>} cracked the terminals of the golems an API error cracked
   */
  const forgeOf = (forge, forges, everyone, order, cracked) => {
    const ids = new Set(forge.spaces.map((space) => space.id));
    const state = forgeState(
      everyone
        .filter((agent) => ids.has(agent.space))
        .map((agent) => ({
          status: cracked.has(agent.address) ? "cracked" : agent.status,
        })),
    );
    const shown = shownIn(forge);
    const active = shown.active;
    const key = lookKeyOf(forge);
    const close = control(
      icon(ICON.close, tokens().muted),
      `forge-close-${forge.key}`,
      () => closeSpace(shown.id),
    );
    const from = forges.findIndex((other) => other.key === drag.from);
    const here = forges.indexOf(forge);
    const dragging =
      drag.from !== null && drag.from !== forge.key && drag.over === forge.key;
    return forgeTab({
      active,
      badge: state.badge,
      close: active ? close : undefined,
      look: { ...gnomeLookOf(key, readGnomes()[key]), mood: state.mood },
      name: forge.main.name,
    })
      .id(`forge-${forge.key}`)
      .cursor_pointer()
      .when(drag.from === forge.key && drag.over !== forge.key, (el) =>
        el.opacity(0.5),
      )
      .when(dragging, (el) =>
        el.child(dropMark(from < here ? "right" : "left")),
      )
      .on_size_change((size, cx) => measure(forge.key, size.width, cx))
      .on_mouse_down("left", (_event, cx) => {
        cx.stop_propagation();
        drag.from = forge.key;
        drag.over = forge.key;
      })
      .on_mouse_move((_event, cx) => {
        // A space moves among the spaces of its own machine only, so a forge does too.
        const source = forges.find((other) => other.key === drag.from);
        const over =
          source !== undefined && source.main.machine === forge.main.machine
            ? forge.key
            : null;
        if (drag.from === null || drag.over === over) return;
        drag.over = over;
        cx.notify();
      })
      .on_mouse_up("left", (_event, cx) => {
        if (
          drag.from !== null &&
          drag.from !== forge.key &&
          drag.over === forge.key
        ) {
          for (const move of forgeMoves(order, forges, drag.from, forge.key))
            run("space.move", move);
        }
        drag.from = null;
        drag.over = null;
        cx.notify();
      })
      .on_mouse_down("middle", (_event, cx) => {
        cx.stop_propagation();
        closeSpace(shown.id);
      })
      .on_mouse_down("right", (_event, cx) => {
        cx.stop_propagation();
        openForgeMenu({
          forge: forge.main.name,
          key,
          main: forge.main.id,
          name: nameOf(key, readNames()),
          rename: forge.main.id,
          space: shown.id,
        });
      })
      .on_click((event) =>
        event.click_count === 2
          ? run("space.rename", { id: forge.main.id })
          : run("space.select", { id: shown.id }),
      );
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const all = spaces();
    const forges = groupForges(all, readSpacesGit());
    const everyone = agents();
    // A golem marked cracked (hooks/golem-state.sh) breaks its forge's mood.
    const cracked = new Set(
      readTerminals()
        .filter((terminal) => terminal.labels?.["forge.state"] === "cracked")
        .map((terminal) => terminal.address),
    );
    const waiting = everyone.filter((agent) => agent.status === "blocked");
    const palette = keys().find((binding) => binding.action === "app.palette");
    const order = [...forges.map((forge) => forge.key), ADD_TAB];
    const activeAt = forges.findIndex((forge) =>
      forge.spaces.some((space) => space.active),
    );
    const activeForge = forges[activeAt];
    if (activeForge !== undefined) {
      lastShown.set(activeForge.key, shownIn(activeForge).id);
      if (activeForge.key !== shownActive) {
        shownActive = activeForge.key;
        reveal(order, activeAt);
      }
    }
    const at = geometry(order);
    /**
     * @param {"left" | "right"} side
     * @param {number | null} target
     */
    const arrow = (side, target) =>
      control(
        scrollArrow(side, target !== null),
        `forge-scroll-${side}`,
        () => {
          if (target !== null) reveal(order, target);
        },
      );
    return h_flex()
      .id("topbar")
      .size_full()
      .items_end()
      .gap(12)
      .pl(WINDOW_BUTTONS)
      .pr(16)
      .bg(tokens().bg0)
      .on_mouse_up("left", (_event, cx) => {
        drag.from = null;
        drag.over = null;
        cx.notify();
      })
      .on_mouse_down_out((_event, cx) => {
        if (drag.from === null) return;
        drag.from = null;
        drag.over = null;
        cx.notify();
      })
      .when(at.overflows, (el) =>
        el.child(arrow("left", scrollTarget(at, "left"))),
      )
      .child(
        h_flex()
          .id("forge-tabs")
          .flex_1()
          .min_w(0)
          .items_end()
          .overflow_x_scroll()
          .track_scroll(strip)
          .on_size_change((size, cx) => {
            if (visible === size.width) return;
            visible = size.width;
            // A narrower strip may hide the active forge: bring it back.
            if (activeAt !== -1) reveal(order, activeAt);
            cx.notify();
          })
          .on_scroll_wheel((event) => {
            scrolled = geometry(order).clamp(scrolled - event.delta.x);
          })
          .children(
            forges.map((forge) =>
              forgeOf(
                forge,
                forges,
                everyone,
                all.map((space) => space.id),
                cracked,
              ),
            ),
          )
          .child(
            control(addTab(), ADD_TAB, () => run("space.new")).on_size_change(
              (size, cx) => measure(ADD_TAB, size.width, cx),
            ),
          ),
      )
      .when(at.overflows, (el) =>
        el.child(arrow("right", scrollTarget(at, "right"))),
      )
      .child(
        h_flex()
          .flex_none()
          .h_full()
          .items_center()
          .gap(8)
          .child(
            control(inboxButton(waiting.length), "inbox", () =>
              openInbox(waiting),
            ),
          )
          .when(palette !== undefined, (el) =>
            el.child(
              control(paletteHint(keyLabel(palette.keys)), "palette", () =>
                run("app.palette"),
              ),
            ),
          ),
      );
  };

  return {
    close: () => {
      commands?.cancel();
      strip.release();
    },
    render,
  };
};
