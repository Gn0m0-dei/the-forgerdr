// The Changes panel: what the shown forge holds uncommitted, checkout by checkout (bin/forge-changes.sh), the comments
// the human writes on its lines, which stay until they are sent, the AI sessions of the forge they can go to, and the
// one prompt that takes them all there: each comment's file by its whole path, its line, its code and what the human
// says. Nothing reads meaning into a comment: it is the human's own words for the session that gets them.
// Pure: Node tests it (test/herdr-changes.test.mjs).
import { forgeTree, groupForges } from "./forges.js";
import { FORGE_LABEL, parentOf } from "./lanes.js";
import { anchorComments, diffRows, plain, printable, SIDE } from "./round.js";
import { paneLabel } from "./sessions.js";

/** @typedef {import("herdr").AgentInfo} AgentInfo */
/** @typedef {import("herdr").Status} Status */
/** @typedef {import("herdr").SpaceInfo} SpaceInfo */
/** @typedef {import("./forges.js").Folder} Folder */
/** @typedef {import("./forges.js").PlaceGit} PlaceGit */
/** @typedef {import("./lanes.js").LaneTerminal} LaneTerminal */
/** @typedef {import("./round.js").Side} Side */

/**
 * A submodule that holds changes, as bin/forge-changes.sh tree lists it.
 * @typedef {{ name: string, top: string, files: number }} TreeSubmodule
 */

/**
 * A checkout of a repository: its main one or a worktree.
 * @typedef {object} TreeWorktree
 * @property {string} top its folder
 * @property {string} branch
 * @property {boolean} main
 * @property {number} files how many it changed, its submodules' apart
 * @property {TreeSubmodule[]} submodules
 */

/** @typedef {{ repo: string, name: string, worktrees: TreeWorktree[] }} TreeRepo */

/**
 * What a comment is made on: a line of a file of a checkout, and that line's text.
 * @typedef {object} CommentDraft
 * @property {string} forge the forge it was written in: it shows there, and goes to a session of it
 * @property {string} top the checkout's folder
 * @property {string} [sub] in a submodule, its path in its superproject: the end of `top`, which the repository names
 * @property {string} path the file's, in its checkout
 * @property {Side} side
 * @property {number} line
 * @property {string} text its line's text
 * @property {string} body what the human says
 */

/** @typedef {CommentDraft & { id: string }} ChangeComment */

const VERSION = 1;

/** @param {unknown} value @returns {value is ChangeComment} */
const isComment = (value) => {
  if (value === null || typeof value !== "object") return false;
  const { id, forge, top, sub, path, side, line, text, body } =
    /** @type {Record<string, unknown>} */ (value);
  return (
    (sub === undefined || typeof sub === "string") &&
    [id, forge, top, path, text, body].every(
      (field) => typeof field === "string",
    ) &&
    (side === SIDE.new || side === SIDE.old) &&
    typeof line === "number"
  );
};

/**
 * The comments kept in their file; none when there is no file or it cannot be read as one.
 * @param {string | null} text
 * @returns {ChangeComment[]}
 */
export const parseComments = (text) => {
  if (text === null) return [];
  try {
    const kept = JSON.parse(text);
    return kept?.v === VERSION && Array.isArray(kept.comments)
      ? kept.comments.filter(isComment)
      : [];
  } catch {
    return [];
  }
};

/** @param {ChangeComment[]} comments */
export const serializeComments = (comments) =>
  JSON.stringify({ comments, v: VERSION });

/**
 * @param {ChangeComment[]} comments
 * @param {CommentDraft} draft
 * @param {string} id one no comment ever had: a comment sent is told by its id, and a reused one would go with it
 * @returns {ChangeComment[]}
 */
export const withComment = (comments, draft, id) => [
  ...comments,
  { ...draft, id },
];

/**
 * @param {ChangeComment[]} comments
 * @param {string} id
 * @param {string} body what it says now
 */
export const withBody = (comments, id, body) =>
  comments.map((comment) =>
    comment.id === id ? { ...comment, body } : comment,
  );

/**
 * The comments written in a forge.
 * @param {ChangeComment[]} comments
 * @param {string} forge its key
 */
export const commentsIn = (comments, forge) =>
  comments.filter((comment) => comment.forge === forge);

/**
 * @param {ChangeComment[]} comments
 * @param {string[]} ids the ones discarded, or sent
 */
export const withoutComments = (comments, ids) =>
  comments.filter((comment) => !ids.includes(comment.id));

/**
 * The comments left once some were sent: one sent as it stands is gone; one whose words changed while the others went
 * stays, to be sent again as it reads now.
 * @param {ChangeComment[]} comments
 * @param {ChangeComment[]} sent as they were sent
 */
export const withoutSent = (comments, sent) =>
  comments.filter(
    (comment) =>
      !sent.some((one) => one.id === comment.id && one.body === comment.body),
  );

// How much of a line or of a file's path a comment quotes: about what the panel shows of one. The session has the
// checkout to read the rest, as code; quoted here it would arrive as the human's own words, past what they saw.
const QUOTE_MAX = 200;

/** A line of code or a file's path as a comment quotes it: whole when it fits, else its start. @param {string} text */
const quoteOf = (text) => {
  const line = [...plain(text).trim()];
  return line.length <= QUOTE_MAX
    ? line.join("")
    : `${line.slice(0, QUOTE_MAX).join("").replace(/\s+/g, " ").trimEnd()} …`;
};

/**
 * A comment's file by its whole path, as its prompt names it: the checkout's folder, which is the user's, whole; what
 * the repository names of it (a submodule's path, the file's) as the panel shows it.
 * @param {Pick<ChangeComment, "top" | "sub" | "path">} comment
 */
const whereOf = ({ top, sub = "", path }) => {
  const within = sub !== "" && top.endsWith(`/${sub}`);
  const root = within ? top.slice(0, -sub.length - 1) : top;
  return [plain(root), ...(within ? [quoteOf(sub)] : []), quoteOf(path)].join(
    "/",
  );
};

/**
 * The prompt that takes every comment to a session at once, so one that depends on another arrives with it.
 * @param {ChangeComment[]} comments
 */
export const changesPrompt = (comments) => {
  const one = comments.length === 1;
  const head = `Review of the uncommitted changes: ${comments.length} ${
    one
      ? "comment from the human. Address it."
      : "comments from the human. Read them all before you start, since one may depend on another, then address each."
  } Where you disagree or need a decision, say so here.`;
  const items = comments.map((comment, index) =>
    [
      `${index + 1}. ${whereOf(comment)}:${comment.line}${comment.side === SIDE.old ? " (a removed line)" : ""}`,
      `   > ${quoteOf(comment.text)}`,
      ...printable(comment.body)
        .trim()
        .split("\n")
        .map((line) => `   ${line}`),
    ].join("\n"),
  );
  return [head, ...items].join("\n\n");
};

/**
 * A checkout the panel folds: a repository's main one, a worktree, or a submodule that holds changes.
 * @typedef {object} Checkout
 * @property {string} repo its repository's name
 * @property {string} top
 * @property {string} label its branch; a submodule's path
 * @property {number} files
 * @property {boolean} main
 * @property {boolean} submodule
 */

/**
 * @param {TreeRepo[]} tree
 * @returns {Checkout[]} repository by repository, each submodule right under its checkout
 */
export const checkoutsOf = (tree) =>
  tree.flatMap(({ name, worktrees }) =>
    worktrees.flatMap((worktree) => [
      {
        files: worktree.files,
        label: worktree.branch,
        main: worktree.main,
        repo: name,
        submodule: false,
        top: worktree.top,
      },
      ...worktree.submodules.map((submodule) => ({
        files: submodule.files,
        label: submodule.name,
        main: false,
        repo: name,
        submodule: true,
        top: submodule.top,
      })),
    ]),
  );

/**
 * The deepest of some checkouts that holds a folder, itself included; none when none does.
 * @param {string[]} tops the checkouts, by folder
 * @param {string} folder
 * @returns {string | null}
 */
export const deepestHolder = (tops, folder) =>
  tops
    .filter((top) => folder === top || folder.startsWith(`${top}/`))
    .toSorted((a, b) => b.length - a.length)
    .at(0) ?? null;

/**
 * The checkout that shows unfolded when the panel opens: the one the shown space works in, the deepest; none outside
 * every checkout.
 * @param {TreeRepo[]} tree
 * @param {string} folder where the shown space works
 * @returns {string | null}
 */
export const openAtFirst = (tree, folder) =>
  deepestHolder(
    checkoutsOf(tree).map(({ top }) => top),
    folder,
  );

/**
 * What the Changes button tells without the panel: the files the forge changed, and the comments not sent yet.
 * @typedef {{ files: number, comments: number }} ChangesSummary
 */

/**
 * @param {TreeRepo[]} tree
 * @param {ChangeComment[]} comments
 * @returns {ChangesSummary}
 */
export const summaryOf = (tree, comments) => ({
  comments: comments.length,
  files: checkoutsOf(tree).reduce((sum, { files }) => sum + files, 0),
});

/**
 * The comments on a checkout the forge no longer lists (a worktree removed since): kept, shown apart and sent with the
 * forge's others.
 * @param {TreeRepo[]} tree
 * @param {ChangeComment[]} comments the forge's
 */
export const strayComments = (tree, comments) => {
  const tops = new Set(checkoutsOf(tree).map(({ top }) => top));
  return comments.filter((comment) => !tops.has(comment.top));
};

export const SESSION_KIND = Object.freeze({
  review: "review",
  security: "security",
  session: "session",
  subagent: "subagent",
});

/** @typedef {typeof SESSION_KIND[keyof typeof SESSION_KIND]} SessionKind */

/**
 * An AI session the comments can go to.
 * @typedef {object} SessionOption
 * @property {string} terminal
 * @property {string} title what it calls itself
 * @property {string} where its repository and branch; its space's name outside git
 * @property {Status} status
 * @property {SessionKind} kind
 * @property {boolean} sendable not while it waits on the human: what is typed there would answer its question
 */

// The view a parked session answers to, as its label says (lanes.js FORGE_LABEL.review).
const SECURITY_VIEW = "security";

/** @param {LaneTerminal | undefined} terminal @returns {SessionKind} */
const kindOf = (terminal) => {
  const view = terminal?.labels?.[FORGE_LABEL.review] ?? "";
  if (view === SECURITY_VIEW) return SESSION_KIND.security;
  if (view !== "") return SESSION_KIND.review;
  return terminal !== undefined && parentOf(terminal) !== null
    ? SESSION_KIND.subagent
    : SESSION_KIND.session;
};

/** @param {string} path the last name of a folder's path */
export const baseName = (path) => path.slice(path.lastIndexOf("/") + 1);

/**
 * The AI sessions open in a forge, in the app's order.
 * @param {Pick<AgentInfo, "address" | "program" | "space" | "space_name" | "status" | "title">[]} agents herdr's, the
 *   parked review and security sessions among them (readAgents)
 * @param {LaneTerminal[]} terminals
 * @param {string[]} spaces the forge's, by id
 * @param {Record<string, Pick<PlaceGit, "top" | "branch"> | null>} places what git says of each space, by id
 * @returns {SessionOption[]}
 */
export const sessionOptions = (agents, terminals, spaces, places) =>
  agents
    .filter((agent) => spaces.includes(agent.space))
    .map((agent) => {
      const place = places[agent.space] ?? null;
      return {
        kind: kindOf(terminals.find((one) => one.address === agent.address)),
        sendable: agent.status !== "blocked",
        status: agent.status,
        terminal: agent.address,
        title: paneLabel({
          program: agent.program,
          terminal: agent.address,
          title: agent.title,
        }),
        where:
          place === null
            ? agent.space_name
            : `${baseName(place.top)} · ${place.branch}`,
      };
    });

/** Lower case, without accents. @param {string} text */
const folded = (text) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Whether a text holds every word of a search, accents and case aside; an empty search is held by any.
 * @param {string} text
 * @param {string} query
 */
export const holdsWords = (text, query) => {
  const told = folded(text);
  return folded(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => told.includes(word));
};

/**
 * The sessions a search keeps: the ones that hold every word of it, in their title, their place or their kind.
 * @param {SessionOption[]} options
 * @param {string} query
 */
export const matchSessions = (options, query) =>
  options.filter((option) =>
    holdsWords(`${option.title} ${option.where} ${option.kind}`, query),
  );

/**
 * The forge the panel shows: the shown space's.
 * @typedef {object} ShownForge
 * @property {string} key
 * @property {boolean} local on this machine: forgerdr's scripts read no other
 * @property {string[]} repos its repositories, by their main checkout's folder; none on another machine
 * @property {string} shown the shown space's id
 * @property {string[]} spaces its spaces, by id
 */

/**
 * @param {SpaceInfo[]} spaces
 * @param {Record<string, PlaceGit | null>} git by space id
 * @param {Record<string, Folder>} folders by space id
 * @returns {ShownForge | null} null with no space shown
 */
export const shownForge = (spaces, git, folders) => {
  const shown = spaces.find((space) => space.active);
  const forge =
    shown === undefined
      ? undefined
      : groupForges(spaces, git, folders).find((one) =>
          one.spaces.includes(shown),
        );
  if (shown === undefined || forge === undefined) return null;
  const local = shown.machine === null;
  return {
    key: forge.key,
    local,
    repos: local
      ? forgeTree(forge, git, folders).repos.map((repo) => repo.path)
      : [],
    shown: shown.id,
    spaces: forge.spaces.map((space) => space.id),
  };
};

/** @typedef {import("./round.js").DiffFile} DiffFile */
/** @typedef {import("./round.js").DiffLine} DiffLine */
/** @typedef {import("./round.js").ParsedDiff} ParsedDiff */

// The rows' heights in pixels: the list draws only the rows on screen, so it is told every row's height.
export const ROW_HEIGHT = Object.freeze({
  checkout: 28,
  // A comment: its head and its padding, then each line of its words.
  comment: 50,
  commentLine: 18,
  file: 40,
  hunk: 22,
  line: 20,
  note: 26,
  repo: 30,
  // The field a comment is written in, under its line: a few lines of words, and what frames them.
  writing: 116,
});

/**
 * A row of the panel's one list.
 * @typedef {{ key: string, height: number } & (
 *   { kind: "repo", name: string, files: number, open: boolean }
 *   | { kind: "checkout", checkout: Checkout, comments: number, open: boolean }
 *   | { kind: "note", words: string, failed: boolean }
 *   | { kind: "file", top: string, file: DiffFile, comments: number, open: boolean }
 *   | { kind: "hunk", header: string }
 *   | { kind: "line", top: string, path: string, line: DiffLine }
 *   | { kind: "comment", comment: ChangeComment, outdated: boolean, away: boolean }
 *   | { kind: "writing", id: string | null })} PanelRow
 */

/**
 * What the panel shows, as the human left it.
 * @typedef {object} PanelView
 * @property {TreeRepo[]} tree
 * @property {Set<string>} shutRepos the repositories folded, by name
 * @property {Set<string>} openTops the checkouts unfolded, by folder
 * @property {Map<string, { diff: ParsedDiff | null, error: string }>} loaded the diffs read, by checkout folder
 * @property {Map<string, boolean>} folds the files folded (true), by fileKey; a file not there is open
 * @property {ChangeComment[]} comments
 * @property {Omit<CommentDraft, "body"> | null} composing the line a new comment is being written on
 * @property {string | null} editing the comment whose words are being changed, by id: the field takes its place
 * @property {number} columns how many characters of a comment fit on a line
 */

/** @param {string} top a checkout's folder @param {string} path a file's, in it */
export const fileKey = (top, path) => `${top}\n${path}`;

/**
 * A comment's row; the field its words are changed in, while they are.
 * @param {ChangeComment} comment
 * @param {Pick<PanelView, "columns" | "editing">} view
 * @param {{ outdated?: boolean, away?: boolean }} [how] away from its line: its file is told with it
 * @returns {PanelRow}
 */
const commentRow = (
  comment,
  { columns, editing },
  { outdated = false, away = false } = {},
) =>
  comment.id === editing
    ? {
        height: ROW_HEIGHT.writing,
        id: comment.id,
        key: `writing:${comment.id}`,
        kind: "writing",
      }
    : {
        away,
        comment,
        height:
          ROW_HEIGHT.comment +
          ROW_HEIGHT.commentLine *
            comment.body
              .split("\n")
              .reduce(
                (lines, line) =>
                  lines +
                  Math.max(1, Math.ceil(line.length / Math.max(1, columns))),
                0,
              ),
        key: `comment:${comment.id}`,
        kind: "comment",
        outdated,
      };

/** @param {string} key @param {string} words @param {boolean} [failed] @returns {PanelRow} */
const noteRow = (key, words, failed = false) => ({
  failed,
  height: ROW_HEIGHT.note,
  key: `note:${key}`,
  kind: "note",
  words,
});

/**
 * An unfolded checkout's rows: its diff, file by file, with the comments under their lines; the ones whose line the
 * diff no longer shows first.
 * @param {Checkout} checkout
 * @param {PanelView} view
 * @returns {PanelRow[]}
 */
const checkoutRows = ({ top }, view) => {
  const read = view.loaded.get(top);
  if (read === undefined) return [noteRow(top, "reading its changes…")];
  if (read.diff === null) return [noteRow(top, read.error, true)];
  const { files, cut, missing } = read.diff;
  const mine = view.comments.filter((comment) => comment.top === top);
  const anchored = anchorComments(files, mine);
  const rows = diffRows(files, {
    collapsed: new Set(
      files
        .map((file) => file.path)
        .filter((path) => view.folds.get(fileKey(top, path)) === true),
    ),
    composing: view.composing?.top === top ? view.composing : null,
    outdated: anchored.outdated,
    placed: anchored.placed,
  });
  return [
    ...anchored.elsewhere.map((comment) =>
      commentRow(comment, view, { away: true, outdated: true }),
    ),
    ...missing.map((path) =>
      noteRow(
        `missing:${top}:${path}`,
        `Not shown, it could not be read: ${path}`,
        true,
      ),
    ),
    ...(rows.length === 0 && missing.length === 0
      ? [noteRow(top, "Nothing uncommitted here.")]
      : []),
    ...rows.flatMap(
      /** @returns {PanelRow[]} */ (row) => {
        const key = `${row.kind}:${top}:${row.key}`;
        if (row.kind === "file")
          return [
            {
              comments: mine.filter((comment) => comment.path === row.file.path)
                .length,
              file: row.file,
              height: ROW_HEIGHT.file,
              key,
              kind: "file",
              open: view.folds.get(fileKey(top, row.file.path)) !== true,
              top,
            },
          ];
        if (row.kind === "hunk")
          return [
            { header: row.header, height: ROW_HEIGHT.hunk, key, kind: "hunk" },
          ];
        if (row.kind === "line")
          return [
            {
              height: ROW_HEIGHT.line,
              key,
              kind: "line",
              line: row.line,
              path: row.file.path,
              top,
            },
          ];
        if (row.kind === "compose")
          return [
            { height: ROW_HEIGHT.writing, id: null, key, kind: "writing" },
          ];
        return row.comments.map((comment) =>
          commentRow(comment, view, { outdated: row.kind === "outdated" }),
        );
      },
    ),
    ...(cut
      ? [noteRow(`cut:${top}`, "The diff is too long: it is cut short.", true)]
      : []),
  ];
};

/**
 * The panel as one flat list, each row with its key and its height: the comments on checkouts the forge no longer
 * lists, then every repository, its checkouts while it is unfolded, and each unfolded checkout's diff.
 * @param {PanelView} view
 * @returns {PanelRow[]}
 */
export const panelRows = (view) => {
  const stray = strayComments(view.tree, view.comments);
  return [
    ...(stray.length === 0
      ? []
      : [
          noteRow("stray", "ON A CHECKOUT THIS FORGE NO LONGER LISTS"),
          ...stray.map((comment) =>
            commentRow(comment, view, { away: true, outdated: true }),
          ),
        ]),
    ...view.tree.flatMap(
      /** @returns {PanelRow[]} */ (repo) => {
        const checkouts = checkoutsOf([repo]);
        const open = !view.shutRepos.has(repo.name);
        return [
          {
            files: checkouts.reduce((sum, { files }) => sum + files, 0),
            height: ROW_HEIGHT.repo,
            key: `repo:${repo.repo}`,
            kind: "repo",
            name: repo.name,
            open,
          },
          ...(open
            ? checkouts.flatMap(
                /** @returns {PanelRow[]} */ (checkout) => [
                  {
                    checkout,
                    comments: view.comments.filter(
                      (comment) => comment.top === checkout.top,
                    ).length,
                    height: ROW_HEIGHT.checkout,
                    key: `checkout:${checkout.top}`,
                    kind: "checkout",
                    open: view.openTops.has(checkout.top),
                  },
                  ...(view.openTops.has(checkout.top)
                    ? checkoutRows(checkout, view)
                    : []),
                ],
              )
            : []),
        ];
      },
    ),
  ];
};

// What a row offers at its right end, in pixels: a comment's ✕, in its head; a checkout's two tools, − last, after a
// little room; the buttons of the field a comment is written in (the ✕ that leaves it, Discard, Save), in its head.
// A row of the list takes one click, so what was pressed is told by where the press landed.
export const ZONE = Object.freeze({
  cancel: 32,
  commentClose: 44,
  commentHead: 32,
  discard: 84,
  editorHead: 46,
  editorPad: 8,
  fold: 24,
  foldPad: 4,
  save: 64,
});

export const ROW_PART = Object.freeze({
  body: "body",
  close: "close",
  discard: "discard",
  fold: "fold",
  save: "save",
  unfold: "unfold",
});

/** @typedef {typeof ROW_PART[keyof typeof ROW_PART]} RowPart */

/**
 * The part of a row a press landed on.
 * @param {PanelRow} row
 * @param {number} fromEnd how far from the row's right end
 * @param {number} down how far from the row's top
 * @returns {RowPart}
 */
export const rowPart = (row, fromEnd, down) => {
  if (row.kind === "comment")
    return fromEnd >= 0 &&
      fromEnd < ZONE.commentClose &&
      down < ZONE.commentHead
      ? ROW_PART.close
      : ROW_PART.body;
  if (row.kind === "checkout") {
    const along = fromEnd - ZONE.foldPad;
    if (!row.open || along < 0 || along >= 2 * ZONE.fold) return ROW_PART.body;
    return along < ZONE.fold ? ROW_PART.fold : ROW_PART.unfold;
  }
  if (row.kind === "writing") {
    const along = fromEnd - ZONE.editorPad;
    const kept = row.id === null ? 0 : ZONE.discard;
    if (along < 0 || down >= ZONE.editorHead) return ROW_PART.body;
    if (along < ZONE.cancel) return ROW_PART.close;
    if (along < ZONE.cancel + kept) return ROW_PART.discard;
    return along < ZONE.cancel + kept + ZONE.save
      ? ROW_PART.save
      : ROW_PART.body;
  }
  return ROW_PART.body;
};

/**
 * The rows laid out: each one's height and how far down it starts, the heads each sits under (its repository's, its
 * checkout's and its file's, by index; -1 for none; a head sits under itself), and each row by its key.
 * @typedef {object} RowsLayout
 * @property {number[]} heights
 * @property {number[]} tops
 * @property {{ repo: number, checkout: number, file: number }[]} under
 * @property {Map<string, PanelRow>} byKey
 */

/**
 * @param {PanelRow[]} rows
 * @returns {RowsLayout}
 */
export const layoutRows = (rows) => {
  const heights = rows.map((row) => row.height);
  let top = 0;
  let under = { checkout: -1, file: -1, repo: -1 };
  return {
    byKey: new Map(rows.map((row) => [row.key, row])),
    heights,
    tops: heights.map((height) => {
      top += height;
      return top - height;
    }),
    under: rows.map((row, index) => {
      if (row.kind === "repo") under = { checkout: -1, file: -1, repo: index };
      else if (row.kind === "checkout")
        under = { ...under, checkout: index, file: -1 };
      else if (row.kind === "file") under = { ...under, file: index };
      return under;
    }),
  };
};

/**
 * The row a point down the list falls in, by index; the last one past the end, -1 in an empty list.
 * @param {number[]} tops
 * @param {number} down
 */
export const rowAt = (tops, down) => {
  const after = tops.findIndex((top) => top > down);
  return (after === -1 ? tops.length : after) - 1;
};

/**
 * The heads pinned over the list's top while it is scrolled: the repository, the checkout and the file of what shows
 * there, by row index, each one that of the row at the foot of its place, so a head takes its place as it scrolls into
 * it. None with the list at its top; no checkout or file where the rows there have none.
 * @param {RowsLayout} layout
 * @param {PanelRow[]} rows
 * @param {number} from how far the list is scrolled
 * @returns {number[]}
 */
export const pinnedHeads = ({ tops, under }, rows, from) => {
  if (from <= 0) return [];
  const foot = (/** @type {number} */ down) =>
    under[rowAt(tops, from + down - 1)];
  const repo = foot(ROW_HEIGHT.repo)?.repo ?? -1;
  if (rows[repo]?.kind !== "repo") return [];
  const second = foot(ROW_HEIGHT.repo + ROW_HEIGHT.checkout);
  if (second?.repo !== repo || rows[second.checkout]?.kind !== "checkout")
    return [repo];
  const third = foot(ROW_HEIGHT.repo + ROW_HEIGHT.checkout + ROW_HEIGHT.file);
  return third?.checkout !== second.checkout ||
    rows[third.file]?.kind !== "file"
    ? [repo, second.checkout]
    : [repo, second.checkout, third.file];
};
