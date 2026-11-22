// Text formats every role shares. Pure, with no Intl (herdr's runtime has none): Node tests it
// (test/herdr-mod.test.mjs).

const MODIFIER = Object.freeze({
  alt: "⌥",
  cmd: "⌘",
  ctrl: "⌃",
  option: "⌥",
  shift: "⇧",
  super: "⌘",
});

// The keys a word names, as their keycaps show them.
const KEY_NAME = Object.freeze({
  backspace: "⌫",
  delete: "⌦",
  down: "↓",
  end: "End",
  enter: "⏎",
  escape: "Esc",
  home: "Home",
  left: "←",
  pagedown: "PgDn",
  pageup: "PgUp",
  right: "→",
  space: "Space",
  tab: "⇥",
  up: "↑",
});

/**
 * A count and the word for what it counts, one or many: 1 review, 3 drafts.
 * @param {number} count
 * @param {string} one
 * @param {string} [many]
 */
export const counted = (count, one, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * A key binding as keys.json writes it, a keycap a key: cmd-shift-p is ⌘ ⇧ P, and cmd-- is ⌘ -.
 * @param {string} binding
 */
export const keyCaps = (binding) =>
  // A dash that ends the binding is the minus key, not a joint.
  binding
    .split(/-(?!$)/)
    .map((part) => MODIFIER[part] ?? KEY_NAME[part] ?? part.toUpperCase());

/**
 * A key binding as keys.json writes it, as a keycap reads: cmd-shift-p is ⌘⇧P.
 * @param {string} binding
 */
export const keyLabel = (binding) => keyCaps(binding).join("");
