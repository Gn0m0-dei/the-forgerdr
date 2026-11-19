// The parts a gnome's head is made of and the moods it shows, as the sprite sheet draws them (herdr/tools/sprites.mts).
// Pure, so the sprites (kit/sprites.js) and the identity a forge gets from its key (identity.js) share one list.

export const HAT = Object.freeze({
  cap: "cap",
  floppy: "floppy",
  pointed: "pointed",
});
export const BEARD = Object.freeze({
  forked: "forked",
  full: "full",
  stubble: "stubble",
});
export const EYES = Object.freeze({
  brows: "brows",
  plain: "plain",
  squint: "squint",
});
export const ACCESSORY = Object.freeze({
  eyepatch: "eyepatch",
  goggles: "goggles",
  headphones: "headphones",
  monocle: "monocle",
  none: "none",
});
export const MOOD = Object.freeze({
  asleep: "asleep",
  done: "done",
  error: "error",
  idle: "idle",
  needs: "needs",
  working: "working",
});
