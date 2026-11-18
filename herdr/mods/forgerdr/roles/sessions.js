// The shown forge's session bar (design 04): a tab per session of the open space, with the icon of what runs in it (a
// golem for an agent, a terminal for a shell, a server for anything else) in the colour of what its golem does; then the
// tab that opens a session, the switches of the side panels (Files, Changes) and the controls that split and zoom the
// focused pane. A tab does what the app's own tab bar does: a click shows it, a double click renames it, a right click
// opens the app's tab menu, its ✕ closes it and dragging it onto another reorders the tabs; the wheel goes from tab to
// tab. Each space keeps its own side panel, as the app's tab bar does, and with no space left the work area shows the
// forge's empty state (the empty role) instead of the panes.
import { h_flex, ScrollHandle } from "gpui-base";
import { div } from "gpui-kit";
import {
  checking,
  focused,
  machines,
  openOverlay,
  panes,
  run,
  spaces,
} from "herdr";
import { lanesOpen } from "../bridges/lanes.js";
import { enabledPanels, layoutNode } from "../bridges/layout.js";
import { readTerminals } from "../bridges/terminals.js";
import { control } from "../kit/control.js";
import { ICON, icon } from "../kit/sprites.js";
import { addTab, dropMark, panelToggle, sessionTab } from "../kit/tabs.js";
import { tokens, toneOf } from "../kit/tokens.js";
import { lanesHeight, spaceLanes } from "../lanes.js";
import { newSwipe, programKind, swipeTab, tabLabel } from "../sessions.js";

/** @typedef {import("herdr").SpaceInfo} SpaceInfo */
/** @typedef {import("herdr").TabInfo} TabInfo */
/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("../kit/sprites.js").IconName} IconName */
/** @typedef {import("../sessions.js").ProgramKind} ProgramKind */
/** @typedef {import("./role.js").Role} Role */

/** @type {Record<ProgramKind, IconName>} */
const PROGRAM_ICON = {
  agent: ICON.golem,
  program: ICON.server,
  shell: ICON.terminal,
};

const PANELS = Object.freeze([
  { id: "files", label: "Files" },
  { id: "changes", label: "Changes" },
]);

// The layout's nodes this bar works: the side panel and its stack, the stack that shows the panes or the empty state,
// and the golem lanes under them.
const NODE = Object.freeze({
  empty: "no-forge",
  lanes: "lanes",
  panel: "panel",
  panelBody: "panel-body",
  panes: "main",
  work: "work-view",
});

// The app's own menus, as its tab bar opens them.
const TAB_MENU = Object.freeze({ kind: "popup", mod: "menu", width: 200 });
const NEW_MENU = Object.freeze({
  height: 512,
  kind: "popup",
  mod: "new-menu",
  width: 250,
});

const PANELS_KEY = "panels";

// How often the bar looks at the side panel and the space count, which the layout's commands change.
const SYNC_EVERY = 250;

/** @returns {Record<string, string | null>} the side panel each space showed, by space id */
const readPanels = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(PANELS_KEY) ?? "{}");
    return stored !== null &&
      typeof stored === "object" &&
      !Array.isArray(stored)
      ? stored
      : {};
  } catch {
    return {};
  }
};

/** @param {Record<string, string | null>} panels */
const savePanels = (panels) => {
  try {
    localStorage.setItem(PANELS_KEY, JSON.stringify(panels));
  } catch {
    // Storage is away: the bar remembers for this run only.
  }
};

/** @param {string | null} id the side panel to show, null to hide it */
const showPanel = (id) => {
  if (id === null) {
    run("layout.hide", { id: NODE.panel });
    return;
  }
  run("layout.select", { child: id, stack: NODE.panelBody });
  run("layout.show", { id: NODE.panel });
};

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const sessions = (cx) => {
  const strip = ScrollHandle.new();
  let revealed = "";
  let swipe = newSwipe();
  /** @type {{ from: string | null, over: string | null }} tab ids */
  const drag = { from: null, over: null };
  let panels = readPanels();
  /** @type {string | undefined} the space the panel was last synced for; undefined before the first look */
  let syncedSpace;
  /** @type {{ want: string | null, until: number } | null} a space's panel on its way back */
  let restoring = null;

  // A space shows the panel it had (none if it never had one); opening or closing it records it.
  const syncPanel = () => {
    const space = spaces().find((one) => one.active);
    const panel = layoutNode(NODE.panel);
    if (space === undefined || panel === undefined) return;
    const now = panel.hidden
      ? null
      : (layoutNode(NODE.panelBody)?.active ?? null);
    if (space.id !== syncedSpace) {
      const first = syncedSpace === undefined;
      syncedSpace = space.id;
      restoring = null;
      if (!first || space.id in panels) {
        const stored = panels[space.id] ?? null;
        const want =
          stored !== null && enabledPanels().includes(stored) ? stored : null;
        if (want !== now) {
          restoring = { until: Date.now() + 1000, want };
          showPanel(want);
          return;
        }
      }
    }
    // Until the restore lands (or something else wins), the old state is not a choice.
    if (restoring !== null) {
      if (restoring.want !== now && Date.now() < restoring.until) return;
      restoring = null;
    }
    if (panels[space.id] === now) return;
    panels = { ...panels, [space.id]: now };
    savePanels(panels);
  };

  // With no space left, the work area shows the empty state; not while this computer's spaces are still loading.
  const syncEmpty = () => {
    const here = machines().find((machine) => machine.name === null);
    if (here !== undefined && here.layout === "loading") return;
    const want = spaces().length === 0 ? NODE.empty : NODE.panes;
    const work = layoutNode(NODE.work);
    if (work !== undefined && work.active !== want) {
      run("layout.select", { child: want, stack: NODE.work });
    }
  };

  // The golem lanes always show, one line folded, as tall as their lanes unfolded.
  const syncLanes = () => {
    const block = layoutNode(NODE.lanes);
    if (block === undefined) return;
    const space = spaces().find((one) => one.active);
    const count =
      space === undefined
        ? 0
        : spaceLanes(space.id, readTerminals(), {}, {}).length;
    const height = lanesHeight(count, lanesOpen());
    if (block.size?.px !== height)
      run("layout.resize", { id: NODE.lanes, px: height });
    if (block.hidden) run("layout.show", { id: NODE.lanes });
  };

  const timer = checking()
    ? null
    : cx.timer.every(SYNC_EVERY, () => {
        syncPanel();
        syncEmpty();
        syncLanes();
      });

  /** @param {Context} cx */
  const endDrag = (cx) => {
    if (drag.from === null) return;
    drag.from = null;
    drag.over = null;
    cx.notify();
  };

  /**
   * @param {TabInfo} tab
   * @param {number} index
   * @param {SpaceInfo} space
   * @param {TabInfo[]} shown
   * @param {import("herdr").PaneInfo[]} everyPane
   */
  const tabOf = (tab, index, space, shown, everyPane) => {
    const k = tokens();
    const lead =
      everyPane.find((pane) => pane.tab === tab.id && pane.program?.agent) ??
      everyPane.find((pane) => pane.tab === tab.id);
    const from = shown.findIndex((other) => other.id === drag.from);
    const over =
      drag.from !== null && drag.from !== tab.id && drag.over === tab.id;
    return sessionTab({
      active: tab.active,
      close: tab.active
        ? control(icon(ICON.close, k.muted), `session-close-${tab.id}`, () =>
            run("tab.close", { id: tab.id }),
          )
        : undefined,
      icon: PROGRAM_ICON[programKind(lead?.program)],
      label: tabLabel(tab, lead),
      tone: tab.status ? toneOf(tab.status) : undefined,
      zoomed: tab.zoomed,
    })
      .id(`session-${tab.id}`)
      .relative()
      .cursor_pointer()
      .when(drag.from === tab.id && drag.over !== tab.id, (el) =>
        el.opacity(0.5),
      )
      .when(over, (el) => el.child(dropMark(from < index ? "right" : "left")))
      .on_mouse_down("left", (event, cx) => {
        cx.stop_propagation();
        drag.from = tab.id;
        drag.over = tab.id;
        if (event.click_count === 2) run("tab.rename", { id: tab.id });
      })
      .on_mouse_move((_event, cx) => {
        if (drag.from === null || drag.over === tab.id) return;
        drag.over = tab.id;
        cx.notify();
      })
      .on_mouse_up("left", (_event, cx) => {
        if (drag.from !== null && drag.from !== tab.id) {
          run("tab.move", { id: drag.from, index: tab.index });
        } else {
          run("tab.select", { id: tab.id });
        }
        drag.from = null;
        drag.over = null;
        cx.notify();
      })
      .on_mouse_down("right", (_event, cx) => {
        cx.stop_propagation();
        openOverlay({
          ...TAB_MENU,
          props: { tab: "tab", target: { id: tab.id, space: space.id } },
        });
      });
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const space = spaces().find((one) => one.active);
    const shown = space?.tabs ?? [];
    const activeAt = shown.findIndex((tab) => tab.active);
    const activeId = shown[activeAt]?.id ?? "";
    if (activeId !== revealed) {
      revealed = activeId;
      if (activeAt !== -1) strip.scroll_to_item(activeAt);
    }
    const everyPane = panes();
    const pane = focused()?.pane ?? null;
    const panel = layoutNode(NODE.panel);
    const showing =
      panel === undefined || panel.hidden
        ? null
        : (layoutNode(NODE.panelBody)?.active ?? null);
    const kept = enabledPanels();
    /**
     * @param {string} id
     * @param {IconName} glyph
     * @param {() => void} action
     */
    const tool = (id, glyph, action) =>
      control(div().p(4).child(icon(glyph, k.muted)), id, action);
    return h_flex()
      .id("sessions")
      .size_full()
      .min_w(0)
      .items_end()
      .gap(8)
      .px(10)
      .bg(k.bg0)
      .border_b(2)
      .border_color(k.line)
      .on_mouse_up("left", (_event, cx) => endDrag(cx))
      .on_mouse_down_out((_event, cx) => endDrag(cx))
      .on_scroll_wheel((event) => {
        const step = swipeTab(
          swipe,
          {
            dy: event.delta.y,
            lines: event.delta_lines?.y,
            started: event.touch_phase === "started",
          },
          Date.now(),
        );
        swipe = step.swipe;
        if (step.go !== null) run(step.go === "prev" ? "tab.prev" : "tab.next");
      })
      .child(
        h_flex()
          .id("session-tabs")
          .flex_1()
          .min_w(0)
          .h_full()
          .items_end()
          .overflow_x_scroll()
          .track_scroll(strip)
          // A rename or a status on an earlier tab can push the active one out.
          .on_size_change((_size, cx) => {
            if (activeAt === -1) return;
            strip.scroll_to_item(activeAt);
            cx.notify();
          })
          .children(
            space === undefined
              ? []
              : shown.map((tab, index) =>
                  tabOf(tab, index, space, shown, everyPane),
                ),
          )
          .child(control(addTab(), "session-add", () => openOverlay(NEW_MENU))),
      )
      .child(
        h_flex()
          .flex_none()
          .h_full()
          .items_center()
          .gap(6)
          .children(
            PANELS.filter(({ id }) => kept.includes(id)).map(({ id, label }) =>
              control(panelToggle(label, showing === id), `panel-${id}`, () =>
                showPanel(showing === id ? null : id),
              ),
            ),
          )
          .when(pane !== null, (el) =>
            el
              .child(
                tool("pane-split-right", ICON.splitRight, () =>
                  run("pane.split", { direction: "right", pane }),
                ),
              )
              .child(
                tool("pane-split-down", ICON.splitDown, () =>
                  run("pane.split", { direction: "down", pane }),
                ),
              )
              .child(
                tool("pane-zoom", ICON.zoom, () => run("pane.zoom", { pane })),
              ),
          ),
      );
  };

  return { close: () => timer?.cancel(), render };
};
