// Where this mod's own files are, for image() and svg(), which take a path in the herdr app's home. A mod cannot tell
// which folder it runs from, and the same files run as "forgerdr" (installed) and "forgerdr-dev" (a checkout's copy),
// so bin/forge-herdr-install.sh writes name.js into each with that folder's name.
import { MOD } from "./name.js";

/**
 * The path of a file of this mod, from the herdr app's home: asset("img/gnome.svg").
 * @param {string} file
 */
export const asset = (file) => `mods/${MOD}/${file}`;
