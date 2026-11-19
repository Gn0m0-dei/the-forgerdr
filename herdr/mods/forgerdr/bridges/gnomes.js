// What the human chose for the forges' gnomes (a re-roll, parts picked by hand), by forge key, in shared state: every
// copy shows them at once and they last across restarts. The gnome dialog (roles/gnome.js) is the only writer.
import { setShared, shared } from "herdr";

/** @typedef {import("../identity.js").GnomeChoice} GnomeChoice */

const GNOMES_KEY = "forgerdr.gnomes";

/** @returns {Record<string, GnomeChoice>} */
export const readGnomes = () =>
  // Only keepGnome writes the key, always as choices by key; gnomeLookOf drops a part it does not know.
  /** @type {Record<string, GnomeChoice> | null} */ (shared(GNOMES_KEY)) ?? {};

/**
 * Keeps what the human chose for a forge's gnome; an empty choice gives it back the one its key rolls.
 * @param {string} key the forge's
 * @param {GnomeChoice} choice
 */
export const keepGnome = (key, choice) => {
  const { [key]: _old, ...others } = readGnomes();
  setShared(
    GNOMES_KEY,
    Object.keys(choice).length === 0 ? others : { ...others, [key]: choice },
  );
};
