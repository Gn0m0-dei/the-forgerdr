// The security view's triage, through bin/forge-security.sh (a mod cannot list a folder): the audit a security session
// in a herdr terminal runs and what it found, read again on every change in its folder. The format is tested from bash
// (test/security.test.sh).
import { exec, home } from "herdr";
import { ROOT } from "../name.js";
import { followFolder } from "./follow.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Task} Task */
/** @typedef {import("../security.js").Triage} Triage */

const SCRIPT = `${ROOT}/bin/forge-security.sh`;
const TIMEOUT = 10_000;

// forge: the default folder only; a mod cannot read XDG_STATE_HOME or FORGE_SECURITY_DIR, which forge_security_dir
// honours, so with either set the script and the view part ways, as the inbox's do.
const folder = () => `${home()}/.local/state/forgerdr/security`;

/** forge-security.sh show prints the triage as it checked it, or null. @type {(text: string) => Triage | null} */
const parseTriage = JSON.parse;

/**
 * A terminal's triage, or null when it keeps none. Throws, saying why, when it cannot be read.
 * @param {string} terminal
 * @returns {Promise<Triage | null>}
 */
const readSecurity = async (terminal) => {
  const result = await exec("bash", [SCRIPT, "show", terminal], {
    timeout: TIMEOUT,
  });
  if (result.code !== 0)
    throw new Error(
      `forge-security.sh show: ${result.stderr.trim() || `exit ${result.code}`}`,
    );
  return parseTriage(result.stdout);
};

/**
 * Reads a terminal's triage now and again on every change in the folder, handing each read to `take`, until the copy
 * closes.
 * @param {AsyncContext} cx
 * @param {string} terminal
 * @param {(triage: Triage | null) => void} take
 * @returns {Task}
 */
export const followSecurity = (cx, terminal, take) =>
  followFolder(
    cx,
    {
      folder: folder(),
      read: () => readSecurity(terminal),
      what: "the triage",
    },
    take,
  );
