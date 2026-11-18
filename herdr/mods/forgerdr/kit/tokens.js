// The design's tokens read from the herdr app's theme, so the look follows the user's theme; the brand's colours
// never do.
import { theme } from "herdr";

/** @typedef {import("gpui-kit").Color} Color */
/** @typedef {import("herdr").Status} Status */

export const FONT = Object.freeze({
  display: "Silkscreen",
  mono: "Maple Mono NF",
  ui: "Pixelify Sans",
});

/** @typedef {keyof typeof FONT} Face */

/** @satisfies {Record<string, Color>} */
export const BRAND = Object.freeze({
  coin: "#f4d35e",
  ember: "#ff6b1a",
  emberDeep: "#b8380c",
  emberHot: "#ffb347",
  forgeGold: "#e5a93b",
  ink: "#0d0d12",
  inkSoft: "#0d0d1266",
});

/** @type {Color} */
export const NONE = "#00000000";

export const TONE = Object.freeze({
  done: "done",
  failed: "failed",
  needs: "needs",
  quiet: "quiet",
  working: "working",
});

/** @typedef {typeof TONE[keyof typeof TONE]} Tone */

export const tokens = () => {
  // The app gives every theme colour as #rrggbb, the form its elements take.
  const t = /** @type {Record<string, Color>} */ (theme());
  return {
    accent: t.accent,
    bg0: t.canvas,
    bg1: t.background,
    bg2: t.surface,
    bg3: t.raised,
    done: t.done,
    failed: t.ansi1,
    fg: t.foreground,
    line: t.border,
    muted: t.muted,
    needs: t.blocked,
    ok: t.ansi2,
    onAccent: t.accent_foreground,
    working: t.working,
  };
};

/**
 * @param {Tone} tone
 * @returns {Color}
 */
export const toneColour = (tone) =>
  tone === TONE.quiet ? tokens().muted : tokens()[tone];

/** @type {Partial<Record<Status | "failed", Tone>>} */
const STATUS_TONE = {
  blocked: TONE.needs,
  done: TONE.done,
  failed: TONE.failed,
  working: TONE.working,
};

/**
 * The tone of an agent status as the herdr app reports it, or forgerdr's own failed.
 * @param {Status | "failed" | null} status
 * @returns {Tone}
 */
export const toneOf = (status) => STATUS_TONE[status] ?? TONE.quiet;

/** @type {Record<Tone, string>} */
export const CHIP_LABEL = {
  done: "DONE ^ ^",
  failed: "CRACKED",
  needs: "NEEDS YOU !",
  quiet: "READY",
  working: "FORGING",
};

/** @type {Record<Tone, string>} */
export const AGENT_LABEL = {
  done: "DONE",
  failed: "CRACKED",
  needs: "NEEDS",
  quiet: "READY",
  working: "FORGING",
};
