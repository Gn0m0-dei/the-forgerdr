// The names the human gave the forges' gnomes, by forge key, in shared state: every copy shows them at once and they
// last across restarts. The rename dialog (roles/rename.js) is the only writer.
import { setShared, shared } from "herdr";

const NAMES_KEY = "forgerdr.names";

/** @returns {Record<string, string>} */
export const readNames = () =>
  // Only renameForge writes the key, always as names by key.
  /** @type {Record<string, string> | null} */ (shared(NAMES_KEY)) ?? {};

/**
 * Names a forge's gnome; an empty name gives it back its brother's.
 * @param {string} key the forge's
 * @param {string} name
 */
export const renameForge = (key, name) => {
  const { [key]: _old, ...others } = readNames();
  const trimmed = name.trim();
  setShared(NAMES_KEY, trimmed === "" ? others : { ...others, [key]: trimmed });
};
