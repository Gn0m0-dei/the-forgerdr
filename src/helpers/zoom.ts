import type { CropRect, Size } from "#model/zoom.ts";

// Only whole-number zooms keep the pixel art sharp; a fractional one blurs it.
const SHARP_ZOOMS = new Set([1, 2]);

// The frames that show a crop on small screens keep the screens' own 16:10 shape.
const FRAME_RATIO = 16 / 10;

// Room for the rounding of fractions that sit right on the screen's edge.
const EDGE = 1e-9;

const toPercent = (fraction: number) => `${Math.round(fraction * 1e4) / 100}%`;

/** The CSS transform that fits `crop` of a screen laid out at `screen` into a stage of `stage`. */
export const zoomTransform = (crop: CropRect, screen: Size, stage: Size): string => {
  const zoom = stage.width / (screen.width * crop.scale);
  if (!SHARP_ZOOMS.has(zoom)) {
    throw new Error(`A crop of ${crop.scale} zooms ${zoom}x; only 1x or 2x keeps the pixels sharp.`);
  }
  const shownDown = stage.height / zoom / screen.height;
  if (crop.x < 0 || crop.y < 0 || crop.x + crop.scale > 1 + EDGE || crop.y + shownDown > 1 + EDGE) {
    throw new Error(`A crop at ${crop.x}, ${crop.y} runs off the screen.`);
  }
  return `translate(${-crop.x * screen.width * zoom}px, ${-crop.y * screen.height * zoom}px) scale(${zoom})`;
};

/** CSS custom properties that place `crop` of a screen in a 16:10 frame of any width. */
export const cropVariables = (crop: CropRect, screen: Size): string => {
  const across = 1 / crop.scale;
  const down = (screen.height / screen.width) * FRAME_RATIO;
  return `--crop-width: ${toPercent(across)}; --crop-left: ${toPercent(-crop.x * across)}; --crop-top: ${toPercent(-crop.y * across * down)};`;
};
