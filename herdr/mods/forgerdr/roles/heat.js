// The forge heat of the account's subscription (design 09, its left half), over the window when the status bar's
// profile is pressed: each window still running with its stepped bar, its use, when it resets and its history, a bar
// a stretch of the window. From what Claude Code gives its status line (bin/forge-statusline.sh); limits it does not
// give, such as each model's weekly one, are not here. Esc or its close control closes it.
import { h_flex, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { checking, closeOverlay, props } from "herdr";
import { readHistory, readUsage, watchUsage } from "../bridges/usage.js";
import { control } from "../kit/control.js";
import { historyBars, steppedBar } from "../kit/meters.js";
import { ICON, icon, iconButton } from "../kit/sprites.js";
import { text } from "../kit/text.js";
import { BRAND, tokens, toneColour } from "../kit/tokens.js";
import {
  bandOf,
  historyBars as barsOf,
  clockOf,
  resetsIn,
  runningWindows,
  WINDOW,
} from "../usage.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("../usage.js").UsageSample} UsageSample */
/** @typedef {import("../usage.js").UsageSnapshot} UsageSnapshot */
/** @typedef {import("../usage.js").UsageWindow} UsageWindow */
/** @typedef {import("../usage.js").WindowName} WindowName */
/** @typedef {import("./role.js").Role} Role */

/** @type {() => { overlay?: string } | null} */
const readProps = props;

const MINUTE = 60_000;

/** @type {Record<WindowName, { title: string, bars: string }>} */
const CARDS = {
  five_hour: {
    bars: "one bar per half hour · this window only",
    title: "CURRENT SESSION · 5 HOURS",
  },
  seven_day: {
    bars: "one bar per day · this week only",
    title: "WEEKLY · ALL MODELS",
  },
};

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const heat = (cx) => {
  /** @type {UsageSnapshot | null} */
  let usage = null;
  /** @type {UsageSample[]} */
  let history = [];

  const task = checking()
    ? null
    : cx.spawn(async (cx) => {
        for (;;) {
          [usage, history] = await Promise.all([readUsage(), readHistory()]);
          cx.notify();
          const change = watchUsage();
          await Promise.race([
            change.catch(() => cx.sleep(MINUTE)),
            cx.sleep(MINUTE),
          ]);
          change.cancel();
        }
      });

  /**
   * @param {WindowName} name
   * @param {UsageWindow} window
   * @param {number} now
   */
  const card = (name, window, now) => {
    const k = tokens();
    const band = bandOf(window.used);
    const lit =
      band === "heat"
        ? BRAND.ember
        : toneColour(band === "warn" ? "needs" : "failed");
    return v_flex()
      .gap(10)
      .p(14)
      .bg(k.bg1)
      .border(2)
      .border_color(k.line)
      .child(
        h_flex()
          .justify_between()
          .items_center()
          .child(text(CARDS[name].title, "display", 9, k.muted))
          .child(text(`${Math.round(window.used)}%`, "display", 14, lit)),
      )
      .child(
        steppedBar({
          colour: lit,
          gap: 2,
          height: 10,
          share: window.used / 100,
          steps: 20,
          width: 22,
        }),
      )
      .child(
        text(
          `resets ${clockOf(window.resets_at)} · in ${resetsIn(window.resets_at, now)}`,
          "ui",
          12,
          k.muted,
        ),
      )
      .child(historyBars(barsOf(history, name, window)))
      .child(text(CARDS[name].bars, "ui", 11, k.muted));
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const now = Math.floor(Date.now() / 1000);
    const windows = runningWindows(usage, now);
    const shown = [WINDOW.fiveHour, WINDOW.sevenDay].filter(
      (name) => windows[name] !== undefined,
    );
    return v_flex()
      .size_full()
      .bg(k.bg0)
      .border(2)
      .border_color(k.line)
      .child(
        h_flex()
          .flex_none()
          .items_center()
          .gap(10)
          .px(16)
          .py(12)
          .border_b(2)
          .border_color(k.line)
          .child(icon(ICON.heat, BRAND.ember))
          .child(text("FORGE HEAT", "display", 11, k.fg))
          .child(div().flex_1())
          .child(text("Claude subscription · OAuth", "ui", 12, k.muted))
          .child(
            control(iconButton(ICON.close, k.muted), "heat-close", () =>
              closeOverlay(readProps()?.overlay ?? ""),
            ),
          ),
      )
      .child(
        v_flex()
          .id("heat-windows")
          .flex_1()
          .min_h(0)
          .gap(12)
          .p(16)
          .overflow_y_scrollbar()
          .when(shown.length === 0, (el) =>
            el.child(
              text(
                "No window yet: Claude Code tells its limits after a session's first answer.",
                "ui",
                12,
                k.muted,
              ),
            ),
          )
          .children(shown.map((name) => card(name, windows[name], now))),
      );
  };

  return { close: () => task?.cancel(), render };
};
