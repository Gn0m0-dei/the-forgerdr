import { h_flex } from "gpui-base";
import { div } from "gpui-kit";
import { agentChip, tag } from "./chips.js";
import { golem, ICON, icon } from "./sprites.js";
import { fill, text } from "./text.js";
import { NONE, tokens } from "./tokens.js";

/** @typedef {import("./tokens.js").Tone} Tone */

/** @param {string} name */
export const repoRow = (name) => {
  const k = tokens();
  return h_flex()
    .items_center()
    .gap(8)
    .px(8)
    .py(5)
    .child(icon(ICON.repo, k.muted))
    .child(text(name.toUpperCase(), "display", 11, k.fg));
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
 */

/** @param {AgentRowProps} props */
export const agentRow = ({ name, tone, selected = false, unseen = false }) => {
  const k = tokens();
  return h_flex()
    .items_center()
    .gap(8)
    .pl(selected ? 24 : 26)
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
    .child(golem("iron", tone, 2))
    .child(fill(name, "ui", 13, k.fg))
    .child(agentChip(tone));
};

/**
 * @typedef {object} SubagentRowProps
 * @property {string} name
 * @property {Tone} tone
 */

/** @param {SubagentRowProps} props */
export const subagentRow = ({ name, tone }) =>
  h_flex()
    .items_center()
    .gap(8)
    .pl(56)
    .pr(8)
    .py(5)
    .child(golem("clay", tone, 2))
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
