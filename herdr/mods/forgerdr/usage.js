// What the usage bar shows of the subscription's windows that the status line kept (bin/forge-statusline.sh): the
// windows still running, how long until each resets, the band of heat each is in and the warnings each still owes.
// Pure: Node tests it (test/herdr-mod.test.mjs).

/**
 * @typedef {object} UsageWindow
 * @property {number} used percent of the window used
 * @property {number} resets_at unix seconds
 */

/**
 * @typedef {object} UsageSnapshot what bin/forge-statusline.sh keeps
 * @property {number} at unix seconds it was seen
 * @property {Partial<Record<WindowName, UsageWindow>>} windows
 */

export const WINDOW = Object.freeze({
  fiveHour: "five_hour",
  sevenDay: "seven_day",
});

/** @typedef {typeof WINDOW[keyof typeof WINDOW]} WindowName */

// From 80 % the gnome warns, from 95 % it warns again.
export const THRESHOLD = Object.freeze({ danger: 95, warn: 80 });

export const BAND = Object.freeze({
  danger: "danger",
  heat: "heat",
  warn: "warn",
});

/** @typedef {typeof BAND[keyof typeof BAND]} Band */

/**
 * The windows still running: one the status line no longer sent, or whose reset has passed, is hidden rather than
 * shown at 0 %.
 * @param {UsageSnapshot | null} snapshot
 * @param {number} now unix seconds
 * @returns {Partial<Record<WindowName, UsageWindow>>}
 */
export const runningWindows = (snapshot, now) =>
  Object.fromEntries(
    Object.entries(snapshot?.windows ?? {}).filter(
      ([, window]) =>
        typeof window?.used === "number" && window.resets_at > now,
    ),
  );

/**
 * How long until a window resets, as a person reads it: 3d 4h, 1h 12m, 12m, <1m.
 * @param {number} resetsAt unix seconds
 * @param {number} now unix seconds
 */
export const resetsIn = (resetsAt, now) => {
  const minutes = Math.max(0, Math.floor((resetsAt - now) / 60));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return minutes > 0 ? `${minutes}m` : "<1m";
};

/** @param {number} percent */
export const bandOf = (percent) => {
  if (percent >= THRESHOLD.danger) return BAND.danger;
  return percent >= THRESHOLD.warn ? BAND.warn : BAND.heat;
};

/**
 * The warnings the windows owe: each threshold a window has crossed, once per reset period, as keys a caller keeps.
 * @param {Partial<Record<WindowName, UsageWindow>>} windows the running ones
 * @param {string[]} told the keys already warned of
 * @returns {{ key: string, name: WindowName, threshold: number, window: UsageWindow }[]}
 */
export const warningsDue = (windows, told) =>
  Object.entries(windows).flatMap(([name, window]) =>
    [THRESHOLD.warn, THRESHOLD.danger]
      .filter((threshold) => window.used >= threshold)
      .map((threshold) => ({
        key: `${name}:${window.resets_at}:${threshold}`,
        name: /** @type {WindowName} */ (name),
        threshold,
        window,
      }))
      .filter(({ key }) => !told.includes(key)),
  );

/**
 * The warned-of keys still worth keeping: those of a reset period that has not ended.
 * @param {string[]} told
 * @param {number} now unix seconds
 */
export const keptWarnings = (told, now) =>
  told.filter((key) => Number(key.split(":")[1]) > now);

const DAYS = Object.freeze(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);

/**
 * When a window resets, on the local clock as a person reads it: Thu 01:00. No Intl in the app, so by hand.
 * @param {number} unix seconds
 */
export const clockOf = (unix) => {
  const date = new Date(unix * 1000);
  const two = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${DAYS[date.getDay()]} ${two(date.getHours())}:${two(date.getMinutes())}`;
};

// How long each window lasts and how many bars its history shows: a bar per half hour of the 5 hours, a bar a day.
/** @type {Record<WindowName, { span: number, bars: number }>} */
export const SPAN = {
  five_hour: { bars: 10, span: 5 * 3600 },
  seven_day: { bars: 7, span: 7 * 24 * 3600 },
};

/**
 * @typedef {object} UsageSample one line of the status line's history
 * @property {number} at unix seconds
 * @property {number | null} [five_hour]
 * @property {number | null} [seven_day]
 */

/**
 * How much of a window each stretch of it used: its period cut into bars, each the rise in use within it. Only this
 * period's samples count; a stretch with no sample shows no rise. When the first sample came after the first stretch,
 * what was used before it is its starting point: nobody saw when it was spent, so no bar claims it.
 * @param {UsageSample[]} samples oldest first
 * @param {WindowName} name
 * @param {UsageWindow} window
 * @returns {number[]} one value per bar, in percent points
 */
export const historyBars = (samples, name, window) => {
  const { bars, span } = SPAN[name];
  const start = window.resets_at - span;
  const width = span / bars;
  const inPeriod = samples.filter(
    (sample) => sample.at >= start && typeof sample[name] === "number",
  );
  const [first] = inPeriod;
  let before =
    first !== undefined && first.at >= start + width ? first[name] : 0;
  return Array.from({ length: bars }, (_, index) => {
    const end = start + (index + 1) * width;
    const reached = inPeriod
      .filter((sample) => sample.at < end)
      .reduce((top, sample) => Math.max(top, sample[name]), before);
    const rise = reached - before;
    before = reached;
    return rise;
  });
};

// A session's context: from 80 % its crucible burns white hot, from 90 % it blinks, close to compacting.
export const CONTEXT = Object.freeze({ blink: 90, hot: 80 });

/**
 * How many of a crucible's levels a session's context fills: none when empty, the top one only when full.
 * @param {number} percent
 * @param {number} levels
 */
export const fillLevel = (percent, levels) =>
  Math.min(levels, Math.ceil((Math.max(0, percent) / 100) * levels));
