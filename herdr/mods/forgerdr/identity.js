// A forge's identity from its key, the same on every start and every machine. Pure: Node tests it
// (test/herdr-mod.test.mjs).

import { ACCESSORY, BEARD, EYES, HAT } from "./parts.js";

/** @typedef {import("./kit/sprites.js").GnomeLook} GnomeLook */
/** @typedef {import("./kit/sprites.js").HatColour} HatColour */

// In the design's order (03 Sprites, HAT AND APRON COLOURS).
/** @type {HatColour[]} */
const HAT_ORDER = ["crimson", "forest", "indigo", "ochre", "teal", "plum"];

/**
 * djb2, kept to 32 bits.
 * @param {string} key
 */
const hash = (key) =>
  [...key].reduce(
    (value, char) => (value * 33 + char.charCodeAt(0)) >>> 0,
    5381,
  );

/**
 * @param {string} key a project's: its folder, else its name
 * @returns {HatColour}
 */
export const hatColourOf = (key) => HAT_ORDER[hash(key) % HAT_ORDER.length];

// The gnome brothers who run the forges (design 11, GNOME BROTHERS).
const BROTHERS = Object.freeze([
  "Anvilbeard",
  "Bellows",
  "Tongs",
  "Quench",
  "Slag",
  "Flux",
  "Rivet",
  "Ingot",
  "Clinker",
  "Swage",
  "Fuller",
  "Hardy",
  "Temper",
  "Gillet",
  "Cinder",
  "Soot",
  "Pritchel",
  "Mandrel",
  "Drift",
  "Bloom",
  "Tuyère",
  "Crucible",
  "Smelt",
  "Tinder",
  "Hammerhand",
  "Ironside",
  "Scale",
  "Forgewright",
  "Coalbrook",
  "Firestoke",
]);

/**
 * The gnome who runs a forge, as "Brother Anvilbeard". Hashed apart from the hat colour, so two forges with one hat
 * still have two brothers.
 * @param {string} key a project's
 */
export const brotherOf = (key) =>
  `Brother ${BROTHERS[hash(`brother:${key}`) % BROTHERS.length]}`;

/**
 * One of a part's options for a key, hashed apart for each part, so two forges that share one part differ in another.
 * @template T
 * @param {string} key
 * @param {string} part
 * @param {readonly T[]} options
 * @returns {T}
 */
const pick = (key, part, options) =>
  options[hash(`${part}:${key}`) % options.length];

// Most gnomes wear nothing over their eyes: none is twice as likely as each accessory.
const ACCESSORIES = Object.freeze([
  ACCESSORY.none,
  ACCESSORY.none,
  ACCESSORY.goggles,
  ACCESSORY.monocle,
  ACCESSORY.eyepatch,
  ACCESSORY.headphones,
]);

// The parts a gnome is made of, which the human can pick one by one.
export const GNOME_PART = Object.freeze({
  accessory: "accessory",
  beard: "beard",
  colour: "colour",
  eyes: "eyes",
  hat: "hat",
});

/** @typedef {typeof GNOME_PART[keyof typeof GNOME_PART]} GnomePart */

// The parts as the dialog lists them, from the top of the head down.
/** @type {readonly GnomePart[]} */
export const PARTS_DOWN = Object.freeze([
  GNOME_PART.hat,
  GNOME_PART.colour,
  GNOME_PART.eyes,
  GNOME_PART.beard,
  GNOME_PART.accessory,
]);
/** @typedef {Required<Pick<GnomeLook, GnomePart>>} WholeLook */

// Each part's options, in the order the human turns through them.
/** @satisfies {{ [P in GnomePart]: readonly WholeLook[P][] }} */
export const PART_OPTIONS = Object.freeze({
  accessory: Object.freeze(Object.values(ACCESSORY)),
  beard: Object.freeze(Object.values(BEARD)),
  colour: Object.freeze(HAT_ORDER),
  eyes: Object.freeze(Object.values(EYES)),
  hat: Object.freeze(Object.values(HAT)),
});

/**
 * What the human chose for a forge's gnome: a roll other than the key's first (a re-roll), and parts picked by hand
 * over the rolled ones.
 * @typedef {Partial<WholeLook> & { roll?: number }} GnomeChoice
 */

/**
 * A key's gnome at a roll; roll 0 is the one the key has always had.
 * @param {string} key
 * @param {number} roll
 * @returns {WholeLook}
 */
const rolled = (key, roll) => {
  const seed = roll === 0 ? key : `${key}\u0000${roll}`;
  return {
    accessory: pick(seed, "accessory", ACCESSORIES),
    beard: pick(seed, "beard", PART_OPTIONS.beard),
    colour: hatColourOf(seed),
    eyes: pick(seed, "eyes", PART_OPTIONS.eyes),
    hat: pick(seed, "hat", PART_OPTIONS.hat),
  };
};

/**
 * @param {GnomeChoice} choice
 * @returns {number}
 */
const rollOf = (choice) =>
  Number.isInteger(choice.roll) && (choice.roll ?? 0) > 0
    ? (choice.roll ?? 0)
    : 0;

/**
 * A forge's gnome, whole: its hat and the hat's colour, its beard, its eyes and what it wears over them. Rolled from
 * the forge's key, so a forge looks the same on every start and every machine, with what the human chose on top; a
 * part this version does not know is the rolled one.
 * @param {string} key a project's
 * @param {GnomeChoice} [choice] the human's
 * @returns {WholeLook}
 */
export const gnomeLookOf = (key, choice = {}) => {
  const look = rolled(key, rollOf(choice));
  /**
   * @template {GnomePart} P
   * @param {P} part
   */
  const chosen = (part) => {
    const option = choice[part];
    /** @type {readonly unknown[]} */
    const options = PART_OPTIONS[part];
    return option !== undefined && options.includes(option)
      ? option
      : look[part];
  };
  return {
    accessory: chosen(GNOME_PART.accessory),
    beard: chosen(GNOME_PART.beard),
    colour: chosen(GNOME_PART.colour),
    eyes: chosen(GNOME_PART.eyes),
    hat: chosen(GNOME_PART.hat),
  };
};

/**
 * The choice with one part turned to its next option (step 1) or its previous one (step -1), round at the ends.
 * @param {string} key
 * @param {GnomeChoice} choice
 * @param {GnomePart} part
 * @param {1 | -1} step
 * @returns {GnomeChoice}
 */
export const turnPart = (key, choice, part, step) => {
  /** @type {readonly string[]} */
  const options = PART_OPTIONS[part];
  const at = options.indexOf(gnomeLookOf(key, choice)[part]);
  const next = options[(at + step + options.length) % options.length];
  return { ...choice, [part]: next };
};

/**
 * A whole new gnome for the key: the next roll that looks different, without the parts picked by hand.
 * @param {string} key
 * @param {GnomeChoice} choice
 * @returns {GnomeChoice}
 */
export const rerolled = (key, choice) => {
  const now = JSON.stringify(gnomeLookOf(key, choice));
  let roll = rollOf(choice) + 1;
  while (JSON.stringify(rolled(key, roll)) === now) roll += 1;
  return { roll };
};

/**
 * A forge's gnome's name: the one the human gave it, else its brother's.
 * @param {string} key a project's
 * @param {Record<string, string>} names the human's, by key
 */
export const nameOf = (key, names) => names[key]?.trim() || brotherOf(key);
