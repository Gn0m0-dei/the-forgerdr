// A pane's header (design 04), for the layout's pane frames: what runs in it and where, and its golem's status, or
// RUNNING for a program that is not a shell. A click focuses the pane; while the pointer is on it, a ✕ closes it, and
// on an agent's pane a review icon snapshots what the agent changed into a review round (bin/forge-round.sh) and opens
// its rounds in a tab of their own (roles/round.js), or selects that tab when it is open. The session bar has the
// controls that split and zoom. The app makes one copy per pane and tells it which in its props.
import { div } from "gpui-kit";
import {
  home,
  notify,
  panes,
  props,
  run,
  setShared,
  shared,
  spaces,
} from "herdr";
import { snapRound } from "../bridges/rounds.js";
import { control } from "../kit/control.js";
import { paneHeader } from "../kit/panels.js";
import { ICON, iconButton } from "../kit/sprites.js";
import { tokens, toneOf } from "../kit/tokens.js";
import { MOD } from "../name.js";
import {
  folderLabel,
  PROGRAM_KIND,
  paneLabel,
  programKind,
} from "../sessions.js";

/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("herdr").PaneInfo} PaneInfo */
/** @typedef {import("./role.js").Role} Role */

/** @type {() => { pane?: string } | null} */
const readProps = props;

// How long the name of a session may be in its rounds' tab.
const TAB_TITLE = 32;
// Each terminal's rounds tab, by the name it was given when it opened: the session's title changes as it works, and two
// sessions may share one, so the tab is never looked up by the title it has now.
const ROUNDS_KEY = "forgerdr.rounds";

/** @returns {Record<string, string>} each terminal's rounds tab, by name */
const readRoundTabs = () => {
  const stored = shared(ROUNDS_KEY);
  if (stored === null || typeof stored !== "object" || Array.isArray(stored))
    return {};
  return Object.fromEntries(
    Object.entries(stored).filter(([, name]) => typeof name === "string"),
  );
};

/**
 * A name for a session's rounds tab that no tab has: its title, else with the first free number from 2.
 * @param {PaneInfo} pane
 * @param {Set<string>} taken
 */
const roundsTab = (pane, taken) => {
  const base = `Rounds · ${paneLabel(pane).slice(0, TAB_TITLE)}`;
  let name = base;
  for (let n = 2; taken.has(name); n += 1) name = `${base} ${n}`;
  return name;
};

/** @returns {Role} */
export const pane = () => {
  let hovered = false;
  let snapping = false;

  /** @param {PaneInfo} me @param {Context} cx */
  const reviewChanges = (me, cx) => {
    const { terminal } = me;
    if (terminal === null || snapping) return;
    snapping = true;
    cx.spawn(async (task) => {
      const snapped = await snapRound(terminal, me.cwd ?? "");
      snapping = false;
      task.notify();
      const tabs = spaces().flatMap((space) => space.tabs);
      const names = new Set(tabs.map((tab) => tab.name));
      const known = readRoundTabs();
      const open = tabs.find((tab) => tab.name === known[terminal]);
      if (snapped.kind === "failed") {
        if (open !== undefined) run("tab.select", { id: open.id });
        notify({
          body: snapped.message,
          level: "error",
          title: "Review changes",
        });
        return;
      }
      if (snapped.kind === "nothing")
        notify({
          body: snapped.message,
          level: "info",
          title: "Review changes",
        });
      if (open !== undefined) {
        run("tab.select", { id: open.id });
        return;
      }
      // A new round, or none new but rounds to look at again: their tab opens.
      if (snapped.kind === "nothing" && snapped.last === null) return;
      const name = roundsTab(me, names);
      // The tabs that are gone are forgotten as a new one is kept.
      setShared(ROUNDS_KEY, {
        ...Object.fromEntries(
          Object.entries(known).filter(([, kept]) => names.has(kept)),
        ),
        [terminal]: name,
      });
      run("tab.new", {
        focus: true,
        mod: MOD,
        name,
        props: { role: "round", terminal },
      });
    });
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const id = readProps()?.pane;
    const me = panes().find((one) => one.pane === id);
    if (me === undefined) return div();
    const agent =
      programKind(me.program) === PROGRAM_KIND.agent && me.terminal !== null;
    return paneHeader({
      close: hovered
        ? control(
            iconButton(ICON.close, tokens().muted),
            `pane-close-${me.pane}`,
            () => run("pane.close", { pane: me.pane }),
          )
        : undefined,
      folder: folderLabel(me.cwd, home()),
      review:
        hovered && agent
          ? control(
              iconButton(
                ICON.pullRequest,
                snapping ? tokens().needs : tokens().muted,
              ),
              `pane-review-${me.pane}`,
              (cx) => reviewChanges(me, cx),
            )
          : undefined,
      running: programKind(me.program) === PROGRAM_KIND.program,
      title: paneLabel(me),
      tone: me.status ? toneOf(me.status) : undefined,
    })
      .id(`pane-head-${me.pane}`)
      .on_hover((over, cx) => {
        hovered = over;
        cx.notify();
      })
      .on_click(() => run("pane.focus", { pane: me.pane }));
  };

  return { render };
};
