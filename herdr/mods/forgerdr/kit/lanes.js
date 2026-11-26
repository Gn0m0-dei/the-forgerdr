// The golem lanes' pieces (design 04): their head and a lane, a golem a session spawned.
import { h_flex } from "gpui-base";
import { div } from "gpui-kit";
import { agentChip } from "./chips.js";
import { steppedBar } from "./meters.js";
import { golem, ICON, icon } from "./sprites.js";
import { fill, text } from "./text.js";
import { tokens, toneColour } from "./tokens.js";

/** @typedef {import("./tokens.js").Tone} Tone */

/**
 * The lanes' head: the arrow that unfolds them (up, folded) or folds them (down), and how many golems there are.
 * @param {{ count: number, open: boolean }} props
 */
export const lanesHead = ({ count, open }) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .items_center()
    .gap(10)
    .px(16)
    .h(34)
    .child(
      icon(open ? ICON.chevronDown : ICON.chevronUp, count > 0 ? k.fg : k.bg3),
    )
    .child(text("GOLEM LANES", "display", 9, k.muted))
    .child(text(`· ${count}`, "display", 9, count > 0 ? k.fg : k.muted));
};

// The room a lane's place takes, before its name; a longer one is cut short.
const PLACE_WIDTH = 96;

/**
 * @typedef {object} LaneRowProps
 * @property {string} name
 * @property {string} [place] where its session works, when the lanes gather several places: a repository's name
 * @property {string} activity what it is doing now
 * @property {Tone} tone
 * @property {string} time how long it has been at it
 * @property {number} [context] its session's context used, in percent: its crucible, its bar and the percent beside it
 * @property {boolean} [ruled] a line above it, between rows; none when it sits in the head of folded lanes
 * @property {import("./sprites.js").GolemRole} [role] its golem: stone for a teammate, clay for a subagent, the warden
 *   for a security session (specials.js golemOf)
 * @property {string} [chip] what its chip reads, else its status (AGENT_LABEL): TRIAGE for a security session
 */

/** @param {LaneRowProps} props */
export const laneRow = ({
  name,
  place,
  activity,
  tone,
  time,
  context,
  ruled = true,
  role = "clay",
  chip,
}) => {
  const k = tokens();
  return h_flex()
    .flex_none()
    .items_center()
    .gap(16)
    .px(16)
    .h(34)
    .when(ruled, (el) => el.border_t(1).border_color(k.line))
    .child(golem(role, tone, 2, context))
    .when(place !== undefined, (el) =>
      el.child(
        div()
          .flex_none()
          .w(PLACE_WIDTH)
          .child(fill((place ?? "").toUpperCase(), "display", 9, k.muted)),
      ),
    )
    .child(
      div()
        .flex_none()
        .w(170)
        .child(fill(name, "ui", 13, k.fg)),
    )
    .child(fill(activity, "mono", 12, k.muted))
    .child(
      div()
        .flex_none()
        .w(164)
        .child(
          context === undefined
            ? ""
            : h_flex()
                .items_center()
                .gap(8)
                .child(
                  steppedBar({
                    colour: toneColour(tone),
                    gap: 2,
                    height: 10,
                    share: context / 100,
                    steps: 12,
                    width: 8,
                  }),
                )
                .child(text(`${Math.round(context)}%`, "mono", 12, k.muted)),
        ),
    )
    .child(
      div()
        .flex_none()
        .w(64)
        .flex()
        .justify_end()
        .child(text(time, "mono", 12, k.muted)),
    )
    .child(
      div().flex_none().w(76).flex().justify_end().child(agentChip(tone, chip)),
    );
};
