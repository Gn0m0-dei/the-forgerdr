// The IDE panel's header, over its view (ide-view): the checkout the IDE shows, picked from the shown forge's in a list
// to search, as the Changes panel picks a session; the shown space's checkout until one is picked by hand, the pick
// kept per space for every copy (bridges/ide.js): picking another loses nothing, as each checkout's ttt lives on with its
// unsaved files. Rendered, while ttt's active file is markdown, shows that file rendered in ttt's place
// (roles/ide-markdown.js); and its switch keeps the IDE in the panes' place, which it takes from the start. Its copy
// drives the panel. While the IDE is on show it ensures the checkout's ttt (bin/forge-ide.sh, one per checkout, alive
// until stopped: picking another leaves it running) and makes ide-term show it, or the placeholder while it opens or
// cannot run (roles/ide-empty.js); it follows that ttt's state, and publishes what the panel shows for its other copies
// (bridges/ide.js), with what every live ttt holds unsaved, so removing a worktree knows whether to ask. Under
// the selector, a notice lists the language servers the checkout lacks (bin/forge-ide.sh servers), looked at when
// another checkout shows, when the IDE comes back on show and on Check again, each with an Install that runs its
// command in a tab, or the program that install needs; its ✕ hides what it lists for that checkout, and the header
// grows while it shows.
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { checking, home, run, shared, spaces } from "herdr";
import { readChangesFailure } from "../bridges/changes.js";
import {
  ensureIde,
  followIdeStates,
  forgetRuns,
  ideStateFolder,
  keepHiddenServers,
  keepPick,
  lookServers,
  publishIdePanel,
  readHiddenServers,
  readIdeState,
  readPicks,
  readRuns,
  refreshIdeStates,
  shownCheckouts,
  writeIdeTerm,
} from "../bridges/ide.js";
import {
  hidePanel,
  keepPanelMaximized,
  layoutNode,
  nodeIn,
  panelOnShow,
  panelWantsMaximized,
  shownLayout,
} from "../bridges/layout.js";
import { placeOf } from "../bridges/places.js";
import { readTerminals } from "../bridges/terminals.js";
import {
  holdsMod,
  IDE_HEAD,
  IDE_LABEL,
  IDE_NODE,
  IDE_SHOWS,
  ideCheckoutAt,
  ideCheckoutOf,
  ideCheckouts,
  ideHeadHeight,
  idePlan,
  ideShows,
  isMarkdown,
  liveAddressOf,
  liveIdes,
  liveTerminalNames,
  matchCheckouts,
  SERVER_OFFER,
  SERVERS_LABEL,
  SERVERS_NOTICE,
  serverRows,
  serversLook,
  withCheckout,
  withHidden,
} from "../ide.js";
import { quietButton } from "../kit/buttons.js";
import { tag } from "../kit/chips.js";
import { control } from "../kit/control.js";
import { ICON, icon, iconButton } from "../kit/sprites.js";
import { panelToggle } from "../kit/tabs.js";
import { fill, text } from "../kit/text.js";
import { NONE, tokens } from "../kit/tokens.js";
import { MOD } from "../name.js";
import { folderLabel, SIDE_PANEL } from "../sessions.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("gpui-kit").Task} Task */
/** @typedef {import("../ide.js").HiddenServers} HiddenServers */
/** @typedef {import("../ide.js").IdeCheckout} IdeCheckout */
/** @typedef {import("../ide.js").InstallTab} InstallTab */
/** @typedef {import("../ide.js").LanguageServer} LanguageServer */
/** @typedef {import("../ide.js").ServerRow} ServerRow */
/** @typedef {import("../ide.js").IdeState} IdeState */
/** @typedef {import("../ide.js").IdeTermContent} IdeTermContent */
/** @typedef {import("./role.js").Role} Role */

// How often the header looks at the panel, the forge and the terminals, which the app's commands change.
const SYNC_EVERY = 250;
// How long a content written to the layout file has to show in layout() before it is written again.
const WRITE_WAIT = 2_000;

/**
 * A content written to the layout file for ide-term, until layout() shows it: when it may be written again, whether the
 * write went through, and whether it was said that layout() never showed it.
 * @typedef {object} IdeWriting
 * @property {string} key the content, as JSON
 * @property {number} until
 * @property {boolean} written
 * @property {boolean} warned
 */

/**
 * A checkout as the closed choice and the list show it: its repository and branch, and its folder under them.
 * @param {IdeCheckout} option
 */
const checkoutLine = (option) => {
  const k = tokens();
  return v_flex()
    .flex_1()
    .min_w(0)
    .child(fill(option.label, "ui", 13, k.fg))
    .child(fill(folderLabel(option.top, home()), "mono", 11, k.muted));
};

/**
 * The checkout the IDE shows, as the closed choice shows it; a call to pick one when the forge has none yet.
 * @param {IdeCheckout | null} chosen
 * @param {boolean} open
 */
const checkoutChoice = (chosen, open) => {
  const k = tokens();
  return h_flex()
    .flex_1()
    .min_w(0)
    .h(40)
    .items_center()
    .gap(8)
    .px(8)
    .bg(k.bg0)
    .border(2)
    .border_color(open ? k.accent : k.line)
    .child(icon(ICON.branch, chosen === null ? k.muted : k.fg))
    .child(
      chosen === null
        ? fill(IDE_LABEL.none, "ui", 13, k.muted)
        : checkoutLine(chosen),
    )
    .child(icon(open ? ICON.chevronUp : ICON.chevronDown, k.muted));
};

/**
 * A checkout in the open list.
 * @param {IdeCheckout} option
 * @param {boolean} chosen
 */
const checkoutRow = (option, chosen) => {
  const k = tokens();
  return h_flex()
    .w_full()
    .h(40)
    .flex_none()
    .items_center()
    .gap(8)
    .px(8)
    .bg(chosen ? k.bg3 : NONE)
    .hover((style) => style.bg(k.bg2))
    .child(icon(option.main ? ICON.repo : ICON.branch, k.muted))
    .child(checkoutLine(option));
};

/**
 * Runs a language server's install in a tab of its own, in the user's home. The panel shuts first: maximized, it would
 * hide that tab; its switch shows it again, which looks at the servers again.
 * @param {InstallTab} tab
 */
const installInTab = (tab) => {
  hidePanel();
  run("tab.new", tab);
};

/**
 * A server the notice lists: its language, its program, and its Install, or the program its install needs.
 * @param {ServerRow} row
 */
const serverLine = (row) => {
  const k = tokens();
  return h_flex()
    .h(SERVERS_NOTICE.line)
    .items_center()
    .gap(8)
    .child(text(row.language, "ui", 12, k.fg))
    .child(fill(row.server, "mono", 11, k.muted))
    .child(
      row.offer === SERVER_OFFER.install
        ? control(
            tag(row.label.toUpperCase(), k.accent),
            `ide-server-${row.server}`,
            () => installInTab(row.tab),
          )
        : text(row.label, "ui", 11, k.needs),
    );
};

/**
 * The notice of the language servers the checkout lacks: what it lists, another look (none to click while one is on its
 * way), and its ✕.
 * @param {ServerRow[]} rows
 * @param {boolean} checking a look at them is on its way
 * @param {(cx: Context) => void} again
 * @param {(cx: Context) => void} hide
 */
const serversNotice = (rows, checking, again, hide) => {
  const k = tokens();
  return v_flex()
    .flex_none()
    .gap(SERVERS_NOTICE.gap)
    .px(8)
    .py(SERVERS_NOTICE.pad)
    .bg(k.bg2)
    .border_l(3)
    .border_color(k.needs)
    .child(
      h_flex()
        .h(SERVERS_NOTICE.line)
        .items_center()
        .gap(8)
        .child(icon(ICON.server, k.needs))
        .child(fill(SERVERS_LABEL.title, "ui", 12, k.fg))
        .child(
          checking
            ? quietButton(SERVERS_LABEL.checking)
            : control(
                quietButton(SERVERS_LABEL.again),
                "ide-servers-again",
                again,
              ),
        )
        .child(
          control(iconButton(ICON.close, k.muted), "ide-servers-hide", hide),
        ),
    )
    .children(rows.map(serverLine));
};

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const ide = (cx) => {
  let picking = false;
  const search = InputState.new({ placeholder: "Search the checkouts…" });
  search.on("change", (_event, cx) => cx.notify());
  /** @type {string | null} the ttt whose state `state` is, by its name */
  let stateFor = null;
  /** @type {IdeState | null} */
  let state = null;
  /** @type {IdeWriting | null} */
  let writing = null;
  /** @type {string | null} the state folder (forge-ide.sh dir), once read */
  let folder = null;
  /** @type {Task | null} the live ttts' states, followed from the start: the shown one's is taken from them */
  let following = null;
  /** The names of the live ttts whose states were read last, one per line. */
  let readFor = "";
  /** @type {HiddenServers} the servers hidden in the notices, as this copy's storage keeps them */
  let hidden = readHiddenServers();
  /** @type {Record<string, LanguageServer[]>} what each checkout of the shown forge lacks, as its last look found */
  let known = {};
  /** @type {string | null} the checkout on show in this copy's layout at the last look (serversLook); null with none */
  let seen = null;
  /** How many looks at the servers were asked: the last one's id. */
  let looks = 0;
  /** @type {{ checkout: string, id: number } | null} the last look asked, while it is on its way */
  let looking = null;
  /** How many servers the notice lists, as the last look at the panel found it. */
  let noticeRows = 0;
  /** @type {number | null} the height the header was last given; null before it was */
  let headPx = null;

  /** @param {Record<string, IdeState>} states the live ttts', by name */
  const takeStates = (states) => {
    if (stateFor !== null) state = states[stateFor] ?? null;
  };
  if (!checking())
    cx.spawn(async (task) => {
      try {
        folder = await ideStateFolder();
      } catch (error) {
        console.error(
          "forgerdr: the IDE's state folder could not be told; its states are not followed",
          error,
        );
        return;
      }
      following = followIdeStates(task, folder, takeStates);
    });

  /** The folders of the shown forge's checkouts, as the session bar's copy read them; none until it has. */
  const liveNow = () =>
    ideCheckouts(shownCheckouts().tree ?? []).map(({ top }) => top);

  /** @param {IdeCheckout[]} options */
  const checkoutNow = (options) => {
    const space = spaces().find((one) => one.active);
    if (space === undefined) return ideCheckoutOf(null, null, options);
    return ideCheckoutOf(
      ideCheckoutAt(options, placeOf(space)),
      readPicks()[space.id] ?? null,
      options,
    );
  };

  /**
   * Reads the state of the ttt shown now, when it is another: the follow reads it again on every change after.
   * @param {string | null} name
   * @param {Context | AsyncContext} cx
   */
  const readStateOf = (name, cx) => {
    if (name === stateFor) return;
    stateFor = name;
    state = null;
    if (name === null || folder === null) return;
    const from = folder;
    cx.spawn(async (task) => {
      const read = await readIdeState(from, name);
      if (name !== stateFor) return;
      state = read;
      task.notify();
    });
  };

  /**
   * Writes ide-term's content to the layout file, once until layout() shows it (a write that failed included); says once
   * when one that went through never shows.
   * @param {IdeTermContent} content
   * @param {Context | AsyncContext} cx
   */
  const write = (content, cx) => {
    const key = JSON.stringify(content);
    const now = Date.now();
    const layoutName = shared("layout");
    const same = writing?.key === key;
    if (typeof layoutName !== "string" || (same && now < writing.until)) return;
    const unseen = same && writing.written;
    if (unseen && !writing.warned)
      console.error(
        `forgerdr: ide-term was written to show ${key}, and the layout on show still does not`,
      );
    writing = {
      key,
      until: now + WRITE_WAIT,
      warned: same && (writing.warned || unseen),
      written: false,
    };
    cx.spawn(async () => {
      try {
        await writeIdeTerm(layoutName, content);
        if (writing?.key === key) writing = { ...writing, written: true };
      } catch (error) {
        console.error("forgerdr: ide-term could not be set", error);
      }
    });
  };

  /**
   * What the notice lists for a checkout: the servers it lacks, but for the ones hidden in it; nothing without one.
   * @param {string | null} forge the shown forge's key
   * @param {string | null} checkout
   * @returns {ServerRow[]}
   */
  const rowsOf = (forge, checkout) =>
    forge === null || checkout === null
      ? []
      : serverRows(
          known[checkout] ?? [],
          hidden[forge]?.[checkout] ?? [],
          home(),
        );

  /** Makes the header as tall as what it shows, when that is not the height it was last given. */
  const fitHead = () => {
    const px = ideHeadHeight(picking, noticeRows);
    if (px !== headPx) {
      headPx = px;
      run("layout.resize", { id: IDE_NODE.head, px });
    }
  };

  /**
   * Opens or shuts the list of checkouts; the header follows on the next fit.
   * @param {boolean} open
   */
  const setPicking = (open) => {
    picking = open;
    if (!open) search.set_value("");
  };

  /**
   * Everything the IDE's show is made of, looked at again: what the panel shows published, and while the IDE is on show
   * in this copy's layout, the checkout's ttt ensured, ide-term set to show it, the rendered markdown left when the
   * active file is no markdown (idePlan), the language servers looked at (serversLook) and the header made as tall as
   * what it shows; the list of checkouts shut when the IDE is not on show.
   * @param {Context | AsyncContext} cx
   */
  const sync = (cx) => {
    const now = Date.now();
    const live = liveIdes(readTerminals())
      .map(({ name }) => name)
      .join("\n");
    if (folder !== null && live !== readFor) {
      readFor = live;
      const from = folder;
      cx.spawn(async () => takeStates(await refreshIdeStates(from)));
    }
    const { forge, tree } = shownCheckouts();
    const options = ideCheckouts(tree ?? []);
    const checkout = tree === null ? null : checkoutNow(options);
    const failure = readChangesFailure();
    const current = checkout === null ? undefined : readRuns()[checkout];
    const shows = ideShows({
      checkout,
      failure:
        failure !== null && failure.forge === forge?.key ? failure.why : null,
      live: liveTerminalNames(readTerminals()),
      now,
      read: tree !== null,
      run: current,
    });
    readStateOf(shows.kind === IDE_SHOWS.terminal ? shows.name : null, cx);
    publishIdePanel({ checkout, shows, state });
    const shown = shownLayout();
    const showing = panelOnShow(shown) === SIDE_PANEL.ide;
    const ours = holdsMod(nodeIn(shown, IDE_NODE.head)?.content, MOD);
    // An install runs in a tab while the panel is shut, so the panel cannot tell when it ends: it looks again when it
    // comes back on show.
    const servers = serversLook(seen, { checkout, ours, showing });
    seen = servers.seen;
    if (servers.look !== null) lookAt(servers.look, cx);
    noticeRows = rowsOf(forge?.key ?? null, checkout).length;
    if (!showing && picking) setPicking(false);
    // The first fit also shuts the list when a copy starts, in case the app closed with it open.
    if (ours) fitHead();
    const plan = idePlan({
      active: state?.active ?? null,
      address:
        shows.kind === IDE_SHOWS.terminal
          ? liveAddressOf(readTerminals(), shows.name)
          : null,
      checkout,
      mod: MOD,
      now,
      ours,
      rendered: nodeIn(shown, IDE_NODE.view)?.active === IDE_NODE.markdown,
      run: current,
      showing,
      shows,
      term: nodeIn(shown, IDE_NODE.term)?.content,
    });
    if (plan.ensure !== null) {
      // Called here, so the run reads as ensuring before the next look, whenever the task runs.
      const ensuring = ensureIde(plan.ensure);
      cx.spawn(() => ensuring);
    }
    if (plan.write === null) writing = null;
    else write(plan.write, cx);
    if (plan.select)
      run("layout.select", { child: IDE_NODE.term, stack: IDE_NODE.view });
  };

  /**
   * Looks at the language servers a checkout lacks. Only the last look asked is taken, an answer of an earlier one
   * dropped; the header fits what the notice then lists at once.
   * @param {string} checkout
   * @param {Context | AsyncContext} cx
   */
  const lookAt = (checkout, cx) => {
    looks += 1;
    const id = looks;
    looking = { checkout, id };
    cx.spawn(async (task) => {
      const servers = await lookServers(checkout);
      if (looking?.id !== id) return;
      looking = null;
      if (servers !== null)
        known = withCheckout(known, checkout, servers, liveNow());
      sync(task);
      task.notify();
    });
  };

  if (!checking()) forgetRuns();
  const timer = checking()
    ? null
    : cx.timer.every(SYNC_EVERY, (cx) => sync(cx));

  /** @param {Context} cx */
  const shutPicker = (cx) => {
    setPicking(false);
    sync(cx);
    cx.notify();
  };

  /**
   * Shows another checkout in the IDE, picked by hand: kept for the shown space, the list shut.
   * @param {string} top the checkout's folder
   * @param {Context} cx
   */
  const switchTo = (top, cx) => {
    const space = spaces().find((one) => one.active);
    if (space !== undefined) keepPick(space.id, top);
    shutPicker(cx);
  };

  /**
   * Hides what a checkout's notice lists, for that checkout, kept in this copy's storage; the header shrinks back at
   * once.
   * @param {string} forge the shown forge's key
   * @param {string} checkout
   * @param {Context} cx
   */
  const hideNotice = (forge, checkout, cx) => {
    hidden = withHidden(hidden, {
      checkout,
      forge,
      live: liveNow(),
      servers: known[checkout] ?? [],
    });
    keepHiddenServers(hidden);
    sync(cx);
    cx.notify();
  };

  /**
   * The notice of the language servers the checkout shown lacks; nothing when it lists none.
   * @param {string | null} forge the shown forge's key
   * @param {string | null} checkout
   * @returns {NativeElement[]}
   */
  const noticeOf = (forge, checkout) => {
    const rows = rowsOf(forge, checkout);
    return forge === null || checkout === null || !rows.length
      ? []
      : [
          serversNotice(
            rows,
            looking?.checkout === checkout,
            (cx) => {
              lookAt(checkout, cx);
              cx.notify();
            },
            (cx) => hideNotice(forge, checkout, cx),
          ),
        ];
  };

  /**
   * @param {IdeCheckout[]} options
   * @param {string | null} checkout the one shown
   */
  const pickerList = (options, checkout) => {
    const k = tokens();
    const found = matchCheckouts(options, search.value());
    return v_flex()
      .flex_1()
      .min_h(0)
      .bg(k.bg0)
      .border(2)
      .border_color(k.line)
      .child(
        div()
          .id("ide-search-field")
          .flex_none()
          .h(32)
          .px(8)
          .flex()
          .items_center()
          .border_b(2)
          .border_color(k.line)
          .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
          .child(Input.new(search).w_full().text_size(13).text_color(k.fg)),
      )
      .child(
        v_flex()
          .id("ide-checkouts")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .children(
            found.map((option) =>
              control(
                checkoutRow(option, option.top === checkout),
                `ide-checkout-${option.top}`,
                (cx) =>
                  option.top === checkout
                    ? shutPicker(cx)
                    : switchTo(option.top, cx),
              ),
            ),
          )
          .when(found.length === 0, (el) =>
            el.child(
              div()
                .p(8)
                .child(
                  text(
                    options.length === 0
                      ? "This forge has no checkout here."
                      : "No checkout matches.",
                    "ui",
                    12,
                    k.muted,
                  ),
                ),
            ),
          ),
      );
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const { forge, tree } = shownCheckouts();
    const options = ideCheckouts(tree ?? []);
    const checkout = tree === null ? null : checkoutNow(options);
    const chosen = options.find((option) => option.top === checkout) ?? null;
    const markdown = stateFor !== null && isMarkdown(state?.active ?? null);
    const rendered = layoutNode(IDE_NODE.view)?.active === IDE_NODE.markdown;
    const maximized = panelWantsMaximized(SIDE_PANEL.ide);
    return v_flex()
      .id("ide")
      .size_full()
      .gap(IDE_HEAD.gap)
      .p(8)
      .bg(k.bg1)
      .border(2)
      .border_color(k.line)
      .child(
        h_flex()
          .flex_none()
          .h(40)
          .items_center()
          .gap(8)
          .child(text(IDE_LABEL.panel, "display", 11, k.fg))
          .child(
            control(checkoutChoice(chosen, picking), "ide-choice", (cx) => {
              if (picking) {
                shutPicker(cx);
                return;
              }
              if (options.length === 0) return;
              setPicking(true);
              fitHead();
              search.focus();
              cx.notify();
            }),
          )
          .when(markdown, (el) =>
            el.child(
              control(
                panelToggle(IDE_LABEL.rendered, rendered),
                "ide-rendered",
                () =>
                  run("layout.select", {
                    child: rendered ? IDE_NODE.term : IDE_NODE.markdown,
                    stack: IDE_NODE.view,
                  }),
              ),
            ),
          )
          .child(
            control(
              iconButton(ICON.zoom, maximized ? k.accent : k.muted),
              "ide-maximize",
              () => keepPanelMaximized(SIDE_PANEL.ide, !maximized),
            ),
          ),
      )
      .when(picking, (el) => el.child(pickerList(options, checkout)))
      .children(picking ? [] : noticeOf(forge?.key ?? null, checkout));
  };

  return {
    close: () => {
      timer?.cancel();
      following?.cancel();
      search.release();
    },
    render,
  };
};
