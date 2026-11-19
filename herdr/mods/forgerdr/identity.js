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

/**
 * A forge's gnome, whole: its hat and the hat's colour, its beard, its eyes and what it wears over them, all from the
 * forge's key, so a forge looks the same on every start and every machine.
 * @param {string} key a project's
 * @returns {Required<Pick<GnomeLook, "accessory" | "beard" | "colour" | "eyes" | "hat">>}
 */
export const gnomeLookOf = (key) => ({
  accessory: pick(key, "accessory", ACCESSORIES),
  beard: pick(key, "beard", Object.values(BEARD)),
  colour: hatColourOf(key),
  eyes: pick(key, "eyes", Object.values(EYES)),
  hat: pick(key, "hat", Object.values(HAT)),
});

/**
 * A forge's gnome's name: the one the human gave it, else its brother's.
 * @param {string} key a project's
 * @param {Record<string, string>} names the human's, by key
 */
export const nameOf = (key, names) => names[key]?.trim() || brotherOf(key);
