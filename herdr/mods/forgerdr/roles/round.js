// A review round (design 06): what an agent changed, as the pane header's "Review changes" snapshotted it
// (bin/forge-round.sh), in a tab of its own told the agent's terminal. One list of every file changed, each folding on
// its own and marked viewed (which folds it); the lines numbered on both sides, added and removed ones lit; a click on
// a line opens a field to comment on it. Comments stay on their line from round to round, or show as outdated once it
// is gone. The strip of rounds picks one; a round shows what changed since the round before it, or everything since
// the base. Request changes sends the open comments to the agent as one prompt (hc send); Ask the golem to fix sends
// one. The stamp approves the round: its head is the new base, and the commit stays the skill's gate.
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { checking, props } from "herdr";
import {
  addComment,
  approveRound,
  dropComment,
  followRounds,
  markViewed,
  readRoundDiff,
  requestChanges,
  resolveComment,
  sendToAgent,
} from "../bridges/rounds.js";
import { playStamp } from "../bridges/sounds.js";
import { readTerminals } from "../bridges/terminals.js";
import { counted } from "../format.js";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { emptyState } from "../kit/panels.js";
import {
  commentBlock,
  diffLine,
  fileHeader,
  hunkHead,
  metaItem,
  roundChip,
  sectionTitle,
  tickLabel,
  viewTitle,
} from "../kit/review.js";
import { ICON, iconButton } from "../kit/sprites.js";
import { landStamp, STAMP_PHASE, stampOver } from "../kit/stamp.js";
import { fill, text, wrapped } from "../kit/text.js";
import { tokens } from "../kit/tokens.js";
import {
  anchorComments,
  diffRows,
  feedbackOf,
  lineSpot,
  parseDiff,
  ROUND_STATUS,
} from "../round.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Color} Color */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../round.js").DiffFile} DiffFile */
/** @typedef {import("../round.js").DiffRow} DiffRow */
/** @typedef {import("../round.js").ParsedDiff} ParsedDiff */
/** @typedef {import("../round.js").Round} Round */
/** @typedef {import("../round.js").RoundComment} RoundComment */
/** @typedef {import("../round.js").RoundsState} RoundsState */
/** @typedef {import("../round.js").RoundStatus} RoundStatus */
/** @typedef {import("../round.js").Side} Side */
/** @typedef {import("./role.js").Role} Role */

/** @type {() => { terminal?: string } | null} */
const readProps = props;

const SHORT_SHA = 7;
// forge: a plain list, cut at this many rows until the human asks for all; a virtual list once its rows may hold
// controls of their own (gpui-kit refuses handlers inside a virtual list's rows today).
const ROW_CAP = 3000;
// The rows' heights in pixels, by kind; the comments take what they need.
const ROW_HEIGHT = Object.freeze({ compose: 44, file: 46, hunk: 24, line: 20 });
/** @type {Record<RoundStatus, string>} */
const STATUS_WORDS = {
  approved: "approved",
  changes: "changes requested",
  open: "open",
};

/**
 * A comment being written: the line it is on and that line's text.
 * @typedef {{ path: string, side: Side, line: number, text: string }} Composing
 */

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const round = (cx) => {
  const terminal = readProps()?.terminal ?? "";
  /** @type {RoundsState | null} */
  let state = null;
  let loaded = false;
  // The round shown, 0 for the latest; whether it shows everything since the base.
  let shown = 0;
  let all = false;
  /** @type {ParsedDiff | null} */
  let diff = null;
  let diffKey = "";
  let diffError = "";
  /** @type {Set<string>} the files folded, by path */
  let collapsed = new Set();
  let collapsedFor = 0;
  /** @type {Composing | null} */
  let composing = null;
  // Whether the list shows every row, past ROW_CAP.
  let everyRow = false;
  let notice = "";
  let failed = "";
  let busy = false;
  /** @type {import("../kit/stamp.js").StampPhase} */
  let stamp = STAMP_PHASE.none;
  const composer = InputState.new({ placeholder: "Comment on this line…" });

  /** @returns {Round | undefined} */
  const roundNow = () =>
    state === null
      ? undefined
      : shown === 0
        ? state.rounds.at(-1)
        : state.rounds.find((one) => one.n === shown);

  const keyNow = () => {
    const now = roundNow();
    return now === undefined ? "" : `${now.n}:${all}:${now.head}`;
  };

  // The diff of the round shown, read again when the round, its head or the toggle changed.
  const refreshDiff = async () => {
    const now = roundNow();
    const key = keyNow();
    if (key === diffKey) return;
    diffKey = key;
    if (now === undefined) {
      diff = null;
      return;
    }
    try {
      diff = parseDiff(await readRoundDiff(terminal, now.n, all));
      diffError = "";
      if (collapsedFor !== now.n) {
        collapsed = new Set(now.viewed);
        collapsedFor = now.n;
      }
    } catch (error) {
      diff = null;
      diffError = String(error);
      console.error("forgerdr round: the diff could not be read", error);
    }
  };

  // One loader: it reads the diff whenever something nudges it, and never two at once.
  /** @type {(() => void) | null} */
  let wake = null;
  const nudge = () => {
    wake?.();
    wake = null;
  };
  const loading =
    checking() || terminal === ""
      ? null
      : cx.spawn(async (task) => {
          for (;;) {
            await refreshDiff();
            task.notify();
            if (keyNow() !== diffKey) continue;
            await new Promise((resolve) => {
              wake = () => resolve(undefined);
            });
          }
        });
  const following =
    checking() || terminal === ""
      ? null
      : followRounds(cx, terminal, (read) => {
          state = read;
          loaded = true;
          nudge();
        });

  /** The comments up to the round shown. @param {Round} now */
  const commentsOf = (now) =>
    (state?.comments ?? []).filter((one) => one.round <= now.n);

  /** @param {(task: AsyncContext) => Promise<string | null>} work @param {string} done @param {Context} cx */
  const act = (work, done, cx) => {
    busy = true;
    failed = "";
    notice = "";
    cx.spawn(async (task) => {
      const refused = await work(task);
      busy = false;
      failed = refused ?? "";
      notice = refused === null ? done : "";
      task.notify();
    });
    cx.notify();
  };

  /** @param {number} n @param {Context} cx */
  const showRound = (n, cx) => {
    shown = n === state?.rounds.at(-1)?.n ? 0 : n;
    composing = null;
    nudge();
    cx.notify();
  };

  /** @param {boolean} everything @param {Context} cx */
  const showAll = (everything, cx) => {
    all = everything;
    nudge();
    cx.notify();
  };

  /** @param {string} path @param {Context} cx */
  const toggleFold = (path, cx) => {
    if (collapsed.has(path)) collapsed.delete(path);
    else collapsed.add(path);
    cx.notify();
  };

  /** @param {Round} now @param {string} path @param {Context} cx */
  const toggleViewed = (now, path, cx) => {
    const on = !now.viewed.includes(path);
    if (on) collapsed.add(path);
    act(() => markViewed(terminal, now.n, path, on), "", cx);
  };

  /** @param {DiffRow} row @param {Context} cx */
  const compose = (row, cx) => {
    if (row.kind !== "line") return;
    const spot = lineSpot(row.line);
    composing = {
      line: spot.number,
      path: row.file.path,
      side: spot.side,
      text: row.line.text,
    };
    composer.set_value("");
    composer.focus();
    cx.notify();
  };

  /** @param {Context} cx */
  const submitComment = (cx) => {
    const now = roundNow();
    const body = composer.value().trim();
    if (now === undefined || composing === null || body === "") return;
    const comment = { ...composing, body, round: now.n };
    composing = null;
    composer.set_value("");
    act(() => addComment(terminal, comment), "", cx);
  };
  composer.on("submit", (_event, cx) => submitComment(cx));

  /** @param {Context} cx */
  const land = (cx) =>
    landStamp(
      cx,
      (phase) => {
        stamp = phase;
      },
      playStamp,
    );

  /** The comments to send: open, and not sent yet. @param {Round} now */
  const unsent = (now) =>
    commentsOf(now).filter((one) => !one.resolved && !one.sent);

  /** @param {Round} now @param {Context} cx */
  const requestNow = (now, cx) => {
    const open = unsent(now);
    if (busy || open.length === 0) return;
    act(
      () => requestChanges(terminal, now.n, feedbackOf(now.n, open)),
      `${counted(open.length, "comment", "comments")} sent to the golem`,
      cx,
    );
  };

  /** @param {Round} now @param {Context} cx */
  const approveNow = (now, cx) => {
    if (busy || now.status === ROUND_STATUS.approved) return;
    land(cx);
    act(
      () => approveRound(terminal, now.n),
      `round ${now.n} approved: it is the new base`,
      cx,
    );
  };

  /** @param {Round} round @param {RoundsState} kept */
  const noteOf = (round, kept) => {
    if (round.status === ROUND_STATUS.open)
      return `open · ${round.from.slice(0, SHORT_SHA)}..${round.head.slice(0, SHORT_SHA)}`;
    if (round.status === ROUND_STATUS.changes) {
      const its = kept.comments.filter((one) => one.round === round.n);
      return `${STATUS_WORDS.changes} · ${counted(its.length, "comment", "comments")}${
        its.length > 0 && its.every((one) => one.resolved)
          ? ", all resolved"
          : ""
      }`;
    }
    return STATUS_WORDS.approved;
  };

  /** @param {RoundStatus} status @returns {Color} */
  const colourOf = (status) => {
    const k = tokens();
    return { approved: k.ok, changes: k.failed, open: k.needs }[status];
  };

  /** @param {RoundComment} comment @param {Round} now */
  const commentOf = (comment, now) => {
    const k = tokens();
    /** @type {NativeElement[]} */
    const actions = comment.resolved
      ? []
      : [
          control(
            text("Resolve", "ui", 12, k.fg),
            `round-resolve-${comment.id}`,
            (cx) => act(() => resolveComment(terminal, comment.id), "", cx),
          ),
          control(
            text("Ask the golem to fix", "ui", 12, k.accent),
            `round-ask-${comment.id}`,
            (cx) =>
              act(
                () => sendToAgent(terminal, feedbackOf(now.n, [comment])),
                "sent to the golem",
                cx,
              ),
          ),
          control(
            iconButton(ICON.trash, k.muted),
            `round-drop-${comment.id}`,
            (cx) => act(() => dropComment(terminal, comment.id), "", cx),
          ),
        ];
    return commentBlock({
      actions,
      body: comment.body,
      state: comment.resolved ? "resolved" : comment.sent ? "sent" : "open",
      where: `round ${comment.round} · ${comment.side} line ${comment.line}`,
    });
  };

  /** @param {DiffRow} row @param {Round} now */
  const rowOf = (row, now) => {
    const k = tokens();
    /** @param {NativeElement} element @param {number} height */
    const placed = (element, height) =>
      div().id(row.key).w_full().h(height).child(element);
    if (row.kind === "file") {
      const comments = commentsOf(now).filter(
        (one) => one.path === row.file.path && !one.resolved,
      ).length;
      return control(
        div()
          .w_full()
          .h(ROW_HEIGHT.file)
          .pt(6)
          .child(
            fileHeader({
              adds: row.file.adds,
              comments,
              dels: row.file.dels,
              open: !collapsed.has(row.file.path),
              path: row.file.path,
              status: row.file.status,
              viewed: control(
                tickLabel(now.viewed.includes(row.file.path), "viewed"),
                `round-viewed-${row.file.path}`,
                (cx) => toggleViewed(now, row.file.path, cx),
              ),
            }),
          ),
        `round-${row.key}`,
        (cx) => toggleFold(row.file.path, cx),
      );
    }
    if (row.kind === "hunk")
      return placed(hunkHead(row.header), ROW_HEIGHT.hunk);
    if (row.kind === "line")
      return control(
        div().w_full().h(ROW_HEIGHT.line).child(diffLine(row.line)),
        `round-${row.key}`,
        (cx) => compose(row, cx),
      );
    if (row.kind === "compose")
      return placed(
        h_flex()
          .size_full()
          .items_center()
          .gap(8)
          .pl(100)
          .pr(12)
          .child(
            div()
              .id("round-compose-field")
              .flex_1()
              .min_w(0)
              .h(32)
              .px(8)
              .flex()
              .items_center()
              .bg(k.bg0)
              .border(2)
              .border_color(k.accent)
              .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
              .child(
                Input.new(composer).w_full().text_size(13).text_color(k.fg),
              ),
          )
          .child(
            control(
              keyButton(KEY_BUTTON.primary, "Comment"),
              "round-compose-send",
              submitComment,
            ),
          )
          .child(
            control(
              iconButton(ICON.close, k.muted),
              "round-compose-cancel",
              (cx) => {
                composing = null;
                cx.notify();
              },
            ),
          ),
        ROW_HEIGHT.compose,
      );
    const measured = (/** @type {NativeElement[]} */ blocks) =>
      v_flex().id(row.key).w_full().children(blocks);
    if (row.kind === "outdated")
      return measured([
        h_flex()
          .pl(100)
          .pt(6)
          .child(text("OUTDATED · its line is gone", "display", 9, k.muted)),
        ...row.comments.map((one) =>
          v_flex()
            .child(
              h_flex()
                .pl(100)
                .child(fill(`> ${one.text.trim()}`, "mono", 12, k.muted)),
            )
            .child(commentOf(one, now)),
        ),
      ]);
    return measured(row.comments.map((one) => commentOf(one, now)));
  };

  /** @param {Round} now @param {RoundsState} kept */
  const header = (now, kept) => {
    const k = tokens();
    const files = diff?.files ?? [];
    const adds = files.reduce((sum, one) => sum + one.adds, 0);
    const dels = files.reduce((sum, one) => sum + one.dels, 0);
    const comments = commentsOf(now);
    const open = comments.filter((one) => !one.resolved).length;
    const title =
      readTerminals().find((one) => one.address === terminal)?.title ??
      terminal;
    const toggle = (
      /** @type {boolean} */ everything,
      /** @type {string} */ label,
    ) =>
      control(
        div()
          .flex_none()
          .px(10)
          .py(3)
          .bg(all === everything ? k.accent : k.bg2)
          .child(
            text(
              label,
              "display",
              9,
              all === everything ? k.onAccent : k.muted,
            ),
          ),
        `round-show-${everything ? "all" : "since"}`,
        (cx) => showAll(everything, cx),
      );
    const fold = (/** @type {boolean} */ shut, /** @type {string} */ label) =>
      control(
        keyButton(KEY_BUTTON.ghost, label),
        `round-${shut ? "collapse" : "expand"}-all`,
        (cx) => {
          collapsed = shut ? new Set(files.map((one) => one.path)) : new Set();
          cx.notify();
        },
      );
    return v_flex()
      .flex_none()
      .gap(10)
      .px(20)
      .py(14)
      .border_b(2)
      .border_color(k.line)
      .child(
        h_flex()
          .items_center()
          .gap(12)
          .child(viewTitle(`Review round ${now.n}`, title ?? ""))
          .child(
            control(
              keyButton(KEY_BUTTON.secondary, "Request changes").opacity(
                unsent(now).length > 0 && !busy ? 1 : 0.45,
              ),
              "round-request",
              (cx) => requestNow(now, cx),
            ),
          )
          .child(
            control(
              keyButton(
                KEY_BUTTON.stamp,
                now.status === ROUND_STATUS.approved
                  ? "Approved"
                  : "Stamp gnomemark",
                { icon: ICON.gnomemark },
              ).opacity(
                now.status === ROUND_STATUS.approved || busy ? 0.45 : 1,
              ),
              "round-stamp",
              (cx) => approveNow(now, cx),
            ),
          ),
      )
      .child(
        h_flex()
          .flex_wrap()
          .items_center()
          .gap(18)
          .child(
            metaItem(
              ICON.board,
              `${counted(files.length, "file", "files")} · +${adds} -${dels}`,
            ),
          )
          .child(
            metaItem(
              ICON.notify,
              `${counted(comments.length, "comment", "comments")} · ${open} unresolved`,
            ),
          )
          .when(now.n > 1 && !all, (el) =>
            el.child(
              metaItem(
                ICON.branch,
                `round ${now.n - 1} → ${now.n}: ${counted(files.length, "file", "files")} changed since your last look`,
              ),
            ),
          )
          .child(div().flex_1())
          .child(fold(false, "Expand all"))
          .child(fold(true, "Collapse all"))
          .child(
            h_flex()
              .gap(2)
              .child(toggle(false, "SINCE LAST"))
              .child(toggle(true, "ALL")),
          ),
      )
      .child(
        h_flex()
          .flex_wrap()
          .items_center()
          .gap(8)
          .child(sectionTitle("ROUNDS", k.muted))
          .children(
            kept.rounds.map((each) =>
              control(
                roundChip(
                  `R${each.n}`,
                  noteOf(each, kept),
                  colourOf(each.status),
                  each.n === now.n,
                ),
                `round-chip-${each.n}`,
                (cx) => showRound(each.n, cx),
              ),
            ),
          ),
      )
      .when(failed !== "" || notice !== "", (el) =>
        el.child(
          wrapped(failed || notice, "ui", 12, failed !== "" ? k.failed : k.ok),
        ),
      );
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const root = v_flex().id("round").relative().size_full().bg(k.bg0);
    const now = roundNow();
    if (terminal === "" || state === null || now === undefined)
      return root.child(
        emptyState({
          caption: "review round",
          sub: "Review changes, on an agent's pane header, snapshots what it changed into a round to review here.",
          title:
            loaded || terminal === ""
              ? "no round to review"
              : "opening the round",
        }),
      );
    const anchored = anchorComments(diff?.files ?? [], commentsOf(now));
    const rows = diffRows(diff?.files ?? [], {
      collapsed,
      composing,
      outdated: anchored.outdated,
      placed: anchored.placed,
    });
    // The comments this diff does not show: on files it leaves out, or on lines it does not touch.
    const elsewhere =
      anchored.elsewhere.length === 0
        ? []
        : [
            v_flex()
              .id("round-elsewhere")
              .flex_none()
              .gap(4)
              .pt(6)
              .child(
                h_flex()
                  .pl(100)
                  .child(
                    text(
                      "ELSEWHERE · on lines this diff does not show",
                      "display",
                      9,
                      k.muted,
                    ),
                  ),
              )
              .children(
                anchored.elsewhere.map((one) =>
                  v_flex()
                    .child(
                      h_flex()
                        .pl(100)
                        .child(
                          fill(
                            `${one.path}:${one.line} > ${one.text.trim()}`,
                            "mono",
                            12,
                            k.muted,
                          ),
                        ),
                    )
                    .child(commentOf(one, now)),
                ),
              ),
          ];
    const notes = [
      ...(diffError === "" ? [] : [wrapped(diffError, "ui", 12, k.failed)]),
      ...(diff?.cut === true
        ? [text("The diff is too long: it is cut short.", "ui", 12, k.needs)]
        : []),
      ...(diff !== null && rows.length === 0
        ? [text("Nothing changed in this round.", "ui", 13, k.muted)]
        : []),
    ];
    return root
      .child(header(now, state))
      .when(notes.length > 0, (el) =>
        el.child(v_flex().flex_none().gap(4).px(20).pt(10).children(notes)),
      )
      .child(
        v_flex()
          .id("round-diff")
          .flex_1()
          .min_h(0)
          .px(12)
          .pb(12)
          .overflow_y_scrollbar()
          .children(elsewhere)
          .children(
            (everyRow ? rows : rows.slice(0, ROW_CAP)).map((row) =>
              rowOf(row, now),
            ),
          )
          .when(!everyRow && rows.length > ROW_CAP, (el) =>
            el.child(
              control(
                text(
                  `Show all ${rows.length} rows (fold files to keep it quick)`,
                  "ui",
                  12,
                  k.accent,
                ),
                "round-every-row",
                (cx) => {
                  everyRow = true;
                  cx.notify();
                },
              ),
            ),
          ),
      )
      .when(stamp !== STAMP_PHASE.none, (el) =>
        el.child(stampOver("round-stamp", stamp)),
      );
  };

  return {
    close: () => {
      following?.cancel();
      loading?.cancel();
      composer.release();
    },
    render,
  };
};
