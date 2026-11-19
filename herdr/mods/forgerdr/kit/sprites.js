// Pixel art from the layers herdr/tools/sprites.mts generates under img/: fixed colours drawn with image(), and one
// colour that changes (a hat, a theme tone) drawn with svg(), which the app tints with the text colour. Sprites only
// scale by whole numbers.
import { div, image, svg } from "gpui-kit";
import { asset } from "../assets.js";
import { ACCESSORY, BEARD, EYES, HAT, MOOD } from "../parts.js";
import { crucible } from "./motion.js";
import { TONE, toneColour } from "./tokens.js";

/** @typedef {import("gpui-kit").Color} Color */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("./tokens.js").Tone} Tone */

export const ICON = Object.freeze({
  add: "add",
  board: "board",
  book: "book",
  branch: "branch",
  chevronDown: "chevron-down",
  chevronLeft: "chevron-left",
  chevronRight: "chevron-right",
  chevronUp: "chevron-up",
  close: "close",
  coal: "coal",
  gnomemark: "gnomemark",
  golem: "golem",
  hammer: "hammer",
  heat: "heat",
  idea: "idea",
  inbox: "inbox",
  lock: "lock",
  manual: "manual",
  notify: "notify",
  ok: "ok",
  pullRequest: "pull-request",
  repo: "repo",
  search: "search",
  server: "server",
  settings: "settings",
  splitDown: "split-down",
  splitRight: "split-right",
  terminal: "terminal",
  trash: "trash",
  warn: "warn",
  worktreeAdd: "worktree-add",
  zoom: "zoom",
});

/** @typedef {typeof ICON[keyof typeof ICON]} IconName */

export { ACCESSORY, BEARD, EYES, HAT, MOOD };

/** @typedef {typeof HAT[keyof typeof HAT]} Hat */
/** @typedef {typeof BEARD[keyof typeof BEARD]} Beard */
/** @typedef {typeof EYES[keyof typeof EYES]} Eyes */
/** @typedef {typeof ACCESSORY[keyof typeof ACCESSORY]} Accessory */
/** @typedef {typeof MOOD[keyof typeof MOOD]} Mood */

// A forge's gnome gets one from its project key.
/** @satisfies {Record<string, { hat: Color, shade: Color }>} */
export const HAT_COLOURS = Object.freeze({
  crimson: Object.freeze({ hat: "#d1394b", shade: "#9e2638" }),
  forest: Object.freeze({ hat: "#3f8f4f", shade: "#2b6337" }),
  indigo: Object.freeze({ hat: "#5b6be0", shade: "#3b47a8" }),
  ochre: Object.freeze({ hat: "#d19a39", shade: "#9e7026" }),
  plum: Object.freeze({ hat: "#9b4bc4", shade: "#6e3390" }),
  teal: Object.freeze({ hat: "#2f9e9a", shade: "#1f6e6b" }),
});

/** @typedef {keyof typeof HAT_COLOURS} HatColour */

/**
 * @typedef {object} GnomeLook
 * @property {Hat} [hat]
 * @property {Beard} [beard]
 * @property {Eyes} [eyes]
 * @property {Accessory} [accessory]
 * @property {Mood} [mood]
 * @property {HatColour} [colour]
 * @property {number} [scale]
 */

// The side of each golem's grid: iron is a main session, clay a subagent, stone a teammate.
export const GOLEM = Object.freeze({ clay: 8, iron: 12, stone: 12 });

/** @typedef {keyof typeof GOLEM} GolemRole */

// Where each golem's chest is, the crucible its context fills: its top-left pixel, its side and its levels.
/** @type {Record<GolemRole, { x: number, y: number, side: number, levels: number }>} */
const CHEST = {
  clay: { levels: 2, side: 2, x: 3, y: 4 },
  iron: { levels: 4, side: 4, x: 4, y: 5 },
  stone: { levels: 4, side: 4, x: 4, y: 5 },
};

/** @type {Record<Tone, string>} */
const GOLEM_MOOD = {
  done: "done",
  failed: "cracked",
  needs: "waiting",
  quiet: "idle",
  working: "forging",
};

// The 8x8 sign beside a gnome or a golem, and the tone its tinted layer takes.
/** @satisfies {Record<string, Tone | null>} */
export const GLYPH = Object.freeze({
  asleep: TONE.quiet,
  flame: null,
  needs: TONE.needs,
  smoke: null,
  spark: TONE.done,
});

/** @typedef {keyof typeof GLYPH} GlyphName */

/**
 * @param {number} width
 * @param {number} height
 * @param {NativeElement[]} layers
 */
const stack = (width, height, layers) =>
  div()
    .flex_none()
    .relative()
    .w(width)
    .h(height)
    .children(
      layers.map((layer) => layer.absolute().top(0).left(0).w(width).h(height)),
    );

// The GNOMEMARK stamp's art (design 05b), its size as herdr/tools/sprites.mts draws it, already tilted.
export const STAMP_ART = Object.freeze({ height: 80, width: 192 });

/**
 * The GNOMEMARK stamp's two layers, to stack at the size its holder gives: its body and its ink.
 * @param {Color} ink
 * @param {Color} body dark and see-through, so the card shows under it
 */
export const stampLayers = (ink, body) => [
  svg(asset("img/stamp/body.svg")).text_color(body),
  svg(asset("img/stamp/ink.svg")).text_color(ink),
];

/**
 * @param {IconName} name
 * @param {Color} colour
 * @param {number} [scale]
 */
export const icon = (name, colour, scale = 1) =>
  svg(asset(`img/icon/${name}.svg`))
    .flex_none()
    .w(12 * scale)
    .h(12 * scale)
    .text_color(colour);

/**
 * An icon to click, as a ✕ or a chevron: wrapped in a div, because the app wires the pointer only on a div, an
 * h_flex, a v_flex or a component such as Button, never on an svg, so a control put on a bare icon never hears a
 * click. The padding gives the pointer a little more room than the icon's 12 pixels.
 * @param {IconName} name
 * @param {Color} colour
 * @param {number} [pad]
 */
export const iconButton = (name, colour, pad = 3) =>
  div().flex_none().p(pad).child(icon(name, colour));

/** @param {GnomeLook} [look] */
export const gnome = ({
  accessory = ACCESSORY.none,
  beard = BEARD.full,
  colour = "crimson",
  eyes = EYES.plain,
  hat = HAT.pointed,
  mood = MOOD.idle,
  scale = 2,
} = {}) => {
  const colours = HAT_COLOURS[colour];
  /** @param {string} file */
  const part = (file) => asset(`img/gnome/${file}.svg`);
  return stack(16 * scale, 16 * scale, [
    image(part(`hat-${hat}`)),
    svg(part(`hat-${hat}-tint`)).text_color(colours.hat),
    svg(part(`hat-${hat}-shade`)).text_color(colours.shade),
    image(part(`face-${eyes}-${mood}`)),
    image(part(`beard-${beard}`)),
    ...(accessory === ACCESSORY.none
      ? []
      : [image(part(`accessory-${accessory}`))]),
  ]);
};

/**
 * @param {GolemRole} role
 * @param {Tone} tone
 * @param {number} [scale]
 * @param {number} [context] its session's context used, in percent: its chest fills as a crucible
 */
export const golem = (role, tone, scale = 2, context) => {
  const side = GOLEM[role] * scale;
  const file = asset(`img/golem/${role}-${GOLEM_MOOD[tone]}`);
  const body = stack(side, side, [
    image(`${file}.svg`),
    svg(`${file}-tone.svg`).text_color(toneColour(tone)),
  ]);
  const chest = CHEST[role];
  const metal =
    context === undefined
      ? null
      : crucible(context, chest.levels, chest.side * scale);
  return metal === null
    ? body
    : body.child(
        metal
          .absolute()
          .left(chest.x * scale)
          .top(chest.y * scale),
      );
};

/**
 * @param {GlyphName} name
 * @param {number} [scale]
 */
export const glyph = (name, scale = 2) => {
  const file = asset(`img/glyph/${name}`);
  const tone = GLYPH[name];
  return stack(8 * scale, 8 * scale, [
    image(`${file}.svg`),
    ...(tone === null
      ? []
      : [svg(`${file}-tone.svg`).text_color(toneColour(tone))]),
  ]);
};

/** @param {number} [scale] */
export const zz = (scale = 2) =>
  stack(16 * scale, 8 * scale, [
    svg(asset("img/glyph/zz-tone.svg")).text_color(toneColour(TONE.quiet)),
  ]);
