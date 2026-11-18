// The window's top bar (design 04): a forge tab per space with its gnome and what its golems do, the tab that opens a
// space, the inbox of what waits on the human and the command palette. The bar drags the window; its controls do not.
// A forge tab does what the app's own space list does: a click shows the space, a double click renames it, a right
// click opens the app's own space menu (rename, worktrees, close), its ✕ or a middle click closes it (the app asks for
// the name and confirms the close), and dragging it onto another reorders the spaces. When the tabs do not fit, the
// strip scrolls under the trackpad and with the arrows beside it.
import { h_flex, ScrollHandle } from "gpui-base";
import { agents, keys, openOverlay, run, spaces } from "herdr";
import { forgeState } from "../forges.js";
import { keyLabel } from "../format.js";
import { hatColourOf } from "../identity.js";
import { inboxButton, paletteHint } from "../kit/buttons.js";
import { ICON, icon } from "../kit/sprites.js";
import { addTab, dropMark, forgeTab, scrollArrow } from "../kit/tabs.js";
import { tokens } from "../kit/tokens.js";
import { scrollTarget, stripState } from "../strip.js";

/** @typedef {import("herdr").AgentInfo} AgentInfo */
/** @typedef {import("herdr").SpaceInfo} SpaceInfo */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("./role.js").Role} Role */

// Room for macOS's window buttons, which the layout draws over at traffic_lights.
const WINDOW_BUTTONS = 84;

// The app's own space menu, as its space list opens it.
const SPACE_MENU = Object.freeze({
  height: 260,
  kind: "popup",
  mod: "menu",
  width: 200,
});

const ADD_TAB = "forge-add";

/**
 * A control of the bar: clickable, and a press on it does not drag the window.
 * @param {NativeElement} element
 * @param {string} id
 * @param {() => void} action
 */
const control = (element, id, action) =>
  element
    .id(id)
    .cursor_pointer()
    .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
    .on_click(() => action());

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

/** @returns {Role} */
export const topbar = () => {
  const strip = ScrollHandle.new();
  // What a copy knows of its strip: each tab's width, the strip's width and how far it is scrolled, kept in step with
  // the trackpad, the arrows and the active space, since the app's scroll handle tells neither.
  /** @type {Map<string, number>} */
  const widths = new Map();
  let visible = 0;
  let scrolled = 0;
  let shownActive = "";
  /** @type {{ from: string | null, over: string | null }} */
  const drag = { from: null, over: null };

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
   * @param {SpaceInfo} space
   * @param {SpaceInfo[]} all
   * @param {AgentInfo[]} everyone
   */
  const forgeOf = (space, all, everyone) => {
    const state = forgeState(
      everyone.filter((agent) => agent.space === space.id),
    );
    const close = control(
      icon(ICON.close, tokens().muted),
      `forge-close-${space.id}`,
      () => closeSpace(space.id),
    );
    const from = all.findIndex((other) => other.id === drag.from);
    const here = all.findIndex((other) => other.id === space.id);
    const dragging =
      drag.from !== null && drag.from !== space.id && drag.over === space.id;
    return forgeTab({
      active: space.active,
      badge: state.badge,
      close: space.active ? close : undefined,
      look: {
        colour: hatColourOf(space.folder || space.name),
        mood: state.mood,
      },
      name: space.name,
    })
      .id(`forge-${space.id}`)
      .cursor_pointer()
      .when(drag.from === space.id && drag.over !== space.id, (el) =>
        el.opacity(0.5),
      )
      .when(dragging, (el) =>
        el.child(dropMark(from < here ? "right" : "left")),
      )
      .on_size_change((size, cx) => measure(space.id, size.width, cx))
      .on_mouse_down("left", (_event, cx) => {
        cx.stop_propagation();
        drag.from = space.id;
        drag.over = space.id;
      })
      .on_mouse_move((_event, cx) => {
        // A space moves among the spaces of its own machine only.
        const source = all.find((other) => other.id === drag.from);
        const over =
          source !== undefined && source.machine === space.machine
            ? space.id
            : null;
        if (drag.from === null || drag.over === over) return;
        drag.over = over;
        cx.notify();
      })
      .on_mouse_up("left", (_event, cx) => {
        const moved =
          drag.from !== null &&
          drag.from !== space.id &&
          drag.over === space.id;
        if (moved) run("space.move", { id: drag.from, index: here + 1 });
        drag.from = null;
        drag.over = null;
        cx.notify();
      })
      .on_mouse_down("middle", (_event, cx) => {
        cx.stop_propagation();
        closeSpace(space.id);
      })
      .on_mouse_down("right", (_event, cx) => {
        cx.stop_propagation();
        openOverlay({
          ...SPACE_MENU,
          props: { tab: "space", target: { id: space.id } },
        });
      })
      .on_click((event) =>
        event.click_count === 2
          ? run("space.rename", { id: space.id })
          : run("space.select", { id: space.id }),
      );
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const all = spaces();
    const everyone = agents();
    const waiting = everyone.filter((agent) => agent.status === "blocked");
    const palette = keys().find((binding) => binding.action === "app.palette");
    const order = [...all.map((space) => space.id), ADD_TAB];
    const active = all.find((space) => space.active);
    if (active !== undefined && active.id !== shownActive) {
      shownActive = active.id;
      reveal(order, all.indexOf(active));
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
            if (active !== undefined) reveal(order, all.indexOf(active));
            cx.notify();
          })
          .on_scroll_wheel((event) => {
            scrolled = geometry(order).clamp(scrolled - event.delta.x);
          })
          .children(all.map((space) => forgeOf(space, all, everyone)))
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

  return { close: () => void strip.release(), render };
};
