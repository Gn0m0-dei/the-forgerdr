// The Changes panel's own pieces, beside the diff's (kit/review.js, design 06): the heads its repositories and
// checkouts fold under, a comment kept until it is sent, and the choice of the AI session the comments go to. Narrow
// on purpose: the panel is a side one.
import { h_flex, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { SESSION_KIND, ZONE } from "../changes.js";
import { counted } from "../format.js";
import { ICON, icon } from "./sprites.js";
import { fill, text, wrapped } from "./text.js";
import { FONT, NONE, tokens, toneColour, toneOf } from "./tokens.js";

/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../changes.js").SessionKind} SessionKind */
/** @typedef {import("../changes.js").SessionOption} SessionOption */

// How far a comment sits in from the panel's edge: past the + and the line numbers' first column.
export const COMMENT_INDENT = 40;

/**
 * A line of its column, cut short with an ellipsis.
 * @param {string} content
 * @param {import("./tokens.js").Face} face
 * @param {number} size
 * @param {import("gpui-kit").Color} colour
 */
const cut = (content, face, size, colour) =>
  div()
    .w_full()
    .truncate()
    .font_family(FONT[face])
    .text_size(size)
    .text_color(colour)
    .child(content);

/** @param {boolean} open */
const chevron = (open) =>
  icon(open ? ICON.chevronDown : ICON.chevronRight, tokens().muted);

/** @param {number} files */
const filesCount = (files) =>
  text(
    files > 0 ? counted(files, "file", "files") : "clean",
    "ui",
    11,
    files > 0 ? tokens().fg : tokens().muted,
  );

/**
 * A repository of the forge, which its checkouts fold under.
 * @param {string} name
 * @param {number} files what its checkouts changed, together
 * @param {boolean} open
 */
export const repoHead = (name, files, open) => {
  const k = tokens();
  return h_flex()
    .w_full()
    .h(30)
    .items_center()
    .gap(8)
    .px(8)
    .bg(k.bg0)
    .child(chevron(open))
    .child(icon(ICON.repo, k.muted))
    .child(fill(name.toUpperCase(), "display", 11, k.fg))
    .child(filesCount(files));
};

/**
 * @typedef {object} CheckoutHeadProps
 * @property {string} label its branch; a submodule's path
 * @property {boolean} main the repository's main checkout
 * @property {boolean} submodule
 * @property {number} files
 * @property {number} comments the ones written on it and not sent yet
 * @property {boolean} open
 * @property {NativeElement[]} [tools] what it offers at its right end: unfold and fold all its files (foldMark)
 */

/**
 * A tool of a checkout's head: + unfolds all its files, − folds them.
 * @param {"+" | "−"} sign
 */
export const foldMark = (sign) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .w(ZONE.fold)
    .h(20)
    .items_center()
    .justify_center()
    .border(1)
    .border_color(k.line)
    .hover((style) => style.bg(k.bg3))
    .child(text(sign, "mono", 13, k.fg));
};

/**
 * A checkout of a repository, which its files fold under: the main one, a worktree, or a submodule a step further in.
 * @param {CheckoutHeadProps} props
 */
export const checkoutHead = ({
  label,
  main,
  submodule,
  files,
  comments,
  open,
  tools = [],
}) => {
  const k = tokens();
  return h_flex()
    .w_full()
    .h(28)
    .items_center()
    .gap(8)
    .pl(submodule ? 36 : 20)
    .pr(tools.length > 0 ? ZONE.foldPad : 8)
    .bg(k.bg1)
    .child(chevron(open))
    .child(icon(submodule ? ICON.board : ICON.branch, k.muted))
    .child(fill(label, "mono", 12, files > 0 ? k.fg : k.muted))
    .when(main, (el) => el.child(text("MAIN", "display", 8, k.muted)))
    .when(submodule, (el) => el.child(text("SUBMODULE", "display", 8, k.muted)))
    .when(comments > 0, (el) =>
      el.child(text(`${comments} ✎`, "ui", 11, k.needs)),
    )
    .child(filesCount(files))
    .when(tools.length > 0, (el) =>
      el.child(h_flex().flex_none().children(tools)),
    );
};

/**
 * @typedef {object} DraftCommentProps
 * @property {string} where "new line 17"; its file too, away from its line
 * @property {string} body
 * @property {boolean} [outdated] its line is gone from the diff
 * @property {NativeElement} close the ✕ that discards it, a control
 */

/**
 * A comment the human wrote, under its line until it is sent or discarded.
 * @param {DraftCommentProps} props
 */
export const draftComment = ({ where, body, outdated = false, close }) => {
  const k = tokens();
  const colour = outdated ? k.muted : k.needs;
  return h_flex()
    .w_full()
    .pl(COMMENT_INDENT)
    .pr(8)
    .py(4)
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .gap(4)
        .p(8)
        .bg(k.bg2)
        .border_l(3)
        .border_color(colour)
        .child(
          h_flex()
            .items_center()
            .gap(8)
            .child(fill(where, "ui", 11, k.muted))
            .child(
              div()
                .flex_none()
                .px(5)
                .border(1)
                .border_color(colour)
                .child(
                  text(
                    outdated ? "OUTDATED" : "NOT SENT",
                    "display",
                    8,
                    colour,
                  ),
                ),
            )
            .child(close),
        )
        .child(wrapped(body, "ui", 13, k.fg)),
    );
};

/** @type {Record<SessionKind, string>} */
const KIND_LABEL = {
  [SESSION_KIND.review]: "REVIEW",
  [SESSION_KIND.security]: "SECURITY",
  [SESSION_KIND.session]: "",
  [SESSION_KIND.subagent]: "SUB-AGENT",
};

/**
 * Who a session is and where it works, on one line: a dot in its status' colour, its title, its repository and branch,
 * and what kind it is when it is not a session of its own.
 * @param {SessionOption} option
 */
const sessionLine = (option) => {
  const k = tokens();
  return h_flex()
    .flex_1()
    .min_w(0)
    .items_center()
    .gap(8)
    .child(
      div()
        .flex_none()
        .w(8)
        .h(8)
        .bg(toneColour(toneOf(option.status))),
    )
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .child(cut(option.title, "ui", 13, k.fg))
        .child(cut(option.where, "mono", 11, k.muted)),
    )
    .when(option.kind !== SESSION_KIND.session, (el) =>
      el.child(text(KIND_LABEL[option.kind], "display", 8, k.muted)),
    )
    .when(!option.sendable, (el) =>
      el.child(text("WAITS ON YOU", "display", 8, k.needs)),
    );
};

/**
 * The session the comments will go to, as the closed choice shows it; a call to pick one when none is.
 * @param {SessionOption | null} picked
 * @param {boolean} open
 */
export const sessionChoice = (picked, open) => {
  const k = tokens();
  return h_flex()
    .flex_1()
    .min_w(0)
    .h(40)
    .items_center()
    .gap(8)
    .px(8)
    .bg(k.bg0)
    .border(2)
    .border_color(open ? k.accent : k.line)
    .child(icon(ICON.golem, picked === null ? k.muted : k.fg))
    .child(
      picked === null
        ? fill("Pick the session to send to…", "ui", 13, k.muted)
        : sessionLine(picked),
    )
    .child(icon(open ? ICON.chevronUp : ICON.chevronDown, k.muted));
};

/**
 * A session in the open list; one that waits on the human is dimmed: it cannot be picked.
 * @param {SessionOption} option
 * @param {boolean} picked
 */
export const sessionRow = (option, picked) => {
  const k = tokens();
  return h_flex()
    .w_full()
    .h(40)
    .flex_none()
    .items_center()
    .px(8)
    .bg(picked ? k.bg3 : NONE)
    .opacity(option.sendable ? 1 : 0.5)
    .when(option.sendable, (el) => el.hover((style) => style.bg(k.bg2)))
    .child(sessionLine(option));
};
