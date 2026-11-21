// Review rounds (design 06): a round of an agent's work as bin/forge-round.sh keeps it, its unified diff read into files,
// hunks and numbered lines, the human's comments put back on the lines they were made on (by the line's text, so a
// comment follows its line when code moves above it, and is outdated once its line is gone), the rows the round's view
// draws, and the feedback the agent gets: one prompt that quotes each comment's file, line and code.
// Pure: Node tests it (test/herdr-review.test.mjs).
import { PROGRAM_KIND, programKind } from "./sessions.js";

/** @typedef {import("herdr").PaneInfo} PaneInfo */

export const LINE_KIND = Object.freeze({ add: "add", ctx: "ctx", del: "del" });

/** @typedef {typeof LINE_KIND[keyof typeof LINE_KIND]} LineKind */

export const FILE_STATUS = Object.freeze({
  added: "A",
  deleted: "D",
  modified: "M",
  renamed: "R",
});

/** @typedef {typeof FILE_STATUS[keyof typeof FILE_STATUS]} FileStatus */

export const SIDE = Object.freeze({ new: "new", old: "old" });

/** @typedef {typeof SIDE[keyof typeof SIDE]} Side */

export const ROUND_STATUS = Object.freeze({
  approved: "approved",
  changes: "changes",
  open: "open",
});

/** @typedef {typeof ROUND_STATUS[keyof typeof ROUND_STATUS]} RoundStatus */

/**
 * @typedef {object} DiffLine
 * @property {LineKind} kind
 * @property {number | null} old its number on the old side, none for an added line
 * @property {number | null} new its number on the new side, none for a removed line
 * @property {string} text without its +, - or space
 */

/** @typedef {{ header: string, lines: DiffLine[] }} Hunk */

/**
 * @typedef {object} DiffFile
 * @property {string} path where it is now (where it was, for a deleted file)
 * @property {string} oldPath
 * @property {FileStatus} status
 * @property {number} adds
 * @property {number} dels
 * @property {Hunk[]} hunks
 * @property {boolean} binary
 */

/** @typedef {{ files: DiffFile[], cut: boolean }} ParsedDiff */

/**
 * A round, as bin/forge-round.sh keeps it.
 * @typedef {object} Round
 * @property {number} n
 * @property {string} base
 * @property {string} from
 * @property {string} head
 * @property {number} at
 * @property {RoundStatus} status
 * @property {string[]} viewed
 */

/**
 * @typedef {object} RoundComment
 * @property {string} id
 * @property {number} round the round it was made on
 * @property {string} path
 * @property {Side} side
 * @property {number} line
 * @property {string} text its line's text
 * @property {string} body
 * @property {boolean} resolved
 * @property {boolean} sent it went to the agent
 */

/**
 * A terminal's rounds, as bin/forge-round.sh show prints them.
 * @typedef {object} RoundsState
 * @property {string} terminal
 * @property {string} repo
 * @property {string} base
 * @property {Round[]} rounds
 * @property {RoundComment[]} comments
 */

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const CUT = "\\ forgerdr: cut at ";

/** A path on a ---/+++ or rename line, without its a/ or b/ and any quotes git put round it. @param {string} given */
const pathOf = (given) =>
  given
    .replace(/^"(.*)"$/, "$1")
    .replace(/^[ab]\//, "")
    .replace(/\t.*$/, "");

/** @returns {DiffFile} */
const newFile = () => ({
  adds: 0,
  binary: false,
  dels: 0,
  hunks: [],
  oldPath: "",
  path: "",
  status: FILE_STATUS.modified,
});

// What a line of a file's header says about it, by how the line starts.
/** @type {readonly [string, (file: DiffFile, rest: string) => DiffFile][]} */
const HEADER_LINES = Object.freeze([
  ["new file mode", (file) => ({ ...file, status: FILE_STATUS.added })],
  ["deleted file mode", (file) => ({ ...file, status: FILE_STATUS.deleted })],
  [
    "rename from ",
    (file, rest) => ({
      ...file,
      oldPath: pathOf(rest),
      status: FILE_STATUS.renamed,
    }),
  ],
  [
    "rename to ",
    (file, rest) => ({
      ...file,
      path: pathOf(rest),
      status: FILE_STATUS.renamed,
    }),
  ],
  ["Binary files ", (file) => ({ ...file, binary: true })],
  [
    "--- ",
    (file, rest) =>
      rest === "/dev/null" ? file : { ...file, oldPath: pathOf(rest) },
  ],
  [
    "+++ ",
    (file, rest) =>
      rest === "/dev/null" ? file : { ...file, path: pathOf(rest) },
  ],
]);

/** @param {DiffFile} file */
const settled = (file) => ({
  ...file,
  oldPath: file.oldPath || file.path,
  path: file.path || file.oldPath,
});

/**
 * A unified diff as git prints it (bin/forge-round.sh diff), read into its files; cut when the bridge cut it short.
 * @param {string} text
 * @returns {ParsedDiff}
 */
export const parseDiff = (text) => {
  /** @type {DiffFile[]} */
  const files = [];
  /** @type {DiffFile | null} */
  let file = null;
  /** @type {Hunk | null} */
  let hunk = null;
  let old = 0;
  let now = 0;
  let cut = false;
  const close = () => {
    if (file !== null) files.push(settled(file));
  };
  for (const line of text.split("\n")) {
    if (line.startsWith(CUT)) {
      cut = true;
    } else if (line.startsWith("diff --git ")) {
      close();
      const names = /^diff --git (?:"?a\/)(.*?)"? (?:"?b\/)(.*?)"?$/.exec(line);
      file = {
        ...newFile(),
        oldPath: names?.[1] ?? "",
        path: names?.[2] ?? "",
      };
      hunk = null;
    } else if (file !== null && HUNK.test(line)) {
      const [, from, to] = HUNK.exec(line) ?? [];
      old = Number(from);
      now = Number(to);
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
    } else if (file !== null && hunk === null) {
      const known = HEADER_LINES.find(([start]) => line.startsWith(start));
      if (known !== undefined)
        file = known[1](file, line.slice(known[0].length));
    } else if (file !== null && hunk !== null) {
      if (line.startsWith("+")) {
        hunk.lines.push({
          kind: LINE_KIND.add,
          new: now,
          old: null,
          text: line.slice(1),
        });
        now += 1;
        file.adds += 1;
      } else if (line.startsWith("-")) {
        hunk.lines.push({
          kind: LINE_KIND.del,
          new: null,
          old,
          text: line.slice(1),
        });
        old += 1;
        file.dels += 1;
      } else if (line.startsWith(" ")) {
        hunk.lines.push({
          kind: LINE_KIND.ctx,
          new: now,
          old,
          text: line.slice(1),
        });
        old += 1;
        now += 1;
      }
    }
  }
  close();
  return { cut, files };
};

/**
 * Where a comment sits: its file, its side and its line.
 * @param {string} path
 * @param {Side} side
 * @param {number} line
 */
export const placeKey = (path, side, line) => `${path}:${side}:${line}`;

/**
 * The number a diff line has on a side, or null when it is not on that side.
 * @param {DiffLine} line
 * @param {Side} side
 */
const numberOn = (line, side) => (side === SIDE.new ? line.new : line.old);

/**
 * @typedef {object} Anchored
 * @property {Map<string, RoundComment[]>} placed by placeKey, in the order they were made
 * @property {RoundComment[]} outdated on a line this diff removes
 * @property {RoundComment[]} elsewhere on a file or a line this diff does not show
 */

/**
 * The comments put on the lines of a diff: on the line of the same side with the same text, the nearest to where it
 * was made; outdated when the diff removes that line; elsewhere when the diff does not show its file or its line.
 * @param {DiffFile[]} files
 * @param {RoundComment[]} comments
 * @returns {Anchored}
 */
export const anchorComments = (files, comments) => {
  /** @type {Map<string, RoundComment[]>} */
  const placed = new Map();
  /** @type {RoundComment[]} */
  const outdated = [];
  /** @type {RoundComment[]} */
  const elsewhere = [];
  for (const comment of comments) {
    const file = files.find(
      (one) => one.path === comment.path || one.oldPath === comment.path,
    );
    if (file === undefined) {
      elsewhere.push(comment);
      continue;
    }
    const same = file.hunks
      .flatMap((hunk) => hunk.lines)
      .filter((line) => line.text === comment.text);
    const numbers = same
      .map((line) => numberOn(line, comment.side))
      .filter((number) => number !== null);
    if (numbers.length === 0) {
      // Gone only when this diff removes its line; a line it does not touch is still there, outside the diff.
      (same.some((line) => line.kind === LINE_KIND.del)
        ? outdated
        : elsewhere
      ).push(comment);
      continue;
    }
    const nearest = numbers.reduce((best, number) =>
      Math.abs(number - comment.line) < Math.abs(best - comment.line)
        ? number
        : best,
    );
    const key = placeKey(file.path, comment.side, nearest);
    placed.set(key, [...(placed.get(key) ?? []), comment]);
  }
  return { elsewhere, outdated, placed };
};

// Control characters (C0, DEL, C1), but the line break and the tab: typed into a terminal, they could leave the paste
// or act as keys.
const CONTROL = Object.freeze({
  c0: 0x20,
  c1: 0x9f,
  del: 0x7f,
  kept: new Set(["\n", "\t"]),
});

/** @param {string} char */
export const isControl = (char) => {
  const code = char.codePointAt(0) ?? 0;
  return (
    !CONTROL.kept.has(char) &&
    (code < CONTROL.c0 || (code >= CONTROL.del && code <= CONTROL.c1))
  );
};

/** @param {string} text */
const printable = (text) =>
  [...text].filter((char) => !isControl(char)).join("");

/**
 * Whether feedback may be typed into a terminal: an agent runs in front there and does not wait in a dialog, where a
 * paste and Enter would answer it; never a shell, which would run the prompt.
 * @param {Pick<PaneInfo, "program" | "status"> | undefined} pane
 */
export const sendableTo = (pane) =>
  pane !== undefined &&
  programKind(pane.program) === PROGRAM_KIND.agent &&
  pane.status !== "blocked";

/**
 * The prompt that sends comments back to the agent that made the round: each comment's file and line, the code it is
 * on and what the human says, numbered, for the agent to answer each.
 * @param {number} round
 * @param {RoundComment[]} comments
 */
export const feedbackOf = (round, comments) => {
  const one = comments.length === 1;
  const head = `Review of round ${round}: ${comments.length} ${one ? "comment" : "comments"} on your changes. ${
    one
      ? "Address it, then reply in a line."
      : "Address each one, then reply to each in a line."
  }`;
  const items = comments.map((comment, index) =>
    [
      `${index + 1}. ${printable(comment.path)}:${comment.line}${comment.side === SIDE.old ? " (a removed line)" : ""}`,
      `   > ${printable(comment.text).trim()}`,
      ...printable(comment.body)
        .trim()
        .split("\n")
        .map((line) => `   ${line}`),
    ].join("\n"),
  );
  return [head, ...items].join("\n\n");
};

/**
 * @typedef {object} RowsView
 * @property {Set<string>} collapsed the files folded, by path
 * @property {Map<string, RoundComment[]>} placed
 * @property {RoundComment[]} outdated
 * @property {{ path: string, side: Side, line: number } | null} composing the line a comment is being written on
 */

/**
 * @typedef {{ key: string, file: DiffFile } & (
 *   { kind: "file" } | { kind: "hunk", header: string } | { kind: "line", line: DiffLine }
 *   | { kind: "comments", side: Side, number: number, comments: RoundComment[] }
 *   | { kind: "compose", side: Side, number: number } | { kind: "outdated", comments: RoundComment[] })} DiffRow
 */

/**
 * The side and number a comment on a diff line takes: the new side unless the line was removed.
 * @param {DiffLine} line
 * @returns {{ side: Side, number: number }}
 */
export const lineSpot = (line) =>
  line.kind === LINE_KIND.del
    ? { number: line.old ?? 0, side: SIDE.old }
    : { number: line.new ?? 0, side: SIDE.new };

/**
 * The rows the round's view draws, one after the other: a header per file, then, unless the file is folded, its
 * outdated comments, and each hunk's header and lines, with the comments placed on a line, and the field to write one,
 * right under it.
 * @param {DiffFile[]} files
 * @param {RowsView} view
 * @returns {DiffRow[]}
 */
export const diffRows = (files, view) =>
  files.flatMap((file) => {
    /** @type {DiffRow[]} */
    const rows = [{ file, key: `file:${file.path}`, kind: "file" }];
    if (view.collapsed.has(file.path) || file.binary) return rows;
    const outdated = view.outdated.filter(
      (comment) => comment.path === file.path,
    );
    if (outdated.length > 0)
      rows.push({
        comments: outdated,
        file,
        key: `outdated:${file.path}`,
        kind: "outdated",
      });
    for (const hunk of file.hunks) {
      rows.push({
        file,
        header: hunk.header,
        key: `hunk:${file.path}:${hunk.header}`,
        kind: "hunk",
      });
      for (const line of hunk.lines) {
        rows.push({
          file,
          key: `line:${file.path}:${line.old ?? ""}:${line.new ?? ""}`,
          kind: "line",
          line,
        });
        const spots = [
          lineSpot(line),
          ...(line.kind === LINE_KIND.ctx
            ? [{ number: line.old ?? 0, side: SIDE.old }]
            : []),
        ];
        for (const { side, number } of spots) {
          const key = placeKey(file.path, side, number);
          const comments = view.placed.get(key);
          if (comments !== undefined)
            rows.push({
              comments,
              file,
              key: `comments:${key}`,
              kind: "comments",
              number,
              side,
            });
        }
        const spot = lineSpot(line);
        const { composing } = view;
        if (
          composing !== null &&
          composing.path === file.path &&
          composing.side === spot.side &&
          composing.line === spot.number
        )
          rows.push({
            file,
            key: `compose:${placeKey(file.path, spot.side, spot.number)}`,
            kind: "compose",
            number: spot.number,
            side: spot.side,
          });
      }
    }
    return rows;
  });
