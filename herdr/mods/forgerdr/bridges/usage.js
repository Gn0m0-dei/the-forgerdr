// What bin/forge-statusline.sh keeps in ~/.local/state/forgerdr/usage (the status line must be forgerdr's:
// /forgerdr:setup installs it): the subscription's windows (claude.json), their history (history.jsonl) and each herdr
// terminal's session context (sessions/<terminal>.json). The usage bar and the forge heat read them and watch the folder; the
// sidebar reads the contexts for its golems.
import { home, readTextFile, watchFolder } from "herdr";

/** @typedef {import("../usage.js").UsageSample} UsageSample */
/** @typedef {import("../usage.js").UsageSnapshot} UsageSnapshot */

const folder = () => `${home()}/.local/state/forgerdr/usage`;

/**
 * The last windows the status line saw; null before it saw any, or when the file cannot be read.
 * @returns {Promise<UsageSnapshot | null>}
 */
export const readUsage = async () => {
  try {
    const text = await readTextFile(`${folder()}/claude.json`);
    if (text === null) return null;
    // The status line writes this file, always in this shape (bin/forge-statusline.sh).
    const parsed = /** @type {UsageSnapshot} */ (JSON.parse(text));
    return parsed !== null && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * The samples the status line kept, oldest first: a line each, the last 7 days. Empty when there are none.
 * @returns {Promise<UsageSample[]>}
 */
export const readHistory = async () => {
  try {
    const text = await readTextFile(`${folder()}/history.jsonl`);
    return (text ?? "").split("\n").flatMap((line) => {
      try {
        // Each line is one sample bin/forge-statusline.sh wrote.
        const sample = /** @type {UsageSample} */ (JSON.parse(line));
        return typeof sample?.at === "number" ? [sample] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
};

/**
 * How full the Claude sessions' contexts are, by the herdr terminal each runs in ("t5"): percent used and when it was
 * seen. Each session keeps its own file (sessions/<terminal>.json); a terminal without one is left out.
 * @param {string[]} addresses the terminals to read
 * @returns {Promise<Record<string, { used: number, at: number }>>}
 */
export const readContexts = async (addresses) => {
  const read = await Promise.all(
    addresses
      .filter((address) => /^[A-Za-z0-9_-]+$/.test(address))
      .map(async (address) => {
        try {
          const text = await readTextFile(
            `${folder()}/sessions/${address}.json`,
          );
          if (text === null) return null;
          // The status line writes each file whole, always in this shape (bin/forge-statusline.sh).
          const context = /** @type {{ used: number, at: number }} */ (
            JSON.parse(text)
          );
          return typeof context?.used === "number" ? [address, context] : null;
        } catch {
          return null;
        }
      }),
  );
  return Object.fromEntries(read.filter((entry) => entry !== null));
};

/** Resolves when something changes in the usage folder; cancel it when the bar no longer waits. */
export const watchUsage = () => watchFolder(folder());
