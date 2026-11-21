// The golem lanes under the panes (design 04), an accordion that stays whatever tab shows: the golems the sessions of the
// active space spawned, the most urgent first, each with what it is doing, its context, how long it has been at it and
// its status. Folded, one line: the arrow, how many there are and the most urgent; with none, "no golems at work".
// Unfolded, every lane. A lane goes to its terminal on a click (a subagent inside a session, to that session's). The
// session bar sizes the block to the fold (roles/sessions.js).
import { h_flex, v_flex } from "gpui-base";
import { checking, panes, run, spaces } from "herdr";
import { lanesOpen, toggleLanes } from "../bridges/lanes.js";
import { readTerminals } from "../bridges/terminals.js";
import { readContexts } from "../bridges/usage.js";
import { reviewTabOf } from "../inbox.js";
import { control } from "../kit/control.js";
import { laneRow, lanesHead } from "../kit/lanes.js";
import { fill } from "../kit/text.js";
import { TONE, tokens, toneOf } from "../kit/tokens.js";
import { elapsed, spaceLanes } from "../lanes.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("../lanes.js").Lane} Lane */
/** @typedef {import("./role.js").Role} Role */

// The lanes' clocks tick once a second, and the contexts are read as often.
const TICK = 1000;

/** @param {string} status */
const toneOfLane = (status) =>
  status === "cracked"
    ? TONE.failed
    : toneOf(/** @type {import("herdr").Status} */ (status));

/** @param {Lane} lane the terminal it goes to: its own, or its session's for a subagent inside one */
const terminalOf = (lane) => lane.id.split("/")[0];

// A lane's golem: its pane; the review it works behind, parked (bin/forge-review.sh); else a peek at it.
/** @param {string} terminal */
const goTo = (terminal) => {
  const reviewTab = reviewTabOf(terminal, readTerminals());
  if (panes().some((pane) => pane.terminal === terminal))
    run("pane.focus", { terminal });
  else if (reviewTab !== "") run("tab.select", { id: reviewTab });
  else run("terminal.peek", { terminal });
};

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const lanes = (cx) => {
  /** @type {Record<string, { used: number, at: number }>} */
  let contexts = {};
  /** @type {Record<string, number>} when each in-session subagent was first seen */
  const seen = {};
  // Whether a lane works, so its clock runs: the lanes draw again each second only then, or when a context changed.
  let ticking = false;
  /** @type {string[]} the terminals of the lanes last drawn, whose contexts the loop reads */
  let wanted = [];

  const task = checking()
    ? null
    : cx.spawn(async (cx) => {
        for (;;) {
          const read = await readContexts(wanted);
          const changed = JSON.stringify(read) !== JSON.stringify(contexts);
          contexts = read;
          if (ticking || changed) cx.notify();
          await cx.sleep(TICK);
        }
      });

  /**
   * @param {Lane} lane
   * @param {number} now
   * @param {boolean} ruled
   */
  const row = (lane, now, ruled) =>
    control(
      laneRow({
        activity: lane.activity || (lane.status === "done" ? "finished" : ""),
        context: lane.context,
        name: lane.name,
        role: lane.golem,
        ruled,
        time: elapsed(lane.since, lane.until ?? now),
        tone: toneOfLane(lane.status),
      }),
      `lane-${lane.id}`,
      () => goTo(terminalOf(lane)),
    );

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const now = Date.now();
    const all = readTerminals();
    const space = spaces().find((one) => one.active);
    for (const terminal of all) {
      for (const key of Object.keys(terminal.records ?? {}))
        seen[`${terminal.address}/${key}`] ??= now;
    }
    const shown =
      space === undefined
        ? []
        : spaceLanes(space.id, all, contexts, seen, spaces());
    ticking = shown.some(
      (lane) => lane.until === undefined && lane.status === "working",
    );
    wanted = shown
      .filter((lane) => !lane.id.includes("/"))
      .map((lane) => lane.id);
    const open = lanesOpen() && shown.length > 0;
    const head = lanesHead({ count: shown.length, open });
    const toggle =
      shown.length > 0 ? control(head, "lanes-fold", toggleLanes) : head;
    const [first] = shown;
    const root = v_flex()
      .id("lanes")
      .size_full()
      .bg(k.bg0)
      .border_t(2)
      .border_color(k.line);
    if (!open) {
      return root.child(
        h_flex()
          .h(34)
          .items_center()
          .child(toggle)
          .child(
            first === undefined
              ? fill("no golems at work", "ui", 12, k.muted)
              : row(first, now, false).flex_1().min_w(0),
          ),
      );
    }
    return root.child(toggle).child(
      v_flex()
        .id("lane-rows")
        .flex_1()
        .min_h(0)
        .overflow_y_scrollbar()
        .children(shown.map((lane) => row(lane, now, true))),
    );
  };

  return { close: () => task?.cancel(), render };
};
