// What bin/forge-statusline.sh keeps in ~/.local/state/forgerdr/usage (the status line must be forgerdr's:
// /forgerdr:setup installs it): the subscription's windows (claude.json), their history (history.jsonl) and each herdr
// terminal's session context (sessions.json). The usage bar and the forge heat read them and watch the folder; the
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
 * How full each Claude session's context is, by the herdr terminal it runs in ("t5"): percent used and when it was
 * seen. Empty when the status line has not seen one.
 * @returns {Promise<Record<string, { used: number, at: number }>>}
 */
export const readContexts = async () => {
  try {
    const text = await readTextFile(`${folder()}/sessions.json`);
    if (text === null) return {};
    // The status line writes this file, always as an object by terminal (bin/forge-statusline.sh).
    const parsed = /** @type {Record<string, { used: number, at: number }>} */ (
      JSON.parse(text)
    );
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

/** Resolves when something changes in the usage folder; cancel it when the bar no longer waits. */
export const watchUsage = () => watchFolder(folder());
