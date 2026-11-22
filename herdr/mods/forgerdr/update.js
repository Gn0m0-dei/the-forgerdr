// What bin/forge-update.sh says of forgerdr's next release, as the status bar's chip and the gnome's notice (design 10b)
// read it: whether one is offered, under way, failed or just applied, and when to look again. Pure: Node tests it
// (test/herdr-mod.test.mjs).

export const UPDATE_PHASE = Object.freeze({
  applied: "applied",
  applying: "applying",
  available: "available",
  failed: "failed",
  none: "none",
});

/** @typedef {typeof UPDATE_PHASE[keyof typeof UPDATE_PHASE]} UpdatePhase */

/**
 * The state forge-update.sh keeps (state.json).
 * @typedef {object} UpdateState
 * @property {string} installed the version installed when it last looked
 * @property {string} latest the newest release
 * @property {number} checked when it last looked, in ms
 * @property {number | null} applying when the apply under way started, in ms
 * @property {string | null} applied the version the last apply installed
 * @property {string | null} error why the last apply failed
 */

const MINUTE = 60_000;

export const UPDATE_TIMING = Object.freeze({
  // A check an hour old is looked at again when the status bar starts, then every few hours.
  due: 60 * MINUTE,
  every: 6 * 60 * MINUTE,
  // An apply that has not ended by then died with whatever ran it.
  stuck: 15 * MINUTE,
});

const VERSION = /^\d+\.\d+\.\d+$/;

/**
 * Whether one version (x.y.z) is newer than another, number by number.
 * @param {string} one
 * @param {string} other
 */
export const newerVersion = (one, other) => {
  const theirs = other.split(".").map(Number);
  const gap = one
    .split(".")
    .map((part, index) => Number(part) - (theirs.at(index) ?? 0))
    .find((difference) => difference !== 0);
  return gap !== undefined && gap > 0;
};

/** @param {unknown} value */
const versionOrNull = (value) =>
  typeof value === "string" && VERSION.test(value) ? value : null;

/**
 * The state as forge-update.sh wrote it; null when it is not in its shape.
 * @param {string} text state.json
 * @returns {UpdateState | null}
 */
export const parseUpdate = (text) => {
  /** @type {unknown} */
  let read;
  try {
    read = JSON.parse(text);
  } catch {
    return null;
  }
  if (read === null || typeof read !== "object" || Array.isArray(read))
    return null;
  /** @type {Record<string, unknown>} */
  const fields = Object.fromEntries(Object.entries(read));
  const { installed, latest, checked, applying, applied, error } = fields;
  const known =
    versionOrNull(installed) !== null &&
    versionOrNull(latest) !== null &&
    typeof checked === "number" &&
    (applying == null || typeof applying === "number") &&
    (applied == null || versionOrNull(applied) !== null) &&
    (error == null || typeof error === "string");
  return known
    ? {
        applied: versionOrNull(applied),
        applying: typeof applying === "number" ? applying : null,
        checked: Number(checked),
        error: typeof error === "string" ? error : null,
        installed: String(installed),
        latest: String(latest),
      }
    : null;
};

/**
 * Where the update stands: applying while an apply runs, available while a newer release waits (failed when the last
 * apply stopped, or got stuck, short of it), applied once the last apply's version is the one installed, none otherwise.
 * @param {UpdateState | null} state
 * @param {number} now ms
 * @returns {UpdatePhase}
 */
export const phaseOf = (state, now) => {
  if (state === null) return UPDATE_PHASE.none;
  const stuck =
    state.applying !== null && now - state.applying >= UPDATE_TIMING.stuck;
  if (state.applying !== null && !stuck) return UPDATE_PHASE.applying;
  if (newerVersion(state.latest, state.installed))
    return state.error === null && !stuck
      ? UPDATE_PHASE.available
      : UPDATE_PHASE.failed;
  return state.applied === state.installed
    ? UPDATE_PHASE.applied
    : UPDATE_PHASE.none;
};

// Where a look asked for by hand (the manual's Check for updates) stands, and what it found.
export const CHECK = Object.freeze({
  checking: "checking",
  failed: "failed",
  idle: "idle",
  newer: "newer",
  upToDate: "upToDate",
});

/** @typedef {typeof CHECK[keyof typeof CHECK]} CheckState */

/**
 * What a look by hand found: a newer release (offered, going in or stopped short of it), none, or no answer, when
 * forge-update.sh check failed or left no state.
 * @param {boolean} ran
 * @param {UpdateState | null} state
 * @returns {CheckState}
 */
export const checkFound = (ran, state) => {
  if (!ran || state === null) return CHECK.failed;
  return newerVersion(state.latest, state.installed)
    ? CHECK.newer
    : CHECK.upToDate;
};

/**
 * Whether to look for a release now: never looked, or the last look an hour old.
 * @param {UpdateState | null} state
 * @param {number} now ms
 */
export const checkDue = (state, now) =>
  state === null || now - state.checked >= UPDATE_TIMING.due;
