import { h_flex } from "gpui-base";
import { div } from "gpui-kit";
import { agentChip, tag } from "./chips.js";
import { golem, ICON, icon } from "./sprites.js";
import { fill, text } from "./text.js";
import { NONE, tokens } from "./tokens.js";

/** @typedef {import("./tokens.js").Tone} Tone */

/**
 * @param {string} name
 * @param {import("gpui-kit").NativeElement} [action] what the repository offers, after its name: a new worktree
 */
export const repoRow = (name, action) => {
  const k = tokens();
  return h_flex()
    .items_center()
    .gap(8)
    .px(8)
    .py(5)
    .child(icon(ICON.repo, k.muted))
    .child(text(name.toUpperCase(), "display", 11, k.fg))
    .when(action !== undefined, (el) =>
      el.child(div().flex_1()).child(action ?? div()),
    );
};

/**
 * @typedef {object} WorktreeRowProps
 * @property {string} branch
 * @property {string} [item] the work item it is for, as #42
 * @property {number} [port] its dev server's
 * @property {boolean} [dirty] uncommitted changes
 * @property {string} [sync] ahead and behind its upstream, as ↑2 ↓1
 * @property {boolean} [selected]
 */

/** @param {WorktreeRowProps} props */
export const worktreeRow = ({
  branch,
  item,
  port,
  dirty = false,
  sync,
  selected = false,
}) => {
  const k = tokens();
  return h_flex()
    .items_center()
    .gap(8)
    .pl(24)
    .pr(8)
    .py(5)
    .child(icon(ICON.branch, k.muted))
    .child(fill(branch, "ui", 13, selected ? k.fg : k.muted))
    .when(item !== undefined, (el) => el.child(tag(item)))
    .when(port !== undefined, (el) => el.child(tag(`DEV :${port}`, k.working)))
    .when(dirty, (el) => el.child(div().flex_none().w(6).h(6).bg(k.needs)))
    .when(sync !== undefined, (el) =>
      el.child(text(sync, "mono", 11, k.muted)),
    );
};

/**
 * @typedef {object} AgentRowProps
 * @property {string} name
 * @property {Tone} tone
 * @property {boolean} [selected] marked with the accent
 * @property {boolean} [unseen] changed since it was looked at
 * @property {number} [context] its session's context used, in percent: beside the golem, and in its chest
 */

/**
 * How full a golem's session is, in grey before it; the same room when it tells nothing, so the golems line up.
 * @param {number | undefined} context
 */
const contextLabel = (context) =>
  div()
    .flex_none()
    .w(30)
    .flex()
    .justify_end()
    .child(
      context === undefined
        ? ""
        : text(`${Math.round(context)}%`, "ui", 11, tokens().muted),
    );

/** @param {AgentRowProps} props */
export const agentRow = ({
  name,
  tone,
  selected = false,
  unseen = false,
  context,
}) => {
  const k = tokens();
  return h_flex()
    .items_center()
    .gap(8)
    .pl(selected ? 8 : 10)
    .pr(8)
    .py(5)
    .bg(selected ? k.bg3 : NONE)
    .border_l(selected ? 2 : 0)
    .border_color(k.accent)
    .child(
      div()
        .flex_none()
        .w(6)
        .h(6)
        .bg(unseen ? k.accent : NONE),
    )
    .child(contextLabel(context))
    .child(golem("iron", tone, 2, context))
    .child(fill(name, "ui", 13, k.fg))
    .child(agentChip(tone));
};

/**
 * @typedef {object} SubagentRowProps
 * @property {string} name
 * @property {Tone} tone
 * @property {number} [context] its session's context used, in percent
 * @property {import("./sprites.js").GolemRole} [role] stone for an agent in a terminal of its own (a teammate), clay
 *   for a subagent inside its session
 * @property {number} [depth] how far under its session: 1 for one inside an agent that is itself under the session
 */

// How far a row of the tree steps in for each level under its session.
const TREE_STEP = 16;

/** @param {SubagentRowProps} props */
export const subagentRow = ({
  name,
  tone,
  context,
  role = "clay",
  depth = 0,
}) =>
  h_flex()
    .items_center()
    .gap(8)
    .pl(40 + depth * TREE_STEP)
    .pr(8)
    .py(5)
    .child(contextLabel(context))
    .child(golem(role, tone, 2, context))
    .child(fill(name, "ui", 13, tokens().fg))
    .child(agentChip(tone));

/** @param {string} message */
export const warningRow = (message) => {
  const k = tokens();
  return h_flex()
    .items_center()
    .gap(8)
    .pl(40)
    .pr(8)
    .py(5)
    .child(icon(ICON.warn, k.needs))
    .child(fill(message, "ui", 13, k.fg));
};
