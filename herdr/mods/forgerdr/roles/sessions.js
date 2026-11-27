// The shown forge's session bar (design 04): a tab per session of the open space, with the icon of what runs in it (a
// golem for an agent, a terminal for a shell, a server for anything else, the view's own for a special session's view)
// in the colour of what its golem does; then the tab that opens a session, the switches of the side panels (Files,
// Changes) and the controls that split and zoom the focused pane. A tab does what the app's own tab bar does: a click
// shows it, a double click renames it, a right click opens the app's tab menu, its ✕ closes it and dragging it onto
// another reorders the tabs. When the tabs do not fit, the strip scrolls under the trackpad and arrows on its sides bring
// in the next hidden tab, as the forge tabs' do; only a click changes the tab shown. Each space keeps its own side panel,
// as the app's tab bar does, and with no space left the work area shows the forge's empty state (the empty role) instead
// of the panes.
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
import {
  followChanges,
  readChanges,
  readComments,
} from "../bridges/changes.js";
import { readFolders, readSpacesGit } from "../bridges/git.js";
import { lanesOpen } from "../bridges/lanes.js";
import {
  changesMaximized,
  enabledPanels,
  layoutNode,
  maximizePanel,
} from "../bridges/layout.js";
import { readAgents, readTerminals } from "../bridges/terminals.js";
import { commentsIn, shownForge, summaryOf } from "../changes.js";
import { lanesSpacesOf } from "../forges.js";
import { control } from "../kit/control.js";
import { ICON, icon, iconButton } from "../kit/sprites.js";
import {
  addTab,
  dropMark,
  panelToggle,
  scrollArrow,
  sessionTab,
  TAB_HEIGHT,
} from "../kit/tabs.js";
import { tokens, toneOf } from "../kit/tokens.js";
import { forgeLanes, lanesHeight } from "../lanes.js";
import { programKind, specialTabLook, tabLabel } from "../sessions.js";
import { arrowsOf, scrollTarget, stripState, wheeled } from "../strip.js";

/** @typedef {import("herdr").SpaceInfo} SpaceInfo */
/** @typedef {import("herdr").TabInfo} TabInfo */
/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("../kit/sprites.js").IconName} IconName */
/** @typedef {import("../sessions.js").ProgramKind} ProgramKind */
/** @typedef {import("../sessions.js").SpecialTabLook} SpecialTabLook */
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

// The side panel that can take the panes' place (its own switch: roles/changes.js).
const MAXIMIZED = "changes";

const ADD_TAB = "session-add";

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
  /** @type {string[]} the tab ids the bar showed last, the + tab's last */
  let order = [];
  // What a copy knows of its strip, as the forge tabs' (roles/topbar.js): each tab's width, the strip's width and how far
  // it is scrolled, kept in step with the trackpad, the arrows and the active tab, since the app's scroll handle tells
  // neither. All three come from on_size_change and the wheel, in the same window pixels at any zoom.
  /** @type {Map<string, number>} by tab id, and the + tab's */
  const widths = new Map();
  let visible = 0;
  let scrolled = 0;
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
    // Only the Changes panel takes the panes' place, when the human keeps it so: once it is shut or another shows, the
    // panes come back, and it takes their place again the next time it shows.
    maximizePanel(now === MAXIMIZED && changesMaximized());
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
    if (spaces().length === 0) maximizePanel(false);
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
    const count = forgeLanes(
      lanesSpacesOf(spaces(), readSpacesGit(), readFolders()),
      readTerminals(),
      {},
      {},
    ).length;
    const height = lanesHeight(count, lanesOpen());
    if (block.size?.px !== height)
      run("layout.resize", { id: NODE.lanes, px: height });
    if (block.hidden) run("layout.show", { id: NODE.lanes });
  };

  // The shown forge's changes, read here because this bar always shows: the Changes switch tells of them with the
  // panel shut, and the panel draws what this publishes (bridges/changes.js).
  const forgeNow = () => shownForge(spaces(), readSpacesGit(), readFolders());
  const following = checking() ? null : followChanges(cx, forgeNow);
  let followed = "";
  // Another forge shown, or its repositories known at last: read now, not at the next poll.
  const syncChanges = () => {
    const forge = forgeNow();
    const now = forge === null ? "" : `${forge.key}\n${forge.repos.join("\n")}`;
    if (now === followed) return;
    followed = now;
    following?.wake();
  };

  const timer = checking()
    ? null
    : cx.timer.every(SYNC_EVERY, () => {
        syncPanel();
        syncEmpty();
        syncLanes();
        syncChanges();
      });

  /**
   * @param {string} id
   * @param {number} width
   * @param {Context} cx
   */
  const measure = (id, width, cx) => {
    if (widths.get(id) === width) return;
    const first = !widths.has(id);
    widths.set(id, width);
    // The tab revealed before it was ever measured (a new one, shown at once): the handle showed it whole, so follow it.
    const index = order.indexOf(id);
    if (first && id === revealed && index !== -1)
      scrolled = geometry(order).after(index);
    cx.notify();
  };

  /** @param {string[]} order tab ids, the + tab's last */
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
   * @param {SpecialTabLook | null} special its special session's view's look, null for any other tab
   */
  const tabOf = (tab, index, space, shown, everyPane, special) => {
    const k = tokens();
    const lead =
      everyPane.find((pane) => pane.tab === tab.id && pane.program?.agent) ??
      everyPane.find((pane) => pane.tab === tab.id);
    const from = shown.findIndex((other) => other.id === drag.from);
    const over =
      drag.from !== null && drag.from !== tab.id && drag.over === tab.id;
    const status = special === null ? tab.status : special.status;
    return sessionTab({
      active: tab.active,
      close: tab.active
        ? control(
            iconButton(ICON.close, k.muted),
            `session-close-${tab.id}`,
            () => run("tab.close", { id: tab.id }),
          )
        : undefined,
      icon: special?.icon ?? PROGRAM_ICON[programKind(lead?.program)],
      label: tabLabel(tab, lead),
      tone: status ? toneOf(status) : undefined,
      zoomed: tab.zoomed,
    })
      .id(`session-${tab.id}`)
      .relative()
      .cursor_pointer()
      .on_size_change((size, cx) => measure(tab.id, size.width, cx))
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
        // Only a press that started on a tab acts: one on its ✕ is the ✕'s (it closes the tab), as the app's tab bar
        // does it.
        if (drag.from === null) return;
        if (drag.from !== tab.id) {
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
    order = [...shown.map((tab) => tab.id), ADD_TAB];
    if (activeId !== revealed) {
      revealed = activeId;
      if (activeAt !== -1) reveal(order, activeAt);
    }
    const at = geometry(order);
    /**
     * @param {"left" | "right"} side
     * @param {number | null} target
     */
    const arrow = (side, target) =>
      control(
        scrollArrow(side, target !== null, TAB_HEIGHT.session),
        `session-scroll-${side}`,
        (cx) => {
          if (target === null) return;
          reveal(order, target);
          cx.notify();
        },
      );
    const everyPane = panes();
    const terminals = readTerminals();
    const everyAgent = readAgents();
    const pane = focused()?.pane ?? null;
    const panel = layoutNode(NODE.panel);
    const showing =
      panel === undefined || panel.hidden
        ? null
        : (layoutNode(NODE.panelBody)?.active ?? null);
    const kept = enabledPanels();
    const read = readChanges();
    const forge = forgeNow();
    // The shown forge's alone: another forge's comments wait in their own.
    const summary = summaryOf(
      read !== null && read.forge === forge?.key ? read.tree : [],
      forge === null ? [] : commentsIn(readComments(), forge.key),
    );
    /** @type {Record<string, import("../kit/tabs.js").PanelMark | undefined>} what each switch tells, by panel id */
    const marks = {
      changes: { count: summary.files, waiting: summary.comments > 0 },
    };
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
      .bg(k.chrome)
      .border_b(2)
      .border_color(k.line)
      .on_mouse_up("left", (_event, cx) => endDrag(cx))
      .on_mouse_down_out((_event, cx) => endDrag(cx))
      .when(at.overflows, (el) =>
        el.child(arrow("left", scrollTarget(at, "left"))),
      )
      .child(
        h_flex()
          .id("session-tabs")
          .flex_1()
          .min_w(0)
          .h_full()
          .items_end()
          .overflow_x_scroll()
          .track_scroll(strip)
          // A narrower strip may hide the active tab: bring it back.
          .on_size_change((size, cx) => {
            if (visible === size.width) return;
            visible = size.width;
            if (activeAt !== -1) reveal(order, activeAt);
            cx.notify();
          })
          // The arrows redraw only when what they bring in changes, not on every step of a swipe.
          .on_scroll_wheel((event, cx) => {
            const before = geometry(order);
            scrolled = wheeled(before, event.delta);
            if (arrowsOf(before) !== arrowsOf(geometry(order))) cx.notify();
          })
          .children(
            space === undefined
              ? []
              : shown.map((tab, index) =>
                  tabOf(
                    tab,
                    index,
                    space,
                    shown,
                    everyPane,
                    specialTabLook(tab.id, everyPane, terminals, everyAgent),
                  ),
                ),
          )
          .child(
            control(addTab(), ADD_TAB, () =>
              openOverlay(NEW_MENU),
            ).on_size_change((size, cx) => measure(ADD_TAB, size.width, cx)),
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
          .gap(6)
          .children(
            PANELS.filter(({ id }) => kept.includes(id)).map(({ id, label }) =>
              control(
                panelToggle(label, showing === id, marks[id]),
                `panel-${id}`,
                () => showPanel(showing === id ? null : id),
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

  return {
    close: () => {
      timer?.cancel();
      following?.task.cancel();
      strip.release();
    },
    render,
  };
};
