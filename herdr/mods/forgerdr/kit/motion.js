// Design 11's motion: signs that step through their frames, stepped and never eased. Each sign is text in the Forgerdr
// Glyphs font, one stacked text per colour layer, stepped natively with .frames(): every view shares the app's one
// clock, so the layers stay together, and nothing runs while the window is not drawn. With motion off, a sign holds
// its resting frame. The frames are drawn in herdr/tools/design/motion-frames.txt.
import { div } from "gpui-kit";
import { GLYPH_FONT, GLYPH_FRAMES } from "./motion-glyphs.js";
import { BRAND, motionOn, tokens } from "./tokens.js";

/** @typedef {import("gpui-kit").Color} Color */
/** @typedef {keyof typeof GLYPH_FRAMES} SignName */

export const SIGN = Object.freeze({
  flame: "flame",
  needs: "needs",
  smoke: "smoke",
  spark: "spark",
  zz: "zz",
});

// How each sign moves: ms a frame shows, the frames in the order they show, and the one it rests on.
/** @type {Record<SignName, { ms: number, order: number[], rest: number }>} */
const MOTION = {
  // 3 frames at 8 fps, looping.
  flame: { ms: 125, order: [0, 1, 2], rest: 1 },
  // A 500 ms blink.
  needs: { ms: 500, order: [0, 1], rest: 0 },
  // 4 frames at 6 fps, looping.
  smoke: { ms: 167, order: [0, 1, 2, 3], rest: 0 },
  // 3 frames, then the last for about two seconds before it sparkles again.
  spark: { ms: 120, order: [0, 1, ...Array(16).fill(2)], rest: 2 },
  // 3 frames at 2 fps, rising.
  zz: { ms: 500, order: [0, 1, 2], rest: 2 },
};

/**
 * The colour of each layer of each sign, by its letter in the design file.
 * @param {ReturnType<typeof tokens>} k
 * @returns {Record<SignName, Record<string, Color>>}
 */
const colours = (k) => ({
  flame: {
    D: BRAND.emberDeep,
    O: BRAND.whiteHot,
    R: BRAND.ember,
    Y: BRAND.emberHot,
  },
  needs: { A: k.needs },
  smoke: { M: BRAND.ash, m: BRAND.smoke },
  spark: { D: k.done, O: BRAND.whiteHot },
  zz: { Z: k.muted },
});

/**
 * A sign of design 11 (the forge flame, the needs-you "!", the done spark, the error smoke, the asleep zZ), 8 pixels a
 * side times scale.
 * @param {SignName} name
 * @param {number} [scale]
 */
export const sign = (name, scale = 2) => {
  const side = 8 * scale;
  const { ms, order, rest } = MOTION[name];
  const palette = colours(tokens())[name];
  const moving = motionOn();
  /** @type {Record<string, string[]>} */
  const layers = GLYPH_FRAMES[name];
  return div()
    .relative()
    .flex_none()
    .w(side)
    .h(side)
    .children(
      Object.entries(layers).map(([letter, frames]) => {
        const layer = div()
          .absolute()
          .top(0)
          .left(0)
          .w(side)
          .h(side)
          .font_family(GLYPH_FONT)
          .text_size(side)
          .line_height(`${side}px`)
          .text_color(palette[letter]);
        return moving
          ? layer.frames(
              order.map((index) => frames[index]),
              ms,
            )
          : layer.child(frames[rest]);
      }),
    );
};
