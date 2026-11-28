// The Changes panel, in the place of the app's own: everything the shown forge holds uncommitted, at once, folding by
// repository, by checkout (the main one, each worktree, a submodule with changes) and by file, every file open, drawn as
// the review round's diff is (design 06). The pointer over a line shows a +; a click there opens a field to comment on
// it, as on a pull request. A comment is the human's own words and stays, through the panel shutting and the app
// restarting, until it is discarded with its ✕ or sent: Send comments types every one of the forge's, in one prompt,
// into the AI session picked from the forge's (a list to search), and only then are they gone. What comes of them is
// talked over in that session.
// The list is a virtual one: only the rows on screen are drawn, whatever the diff's length. Its rows take no handler
// of their own (gpui-kit refuses them there), so one click handler for the list tells the row by its key, and what
// was pressed in it (a comment's ✕, a checkout's tools, the buttons of the field a comment is written in, which is a
// row too) by where the press landed (changes.js rowPart).
// The session bar's copy reads the forge (bridges/changes.js), so this copy shows what it published and reads the diffs
// of the checkouts unfolded here.

// biome-ignore lint/style/useNodejsImportProtocol: the herdr runtime names its module "crypto", not "node:crypto"
import { randomUUID } from "crypto";
import {
  h_flex,
  Input,
  InputState,
  Scrollbar,
  Textarea,
  TextareaState,
  VirtualListScrollHandle,
  v_flex,
  v_virtual_list,
} from "gpui-base";
import { div } from "gpui-kit";
import { checking, panes, spaces } from "herdr";
import {
  changeComments,
  readChanges,
  readComments,
  readDiff,
} from "../bridges/changes.js";
import { readFolders, readSpacesGit } from "../bridges/git.js";
import {
  keepPanelMaximized,
  panelOnShow,
  panelWantsMaximized,
  zoomOf,
} from "../bridges/layout.js";
import { placeOf } from "../bridges/places.js";
import { sendToAgent } from "../bridges/rounds.js";
import { readAgents, readTerminals } from "../bridges/terminals.js";
import {
  changesPrompt,
  checkoutsOf,
  commentsIn,
  fileKey,
  layoutRows,
  matchSessions,
  openAtFirst,
  panelRows,
  pinnedHeads,
  ROW_HEIGHT,
  ROW_PART,
  rowAt,
  rowPart,
  sessionOptions,
  shownForge,
  summaryOf,
  withBody,
  withComment,
  withoutComments,
  withoutSent,
  ZONE,
} from "../changes.js";
import { counted } from "../format.js";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import {
  COMMENT_INDENT,
  checkoutHead,
  draftComment,
  foldMark,
  repoHead,
  sessionChoice,
  sessionRow,
} from "../kit/changes.js";
import { control } from "../kit/control.js";
import { emptyState } from "../kit/panels.js";
import { diffLine, fileHeader, hunkHead } from "../kit/review.js";
import { ICON, iconButton } from "../kit/sprites.js";
import { fill, text, wrapped } from "../kit/text.js";
import { tokens, withAlpha } from "../kit/tokens.js";
import { lineSpot, parseDiff, sendableTo } from "../round.js";
import { SIDE_PANEL } from "../sessions.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../changes.js").ChangeComment} ChangeComment */
/** @typedef {import("../changes.js").CommentDraft} CommentDraft */
/** @typedef {import("../changes.js").PanelRow} PanelRow */
/** @typedef {import("../changes.js").SessionOption} SessionOption */
/** @typedef {import("../changes.js").ShownForge} ShownForge */
/** @typedef {import("../round.js").ParsedDiff} ParsedDiff */
/** @typedef {import("./role.js").Role} Role */

const LIST = "changes-rows";
// The session picked last, kept for the next time the panel opens.
const SESSION_KEY = "changes.session";
// How often the panel looks at what the session bar's copy published.
const SYNC_EVERY = 500;
// What the panel measures a comment's lines by: how wide a character of its words is, and what its frame takes of the
// panel's width.
const COMMENT = Object.freeze({ char: 7.5, frame: 80, least: 20 });
// The panel's width before it is measured.
const WIDTH = 368;
const DIM = 0.45;
// How many lines the field a comment is written in shows.
const EDITOR_LINES = 4;
// How often the panel looks at how far the list was scrolled, to pin the heads of where it is.
const PIN_EVERY = 120;

/**
 * A checkout's diff as the panel holds it: read at a forge's read, or why it could not be.
 * @typedef {{ at: number, diff: ParsedDiff | null, error: string }} Loaded
 */

/**
 * A comment being written: the line it is on; its id when it is one already kept, whose words are being changed.
 * @typedef {{ on: Omit<CommentDraft, "body">, id: string | null }} Editing
 */

/** @returns {string} the session picked last, "" for none */
const storedSession = () => {
  try {
    return localStorage.getItem(SESSION_KEY) ?? "";
  } catch {
    return "";
  }
};

/** @param {string} terminal */
const storeSession = (terminal) => {
  try {
    localStorage.setItem(SESSION_KEY, terminal);
  } catch {
    // Storage is away: the panel remembers for this run only.
  }
};

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const changes = (cx) => {
  /** @type {string | null} the forge the folds below are for */
  let foldsFor = null;
  // The space whose checkout was last unfolded for being shown.
  let unfoldedFor = "";
  /** @type {Set<string>} the repositories folded, by name */
  let shutRepos = new Set();
  /** @type {Set<string>} the checkouts unfolded, by folder */
  let openTops = new Set();
  /** @type {Map<string, boolean>} the files folded (true), by fileKey */
  let folds = new Map();
  /** @type {Map<string, Loaded>} by checkout folder */
  const loaded = new Map();
  /** @type {Editing | null} */
  let editing = null;
  let picked = storedSession();
  let picking = false;
  // How many of the human's commands are at work.
  let working = 0;
  let notice = "";
  let failed = "";
  // Whether the comments are on their way to a session.
  let sending = false;
  let width = WIDTH;
  // Where the last press landed in the list, in layout px: what was pressed in a row is told by it.
  let pressed = { x: 0, y: 0 };
  const composer = TextareaState.new({
    placeholder: "Comment on this line…",
    rows: EDITOR_LINES,
  });
  const search = InputState.new({ placeholder: "Search the sessions…" });
  search.on("change", (_event, cx) => cx.notify());

  /** @returns {ShownForge | null} */
  const forgeNow = () => shownForge(spaces(), readSpacesGit(), readFolders());

  /** The forge's checkouts as the session bar's copy read them; none until it has read this forge. */
  const treeNow = () => {
    const forge = forgeNow();
    const read = readChanges();
    return forge !== null && read?.forge === forge.key ? read.tree : null;
  };

  // The rows drawn last, kept while nothing they are made of changed: a redraw for a hover costs no new list.
  // `changed` counts what changed here; the forge's read and the comments tell the rest.
  let changed = 0;
  /**
   * The list as drawn: its rows, laid out, and what they were made of.
   * @typedef {{ key: string, rows: PanelRow[] } & import("../changes.js").RowsLayout} Drawn
   */
  /** @type {Drawn | null} */
  let drawn = null;
  const scroll = VirtualListScrollHandle.new();
  /** @type {number[]} the heads pinned over the list's top, by row index (changes.js pinnedHeads) */
  let pins = [];

  /** Finds the heads to pin where the list is scrolled now; whether they changed. */
  const repin = () => {
    const next =
      drawn === null ? [] : pinnedHeads(drawn, drawn.rows, scroll.offset().y);
    const moved = next.join() !== pins.join();
    pins = next;
    return moved;
  };

  /**
   * Makes the list again when something it is made of changed; whether it did. Never from render: a long diff takes
   * longer to lay out in rows than the app gives a render, so every handler, timer and task that changes what the
   * list shows calls this, and render draws what is there.
   */
  const remake = () => {
    const forge = forgeNow();
    const comments =
      forge === null ? [] : commentsIn(readComments(), forge.key);
    const columns = Math.max(
      COMMENT.least,
      Math.floor((width - COMMENT.frame) / COMMENT.char),
    );
    const key = [
      changed,
      readChanges()?.at ?? 0,
      columns,
      ...comments.map((comment) => `${comment.id}:${comment.body}`),
    ].join("|");
    if (drawn?.key === key) return false;
    {
      const rows = panelRows({
        columns,
        comments,
        composing: editing?.id === null ? editing.on : null,
        editing: editing?.id ?? null,
        folds,
        loaded,
        openTops,
        shutRepos,
        tree: treeNow() ?? [],
      });
      drawn = { key, rows, ...layoutRows(rows) };
    }
    repin();
    return true;
  };

  // One loader: it reads the diffs of the checkouts unfolded whenever something nudges it, and never two at once. A
  // nudge that comes while it reads waits in `stale` for the next round.
  let stale = false;
  /** @type {(() => void) | null} */
  let wake = null;
  const nudge = () => {
    stale = true;
    wake?.();
  };
  // What the session bar's copy published last, as this copy saw it: a new read means the diffs are read again.
  let seen = 0;
  // Whether the panel was on show at the last look.
  let shown = false;
  const loading = checking()
    ? null
    : cx.spawn(async (task) => {
        for (;;) {
          stale = false;
          const at = readChanges()?.at ?? 0;
          const tops = checkoutsOf(treeNow() ?? []).map(({ top }) => top);
          for (const top of loaded.keys())
            if (!tops.includes(top)) loaded.delete(top);
          for (const top of tops) {
            // A panel out of sight reads nothing: the copy lives on behind the one that shows.
            if (
              panelOnShow() !== SIDE_PANEL.changes ||
              !openTops.has(top) ||
              loaded.get(top)?.at === at
            )
              continue;
            try {
              loaded.set(top, {
                at,
                diff: parseDiff(await readDiff(top)),
                error: "",
              });
            } catch (error) {
              loaded.set(top, { at, diff: null, error: String(error) });
              console.error(
                "forgerdr changes: a diff could not be read",
                error,
              );
            }
            changed += 1;
            remake();
            task.notify();
          }
          if (stale) continue;
          await new Promise((resolve) => {
            wake = () => resolve(undefined);
          });
          wake = null;
        }
      });
  const syncing = checking()
    ? null
    : cx.timer.every(SYNC_EVERY, (cx) => {
        const at = readChanges()?.at ?? 0;
        const forge = forgeNow();
        const tree = treeNow();
        const moved = forge !== null && tree !== null && forge.key !== foldsFor;
        if (forge !== null && tree !== null && moved) {
          // Another forge: everything folds again.
          foldsFor = forge.key;
          unfoldedFor = "";
          openTops = new Set();
          shutRepos = new Set();
          folds = new Map();
          editing = null;
        }
        // The checkout the shown space works in unfolds when that space is shown; what the human unfolded stays.
        const stepped =
          forge !== null && tree !== null && forge.shown !== unfoldedFor;
        if (forge !== null && tree !== null && stepped) {
          unfoldedFor = forge.shown;
          const shown = spaces().find((space) => space.id === forge.shown);
          const first = openAtFirst(
            tree,
            shown === undefined ? "" : placeOf(shown),
          );
          if (first !== null) openTops = new Set([...openTops, first]);
        }
        if (at !== seen || moved || stepped) {
          seen = at;
          changed += 1;
          nudge();
        }
        // Back on show: what changed meanwhile is read now.
        const showing = panelOnShow() === SIDE_PANEL.changes;
        if (showing && !shown) nudge();
        shown = showing;
        // The comments and the forge's read come from other copies: the list follows them here.
        if (remake()) cx.notify();
      });

  // The pinned heads follow the scroll: nothing tells when the list moved, so this looks, and redraws only when the
  // heads to pin are others.
  const pinning = checking()
    ? null
    : cx.timer.every(PIN_EVERY, (cx) => {
        if (repin()) cx.notify();
      });

  /** Redraws after something the list is made of changed here. @param {Context} cx */
  const redraw = (cx) => {
    changed += 1;
    remake();
    cx.notify();
  };

  /** @param {(task: AsyncContext) => Promise<string | null>} work @param {string} done @param {Context} cx */
  const act = (work, done, cx) => {
    working += 1;
    failed = "";
    notice = "";
    cx.spawn(async (task) => {
      const refused = await work(task);
      working -= 1;
      failed = refused ?? "";
      notice = refused === null ? done : "";
      remake();
      task.notify();
    });
    cx.notify();
  };

  /** @param {Set<string>} set @param {string} key */
  const toggled = (set, key) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    return next;
  };

  /** @param {Editing} next @param {string} words @param {Context} cx */
  const edit = (next, words, cx) => {
    editing = next;
    composer.set_value(words);
    composer.focus();
    redraw(cx);
  };

  /** @param {Context} cx */
  const stopEditing = (cx) => {
    editing = null;
    composer.set_value("");
    redraw(cx);
  };

  /** @param {Context} cx */
  const saveComment = (cx) => {
    const body = composer.value().trim();
    if (editing === null || body === "") return;
    const { on, id } = editing;
    stopEditing(cx);
    act(
      () =>
        changeComments((kept) =>
          id === null
            ? withComment(kept, { ...on, body }, randomUUID())
            : withBody(kept, id, body),
        ),
      "",
      cx,
    );
  };
  composer.on("submit", (_event, cx) => saveComment(cx));

  /** @param {string} id @param {Context} cx */
  const discard = (id, cx) => {
    if (editing?.id === id) stopEditing(cx);
    act(() => changeComments((kept) => withoutComments(kept, [id])), "", cx);
  };

  /**
   * What a click on a row does: a repository, a checkout and a file fold; a line takes a comment; a comment's ✕
   * discards it, and the rest of it opens its words to change them.
   * @param {string} key the row's
   * @param {string} forge the shown forge's key
   * @param {Context} cx
   */
  const clicked = (key, forge, cx) => {
    const row = drawn?.byKey.get(key);
    if (drawn === null || row === undefined) return;
    // Where in the row the press landed: from its right end, and from its top as the list is scrolled now.
    const top = drawn.tops[drawn.rows.indexOf(row)] ?? 0;
    const part = rowPart(
      row,
      width - pressed.x,
      pressed.y - (top - scroll.offset().y),
    );
    if (row.kind === "repo") {
      shutRepos = toggled(shutRepos, row.name);
      redraw(cx);
    } else if (row.kind === "checkout") {
      if (part === ROW_PART.body) foldCheckout(row.checkout.top, cx);
      else foldFiles(row.checkout.top, part === ROW_PART.fold, cx);
    } else if (row.kind === "file") {
      folds = new Map([...folds, [fileKey(row.top, row.file.path), row.open]]);
      redraw(cx);
    } else if (row.kind === "line") {
      const spot = lineSpot(row.line);
      const checkout = checkoutsOf(treeNow() ?? []).find(
        ({ top }) => top === row.top,
      );
      edit(
        {
          id: null,
          on: {
            forge,
            line: spot.number,
            path: row.path,
            side: spot.side,
            // A submodule's path is its repository's word, not the user's: the prompt tells it apart.
            ...(checkout?.submodule === true ? { sub: checkout.label } : {}),
            text: row.line.text,
            top: row.top,
          },
        },
        "",
        cx,
      );
    } else if (row.kind === "writing") {
      if (part === ROW_PART.close) stopEditing(cx);
      else if (part === ROW_PART.discard && row.id !== null)
        discard(row.id, cx);
      else if (part === ROW_PART.save) saveComment(cx);
    } else if (row.kind === "comment") {
      if (part === ROW_PART.close) discard(row.comment.id, cx);
      else edit({ id: row.comment.id, on: row.comment }, row.comment.body, cx);
    }
  };

  /**
   * Folds every file of a checkout, or unfolds them all.
   * @param {string} top the checkout's folder
   * @param {boolean} shut
   * @param {Context} cx
   */
  const foldFiles = (top, shut, cx) => {
    const files = loaded.get(top)?.diff?.files ?? [];
    folds = new Map([
      ...folds,
      ...files.map(
        /** @returns {[string, boolean]} */ (file) => [
          fileKey(top, file.path),
          shut,
        ],
      ),
    ]);
    redraw(cx);
  };

  /** @param {string} top a checkout's folder @param {Context} cx */
  const foldCheckout = (top, cx) => {
    openTops = toggled(openTops, top);
    nudge();
    redraw(cx);
  };

  /** @param {SessionOption} option @param {Context} cx */
  const pick = (option, cx) => {
    if (!option.sendable) return;
    picked = option.terminal;
    storeSession(picked);
    picking = false;
    search.set_value("");
    cx.notify();
  };

  /**
   * Sends every comment of the forge to the session picked, in one prompt, and only then takes them away: the ones
   * sent, so one saved meanwhile stays.
   * @param {SessionOption} to
   * @param {ChangeComment[]} comments the forge's
   * @param {Context} cx
   */
  const send = (to, comments, cx) => {
    if (working > 0 || comments.length === 0) return;
    const sent = `${counted(comments.length, "comment", "comments")} sent to ${to.title}`;
    // The send waits while a draft is being typed in that session: the panel says it is on its way.
    sending = true;
    act(
      async () => {
        const refused = await sendToAgent(to.terminal, changesPrompt(comments));
        sending = false;
        if (refused !== null) return refused;
        const kept = await changeComments((all) => withoutSent(all, comments));
        return kept === null
          ? null
          : `${sent}, but they stay listed here (${kept}): discard them, or they go again`;
      },
      sent,
      cx,
    );
  };

  /** @param {NativeElement} element @param {PanelRow} row a row the pointer can act on */
  const pointed = (element, row) =>
    div().w_full().h(row.height).cursor_pointer().child(element);

  /** Draws a row: no handler in it, the list's own tells its click. @param {PanelRow} row */
  const draw = (row) => {
    const k = tokens();
    if (row.kind === "repo")
      return pointed(repoHead(row.name, row.files, row.open), row);
    if (row.kind === "checkout")
      return pointed(
        checkoutHead({
          comments: row.comments,
          files: row.checkout.files,
          label: row.checkout.label,
          main: row.checkout.main,
          open: row.open,
          submodule: row.checkout.submodule,
          tools: row.open
            ? [
                foldMark("+").id(`changes-unfold-${row.key}`),
                foldMark("−").id(`changes-fold-${row.key}`),
              ]
            : [],
        }),
        row,
      );
    if (row.kind === "file")
      return div()
        .w_full()
        .h(row.height)
        .pt(4)
        .cursor_pointer()
        .child(
          fileHeader({
            adds: row.file.adds,
            comments: row.comments,
            dels: row.file.dels,
            open: row.open,
            path: row.file.path,
            status: row.file.status,
            viewed: div(),
          }),
        );
    if (row.kind === "hunk")
      return div().w_full().h(row.height).child(hunkHead(row.header));
    if (row.kind === "line")
      return pointed(
        diffLine({ ...row.line, plus: `changes-plus-${row.key}` }),
        row,
      );
    if (row.kind === "comment")
      return div()
        .w_full()
        .h(row.height)
        .overflow_hidden()
        .cursor_pointer()
        .child(
          draftComment({
            body: row.comment.body,
            close: iconButton(ICON.close, k.muted),
            outdated: row.outdated,
            where: `${row.away ? `${row.comment.path} · ` : ""}${row.comment.side} line ${row.comment.line}`,
          }),
        );
    if (row.kind === "writing")
      return h_flex()
        .w_full()
        .h(row.height)
        .items_start()
        .pl(COMMENT_INDENT)
        .pr(ZONE.editorPad)
        .py(6)
        .bg(withAlpha(k.accent, 0.12))
        .child(
          div()
            .flex_1()
            .min_w(0)
            .h_full()
            .px(8)
            .py(4)
            .bg(k.bg0)
            .border(2)
            .border_color(k.accent)
            .child(
              Textarea.new(composer).size_full().text_size(13).text_color(k.fg),
            ),
        )
        .child(
          h_flex()
            .flex_none()
            .w(ZONE.save)
            .justify_end()
            .cursor_pointer()
            .child(keyButton(KEY_BUTTON.primary, "Save")),
        )
        .when(row.id !== null, (el) =>
          el.child(
            h_flex()
              .flex_none()
              .w(ZONE.discard)
              .justify_end()
              .cursor_pointer()
              .child(keyButton(KEY_BUTTON.ghost, "Discard")),
          ),
        )
        .child(
          h_flex()
            .flex_none()
            .w(ZONE.cancel)
            .h(28)
            .items_center()
            .justify_end()
            .cursor_pointer()
            .child(iconButton(ICON.close, k.muted)),
        );
    return h_flex()
      .w_full()
      .h(row.height)
      .items_center()
      .pl(COMMENT_INDENT)
      .pr(8)
      .child(fill(row.words, "ui", 12, row.failed ? k.failed : k.muted));
  };

  /**
   * After a pinned head folded what is under it: scrolls the list so that head stays where it was pinned, with what
   * comes after it right below, instead of wherever the shorter list would leave the view.
   * @param {string} key the head's row
   * @param {number} above how much of the list's top the heads pinned over it take
   */
  const settle = (key, above) => {
    if (drawn === null) return;
    const head = drawn.rows.findIndex((row) => row.key === key);
    if (head === -1) return;
    // The list scrolls to a row's top, so to the row that reaches just above the head's place.
    scroll.scroll_to_item(
      Math.max(0, rowAt(drawn.tops, (drawn.tops[head] ?? 0) - above)),
      "top",
    );
  };

  /**
   * The heads pinned over the list's top while it is scrolled past them: the repository, the checkout and the file of
   * what shows there, each under the one before, so what is being read can be folded without scrolling back. They
   * are no rows of the list, so each takes its own clicks.
   * @param {Drawn} list
   * @returns {NativeElement[]}
   */
  const pinned = (list) => {
    const k = tokens();
    /** @type {NativeElement[]} */
    const heads = [];
    const [repoAt = -1, checkoutAt = -1, fileAt = -1] = pins;
    const repo = list.rows[repoAt];
    if (repo?.kind !== "repo") return heads;
    heads.push(
      control(
        repoHead(repo.name, repo.files, repo.open),
        "changes-pinned-repo",
        (cx) => {
          shutRepos = toggled(shutRepos, repo.name);
          redraw(cx);
          settle(repo.key, 0);
        },
      ),
    );
    const checkout = list.rows[checkoutAt];
    if (checkout?.kind !== "checkout") return heads;
    const { top } = checkout.checkout;
    heads.push(
      control(
        checkoutHead({
          comments: checkout.comments,
          files: checkout.checkout.files,
          label: checkout.checkout.label,
          main: checkout.checkout.main,
          open: checkout.open,
          submodule: checkout.checkout.submodule,
          tools: checkout.open
            ? [
                control(foldMark("+"), "changes-pinned-unfold", (cx) =>
                  foldFiles(top, false, cx),
                ),
                control(foldMark("−"), "changes-pinned-fold", (cx) =>
                  foldFiles(top, true, cx),
                ),
              ]
            : [],
        }),
        "changes-pinned-checkout",
        (cx) => {
          foldCheckout(top, cx);
          settle(checkout.key, ROW_HEIGHT.repo);
        },
      ),
    );
    const file = list.rows[fileAt];
    if (file?.kind !== "file") return heads;
    heads.push(
      control(
        div()
          .w_full()
          .h(ROW_HEIGHT.file)
          .pt(4)
          .bg(k.bg1)
          .child(
            fileHeader({
              adds: file.file.adds,
              comments: file.comments,
              dels: file.file.dels,
              open: file.open,
              path: file.file.path,
              status: file.file.status,
              viewed: div(),
            }),
          ),
        "changes-pinned-file",
        (cx) => {
          folds = new Map([
            ...folds,
            [fileKey(file.top, file.file.path), file.open],
          ]);
          redraw(cx);
          settle(file.key, ROW_HEIGHT.repo + ROW_HEIGHT.checkout);
        },
      ),
    );
    return heads;
  };

  /**
   * Why the comments cannot be sent now, for the human to act on; "" when they can, or there is none to send.
   * @param {SessionOption[]} options
   * @param {SessionOption | null} to
   * @param {number} comments
   */
  const held = (options, to, comments) => {
    if (comments === 0 || to !== null) return "";
    const option = options.find((one) => one.terminal === picked);
    if (picked === "") return "Pick the session the comments go to.";
    if (option === undefined)
      return "The session picked is gone: pick another.";
    return option.sendable
      ? "The session picked has no agent at its prompt now: pick another."
      : "The session picked waits on you: answer it first, or pick another.";
  };

  /**
   * @param {SessionOption[]} options
   * @param {SessionOption | null} to
   * @param {ChangeComment[]} comments the forge's
   */
  const picker = (options, to, comments) => {
    const k = tokens();
    const found = matchSessions(options, search.value());
    const why = held(options, to, comments.length);
    return v_flex()
      .flex_none()
      .gap(4)
      .child(
        h_flex()
          .items_center()
          .gap(8)
          .child(
            control(
              sessionChoice(
                options.find((one) => one.terminal === picked) ?? null,
                picking,
              ),
              "changes-session",
              (cx) => {
                picking = !picking;
                if (picking) search.focus();
                cx.notify();
              },
            ),
          )
          .child(
            control(
              keyButton(
                KEY_BUTTON.primary,
                `Send ${counted(comments.length, "comment", "comments")}`,
              ).opacity(
                to !== null && comments.length > 0 && working === 0 ? 1 : DIM,
              ),
              "changes-send",
              (cx) => {
                if (to !== null) send(to, comments, cx);
              },
            ),
          ),
      )
      .when(why !== "", (el) => el.child(wrapped(why, "ui", 12, k.needs)))
      .when(picking, (el) =>
        el.child(
          v_flex()
            .bg(k.bg0)
            .border(2)
            .border_color(k.line)
            .child(
              div()
                .id("changes-search-field")
                .h(32)
                .px(8)
                .flex()
                .items_center()
                .border_b(2)
                .border_color(k.line)
                .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
                .child(
                  Input.new(search).w_full().text_size(13).text_color(k.fg),
                ),
            )
            .child(
              v_flex()
                .id("changes-sessions")
                .max_h(240)
                .overflow_y_scrollbar()
                .children(
                  found.map((option) =>
                    control(
                      sessionRow(option, option.terminal === picked),
                      `changes-session-${option.terminal}`,
                      (cx) => pick(option, cx),
                    ),
                  ),
                )
                .when(found.length === 0, (el) =>
                  el.child(
                    div()
                      .p(8)
                      .child(
                        text(
                          options.length === 0
                            ? "No AI session is open in this forge."
                            : "No session matches.",
                          "ui",
                          12,
                          k.muted,
                        ),
                      ),
                  ),
                ),
            ),
        ),
      );
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const root = v_flex()
      .id("changes")
      .size_full()
      .min_h(0)
      .bg(k.bg1)
      .border(2)
      .border_color(k.line);
    const forge = forgeNow();
    const tree = treeNow();
    if (
      forge === null ||
      !forge.local ||
      tree === null ||
      foldsFor !== forge.key
    )
      return root.child(
        emptyState({
          caption: "changes",
          sub:
            forge === null
              ? "Open a forge to see what it holds uncommitted."
              : forge.local
                ? "Its checkouts are being read."
                : "This forge is on another machine: its changes are not read from here.",
          title:
            forge?.local === true ? "reading the forge" : "no changes to show",
        }),
      );
    const comments = commentsIn(readComments(), forge.key);
    const everyPane = panes();
    // A session takes a prompt only through a pane of its own, with an agent at its prompt there: one parked behind
    // a view (a review, a security triage) has none, and is not listed.
    const options = sessionOptions(
      readAgents(),
      readTerminals(),
      forge.spaces,
      readSpacesGit(),
    ).filter((option) =>
      everyPane.some((pane) => pane.terminal === option.terminal),
    );
    const to =
      options.find(
        (option) =>
          option.terminal === picked &&
          option.sendable &&
          sendableTo(everyPane.find((pane) => pane.terminal === picked)),
      ) ?? null;
    const summary = summaryOf(tree, comments);
    const list = drawn;
    if (list === null) return root;
    const heads = pinned(list);
    return root
      .child(
        v_flex()
          .flex_none()
          .gap(8)
          .p(10)
          .border_b(2)
          .border_color(k.line)
          .child(
            h_flex()
              .items_center()
              .gap(8)
              .child(text("CHANGES", "display", 11, k.fg))
              .child(
                fill(
                  `${counted(summary.files, "file", "files")} · ${counted(summary.comments, "comment", "comments")} not sent`,
                  "ui",
                  12,
                  k.muted,
                ),
              )
              .child(
                control(
                  iconButton(
                    ICON.zoom,
                    panelWantsMaximized(SIDE_PANEL.changes)
                      ? k.accent
                      : k.muted,
                  ),
                  "changes-maximize",
                  () =>
                    keepPanelMaximized(
                      SIDE_PANEL.changes,
                      !panelWantsMaximized(SIDE_PANEL.changes),
                    ),
                ),
              ),
          )
          .child(picker(options, to, comments))
          .when(sending, (el) =>
            el.child(text("Sending the comments…", "ui", 12, k.muted)),
          )
          .when(failed !== "" || notice !== "", (el) =>
            el.child(
              wrapped(
                failed || notice,
                "ui",
                12,
                failed !== "" ? k.failed : k.ok,
              ),
            ),
          ),
      )
      .child(
        div()
          .id("changes-list")
          .flex_1()
          .min_h(0)
          .relative()
          .on_size_change((size, cx) => {
            // A size comes in window px; the list is laid out in layout ones.
            const measured = size.width / zoomOf();
            if (measured === width) return;
            width = measured;
            remake();
            cx.notify();
          })
          .on_mouse_down("left", (event) => {
            const zoom = zoomOf();
            pressed = {
              x: (event.local_position?.x ?? 0) / zoom,
              y: (event.local_position?.y ?? 0) / zoom,
            };
          })
          .child(
            v_virtual_list(
              LIST,
              list.rows.length,
              list.heights,
              (index) => list.rows[index]?.key ?? String(index),
              (range) => list.rows.slice(range.start, range.end).map(draw),
            )
              .track_scroll(scroll)
              .size_full()
              .on_item_click((key, cx) => clicked(key, forge.key, cx)),
          )
          .child(
            Scrollbar.vertical(LIST)
              .viewport_from_layout()
              .absolute()
              .inset_0(),
          )
          .child(
            v_flex()
              .id("changes-pinned")
              .absolute()
              .top(0)
              .left(0)
              .right(0)
              .bg(k.bg1)
              .children(heads)
              .when(heads.length > 0, (el) =>
                el.border_b(2).border_color(k.line),
              ),
          ),
      );
  };

  return {
    close: () => {
      loading?.cancel();
      syncing?.cancel();
      pinning?.cancel();
      scroll.release();
      composer.release();
      search.release();
    },
    render,
  };
};
