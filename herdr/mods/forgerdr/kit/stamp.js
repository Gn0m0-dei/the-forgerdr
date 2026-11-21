// The GNOMEMARK stamp over a whole view (design 05b, after the mark), as the review views stamp a publish or an
// approval: raised over the view, it lands with a spring and the stamp's thump, stays a moment and lifts. The inbox's
// cards keep their own, which slides off with the card.
import { h_flex } from "gpui-base";
import { div } from "gpui-kit";
import { STAMP_ART, stampLayers } from "./sprites.js";
import { motionOn, tokens, withAlpha } from "./tokens.js";

/** @typedef {import("gpui-kit").Context} Context */

export const STAMP_PHASE = Object.freeze({
  landed: "landed",
  none: "none",
  raised: "raised",
});

/** @typedef {typeof STAMP_PHASE[keyof typeof STAMP_PHASE]} StampPhase */

// Its life, in ms, and its size: raised half again as big, it lands at its own and springs a little.
const STAMP = Object.freeze({
  hold: 900,
  land: 60,
  raised: 1.5,
  scale: 1.4,
  spring: { damping: 0.5, response: 170 },
  veil: 0.4,
});

/**
 * Brings the stamp down over the view: `turn` sets the phase the view draws, `play` sounds the thump as it lands. With
 * the motion off, only the thump.
 * @param {Context} cx
 * @param {(phase: StampPhase) => void} turn
 * @param {() => void} play
 */
export const landStamp = (cx, turn, play) => {
  if (!motionOn()) {
    play();
    return;
  }
  turn(STAMP_PHASE.raised);
  cx.timer.after(STAMP.land, (task) => {
    turn(STAMP_PHASE.landed);
    play();
    task.notify();
  });
  cx.timer.after(STAMP.land + STAMP.hold, (task) => {
    turn(STAMP_PHASE.none);
    task.notify();
  });
};

/**
 * The stamp over the view, for a view that is relative; nothing to draw at none.
 * @param {string} id
 * @param {StampPhase} phase
 */
export const stampOver = (id, phase) => {
  const k = tokens();
  const raised = phase === STAMP_PHASE.raised;
  const size = STAMP.scale * (raised ? STAMP.raised : 1);
  return h_flex()
    .id(`${id}-over`)
    .absolute()
    .top(0)
    .left(0)
    .size_full()
    .items_center()
    .justify_center()
    .bg(withAlpha(k.bg0, STAMP.veil))
    .child(
      div()
        .id(`${id}-art`)
        .flex_none()
        .relative()
        .w(STAMP_ART.width * size)
        .h(STAMP_ART.height * size)
        .spring("width", STAMP.spring)
        .spring("height", STAMP.spring)
        .opacity(raised ? 0 : 1)
        .transition("opacity", STAMP.land)
        .children(
          stampLayers(k.done, withAlpha(k.bg0, 0.85)).map((layer) =>
            layer.absolute().top(0).left(0).size_full(),
          ),
        ),
    );
};
