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
 * Someone waiting on the human wins, then a golem cracked by an API error, then the golems at work, counted, then a
 * finished one; a forge with no golem sleeps.
 * @param {{ status: string }[]} agents the forge's, cracked ones with status "cracked" (hooks/golem-state.sh)
 * @returns {ForgeState}
 */
export const forgeState = (agents) => {
  const count = (/** @type {string} */ status) =>
    agents.filter((agent) => agent.status === status).length;
  if (agents.length === 0) return { badge: undefined, mood: "asleep" };
  if (count("blocked") > 0)
    return { badge: { content: "!", tone: "needs" }, mood: "needs" };
  if (count("cracked") > 0)
    return { badge: { content: "×", tone: "failed" }, mood: "error" };
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
 * What a forge's gnome, its brother and what the human chose for them are kept by, the same whichever of its spaces is
 * open: its repository; outside git, its one space (the folder the app gives a space is where its new terminals
 * start, not where it is).
 * @param {{ key: string }} forge
 */
export const lookKeyOf = ({ key }) => key.replace(/\/\.git$/, "");

/**
 * What git says of each space, to publish: the answer for a space asked now (null outside git), else the last one
 * known, so a start or a slow git never shows a forge without its repository; a space never asked has none yet.
 * Before the app has its spaces, everything known stays.
 * @param {string[]} ids the spaces', now
 * @param {Map<string, PlaceGit | null>} fresh by space id, the ones asked
 * @param {Record<string, PlaceGit | null>} known the last published
 * @returns {Record<string, PlaceGit | null>}
 */
export const knownGit = (ids, fresh, known) =>
  ids.length === 0
    ? known
    : Object.fromEntries(
        ids.flatMap((id) => {
          const answer = fresh.get(id);
          if (answer !== undefined) return [[id, answer]];
          return id in known ? [[id, known[id]]] : [];
        }),
      );

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

/**
 * The line under a forge's gnome: its mood and how many golems it has, as "working · 3 golems".
 * @param {{ status: string }[]} agents the forge's
 */
export const forgeMood = (agents) => {
  const { mood } = forgeState(agents);
  const word =
    {
      asleep: "asleep",
      done: "done",
      error: "cracked",
      needs: "needs you",
      working: "working",
    }[mood] ?? "idle";
  return `${word} · ${agents.length} ${agents.length === 1 ? "golem" : "golems"}`;
};

/**
 * The golems an API error cracked: the terminals hooks/golem-state.sh labels so, by address.
 * @param {{ address: string, labels?: Record<string, string> }[]} terminals
 */
export const crackedOf = (terminals) =>
  new Set(
    terminals
      .filter((terminal) => terminal.labels?.["forge.state"] === "cracked")
      .map((terminal) => terminal.address),
  );

/**
 * The golems cracked now and not at the last look, in their order now.
 * @param {Set<string>} before
 * @param {Set<string>} now
 */
export const newlyCracked = (before, now) =>
  [...now].filter((address) => !before.has(address));
