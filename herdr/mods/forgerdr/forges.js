// What a forge's golems do, from its agents' statuses: the gnome's mood and the badge on its tab. Pure: Node tests it
// (test/herdr-mod.test.mjs).

/** @typedef {import("herdr").Status} Status */
/** @typedef {import("./kit/sprites.js").Mood} Mood */
/** @typedef {import("./kit/tokens.js").Tone} Tone */

/**
 * @typedef {object} ForgeState
 * @property {Mood} mood
 * @property {{ content: string, tone: Tone } | undefined} badge
 */

/**
 * Someone waiting on the human wins, then the golems at work, counted, then a finished one.
 * @param {{ status: Status }[]} agents the forge's
 * @returns {ForgeState}
 */
export const forgeState = (agents) => {
  const count = (/** @type {Status} */ status) =>
    agents.filter((agent) => agent.status === status).length;
  if (count("blocked") > 0)
    return { badge: { content: "!", tone: "needs" }, mood: "needs" };
  const working = count("working");
  if (working > 0)
    return {
      badge: { content: String(working), tone: "working" },
      mood: "working",
    };
  if (count("done") > 0)
    return { badge: { content: "✓", tone: "done" }, mood: "done" };
  return { badge: undefined, mood: "idle" };
};
