// What bin/forge-update.sh says of forgerdr's next release, as the status bar's chip and the gnome's notice (design 10b)
// read it: whether one is offered, under way, failed or just applied, when to look again, and what the apply's
// install.sh --update said of each piece. Pure: Node tests it (test/herdr-mod.test.mjs).

export const UPDATE_PHASE = Object.freeze({
  applied: "applied",
  applying: "applying",
  available: "available",
  failed: "failed",
  none: "none",
});

/** @typedef {typeof UPDATE_PHASE[keyof typeof UPDATE_PHASE]} UpdatePhase */

// What install.sh --update says of a piece: left as it was, its look refreshed, installed, updated to what forgerdr
// needs, removed on purpose (uninstall.sh), missing (it needs the person's password or another piece) or failed.
export const PIECE_RESULT = Object.freeze({
  failed: "failed",
  here: "here",
  installed: "installed",
  missing: "missing",
  refreshed: "refreshed",
  removed: "removed",
  updated: "updated",
});

/** @typedef {typeof PIECE_RESULT[keyof typeof PIECE_RESULT]} PieceResult */

/**
 * A line install.sh --update printed, as forge-update.sh keeps it.
 * @typedef {object} PieceSaid
 * @property {string} piece install.sh's id of the piece
 * @property {PieceResult} result
 * @property {string} detail why, for missing, failed and removed; empty otherwise
 */

/**
 * The state forge-update.sh keeps (state.json).
 * @typedef {object} UpdateState
 * @property {string} installed the version installed when it last looked
 * @property {string} latest the newest release
 * @property {number} checked when it last looked, in ms
 * @property {number | null} applying when the apply under way started, in ms
 * @property {string | null} applied the version the last apply installed
 * @property {string | null} error why the last apply failed
 * @property {string | null} step the piece install.sh --update said last while the apply runs: the one just checked
 * @property {PieceSaid[]} pieces what it said of each piece in the last apply, in its order
 */

// Each piece's name, as install.sh's name() prints it, for every piece of its PIECES (a test holds them together).
/** @type {Readonly<Record<string, string>>} */
export const PIECE_NAME = Object.freeze({
  az: "Azure CLI (az)",
  azdo: "azdo plugin",
  "codebase-memory": "codebase-memory-mcp",
  devops: "azure-devops extension",
  engram: "engram",
  font: "Maple Mono NF font",
  forgerdr: "forgerdr plugin",
  gh: "GitHub CLI (gh)",
  glab: "GitLab CLI (glab)",
  jq: "jq",
  look: "forgerdr look in herdr",
  node: "Node.js + npm",
  openspec: "OpenSpec CLI",
  path: "~/.local/bin on PATH",
  pnpm: "pnpm",
  statusline: "forgerdr status line",
  ttt: "ttt (the IDE panel's editor)",
});

// The details install.sh --update gives that mean something here: a piece left missing because installing it asks for
// the person's password (a test holds it to install.sh's).
export const PIECE_DETAIL = Object.freeze({ password: "needs your password" });

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
 * A piece's name; one install.sh names after this mod was made, by its id, as install.sh does.
 * @param {string} piece
 */
export const pieceName = (piece) =>
  Object.hasOwn(PIECE_NAME, piece) ? PIECE_NAME[piece] : piece;

/** @type {ReadonlySet<string>} */
const RESULTS = new Set(Object.values(PIECE_RESULT));

/**
 * @param {unknown} value
 * @returns {value is PieceSaid}
 */
const isPieceSaid = (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  /** @type {Record<string, unknown>} */
  const fields = Object.fromEntries(Object.entries(value));
  const { piece, result, detail } = fields;
  return (
    typeof piece === "string" &&
    piece !== "" &&
    typeof result === "string" &&
    RESULTS.has(result) &&
    typeof detail === "string"
  );
};

/**
 * The pieces in their shape, each copied with only its own fields; the rest dropped.
 * @param {unknown} value
 * @returns {PieceSaid[]}
 */
const piecesOf = (value) =>
  Array.isArray(value)
    ? value
        .filter(isPieceSaid)
        .map(({ detail, piece, result }) => ({ detail, piece, result }))
    : [];

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
  const { installed, latest, checked, applying, applied, error, step, pieces } =
    fields;
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
        pieces: piecesOf(pieces),
        step: typeof step === "string" && step !== "" ? step : null,
      }
    : null;
};

/**
 * A piece named with why it went as it did.
 * @typedef {object} PieceWhy
 * @property {string} name
 * @property {string} why
 */

/**
 * What the pieces of an apply went through, each list in install.sh's order; the pieces left as they were are not in it.
 * @typedef {object} PiecesSummary
 * @property {string[]} updated
 * @property {string[]} installed
 * @property {string[]} refreshed
 * @property {PieceWhy[]} missing
 * @property {PieceWhy[]} failed
 * @property {string[]} removed
 * @property {boolean} password whether a piece is missing only because installing it asks for the person's password
 */

/**
 * @param {PieceSaid[]} pieces
 * @returns {PiecesSummary}
 */
export const piecesSummary = (pieces) => {
  const by = Object.groupBy(pieces, ({ result }) => result);
  /** @param {PieceResult} result */
  const names = (result) =>
    (by[result] ?? []).map(({ piece }) => pieceName(piece));
  /** @param {PieceResult} result */
  const reasons = (result) =>
    (by[result] ?? []).map(({ detail, piece }) => ({
      name: pieceName(piece),
      why: detail,
    }));
  return {
    failed: reasons(PIECE_RESULT.failed),
    installed: names(PIECE_RESULT.installed),
    missing: reasons(PIECE_RESULT.missing),
    password: (by[PIECE_RESULT.missing] ?? []).some(
      ({ detail }) => detail === PIECE_DETAIL.password,
    ),
    refreshed: names(PIECE_RESULT.refreshed),
    removed: names(PIECE_RESULT.removed),
    updated: names(PIECE_RESULT.updated),
  };
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
