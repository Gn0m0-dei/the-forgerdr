// The review views' pieces (designs 06, 06b, 06c): the severity of a finding and its row to pick, its explanation, a
// comment's draft, a thread of the user's own pull request with what to do about it, the checks before the stamp, and a
// round's diff: a file's header, a hunk's, a line, the comments under it and the strip of rounds. The security view
// (design 06d, kit/security.js) lists its findings with the same heads, rows and lines. Plain values in, an element
// out; the roles make them controls and hand them their fields.
import { h_flex, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { checkBox } from "./forms.js";
import { ICON, icon } from "./sprites.js";
import { fill, text, wrapped } from "./text.js";
import { motionOn, NONE, tokens, withAlpha } from "./tokens.js";

/** @typedef {import("gpui-kit").Color} Color */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("./sprites.js").IconName} IconName */
/** @typedef {import("../review.js").Severity} Severity */
/** @typedef {import("../review.js").Proposal} Proposal */
/** @typedef {import("../round.js").LineKind} LineKind */
/** @typedef {import("../round.js").FileStatus} FileStatus */

// How wide a finding's places may be in its row, in pixels, before they are cut short.
const PLACE_MAX = 520;

/** @type {Record<Severity, string>} */
export const SEVERITY_LABEL = {
  blocker: "BLOCKER",
  info: "INFO",
  nit: "NIT",
  question: "QUESTION",
  should: "SHOULD",
};

/** @type {Record<Proposal, string>} */
export const PROPOSAL_LABEL = { ask: "ASK", fix: "FIX", reply: "REPLY" };

/**
 * A severity's colour: red for a blocker, amber for a should, the accent for a question, quiet for the rest.
 * @param {Severity} severity
 * @returns {Color}
 */
export const severityColour = (severity) => {
  const k = tokens();
  return {
    blocker: k.failed,
    info: k.muted,
    nit: k.muted,
    question: k.accent,
    should: k.needs,
  }[severity];
};

/**
 * A proposal's colour: green for a fix, the accent for a reply, amber for a question back.
 * @param {Proposal} proposal
 * @returns {Color}
 */
export const proposalColour = (proposal) => {
  const k = tokens();
  return { ask: k.needs, fix: k.ok, reply: k.accent }[proposal];
};

/**
 * A section's title, spaced out: FINDINGS, DRAFTS · 5 COMMENTS.
 * @param {string} content
 * @param {Color} [colour]
 */
export const sectionTitle = (content, colour) =>
  text(content, "display", 11, colour ?? tokens().fg);

/**
 * One fact of the view's header, quiet, after its icon.
 * @param {IconName} glyph
 * @param {string} content
 */
export const metaItem = (glyph, content) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .items_center()
    .gap(6)
    .child(icon(glyph, k.muted))
    .child(text(content, "ui", 12, k.muted));
};

/**
 * The icon a view's title starts with, in its colour.
 * @typedef {object} ViewMark
 * @property {IconName} glyph
 * @property {Color} colour
 */

/**
 * The view's title row: its mark, the title and what it covers: the branches it goes between, the diff it reviews.
 * @param {string} title
 * @param {string} branches "feature/#42-x → main", empty when unknown
 * @param {ViewMark} [mark] a pull request's icon in amber unless told
 */
export const viewTitle = (title, branches, mark) => {
  const k = tokens();
  const { glyph, colour } = mark ?? {
    colour: k.needs,
    glyph: ICON.pullRequest,
  };
  return h_flex()
    .flex_1()
    .min_w(0)
    .items_center()
    .gap(12)
    .child(icon(glyph, colour, 2))
    .child(fill(title, "display", 18, k.fg))
    .when(branches !== "", (el) =>
      el.child(
        div()
          .flex_none()
          .px(8)
          .py(3)
          .border(1)
          .border_color(k.line)
          .child(text(branches, "mono", 12, k.muted)),
      ),
    );
};

/**
 * A severity and how many findings it has, bordered in its colour.
 * @param {Severity} severity
 * @param {number} count
 */
export const severityChip = (severity, count) => {
  const colour = severityColour(severity);
  return div()
    .flex_none()
    .px(6)
    .py(2)
    .border(1)
    .border_color(count > 0 ? colour : tokens().line)
    .child(
      text(
        `${SEVERITY_LABEL[severity]} ${count}`,
        "display",
        9,
        count > 0 ? colour : tokens().muted,
      ),
    );
};

/**
 * A group's head: its bar and BLOCKER · 1, CONFIRMED · CRITICAL · 1, in its colour.
 * @param {string} label
 * @param {number} count
 * @param {Color} colour
 */
export const groupHead = (label, count, colour) =>
  h_flex()
    .flex_none()
    .items_center()
    .gap(8)
    .pt(6)
    .child(div().flex_none().w(4).h(14).bg(colour))
    .child(text(`${label} · ${count}`, "display", 10, colour));

/**
 * A small box: [1], [2-6], the T of a reviewer.
 * @param {string} content
 */
export const idBox = (content) => {
  const k = tokens();
  return div()
    .flex_none()
    .px(5)
    .py(1)
    .border(1)
    .border_color(k.line)
    .child(text(content, "mono", 12, k.muted));
};

/**
 * A tag at a finding row's end, quiet unless given a colour: GROUP · 2, RECOMMENDED, VERIFIER: CONFIRMED.
 * @typedef {object} RowTag
 * @property {string} text
 * @property {Color} [colour]
 */

/**
 * A finding row's tag, quiet unless given a colour.
 * @param {string} content
 * @param {Color} [colour]
 */
const rowTag = (content, colour) => {
  const k = tokens();
  return div()
    .flex_none()
    .px(5)
    .py(1)
    .border(1)
    .border_color(colour ?? k.line)
    .child(text(content, "display", 8, colour ?? k.muted));
};

/**
 * @typedef {object} FindingRowProps
 * @property {NativeElement | null} tick its box to tick, made a control by the role, or a still one; null for a
 *   finding nobody picks, as a rejected one
 * @property {string} label its id's box: [1], [2-6], S1
 * @property {string} place where it is: resize.rs:48, two files, the pull request; "" when it is nowhere
 * @property {string} title
 * @property {Color} colour its border once picked: its severity's
 * @property {boolean} picked
 * @property {boolean} open
 * @property {RowTag[]} tags at its end, in order
 * @property {NativeElement[]} actions after its chevron, made controls by the role: Note on the issue, Remember
 */

/** @param {FindingRowProps} props */
export const findingRow = ({
  tick,
  label,
  place,
  title,
  colour,
  picked,
  open,
  tags,
  actions,
}) => {
  const k = tokens();
  return (
    h_flex()
      .w_full()
      .items_center()
      .gap(10)
      .px(12)
      .py(8)
      .bg(k.bg1)
      .border(2)
      .border_color(picked ? colour : k.line)
      .when(tick !== null, (el) => el.child(tick ?? div()))
      .child(idBox(label))
      // Its places give way to its title when they are long, cut short: the row opened shows them whole.
      .when(Boolean(place), (el) =>
        el.child(
          text(place, "mono", 13, k.fg)
            .flex_shrink(1)
            .min_w(0)
            .max_w(PLACE_MAX)
            .truncate(),
        ),
      )
      .child(fill(title, "ui", 12, k.muted))
      .children(tags.map((tag) => rowTag(tag.text, tag.colour)))
      .child(icon(open ? ICON.chevronDown : ICON.chevronRight, k.muted))
      .children(actions)
  );
};

/**
 * A box to tick that cannot be ticked now: the view is not waiting for picks.
 * @param {boolean} ticked
 */
export const stillBox = (ticked) => checkBox(ticked).opacity(0.5);

/**
 * @typedef {object} CodeLine
 * @property {number | null} number
 * @property {string} text
 * @property {boolean} [mark] the line the finding is on
 */

/**
 * A few lines of code, numbered, the marked one lit as added.
 * @param {CodeLine[]} lines
 */
export const codeBlock = (lines) => {
  const k = tokens();
  return v_flex()
    .w_full()
    .py(4)
    .bg(k.bg0)
    .border(1)
    .border_color(k.line)
    .children(
      lines.map((line) =>
        h_flex()
          .w_full()
          .gap(10)
          .px(10)
          .bg(line.mark ? withAlpha(k.ok, 0.18) : NONE)
          .when(line.number !== null, (el) =>
            el.child(
              div()
                .flex_none()
                .w(36)
                .child(text(String(line.number), "mono", 12, k.muted)),
            ),
          )
          .child(fill(line.text, "mono", 12, k.fg)),
      ),
    );
};

/**
 * A label and its words, side by side: RULE, WHAT HAPPENS, WHAT TO CHANGE.
 * @param {string} label
 * @param {string} words
 */
export const explainedLine = (label, words) => {
  const k = tokens();
  return h_flex()
    .w_full()
    .items_start()
    .gap(16)
    .child(
      div()
        .flex_none()
        .w(130)
        .child(text(label, "display", 8, k.muted)),
    )
    .child(
      div()
        .flex_1()
        .min_w(0)
        .child(wrapped(words, "ui", 13, k.fg)),
    );
};

/**
 * @typedef {object} FindingDetailProps
 * @property {string} rule
 * @property {string} happens
 * @property {string} change
 * @property {CodeLine[]} context
 * @property {string} refactor
 * @property {string[]} where every place it is, whole, a line each, when its row groups several; none otherwise
 */

/**
 * A finding opened: its rule, what happens, what to change, the code around it and the sketch of the change.
 * @param {FindingDetailProps} props
 */
export const findingDetail = ({
  rule,
  happens,
  change,
  context,
  refactor,
  where,
}) =>
  v_flex()
    .w_full()
    .gap(10)
    .px(16)
    .pb(12)
    .pt(4)
    .when(where.length > 0, (el) =>
      el.child(
        h_flex()
          .w_full()
          .items_start()
          .gap(16)
          .child(
            div()
              .flex_none()
              .w(130)
              .child(text("WHERE", "display", 8, tokens().muted)),
          )
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(2)
              .children(
                where.map((place) => wrapped(place, "mono", 12, tokens().fg)),
              ),
          ),
      ),
    )
    .child(explainedLine("RULE", rule))
    .child(explainedLine("WHAT HAPPENS", happens))
    .child(explainedLine("WHAT TO CHANGE", change))
    .when(context.length > 0, (el) => el.child(codeBlock(context)))
    .when(refactor !== "", (el) =>
      el.child(
        codeBlock(
          refactor.split("\n").map((line) => ({ number: null, text: line })),
        ),
      ),
    );

/**
 * A finding's row and, opened, its explanation, in one frame.
 * @param {NativeElement} row
 * @param {NativeElement | null} detail
 * @param {Color} border
 */
export const findingFrame = (row, detail, border) =>
  v_flex()
    .w_full()
    .when(detail !== null, (el) =>
      el
        .bg(tokens().bg1)
        .border(2)
        .border_color(border)
        .child(row)
        .child(detail ?? div()),
    )
    .when(detail === null, (el) => el.child(row));

/**
 * @typedef {object} DraftCardProps
 * @property {string} label [1], [2-6]
 * @property {string} place resize.rs:48 · pane.rs:64
 * @property {number} threads how many threads it publishes, one per location
 * @property {NativeElement} body its text: a field while it can be edited
 * @property {string} suggestion code that replaces the lines, when there is some
 * @property {string[]} flagged words that name AI or its tools, which keep it from the stamp
 * @property {NativeElement | null} drop the control that takes it away, while it can be
 */

/** @param {DraftCardProps} props */
export const draftCard = ({
  label,
  place,
  threads,
  body,
  suggestion,
  flagged,
  drop,
}) => {
  const k = tokens();
  return v_flex()
    .w_full()
    .gap(8)
    .p(12)
    .bg(k.bg2)
    .border(2)
    .border_color(flagged.length > 0 ? k.failed : k.line)
    .child(
      h_flex()
        .items_center()
        .gap(8)
        .child(text(label, "mono", 13, k.fg))
        .child(
          div()
            .flex_1()
            .min_w(0)
            .child(wrapped(place, "mono", 12, k.muted)),
        )
        .when(threads > 1, (el) =>
          el.child(text(`×${threads}`, "display", 9, k.accent)),
        )
        .when(drop !== null, (el) => el.child(drop ?? div())),
    )
    .child(body)
    .when(suggestion !== "", (el) =>
      el.child(
        v_flex()
          .w_full()
          .gap(4)
          .p(10)
          .bg(withAlpha(k.ok, 0.14))
          .border(1)
          .border_color(withAlpha(k.ok, 0.5))
          .child(text("SUGGESTION", "display", 8, k.ok))
          .children(
            suggestion
              .split("\n")
              .map((line) => wrapped(line, "mono", 12, k.fg)),
          ),
      ),
    )
    .when(flagged.length > 0, (el) =>
      el.child(
        wrapped(
          `Names ${flagged.join(", ")}: nothing published may mention AI or its tools. Edit it before the stamp.`,
          "ui",
          11,
          k.failed,
        ),
      ),
    );
};

// The dots after a thinking golem's words, a frame each, natively stepped.
const THINKING = Object.freeze({ dots: ["", ".", "..", "..."], ms: 450 });

/**
 * What the golem is doing while it thinks, in a line, its dots stepping after it (still with the motion off).
 * @param {string} words
 */
export const thinkingLine = (words) => {
  const k = tokens();
  return h_flex()
    .items_end()
    .gap(6)
    .py(6)
    .child(icon(ICON.golem, k.working))
    .child(text(words, "ui", 13, k.working))
    .child(
      motionOn()
        ? text("", "ui", 13, k.working).w(20).frames(THINKING.dots, THINKING.ms)
        : text("...", "ui", 13, k.working).w(20),
    );
};

/**
 * Text that stays as it is: a draft once stamped, a reply with nothing to edit.
 * @param {string} content
 */
export const stillText = (content) => {
  const k = tokens();
  return div()
    .w_full()
    .p(10)
    .bg(k.bg0)
    .border(1)
    .border_color(k.line)
    .child(wrapped(content, "ui", 13, k.fg));
};

/**
 * A check before the stamp: met or not.
 * @param {boolean} met
 * @param {string} content
 */
export const checkLine = (met, content) => {
  const k = tokens();
  return h_flex()
    .items_center()
    .gap(8)
    .child(icon(met ? ICON.ok : ICON.warn, met ? k.ok : k.failed))
    .child(wrapped(content, "ui", 12, met ? k.muted : k.failed));
};

/**
 * A proposal's chip: FIX, REPLY, ASK.
 * @param {Proposal} proposal
 */
export const proposalChip = (proposal) => {
  const colour = proposalColour(proposal);
  return div()
    .flex_none()
    .w(60)
    .py(2)
    .flex()
    .justify_center()
    .border(1)
    .border_color(colour)
    .child(text(PROPOSAL_LABEL[proposal], "display", 9, colour));
};

/**
 * @typedef {object} ThreadCardProps
 * @property {NativeElement} tick
 * @property {string} author
 * @property {string} place
 * @property {string} request what the reviewer asks
 * @property {Proposal} proposal
 * @property {string} detail the change, or the reply's reason
 * @property {string} commit "7c41e2a · fix(ui): … · 52 tests passed", empty before the fix
 * @property {NativeElement | null} reply the reply's draft, a field while it can be edited
 * @property {boolean} picked
 */

/** @param {ThreadCardProps} props */
export const threadCard = ({
  tick,
  author,
  place,
  request,
  proposal,
  detail,
  commit,
  reply,
  picked,
}) => {
  const k = tokens();
  return v_flex()
    .w_full()
    .gap(10)
    .p(14)
    .bg(k.bg1)
    .border(2)
    .border_color(picked ? proposalColour(proposal) : k.line)
    .child(
      h_flex()
        .items_center()
        .gap(10)
        .child(tick)
        .child(idBox((author.at(0) ?? "?").toUpperCase()))
        .child(text(`@${author}`, "ui", 13, k.fg))
        .child(fill(place, "mono", 12, k.muted)),
    )
    .child(
      h_flex()
        .w_full()
        .gap(10)
        .child(div().flex_none().w(3).bg(k.line))
        .child(
          div()
            .flex_1()
            .min_w(0)
            .py(4)
            .child(wrapped(request, "ui", 13, k.fg)),
        ),
    )
    .child(
      h_flex()
        .w_full()
        .items_center()
        .gap(12)
        .child(proposalChip(proposal))
        .child(
          div()
            .flex_1()
            .min_w(0)
            .child(wrapped(detail, "ui", 12, k.muted)),
        ),
    )
    .when(commit !== "", (el) =>
      el.child(fill(`-o- ${commit}`, "mono", 12, k.ok)),
    )
    .when(reply !== null, (el) =>
      el.child(
        v_flex()
          .w_full()
          .gap(6)
          .child(text("REPLY DRAFT", "display", 8, k.muted))
          .child(reply ?? div()),
      ),
    );
};

/** @type {Record<FileStatus, string>} */
const STATUS_TONE_KEY = { A: "ok", D: "failed", M: "needs", R: "accent" };

/**
 * A file's status box: A, M, D, R.
 * @param {FileStatus} status
 */
export const statusBox = (status) => {
  const k = tokens();
  /** @type {Record<string, Color>} */
  const colours = {
    accent: k.accent,
    failed: k.failed,
    needs: k.needs,
    ok: k.ok,
  };
  const colour = colours[STATUS_TONE_KEY[status]] ?? k.muted;
  return div()
    .flex_none()
    .w(22)
    .flex()
    .justify_center()
    .border(1)
    .border_color(colour)
    .child(text(status, "display", 9, colour));
};

/**
 * @typedef {object} FileHeaderProps
 * @property {string} path
 * @property {FileStatus} status
 * @property {number} adds
 * @property {number} dels
 * @property {number} comments
 * @property {boolean} open
 * @property {NativeElement} viewed its box to tick, a control
 */

/** @param {FileHeaderProps} props */
export const fileHeader = ({
  path,
  status,
  adds,
  dels,
  comments,
  open,
  viewed,
}) => {
  const k = tokens();
  return h_flex()
    .size_full()
    .items_center()
    .gap(10)
    .px(12)
    .bg(k.bg2)
    .border(1)
    .border_color(k.line)
    .child(icon(open ? ICON.chevronDown : ICON.chevronRight, k.muted))
    .child(statusBox(status))
    .child(fill(path, "mono", 13, k.fg))
    .when(comments > 0, (el) =>
      el.child(text(`${comments} ✎`, "ui", 12, k.needs)),
    )
    .when(adds > 0, (el) => el.child(text(`+${adds}`, "mono", 12, k.ok)))
    .when(dels > 0, (el) => el.child(text(`-${dels}`, "mono", 12, k.failed)))
    .child(viewed);
};

/**
 * A box to tick and its word: viewed.
 * @param {boolean} ticked
 * @param {string} label
 */
export const tickLabel = (ticked, label) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .items_center()
    .gap(6)
    .px(6)
    .py(2)
    .border(1)
    .border_color(ticked ? k.ok : k.line)
    .child(checkBox(ticked))
    .child(text(label, "ui", 11, ticked ? k.ok : k.muted));
};

/** @param {string} header */
export const hunkHead = (header) => {
  const k = tokens();
  return h_flex()
    .size_full()
    .items_center()
    .px(12)
    .child(fill(header, "mono", 12, k.accent));
};

/** @type {Record<LineKind, string>} */
const SIGN = { add: "+", ctx: " ", del: "-" };

/**
 * @typedef {object} DiffLineProps
 * @property {LineKind} kind
 * @property {number | null} old
 * @property {number | null} new
 * @property {string} text
 * @property {string} [plus] an id for the line, which then shows a + before its numbers under the pointer: a comment
 *   can be written on it. The app follows the pointer only over an element with an id
 */

// The room the + takes before a line's numbers.
const PLUS_WIDTH = 18;

/**
 * One line of a diff: its old and new numbers, its sign and its code, lit green when added, red when removed.
 * forge: long lines are cut at the view's edge; a sideways scroll if they ever matter.
 * @param {DiffLineProps} props
 */
export const diffLine = ({ kind, old, new: now, text: code, plus }) => {
  const k = tokens();
  const tint = {
    add: withAlpha(k.ok, 0.16),
    ctx: NONE,
    del: withAlpha(k.failed, 0.16),
  }[kind];
  const number = (/** @type {number | null} */ value) =>
    div()
      .flex_none()
      .w(44)
      .pr(8)
      .flex()
      .justify_end()
      .child(text(value === null ? "" : String(value), "mono", 12, k.muted));
  const line = h_flex()
    .size_full()
    .items_center()
    .bg(tint)
    .child(number(old))
    .child(number(now))
    .child(
      div()
        .flex_none()
        .w(18)
        .child(
          text(
            SIGN[kind],
            "mono",
            12,
            { add: k.ok, ctx: k.muted, del: k.failed }[kind],
          ),
        ),
    )
    .child(fill(code, "mono", 12, k.fg));
  if (plus === undefined) return line;
  // A hover styles the element it is on and nothing inside it, a text's colour included. So the + is drawn in a sheet
  // over the whole line, see-through until the pointer is over it: the sheet's own opacity is what the hover changes,
  // and what is drawn in it shows with it.
  return h_flex()
    .relative()
    .size_full()
    .pl(PLUS_WIDTH)
    .child(line)
    .child(
      h_flex()
        .id(plus)
        .absolute()
        .inset_0()
        .bg(withAlpha(k.accent, 0.1))
        .opacity(0)
        .hover((style) => style.opacity(1))
        .child(
          h_flex()
            .flex_none()
            .w(PLUS_WIDTH)
            .h_full()
            .items_center()
            .justify_center()
            .bg(k.accent)
            .child(text("+", "mono", 14, k.onAccent)),
        ),
    );
};

/**
 * @typedef {object} CommentBlockProps
 * @property {string} where "round 2 · new line 17"
 * @property {string} body
 * @property {"open" | "sent" | "resolved"} state
 * @property {NativeElement[]} actions
 */

/** @type {Record<CommentBlockProps["state"], string>} */
const COMMENT_STATE = {
  open: "UNRESOLVED",
  resolved: "RESOLVED",
  sent: "SENT",
};

/**
 * A comment under its line: who and where, its state, what it says and what can be done with it.
 * @param {CommentBlockProps} props
 */
export const commentBlock = ({ where, body, state, actions }) => {
  const k = tokens();
  const colour = { open: k.needs, resolved: k.ok, sent: k.accent }[state];
  return h_flex()
    .w_full()
    .pl(100)
    .pr(12)
    .py(6)
    .child(
      v_flex()
        .flex_1()
        .min_w(0)
        .gap(6)
        .p(10)
        .bg(k.bg2)
        .border_l(3)
        .border_color(colour)
        .child(
          h_flex()
            .items_center()
            .gap(8)
            .child(text("you", "ui", 13, k.fg))
            .child(text(where, "ui", 11, k.muted))
            .child(
              div()
                .flex_none()
                .px(5)
                .border(1)
                .border_color(colour)
                .child(text(COMMENT_STATE[state], "display", 8, colour)),
            )
            .child(div().flex_1())
            .children(actions),
        )
        .child(wrapped(body, "ui", 13, k.fg)),
    );
};

/**
 * A round in the strip: R2 open, R1 changes requested, lit when shown.
 * @param {string} label
 * @param {string} note
 * @param {Color} colour
 * @param {boolean} shown
 */
export const roundChip = (label, note, colour, shown) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .items_center()
    .gap(8)
    .px(10)
    .py(4)
    .bg(shown ? withAlpha(colour, 0.12) : NONE)
    .border(2)
    .border_color(shown ? colour : k.line)
    .child(text(label, "display", 10, shown ? colour : k.muted))
    .child(text(note, "ui", 12, shown ? colour : k.muted));
};
