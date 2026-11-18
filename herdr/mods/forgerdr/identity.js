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
