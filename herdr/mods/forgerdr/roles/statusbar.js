// The window's status bar (designs 04 and 09): the account's profile, which opens its forge heat (roles/heat.js), the
// subscription's heat as the status line kept it (the 5-hour window and the week, each with its steps and its reset),
// forgerdr's next release beside Herdr's update when one is ready, and the forgerdr manual.
// forgerdr looks for a release (bin/forge-update.sh check) when the bar starts and its last look is an hour old, then every
// few hours; the first time it finds one, the gnome's notice (roles/news.js) opens by itself, and FORGERDR x.y.z opens it
// again. Nothing is applied without its Update now.
// It shows only the windows still running, so with no session it shows no heat. The first time in a reset period that a
// window crosses 80 % and then 95 %, the gnome says so in a notification.
import { h_flex } from "gpui-base";
import { div } from "gpui-kit";
import { checking, notify, openOverlay, run, updates } from "herdr";
import { checkUpdate, followUpdate } from "../bridges/update.js";
import { readUsage, watchUsage } from "../bridges/usage.js";
import { forgerdrChip, quietButton, updateChip } from "../kit/buttons.js";
import { profileSwitch } from "../kit/chips.js";
import { control } from "../kit/control.js";
import { heatMeter } from "../kit/meters.js";
import { tokens } from "../kit/tokens.js";
import { MOD } from "../name.js";
import { checkDue, phaseOf, UPDATE_PHASE, UPDATE_TIMING } from "../update.js";
import {
  bandOf,
  keptWarnings,
  resetsIn,
  runningWindows,
  THRESHOLD,
  WINDOW,
  warningsDue,
} from "../usage.js";
import { openManual } from "./manual.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("../update.js").UpdateState} UpdateState */
/** @typedef {import("../usage.js").UsageSnapshot} UsageSnapshot */
/** @typedef {import("../usage.js").WindowName} WindowName */
/** @typedef {import("./role.js").Role} Role */

const MINUTE = 60_000;

// The windows' thresholds already told of, so a restart does not tell them again.
const TOLD_KEY = "usage.told";

// The newest release whose notice opened by itself, so it opens once.
const ANNOUNCED_KEY = "update.announced";

/** @type {Record<WindowName, { label: string, spoken: string }>} */
const NAMES = {
  five_hour: { label: "5H", spoken: "5-hour window" },
  seven_day: { label: "WEEK", spoken: "weekly window" },
};

const HEAT = Object.freeze({ height: 560, kind: "dialog", width: 620 });
const NEWS = Object.freeze({ height: 600, kind: "dialog", width: 720 });

// What forgerdr's chip adds to its version in each phase that shows it.
/** @type {Readonly<Partial<Record<import("../update.js").UpdatePhase, string>>>} */
const CHIP_SAYS = Object.freeze({
  applying: " · forging…",
  available: "",
  failed: " · failed",
});

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** @returns {string[]} */
const readTold = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(TOLD_KEY) ?? "[]");
    return Array.isArray(stored)
      ? stored.filter((key) => typeof key === "string")
      : [];
  } catch {
    return [];
  }
};

/** @param {string[]} told */
const saveTold = (told) => {
  try {
    localStorage.setItem(TOLD_KEY, JSON.stringify(told));
  } catch {
    // Storage is away: a restart may tell a threshold again.
  }
};

const openNews = () =>
  openOverlay({ ...NEWS, mod: MOD, props: { role: "news" } });

/** @returns {string} */
const readAnnounced = () => {
  try {
    return localStorage.getItem(ANNOUNCED_KEY) ?? "";
  } catch {
    return "";
  }
};

/** @param {string} version */
const saveAnnounced = (version) => {
  try {
    localStorage.setItem(ANNOUNCED_KEY, version);
  } catch {
    // Storage is away: the notice may open by itself once more after a restart.
  }
};

const lookForRelease = () =>
  checkUpdate().catch((error) =>
    console.error("forgerdr: forge-update.sh check could not run", error),
  );

// The profile, lit while it is the one in use, opens its forge heat.
const openHeat = () =>
  openOverlay({ ...HEAT, mod: MOD, props: { role: "heat" } });

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const statusbar = (cx) => {
  /** @type {UsageSnapshot | null} */
  let usage = null;
  let told = readTold();
  /** @type {UpdateState | null} */
  let update = null;
  let announced = readAnnounced();
  let looked = false;

  const warn = () => {
    const now = nowSeconds();
    const due = warningsDue(runningWindows(usage, now), told);
    for (const { name, threshold, window } of due) {
      notify({
        body: `The ${NAMES[name].spoken} is at ${Math.round(window.used)}%; it resets in ${resetsIn(window.resets_at, now)}.`,
        level: threshold >= THRESHOLD.danger ? "error" : "warning",
        title: "Forge heat",
      });
    }
    const kept = keptWarnings([...told, ...due.map(({ key }) => key)], now);
    if (kept.join() === told.join()) return;
    told = kept;
    saveTold(told);
  };

  const task = checking()
    ? null
    : cx.spawn(async (cx) => {
        for (;;) {
          usage = await readUsage();
          warn();
          cx.notify();
          // Again when the status line writes, and every minute for the countdown and the windows that end.
          const change = watchUsage();
          await Promise.race([
            change.catch(() => cx.sleep(MINUTE)),
            cx.sleep(MINUTE),
          ]);
          change.cancel();
        }
      });

  // The first read decides whether to look now; a release found for the first time opens its notice.
  const updating = checking()
    ? null
    : followUpdate(cx, ({ state }) => {
        update = state;
        if (!looked) {
          looked = true;
          if (checkDue(state, Date.now())) lookForRelease();
        }
        if (
          state !== null &&
          phaseOf(state, Date.now()) === UPDATE_PHASE.available &&
          state.latest !== announced
        ) {
          announced = state.latest;
          saveAnnounced(announced);
          openNews();
        }
      });
  const looking = checking()
    ? null
    : cx.spawn(async (cx) => {
        for (;;) {
          await cx.sleep(UPDATE_TIMING.every);
          await lookForRelease();
        }
      });

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const now = nowSeconds();
    const windows = runningWindows(usage, now);
    const ready = updates().app.ready;
    const phase = phaseOf(update, Date.now());
    const says = CHIP_SAYS[phase];
    return h_flex()
      .id("statusbar")
      .size_full()
      .items_center()
      .gap(16)
      .px(14)
      .bg(k.chrome)
      .border_t(2)
      .border_color(k.line)
      .child(control(profileSwitch(["OAuth"], 0), "profile", openHeat))
      .children(
        [WINDOW.fiveHour, WINDOW.sevenDay]
          .filter((name) => windows[name] !== undefined)
          .map((name, index) =>
            heatMeter({
              band: bandOf(windows[name].used),
              detail: `${Math.round(windows[name].used)}% · resets ${resetsIn(windows[name].resets_at, now)}`,
              flame: index === 0,
              label: NAMES[name].label,
              percent: windows[name].used,
            }),
          ),
      )
      .child(div().flex_1())
      .when(update !== null && says !== undefined, (el) =>
        el.child(
          control(
            forgerdrChip(
              `FORGERDR ${update?.latest ?? ""}${says}`,
              phase === UPDATE_PHASE.failed,
            ),
            "forgerdr-update",
            openNews,
          ),
        ),
      )
      .when(ready !== null, (el) =>
        el.child(
          control(updateChip(ready), "herdr-update", () => run("app.update")),
        ),
      )
      .child(control(quietButton("? Manual"), "manual", openManual));
  };

  return {
    close: () => {
      task?.cancel();
      updating?.cancel();
      looking?.cancel();
    },
    render,
  };
};
