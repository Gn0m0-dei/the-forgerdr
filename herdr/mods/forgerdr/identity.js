// A forge's identity from its key, the same on every start and every machine. Pure: Node tests it
// (test/herdr-mod.test.mjs).

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
