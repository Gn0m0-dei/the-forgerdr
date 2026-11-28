// The IDE panel: one ttt per checkout (bin/forge-ide.sh), shown by the layout block ide-term, whose content the mod
// swaps for the ttt of the checkout picked; the checkouts it offers, the search over them, what its ttt's state and the
// script's answers say, the notice of the language servers a checkout lacks, when removing a worktree must ask first and
// what follows the answer. Pure: Node tests it (test/herdr-ide.test.mjs).
import { baseName, checkoutsOf, deepestHolder, holdsWords } from "./changes.js";

/** @typedef {import("./bridges/layout.js").LayoutNode} LayoutNode */
/** @typedef {import("./changes.js").TreeRepo} TreeRepo */
/** @typedef {import("./lanes.js").LaneTerminal} LaneTerminal */

// The IDE's nodes in herdr/layouts/forgerdr.json that the mod acts on: its header (ide-head), over ide-view, a stack of
// the ttt (ide-term) and the rendered markdown.
export const IDE_NODE = Object.freeze({
  head: "ide-head",
  markdown: "ide-markdown",
  term: "ide-term",
  view: "ide-view",
});

// The words the panel shows in more than one place: its name (the session bar's switch, its header, its placeholder's
// caption), what it says when the forge has no checkout, and its switch to the rendered markdown.
export const IDE_LABEL = Object.freeze({
  none: "No checkout to open",
  panel: "IDE",
  rendered: "Rendered",
});

// The role ide-term shows while no ttt runs for the checkout.
const PLACEHOLDER_ROLE = "ide-empty";

/** @typedef {{ terminal: string }} TerminalContent */
/** @typedef {{ role: string }} RoleProps */
/** @typedef {{ mod: string, props: RoleProps }} ModContent */
/** @typedef {TerminalContent | ModContent} IdeTermContent */

/** @param {LayoutNode} node @param {string} id whether the node is the one of that id, or holds it */
const holds = (node, id) =>
  node.id === id || (node.children ?? []).some((child) => holds(child, id));

/**
 * @param {LayoutNode} node
 * @param {IdeTermContent} content
 * @returns {LayoutNode}
 */
const withTerm = (node, content) => {
  if (node.id === IDE_NODE.term) return { ...node, content };
  // The app drops a block from the layout file once the terminal it shows ends: ide-term comes back as the first child.
  if (node.id === IDE_NODE.view && !holds(node, IDE_NODE.term))
    return {
      ...node,
      children: [
        { content, id: IDE_NODE.term, type: "block" },
        ...(node.children ?? []),
      ],
    };
  return holds(node, IDE_NODE.term) || holds(node, IDE_NODE.view)
    ? {
        ...node,
        children: node.children.map((child) => withTerm(child, content)),
      }
    : node;
};

/**
 * The layout with ide-term showing a content of its own, as a new tree: the layout given is left as it was. ide-term
 * the app dropped, once the ttt it showed ended, is put back in ide-view.
 * @param {LayoutNode} layout the layout file's, not layout()'s, which carries the clicks
 * @param {IdeTermContent} content
 * @returns {LayoutNode | null} null when it has neither ide-term nor ide-view
 */
export const withIdeTerm = (layout, content) =>
  holds(layout, IDE_NODE.term) || holds(layout, IDE_NODE.view)
    ? withTerm(layout, content)
    : null;

/**
 * ide-term showing a ttt, by its terminal's address: the app draws a block named by the terminal's name too, but its
 * terminal menu and its right-click routing look the block's terminal up by address, so a block named otherwise gets
 * an empty menu and never hands a right click to ttt.
 * @param {string} address its terminal's (t7)
 * @returns {TerminalContent}
 */
export const terminalContent = (address) => ({ terminal: address });

/**
 * ide-term while no ttt runs.
 * @param {string} mod this copy's name: forgerdr, or forgerdr-dev
 * @returns {ModContent}
 */
export const placeholderContent = (mod) => ({
  mod,
  props: { role: PLACEHOLDER_ROLE },
});

/**
 * Whether a block's content is a block of a mod: ide-head's being one of this copy's tells that the layout on show, or a
 * layout file, is this copy's.
 * @param {unknown} content
 * @param {string} mod this copy's name
 */
export const holdsMod = (content, mod) => fieldsOf(content)?.mod === mod;

/**
 * A value as JSON with every object's keys in order, so two values that hold the same read the same.
 * @param {unknown} value
 */
const canonical = (value) =>
  JSON.stringify(value, (_key, item) => {
    const fields = fieldsOf(item);
    return fields === null
      ? item
      : Object.fromEntries(
          Object.entries(fields).toSorted(([one], [other]) =>
            one < other ? -1 : Number(one > other),
          ),
        );
  });

/**
 * Whether what ide-term carries now, as layout() gives it, is the content wanted.
 * @param {unknown} shown
 * @param {IdeTermContent} wanted
 */
export const sameContent = (shown, wanted) =>
  shown !== undefined && canonical(shown) === canonical(wanted);

/**
 * A checkout the IDE can show, as its selector offers it.
 * @typedef {object} IdeCheckout
 * @property {string} top its folder
 * @property {string} repo its repository's name
 * @property {string} branch
 * @property {boolean} main
 * @property {string} label what the selector shows of it, and what its search reads
 */

// What bin/forge-changes.sh calls the branch of a checkout whose HEAD is detached.
const DETACHED = "(detached)";

/**
 * The checkouts the selector offers, in the sidebar's order: repository by repository, its main checkout first, then
 * its worktrees. A submodule is not one: it is edited from its superproject's checkout. A detached one is told by its
 * folder too, so two of them differ.
 * @param {TreeRepo[]} tree
 * @returns {IdeCheckout[]}
 */
export const ideCheckouts = (tree) =>
  checkoutsOf(tree)
    .filter(({ submodule }) => !submodule)
    .map(({ label, main, repo, top }) => ({
      branch: label,
      label: [repo, label, ...(label === DETACHED ? [baseName(top)] : [])].join(
        " · ",
      ),
      main,
      repo,
      top,
    }));

/**
 * The checkouts a search keeps: the ones that hold every word of it in what the selector shows of them.
 * @param {IdeCheckout[]} options
 * @param {string} query
 */
export const matchCheckouts = (options, query) =>
  options.filter((option) => holdsWords(option.label, query));

/**
 * The checkout a folder is in: the deepest that holds it, so a folder in a submodule is in its superproject's; none
 * outside every one, as the forge's parent folder is.
 * @param {IdeCheckout[]} options
 * @param {string} folder
 * @returns {string | null} its folder
 */
export const ideCheckoutAt = (options, folder) =>
  deepestHolder(
    options.map(({ top }) => top),
    folder,
  );

/**
 * The checkout the IDE shows: the one picked by hand while the forge still has it, else the shown space's, else the
 * forge's first.
 * @param {string | null} shown the shown space's checkout (ideCheckoutAt), by folder
 * @param {string | null} picked the one picked in this space, by folder
 * @param {IdeCheckout[]} options
 * @returns {string | null} null when the forge has none
 */
export const ideCheckoutOf = (shown, picked, options) =>
  [picked, shown].find((top) => options.some((option) => option.top === top)) ??
  options.at(0)?.top ??
  null;

const MARKDOWN = /\.(md|markdown)$/i;

/** @param {string | null} path the active file's; null with none */
export const isMarkdown = (path) => path !== null && MARKDOWN.test(path);

/**
 * The file the rendered view follows: the active one while it is markdown and the view shows; none otherwise.
 * @param {string | null} active the shown ttt's active file
 * @param {string | undefined} shown the child ide-view shows
 * @returns {string | null}
 */
export const ideMarkdownPath = (active, shown) =>
  active !== null && shown === IDE_NODE.markdown && isMarkdown(active)
    ? active
    : null;

/** @param {string} path a file's @returns {string} the folder it is in */
export const folderOf = (path) => path.slice(0, path.lastIndexOf("/")) || "/";

/**
 * Whether a batch of changes from the watch on a file's folder concerns the file: it names the file, or the folder whole
 * (the watch's way of saying that everything may have changed).
 * @param {string[]} changed the paths the watch gave
 * @param {string} file
 */
export const namesFile = (changed, file) =>
  changed.some((path) => path === file || path === folderOf(file));

/**
 * What a checkout's ttt says of itself (forgerdr.lua): its checkout, its active file, the files it holds unsaved and
 * the last order it answered.
 * @typedef {object} IdeState
 * @property {string} checkout
 * @property {string | null} active by its path; null with none
 * @property {string[]} unsaved by their paths
 * @property {string | null} order the id of the last order to save it answered; null before one
 */

/**
 * A JSON text's value; undefined when it is not JSON.
 * @param {string} text
 * @returns {unknown}
 */
const jsonOf = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * A JSON object's fields; null for anything else.
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
const fieldsOf = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

/** @param {unknown} value @returns {value is string} */
const filled = (value) => typeof value === "string" && value !== "";

/** @param {unknown} value @returns {value is string[]} */
const isStrings = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * The state as the ttt wrote it, with its own fields; null when it is not in its shape.
 * @param {string | null} text its file's; null when there is none
 * @returns {IdeState | null}
 */
export const parseIdeState = (text) => {
  const fields = text === null ? null : fieldsOf(jsonOf(text));
  if (fields === null) return null;
  const { active, checkout, order, unsaved } = fields;
  return filled(checkout) &&
    (active === null || typeof active === "string") &&
    isStrings(unsaved) &&
    (order === undefined || filled(order))
    ? {
        active: typeof active === "string" ? active : null,
        checkout,
        order: filled(order) ? order : null,
        unsaved: [...unsaved],
      }
    : null;
};

/**
 * Whether removing a worktree must first ask what becomes of the files the live ttt open on it holds: when it holds
 * some, and when its state cannot be read, since the removal stops it, and with --discard (the Remove worktree dialog
 * throwing git's changes away) loses them unseen.
 * @param {IdeOn | null} on the live ttt open on it (ideOn); null with none
 */
export const removalNeedsAsk = (on) =>
  on !== null && (on.unsaved === null || on.unsaved.length > 0);

/**
 * The file a ttt asks about once it was ordered to save: an order stops at a file it cannot save without the human (one
 * changed on disk, a read-only one), which stays listed and active; the first listed when the active one is not. Null
 * when it saved every file.
 * @param {IdeState} state what it wrote after the order
 * @returns {string | null}
 */
export const askedFile = ({ active, unsaved }) =>
  unsaved.find((path) => path === active) ?? unsaved.at(0) ?? null;

/**
 * A file as the IDE names it: by its path in its checkout; one outside it, as it is.
 * @param {string} top the checkout's folder
 * @param {string} path the file's
 */
export const inCheckout = (top, path) => {
  const within = top.endsWith("/") ? top : `${top}/`;
  return path.startsWith(within) ? path.slice(within.length) : path;
};

// Where an order to save stands: not answered yet, every file saved, or stopped at a file ttt asks about.
export const IDE_SAVE = Object.freeze({
  asking: "asking",
  pending: "pending",
  saved: "saved",
});

/** @typedef {typeof IDE_SAVE[keyof typeof IDE_SAVE]} SaveKind */

/**
 * The fields each answer carries, by its kind: the file ttt asks about, when it asks.
 * @typedef {object} SaveAnswerFields
 * @property {{ file: string }} asking
 * @property {Record<never, never>} pending
 * @property {Record<never, never>} saved
 */

/** @typedef {{ [K in SaveKind]: { kind: K } & SaveAnswerFields[K] }[SaveKind]} SaveAnswer */

/** @type {SaveAnswer} */
const PENDING = Object.freeze({ kind: IDE_SAVE.pending });

/**
 * Where an order to save stands, by the ttt's state: pending until the state carries the order's id; then saved when
 * nothing is listed, else stopped at the file ttt asks about.
 * @param {IdeState | null} state null when it does not read
 * @param {string} order the order's id (forge-ide.sh order)
 * @returns {SaveAnswer}
 */
export const saveAnswer = (state, order) => {
  if (state === null || state.order !== order) return PENDING;
  const file = askedFile(state);
  return file === null
    ? { kind: IDE_SAVE.saved }
    : { file, kind: IDE_SAVE.asking };
};

/**
 * The checkouts picked by hand with a space's own, as a new record; the picks of spaces gone are dropped.
 * @param {Record<string, string>} picks by space id
 * @param {string} space its id
 * @param {string} top the checkout's folder
 * @param {string[]} live the ids of the spaces there are
 * @returns {Record<string, string>}
 */
export const withPick = (picks, space, top, live) => ({
  ...Object.fromEntries(
    Object.entries(picks).filter(([id]) => live.includes(id)),
  ),
  [space]: top,
});

// What forge-ide.sh ensure says of a checkout's ttt: running (live), just started, or why it cannot run: no ttt on
// PATH, a version it cannot read, one too old, no forgerdr profile.
export const IDE_START = Object.freeze({
  live: "live",
  missing: "missing",
  noprofile: "noprofile",
  old: "old",
  started: "started",
  unreadable: "unreadable",
});

/** @typedef {typeof IDE_START[keyof typeof IDE_START]} IdeStart */

/**
 * @typedef {{ state: typeof IDE_START.live | typeof IDE_START.started, name: string }
 *   | { state: typeof IDE_START.old, version: string, minimum: string }
 *   | { state: typeof IDE_START.missing | typeof IDE_START.noprofile | typeof IDE_START.unreadable }} EnsureResult
 */

/** @type {Readonly<Record<IdeStart, (fields: Record<string, unknown>) => EnsureResult | null>>} */
const ENSURE_SHAPE = Object.freeze({
  live: ({ name }) => (filled(name) ? { name, state: IDE_START.live } : null),
  missing: () => ({ state: IDE_START.missing }),
  noprofile: () => ({ state: IDE_START.noprofile }),
  old: ({ minimum, version }) =>
    filled(version) && filled(minimum)
      ? { minimum, state: IDE_START.old, version }
      : null,
  started: ({ name }) =>
    filled(name) ? { name, state: IDE_START.started } : null,
  unreadable: () => ({ state: IDE_START.unreadable }),
});

/** @param {unknown} value @returns {value is IdeStart} */
const isIdeStart = (value) =>
  typeof value === "string" && Object.hasOwn(ENSURE_SHAPE, value);

/**
 * forge-ide.sh ensure's answer, with its own fields; null when it is not one.
 * @param {string} text
 * @returns {EnsureResult | null}
 */
export const parseEnsure = (text) => {
  const fields = fieldsOf(jsonOf(text));
  const state = fields?.state;
  return isIdeStart(state) ? ENSURE_SHAPE[state](fields) : null;
};

// What the panel offers when the ttt cannot run: to install it, to update it, to look at why its version cannot be
// read, to install forgerdr's profile of it.
export const IDE_NOTICE = Object.freeze({
  install: "install",
  profile: "profile",
  unreadable: "unreadable",
  update: "update",
});

/** @typedef {typeof IDE_NOTICE[keyof typeof IDE_NOTICE]} IdeNoticeKind */

/** @typedef {{ kind: IdeNoticeKind, text: string }} IdeNotice */

// What the panel says of every answer but old, whose words carry its versions; nothing while the ttt runs.
/** @type {Readonly<Record<Exclude<IdeStart, typeof IDE_START.old>, Readonly<IdeNotice> | null>>} */
const NOTICE = Object.freeze({
  live: null,
  missing: Object.freeze({
    kind: IDE_NOTICE.install,
    text: "ttt is not installed",
  }),
  noprofile: Object.freeze({
    kind: IDE_NOTICE.profile,
    text: "forgerdr's ttt profile is missing",
  }),
  started: null,
  unreadable: Object.freeze({
    kind: IDE_NOTICE.unreadable,
    text: "ttt's version cannot be read",
  }),
});

/**
 * What the panel says when the ttt cannot run; null when it runs.
 * @param {EnsureResult} result
 * @returns {Readonly<IdeNotice> | null}
 */
export const ensureNotice = (result) =>
  result.state === IDE_START.old
    ? {
        kind: IDE_NOTICE.update,
        text: `ttt ${result.version} is older than the ${result.minimum} forgerdr needs`,
      }
    : NOTICE[result.state];

// How a checkout's ttt is going, as the panel keeps it: its ensure on its way since it started, one that failed (the
// script could not run, or said nothing that reads), or ensure's answer and when it came.
export const IDE_STEP = Object.freeze({
  answered: "answered",
  ensuring: "ensuring",
  failed: "failed",
});

/**
 * @typedef {{ step: typeof IDE_STEP.ensuring, at: number }
 *   | { step: typeof IDE_STEP.failed, why: string }
 *   | { step: typeof IDE_STEP.answered, result: EnsureResult, at: number }} IdeRun
 */

// How long a ttt ensure answered for may take to show among the app's terminals before the panel counts it as ended; how
// long ensure may run, and forge-ide.sh's other commands, which is also how long a ttt has to answer an order to save;
// how long a stop may run, past the minute forge_end_terminal (bin/forge-lib.sh) waits for a ttt to end; and when an
// ensure still on its way was left by a copy gone, past that time and then some.
export const IDE_TIMING = Object.freeze({
  appear: 5_000,
  ensure: 20_000,
  script: 20_000,
  stop: 75_000,
  stuck: 40_000,
});

/** @param {IdeRun | undefined} run @param {number} now */
const ensuringNow = (run, now) =>
  run?.step === IDE_STEP.ensuring && now - run.at < IDE_TIMING.stuck;

/**
 * The runs a header that starts keeps: only the ensures another copy has on their way; it ensures the rest again.
 * @param {Record<string, IdeRun>} runs by checkout
 * @param {number} now
 * @returns {Record<string, IdeRun>}
 */
export const keptRuns = (runs, now) =>
  Object.fromEntries(
    Object.entries(runs).filter(([, run]) => ensuringNow(run, now)),
  );

/**
 * The runs with a checkout's own, as a new record: a failure never takes the place of a ttt another ensure found
 * running (two copies ensuring at once: the one whose start loses to the other's fails).
 * @param {Record<string, IdeRun>} runs by checkout
 * @param {string} checkout
 * @param {IdeRun} run
 * @returns {Record<string, IdeRun>}
 */
export const withRun = (runs, checkout, run) => {
  const before = runs[checkout];
  const running = before?.step === IDE_STEP.answered && "name" in before.result;
  return run.step === IDE_STEP.failed && running
    ? runs
    : { ...runs, [checkout]: run };
};

// What ide-term shows: the checkout's ttt, or the placeholder, which says ttt is opening, that the forge has no checkout,
// that the ttt ended, why it could not start or why it cannot run, or why the forge's checkouts could not be read.
export const IDE_SHOWS = Object.freeze({
  ended: "ended",
  failed: "failed",
  none: "none",
  notice: "notice",
  opening: "opening",
  terminal: "terminal",
  unread: "unread",
});

/**
 * @typedef {{ kind: typeof IDE_SHOWS.opening | typeof IDE_SHOWS.none | typeof IDE_SHOWS.ended }
 *   | { kind: typeof IDE_SHOWS.failed | typeof IDE_SHOWS.unread, why: string }
 *   | { kind: typeof IDE_SHOWS.notice, notice: Readonly<IdeNotice> }
 *   | { kind: typeof IDE_SHOWS.terminal, name: string }} IdeShows
 */

/**
 * What ide-term's show is made of.
 * @typedef {object} IdeMoment
 * @property {boolean} read whether the forge's checkouts are read
 * @property {string | null} failure why the last read of the forge's checkouts failed; null when it did not
 * @property {string | null} checkout the one the panel shows; null when the forge has none
 * @property {IdeRun | undefined} run its ttt's; undefined before its first ensure
 * @property {ReadonlySet<string>} live the names of the terminals live now
 * @property {number} now
 */

/** @type {IdeShows} */
const OPENING = Object.freeze({ kind: IDE_SHOWS.opening });

/**
 * What ide-term shows: the checkout's ttt while it is live; while it is not among the app's terminals yet, that it opens,
 * until it is late, which counts as ended, as when the person quits it.
 * @param {IdeMoment} moment
 * @returns {IdeShows}
 */
export const ideShows = ({ checkout, failure, live, now, read, run }) => {
  if (!read)
    return failure === null
      ? OPENING
      : { kind: IDE_SHOWS.unread, why: failure };
  if (checkout === null) return { kind: IDE_SHOWS.none };
  if (run === undefined || run.step === IDE_STEP.ensuring) return OPENING;
  if (run.step === IDE_STEP.failed)
    return { kind: IDE_SHOWS.failed, why: run.why };
  const { at, result } = run;
  if ("name" in result) {
    if (live.has(result.name))
      return { kind: IDE_SHOWS.terminal, name: result.name };
    return now - at < IDE_TIMING.appear ? OPENING : { kind: IDE_SHOWS.ended };
  }
  const notice = ensureNotice(result);
  return notice === null ? OPENING : { kind: IDE_SHOWS.notice, notice };
};

/**
 * What the placeholder in ide-term says, and the buttons it offers.
 * @typedef {object} IdePlaceholder
 * @property {string} title
 * @property {string} sub
 * @property {boolean} quiet a plain line while ttt opens, no card
 * @property {string | null} install the label of the button that opens forgerdr's installer in a tab; null with none
 * @property {string | null} again the label of the button that ensures the ttt again; null with none
 */

/** @type {Readonly<Record<IdeNoticeKind, string>>} the installer's button, by what it sets right */
const INSTALL_LABEL = Object.freeze({
  install: "Install ttt",
  profile: "Install the profile",
  unreadable: "Open the installer",
  update: "Update ttt",
});

/**
 * What ide-term shows, of one kind.
 * @template {IdeShows["kind"]} Kind
 * @typedef {IdeShows & { kind: Kind }} IdeShowsOf
 */

/** @type {Readonly<IdePlaceholder>} */
const QUIET_OPENING = Object.freeze({
  again: null,
  install: null,
  quiet: true,
  sub: "",
  title: "Opening ttt…",
});

// What the placeholder says, by the kind of show; the terminal's while ide-term has not taken it.
/** @type {{ readonly [Kind in IdeShows["kind"]]: (shows: IdeShowsOf<Kind>) => Readonly<IdePlaceholder> }} */
const PLACEHOLDER = Object.freeze({
  ended: () => ({
    again: "Open again",
    install: null,
    quiet: false,
    sub: "ttt was quit, or stopped.",
    title: "ttt has ended",
  }),
  failed: ({ why }) => ({
    again: "Open again",
    install: null,
    quiet: false,
    sub: why,
    title: "ttt could not be opened",
  }),
  none: () => ({
    again: null,
    install: null,
    quiet: false,
    sub: "The IDE opens ttt in a git checkout of a forge on this computer.",
    title: IDE_LABEL.none,
  }),
  notice: ({ notice }) => ({
    again: "Try again",
    install: INSTALL_LABEL[notice.kind],
    quiet: false,
    sub: "forgerdr's installer sets ttt up: run it in a tab, then try again.",
    title: notice.text,
  }),
  opening: () => QUIET_OPENING,
  terminal: () => QUIET_OPENING,
  unread: ({ why }) => ({
    again: "Try again",
    install: null,
    quiet: false,
    sub: why,
    title: "The forge's checkouts could not be read",
  }),
});

/**
 * @template {IdeShows["kind"]} Kind
 * @param {IdeShowsOf<Kind>} shows
 * @returns {Readonly<IdePlaceholder>}
 */
export const placeholderOf = (shows) => PLACEHOLDER[shows.kind](shows);

/**
 * What ide-term carries for what it shows: the ttt by its address, else the placeholder of the mod's copy, which also
 * stays while herdr-core does not list the ttt yet.
 * @param {IdeShows} shows
 * @param {string} mod this copy's name
 * @param {string | null} address the shown ttt's terminal address (liveAddressOf)
 * @returns {IdeTermContent}
 */
export const termContentOf = (shows, mod, address) =>
  shows.kind === IDE_SHOWS.terminal && address !== null
    ? terminalContent(address)
    : placeholderContent(mod);

// What herdr-core says of a terminal that runs.
const LIVE = "live";

/**
 * The names of the terminals live now, as herdr-core names them (a ttt's: forge-ide.sh name).
 * @param {LaneTerminal[]} terminals
 * @returns {Set<string>}
 */
export const liveTerminalNames = (terminals) =>
  new Set(
    terminals.flatMap(({ name, state }) =>
      state === LIVE && filled(name) ? [name] : [],
    ),
  );

/**
 * The address of the live terminal of that name (a ttt's: forge-ide.sh name); null when none is live by that name.
 * @param {LaneTerminal[]} terminals
 * @param {string} name
 * @returns {string | null}
 */
export const liveAddressOf = (terminals, name) =>
  terminals.find(
    (terminal) => terminal.state === LIVE && terminal.name === name,
  )?.address ?? null;

// The label forge-ide.sh gives a checkout's ttt, whose value is that checkout.
const IDE_LABEL_KEY = "forge.ide";

/**
 * A ttt of the IDE that runs: its terminal's name, and the checkout it is open on (physical, as forge-ide.sh takes it).
 * @typedef {{ checkout: string, name: string }} LiveIde
 */

/**
 * The IDE's ttts live now: the live terminals forge-ide.sh started, which it labels with their checkout.
 * @param {LaneTerminal[]} terminals
 * @returns {LiveIde[]}
 */
export const liveIdes = (terminals) =>
  terminals.flatMap(({ labels, name, state }) => {
    const checkout = labels?.[IDE_LABEL_KEY];
    return state === LIVE && filled(name) && filled(checkout)
      ? [{ checkout, name }]
      : [];
  });

/**
 * What every copy is told of the IDE's live ttts: the files each holds unsaved, by name, for the copies that ask before
 * a checkout is left or removed. Not their active file: only the shown ttt's matters, and the IDE panel's shared state
 * (publishIdePanel) carries it, with the rest of that ttt's state, for Rendered.
 * @param {Record<string, IdeState>} states by ttt name
 * @returns {Record<string, string[]>}
 */
export const unsavedByName = (states) =>
  Object.fromEntries(
    Object.entries(states).map(([name, { unsaved }]) => [name, unsaved]),
  );

/**
 * The live ttt open on a checkout: its name, and the files it holds unsaved as the IDE's header last read them (null
 * when its state did not read).
 * @typedef {{ name: string, unsaved: string[] | null }} IdeOn
 */

/**
 * The live ttt open on a checkout; null when none runs there.
 * @param {LiveIde[]} ides the live ones (liveIdes)
 * @param {Record<string, string[]>} unsaved by ttt name (unsavedByName)
 * @param {string} top the checkout's folder
 * @returns {IdeOn | null}
 */
export const ideOn = (ides, unsaved, top) => {
  const ide = ides.find(({ checkout }) => checkout === top);
  return ide === undefined
    ? null
    : {
        name: ide.name,
        unsaved: Object.hasOwn(unsaved, ide.name) ? unsaved[ide.name] : null,
      };
};

/**
 * What the header does on a look: ensure a checkout's ttt; write ide-term's content to the layout file; take ide-view
 * back from the rendered markdown to the ttt. Nothing to do is no checkout, no content and no select.
 * @typedef {object} IdePlan
 * @property {string | null} ensure the checkout whose ttt to ensure
 * @property {IdeTermContent | null} write what ide-term must carry, when the layout's carries another
 * @property {boolean} select whether to take ide-view back to the ttt
 */

/**
 * What a look of the header is made of.
 * @typedef {object} IdeLook
 * @property {boolean} showing the IDE is the side panel on show
 * @property {boolean} ours the layout on show is this copy's mod's (holdsMod on ide-head)
 * @property {string} mod this copy's name
 * @property {string | null} checkout the one the panel shows
 * @property {IdeRun | undefined} run its ttt's
 * @property {IdeShows} shows what ide-term shows (ideShows)
 * @property {string | null} address the shown ttt's terminal address (liveAddressOf), null while none is listed
 * @property {unknown} term what ide-term carries in the layout on show; undefined while the app has dropped it
 * @property {boolean} rendered ide-view shows the rendered markdown
 * @property {string | null} active the shown ttt's active file
 * @property {number} now
 */

/** @type {Readonly<IdePlan>} */
const NOTHING = Object.freeze({ ensure: null, select: false, write: null });

/**
 * What the header does on a look: nothing while the IDE is not on show in a layout of this copy's; else ensure the
 * checkout's ttt when it has no run, or one a copy gone left ensuring; write ide-term's content when the layout's is
 * another, or ide-term is gone; take ide-view back to the ttt when it shows no markdown file of a live ttt, once ide-term
 * is there.
 * @param {IdeLook} look
 * @returns {Readonly<IdePlan>}
 */
export const idePlan = ({
  active,
  address,
  checkout,
  mod,
  now,
  ours,
  rendered,
  run,
  showing,
  shows,
  term,
}) => {
  if (!showing || !ours) return NOTHING;
  const content = termContentOf(shows, mod, address);
  const ensure =
    run === undefined ||
    (run.step === IDE_STEP.ensuring && !ensuringNow(run, now));
  return {
    ensure: ensure ? checkout : null,
    select:
      term !== undefined &&
      rendered &&
      !(shows.kind === IDE_SHOWS.terminal && isMarkdown(active)),
    write: sameContent(term, content) ? null : content,
  };
};

/**
 * The entries of a JSON list in their shape; anything else, the list's malformed entries among it, dropped.
 * @template T
 * @param {string} text
 * @param {(fields: Record<string, unknown>) => T | null} shapeOf
 * @returns {T[]}
 */
const listOf = (text, shapeOf) => {
  const read = jsonOf(text);
  return Array.isArray(read)
    ? read.flatMap((entry) => {
        const fields = fieldsOf(entry);
        return (fields === null ? null : shapeOf(fields)) ?? [];
      })
    : [];
};

/**
 * A language server the checkout needs and PATH lacks, as forge-ide.sh servers lists it.
 * @typedef {object} LanguageServer
 * @property {string} language
 * @property {string} server its program
 * @property {string[]} install the argv that installs it
 * @property {string | null} needs the program the install runs when PATH lacks it too; null otherwise
 */

/**
 * @param {Record<string, unknown>} fields
 * @returns {LanguageServer | null}
 */
const serverOf = ({ install, language, needs, server }) =>
  filled(language) &&
  filled(server) &&
  isStrings(install) &&
  install.length > 0 &&
  (needs === null || filled(needs))
    ? {
        install: [...install],
        language,
        needs: filled(needs) ? needs : null,
        server,
      }
    : null;

/**
 * forge-ide.sh servers' list, each entry with its own fields; an entry not in its shape is dropped.
 * @param {string} text
 * @returns {LanguageServer[]}
 */
export const parseServers = (text) => listOf(text, serverOf);

// What the notice of the language servers a checkout lacks says: its title, its buttons, what it says in Check again's
// place while a look is on its way, what it says of a server whose install's own program is missing in its Install's
// place, and the word an install's tab is named with.
export const SERVERS_LABEL = Object.freeze({
  again: "Check again",
  checking: "Checking…",
  install: "Install",
  needs: "Needs",
  tab: "install",
  title: "Language servers missing",
});

// What the notice offers for a server: its install, run in a tab of its own, or only the words that name the program
// that install needs.
export const SERVER_OFFER = Object.freeze({
  install: "install",
  needs: "needs",
});

/** @typedef {{ argv: string[], folder: string, name: string }} InstallTab the app's tab.new for an install */

/** @typedef {{ language: string, server: string, label: string }} ServerLine what the notice says of every server */

/**
 * A server the notice offers to install, in the tab it opens.
 * @typedef {ServerLine & { offer: typeof SERVER_OFFER.install, tab: InstallTab }} InstallRow
 */

/**
 * A server whose install's own program is missing: its label names that program.
 * @typedef {ServerLine & { offer: typeof SERVER_OFFER.needs }} NeedsRow
 */

/** @typedef {InstallRow | NeedsRow} ServerRow a language server as the notice lists it */

/**
 * @param {LanguageServer} server
 * @param {string} home the folder its install's tab opens in
 * @returns {ServerRow}
 */
const serverRow = ({ install, language, needs, server }, home) =>
  needs === null
    ? {
        label: SERVERS_LABEL.install,
        language,
        offer: SERVER_OFFER.install,
        server,
        tab: {
          argv: install,
          folder: home,
          name: `${SERVERS_LABEL.tab} ${server}`,
        },
      }
    : {
        label: `${SERVERS_LABEL.needs} ${needs}`,
        language,
        offer: SERVER_OFFER.needs,
        server,
      };

/**
 * What the notice lists: the servers missing that were not hidden; none when every one was, or none is missing.
 * @param {LanguageServer[]} servers the ones the checkout lacks (forge-ide.sh servers)
 * @param {string[]} hidden the servers hidden in the checkout's notice, by program
 * @param {string} home the folder an install's tab opens in: the user's home, never the checkout, so an install lands
 *   where forge-ide.sh servers looks (in a checkout, rustup would add a component to the toolchain it pins)
 * @returns {ServerRow[]}
 */
export const serverRows = (servers, hidden, home) =>
  servers
    .filter(({ server }) => !hidden.includes(server))
    .map((server) => serverRow(server, home));

/**
 * The servers hidden in each forge's notices, by forge key, then by checkout.
 * @typedef {Record<string, Record<string, string[]>>} HiddenServers
 */

/**
 * What a ✕ hides: every server a checkout of a forge lacks now.
 * @typedef {object} Hiding
 * @property {string} forge its key
 * @property {string} checkout
 * @property {LanguageServer[]} servers the ones it lacks
 * @property {string[]} live the forge's checkouts, by folder
 */

/**
 * The servers hidden once the ✕ of a checkout's notice hid what it lists, as a new record: every server it lacks now,
 * so a server missing later shows again and one installed since is let go; the checkouts the forge no longer holds are
 * let go too, and the other forges' are left as they were, since only their own checkouts tell which are gone.
 * @param {HiddenServers} hidden
 * @param {Hiding} hiding
 * @returns {HiddenServers}
 */
export const withHidden = (hidden, { checkout, forge, live, servers }) => ({
  ...hidden,
  [forge]: withCheckout(
    hidden[forge] ?? {},
    checkout,
    servers.map(({ server }) => server),
    live,
  ),
});

/** @param {[string, unknown]} entry @returns {[string, string[]][]} the entry when it holds names; none otherwise */
const namesEntry = ([key, names]) => (isStrings(names) ? [[key, names]] : []);

/**
 * @param {[string, unknown]} entry
 * @returns {[string, Record<string, string[]>][]} a forge's, in its shape; none otherwise
 */
const forgeEntry = ([key, checkouts]) => {
  const fields = fieldsOf(checkouts);
  return fields === null
    ? []
    : [[key, Object.fromEntries(Object.entries(fields).flatMap(namesEntry))]];
};

/**
 * The servers hidden, as the header's storage holds them: the entries in their shape.
 * @param {unknown} value the stored JSON's
 * @returns {HiddenServers}
 */
export const hiddenServersOf = (value) =>
  Object.fromEntries(Object.entries(fieldsOf(value) ?? {}).flatMap(forgeEntry));

// How tall the header's block is: its row alone, and with the list of checkouts open under it; the gap under that row.
export const IDE_HEAD = Object.freeze({ closed: 60, gap: 6, open: 360 });

// The notice of language servers under the selector: its padding, the height of its title and of each server's line,
// the gap between them.
export const SERVERS_NOTICE = Object.freeze({ gap: 4, line: 22, pad: 6 });

/**
 * How tall the header is: as the list of checkouts open under it, else as its row and the notice it shows, when it
 * lists a server.
 * @param {boolean} picking the list is open
 * @param {number} rows the servers the notice lists
 */
export const ideHeadHeight = (picking, rows) => {
  const { gap, line, pad } = SERVERS_NOTICE;
  if (picking) return IDE_HEAD.open;
  return rows
    ? IDE_HEAD.closed + IDE_HEAD.gap + 2 * pad + line + rows * (gap + line)
    : IDE_HEAD.closed;
};

/**
 * What a look of the header sees of the IDE, for the language servers.
 * @typedef {object} ServersMoment
 * @property {string | null} checkout the one the IDE shows; null with none
 * @property {boolean} ours the layout on show is this copy's
 * @property {boolean} showing the IDE is the side panel on show
 */

/**
 * The checkout on show, and the one whose servers to look at.
 * @typedef {{ seen: string | null, look: string | null }} ServersLook
 */

/**
 * Whether to look at the language servers: when the checkout on show is another than at the last look, the IDE back on
 * show included; never while it does not show in this copy's layout.
 * @param {string | null} seen the checkout on show at the last look (this function's seen then); null when none was
 * @param {ServersMoment} moment
 * @returns {ServersLook} seen: the checkout on show now; look: the one to look at, null when none
 */
export const serversLook = (seen, { checkout, ours, showing }) => {
  const now = showing && ours ? checkout : null;
  return { look: now !== null && now !== seen ? now : null, seen: now };
};

/**
 * A record of lists by checkout with a checkout's own, as a new record: let go when its list is empty, and with it the
 * checkouts the forge no longer holds.
 * @template T
 * @param {Record<string, T[]>} byCheckout
 * @param {string} checkout
 * @param {T[]} list
 * @param {string[]} live the forge's checkouts, by folder
 * @returns {Record<string, T[]>}
 */
export const withCheckout = (byCheckout, checkout, list, live) => {
  const kept = Object.fromEntries(
    Object.entries(byCheckout).filter(([top]) => live.includes(top)),
  );
  const { [checkout]: _before, ...rest } = kept;
  return list.length ? { ...rest, [checkout]: list } : rest;
};

// The editors forge-ide.sh editors and open know, by id.
export const IDE_EDITOR = Object.freeze({ code: "code", zed: "zed" });

/** @typedef {typeof IDE_EDITOR[keyof typeof IDE_EDITOR]} EditorId */

/** @typedef {{ id: EditorId, name: string }} Editor */

/** @type {ReadonlySet<string>} */
const EDITOR_IDS = new Set(Object.values(IDE_EDITOR));

/** @param {unknown} value @returns {value is EditorId} */
const isEditorId = (value) =>
  typeof value === "string" && EDITOR_IDS.has(value);

/**
 * @param {Record<string, unknown>} fields
 * @returns {Editor | null}
 */
const editorOf = ({ id, name }) =>
  isEditorId(id) && filled(name) ? { id, name } : null;

/**
 * forge-ide.sh editors' list, each entry with its own fields; one of an id the mod does not know, or not in its shape,
 * is dropped.
 * @param {string} text
 * @returns {Editor[]}
 */
export const parseEditors = (text) => listOf(text, editorOf);

// What follows a Save or a Discard in the dialog that asks before a worktree is removed (roles/ide-leave.js): opening the
// Remove worktree dialog on a folder.
export const IDE_AFTER = Object.freeze({ remove: "remove" });

/** @typedef {typeof IDE_AFTER[keyof typeof IDE_AFTER]} IdeAfterKind */

/**
 * The fields each of what follows carries, by its kind: the folder whose worktree the Remove worktree dialog removes and
 * its forge's name.
 * @typedef {object} IdeAfterFields
 * @property {{ dir: string, forge: string }} remove
 */

/** @typedef {{ [K in IdeAfterKind]: { kind: K } & IdeAfterFields[K] }[IdeAfterKind]} IdeAfter */

/** @type {Readonly<Record<IdeAfterKind, (fields: Record<string, unknown>) => IdeAfter | null>>} */
const AFTER_SHAPE = Object.freeze({
  remove: ({ dir, forge }) =>
    filled(dir) && filled(forge)
      ? { dir, forge, kind: IDE_AFTER.remove }
      : null,
});

/**
 * What the after-actions act through: opening forgerdr's Remove worktree dialog.
 * @typedef {object} IdeAfterEffects
 * @property {(target: { dir: string, forge: string }) => unknown} openRemoval
 */

/**
 * What each of what follows does, by kind, through the effects given: open the Remove worktree dialog where it was asked
 * from.
 * @param {IdeAfterEffects} effects
 * @returns {{ readonly [K in IdeAfterKind]: (after: IdeAfterFields[K]) => void }}
 */
export const afterActions = ({ openRemoval }) =>
  Object.freeze({
    // Where it was asked from: switching to the worktree first would have the IDE open a ttt there just before it goes.
    remove: ({ dir, forge }) => {
      openRemoval({ dir, forge });
    },
  });

/** @param {unknown} value @returns {value is IdeAfterKind} */
const isAfterKind = (value) =>
  typeof value === "string" && Object.hasOwn(AFTER_SHAPE, value);

/**
 * What follows, as the dialog's props carry it, with its own fields; null when it is none of the set.
 * @param {unknown} value
 * @returns {IdeAfter | null}
 */
export const parseIdeAfter = (value) => {
  const fields = fieldsOf(value);
  const kind = fields?.kind;
  return isAfterKind(kind) ? AFTER_SHAPE[kind](fields) : null;
};
