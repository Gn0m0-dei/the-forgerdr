// image() and svg() take a path from the app's home, and a mod cannot tell which folder it runs from: the same files
// run as forgerdr (installed) and forgerdr-dev (a checkout's copy), so bin/forge-herdr-install.sh writes name.js into
// each with that folder's name.
import { MOD } from "./name.js";

export const asset = (file) => `mods/${MOD}/${file}`;
