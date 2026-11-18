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

/** @typedef {import("herdr").SpaceInfo} SpaceInfo */

/**
 * What git says of a space's place, as bridges/git.js publishes it.
 * @typedef {object} PlaceGit
 * @property {string} repo the repository's common folder: the same for a checkout and its worktrees
 * @property {boolean} linked a worktree, not the main checkout
 * @property {string} branch
 * @property {number} ahead
 * @property {number} behind
 */

/**
 * @typedef {object} Forge
 * @property {string} key its repository, or its one space when that is not in git
 * @property {SpaceInfo} main the space the forge opens on: the main checkout's, else its first
 * @property {SpaceInfo[]} spaces the main checkout's first, then its worktrees', in the app's order
 */

/**
 * The spaces as forges: one per repository, its worktrees under it; a space outside git is a forge of its own. In the
 * order of each forge's first space.
 * @param {SpaceInfo[]} spaces
 * @param {Record<string, PlaceGit | null>} git by space id
 * @returns {Forge[]}
 */
export const groupForges = (spaces, git) => {
  const forges = Map.groupBy(
    spaces,
    (space) => git[space.id]?.repo ?? `space:${space.id}`,
  );
  return [...forges].map(([key, members]) => {
    const ordered = members.toSorted(
      (a, b) =>
        Number(git[a.id]?.linked ?? false) - Number(git[b.id]?.linked ?? false),
    );
    return { key, main: ordered[0], spaces: ordered };
  });
};

/**
 * What a forge's gnome and brother are drawn from, the same whichever of its spaces is open: its main checkout's
 * folder (the one the app gives its space before git answers), else its one space's folder, else its name.
 * @param {{ key: string, main: { folder: string, name: string } }} forge
 */
export const lookKeyOf = ({ key, main }) =>
  key.startsWith("space:")
    ? main.folder || main.name
    : key.replace(/\/\.git$/, "");

/**
 * The moves that drop one forge where another is, its spaces together, its main checkout first: as space.move takes
 * them, 1-based, each counting the moves before it. A forge dragged rightwards lands after the one it is dropped on.
 * @param {string[]} order the spaces' ids, in the app's order
 * @param {{ key: string, spaces: { id: string }[] }[]} forges every space's
 * @param {string} from the dragged forge's key
 * @param {string} to the key of the forge it is dropped on
 * @returns {{ id: string, index: number }[]}
 */
export const forgeMoves = (order, forges, from, to) => {
  const keys = forges.map((forge) => forge.key);
  const source = keys.indexOf(from);
  const target = keys.indexOf(to);
  if (source === -1 || target === -1 || source === target) return [];
  const wanted = keys
    .toSpliced(source, 1)
    .toSpliced(target, 0, from)
    .flatMap((key) =>
      forges[keys.indexOf(key)].spaces.map((space) => space.id),
    );
  const ids = [...order];
  /** @type {{ id: string, index: number }[]} */
  const moves = [];
  wanted.forEach((id, index) => {
    const at = ids.indexOf(id);
    if (at === index) return;
    ids.splice(index, 0, ...ids.splice(at, 1));
    moves.push({ id, index: index + 1 });
  });
  return moves;
};

// What each status is called in a forge's words, in the order a forge's line reads.
/** @type {[Status, string][]} */
const STATUS_WORDS = [
  ["working", "forging"],
  ["blocked", "waiting"],
  ["done", "done"],
];

/**
 * What a forge's golems do, in a line: "3 forging · 1 waiting · 1 done"; "no golems at work" when none is.
 * @param {{ status: Status }[]} agents the forge's
 */
export const forgeSummary = (agents) => {
  const parts = STATUS_WORDS.map(([status, word]) => ({
    count: agents.filter((agent) => agent.status === status).length,
    word,
  }))
    .filter(({ count }) => count > 0)
    .map(({ count, word }) => `${count} ${word}`);
  return parts.length > 0 ? parts.join(" · ") : "no golems at work";
};

/**
 * The line under a forge's gnome: its mood and how many golems it has, as "working · 3 golems".
 * @param {{ status: Status }[]} agents the forge's
 */
export const forgeMood = (agents) => {
  const { mood } = forgeState(agents);
  const word =
    { done: "done", needs: "needs you", working: "working" }[mood] ?? "idle";
  return `${word} · ${agents.length} ${agents.length === 1 ? "golem" : "golems"}`;
};
