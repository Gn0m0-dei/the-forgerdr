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

/**
 * A key binding as keys.json writes it, as a keycap reads: cmd-shift-p is ⌘⇧P.
 * @param {string} binding
 */
export const keyLabel = (binding) =>
  binding
    .split("-")
    .map((part) => MODIFIER[part] ?? part.toUpperCase())
    .join("");
