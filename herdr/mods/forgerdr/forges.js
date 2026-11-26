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
 * @property {string} repo the repository's common folder: the same for a checkout and its worktrees; a submodule's is
 * inside its superproject's
 * @property {string} top the checkout's folder
 * @property {boolean} linked a worktree, not the main checkout
 * @property {string} branch
 * @property {number} ahead
 * @property {number} behind
 */

/**
 * What a folder outside git holds, as bridges/forge.js reads it: its repositories, by their main checkout's folder.
 * @typedef {{ root: string, repos: string[] }} Folder
 */

/**
 * @typedef {object} Forge
 * @property {string} key its repository; the folder, for a parent folder of repositories; its one space when that is
 * outside git and holds none
 * @property {SpaceInfo} main the space the forge opens on: the parent folder's, else the main checkout's, else its first
 * @property {SpaceInfo[]} spaces the parent folder's first, then the main checkouts', then the worktrees', in the app's
 * order
 */

// A forge's spaces in order: the parent folder (or a space outside git), the main checkouts, the worktrees.
const ORDER = Object.freeze({ folder: 0, linked: 2, main: 1 });

// A submodule keeps its git folder inside its superproject's: under modules, or under a worktree's own modules.
const SUBMODULE = /\/\.git\/(?:worktrees\/[^/]+\/)?modules\/.*$/;

/** @param {PlaceGit} place whether it is a submodule's checkout */
const isSubmodule = (place) => SUBMODULE.test(place.repo);

/**
 * The repository a place belongs to, by its common folder: a submodule belongs to its superproject.
 * @param {PlaceGit} place
 */
const repoOf = (place) => place.repo.replace(SUBMODULE, "/.git");

/** @param {string} repo a repository's common folder; its main checkout's folder */
const checkoutOf = (repo) => repo.replace(/\/\.git$/, "");

/**
 * Whether a space is a parent folder of repositories.
 * @param {string} id the space's
 * @param {Record<string, PlaceGit | null>} git
 * @param {Record<string, Folder>} folders
 */
const holdsRepos = (id, git, folders) =>
  (git[id] ?? null) === null && (folders[id]?.repos.length ?? 0) > 0;

/**
 * The spaces as forges: one per repository, its worktrees and the spaces inside its submodules under it; a parent
 * folder of repositories that is open takes theirs, wherever their worktrees live; any other space outside git is a
 * forge of its own. In the order of each forge's first space.
 * @param {SpaceInfo[]} spaces
 * @param {Record<string, PlaceGit | null>} git by space id
 * @param {Record<string, Folder>} [folders] by space id, the ones outside git on this machine
 * @returns {Forge[]}
 */
export const groupForges = (spaces, git, folders = {}) => {
  /** @type {Map<string, string>} the parent folder open on each repository, by its main checkout's folder */
  const parents = new Map();
  for (const space of spaces) {
    if (!holdsRepos(space.id, git, folders)) continue;
    const folder = folders[space.id];
    for (const repo of folder.repos)
      if (!parents.has(repo)) parents.set(repo, folder.root);
  }
  /** @param {SpaceInfo} space */
  const keyOf = (space) => {
    const place = git[space.id] ?? null;
    if (place === null)
      return holdsRepos(space.id, git, folders)
        ? folders[space.id].root
        : `space:${space.id}`;
    const repo = repoOf(place);
    return parents.get(checkoutOf(repo)) ?? repo;
  };
  /** @param {SpaceInfo} space */
  const rank = (space) => {
    const place = git[space.id] ?? null;
    if (place === null) return ORDER.folder;
    return place.linked ? ORDER.linked : ORDER.main;
  };
  return [...Map.groupBy(spaces, keyOf)].map(([key, members]) => {
    const ordered = members.toSorted((a, b) => rank(a) - rank(b));
    return { key, main: ordered[0], spaces: ordered };
  });
};

/**
 * The spaces whose golems the lanes show, from the space shown: every space of a parent folder's forge, since its
 * agents work across its repositories and their worktrees; in any other forge, the space shown alone. None with no
 * space shown.
 * @param {SpaceInfo[]} spaces
 * @param {Record<string, PlaceGit | null>} git by space id
 * @param {Record<string, Folder>} folders by space id
 * @returns {string[]}
 */
export const lanesSpacesOf = (spaces, git, folders) => {
  const shown = spaces.find((space) => space.active);
  if (shown === undefined) return [];
  const forge = groupForges(spaces, git, folders).find((one) =>
    one.spaces.some((space) => space.id === shown.id),
  );
  return forge !== undefined && holdsRepos(forge.main.id, git, folders)
    ? forge.spaces.map((space) => space.id)
    : [shown.id];
};

/**
 * What each space is called where golems of several are listed together: its repository's name, a submodule's being its
 * superproject's; outside git, the space's own (a parent folder's).
 * @param {SpaceInfo[]} spaces
 * @param {Record<string, PlaceGit | null>} git by space id
 * @returns {Record<string, string>} by space id
 */
export const placeNamesOf = (spaces, git) =>
  Object.fromEntries(
    spaces.map((space) => {
      const place = git[space.id] ?? null;
      return [
        space.id,
        place === null ? space.name : baseName(checkoutOf(repoOf(place))),
      ];
    }),
  );

/**
 * A space inside a submodule, named by its path from the checkout that holds it; by its folder's name when that
 * checkout is not open.
 * @typedef {{ space: SpaceInfo, name: string }} TreeSubmodule
 */

/**
 * A checkout with a space open on it, and the spaces open inside its submodules.
 * @typedef {{ space: SpaceInfo, submodules: TreeSubmodule[] }} TreeCheckout
 */

/**
 * @typedef {object} TreeRepo
 * @property {string} path its main checkout's folder
 * @property {string} name
 * @property {TreeCheckout[]} checkouts the ones open, the main one first
 * @property {TreeSubmodule[]} orphans the spaces inside its submodules whose checkout is not open
 */

/**
 * A forge as the sidebar's tree shows it.
 * @typedef {object} ForgeTree
 * @property {SpaceInfo[]} roots its spaces outside git: the parent folder's, or a forge that is not in git
 * @property {TreeRepo[]} repos a parent folder's, every one, open or not; else the forge's own
 */

/** @param {string} path the last name of a folder's path */
const baseName = (path) => path.slice(path.lastIndexOf("/") + 1);

/**
 * A forge's tree: its parent folder, each repository with its open checkouts, and a space inside a submodule under the
 * checkout that holds it.
 * @param {Forge} forge
 * @param {Record<string, PlaceGit | null>} git by space id
 * @param {Record<string, Folder>} [folders] by space id
 * @returns {ForgeTree}
 */
export const forgeTree = (forge, git, folders = {}) => {
  const placed = forge.spaces.flatMap((space) => {
    const place = git[space.id] ?? null;
    return place === null ? [] : [{ place, space }];
  });
  const checkouts = placed.filter(({ place }) => !isSubmodule(place));
  const submodules = placed.filter(({ place }) => isSubmodule(place));
  /** @param {PlaceGit} place the checkout open on the folder a submodule is in, the deepest one */
  const holderOf = (place) =>
    checkouts
      .filter((checkout) => place.top.startsWith(`${checkout.place.top}/`))
      .toSorted((a, b) => b.place.top.length - a.place.top.length)
      .at(0);
  const held = submodules.map((submodule) => ({
    ...submodule,
    holder: holderOf(submodule.place),
  }));
  const listed = holdsRepos(forge.main.id, git, folders)
    ? folders[forge.main.id].repos
    : [];
  const paths = [
    ...new Set([
      ...listed,
      ...placed.map(({ place }) => checkoutOf(repoOf(place))),
    ]),
  ];
  return {
    repos: paths.map((path) => {
      /** @param {{ place: PlaceGit }} one */
      const mine = ({ place }) => checkoutOf(repoOf(place)) === path;
      return {
        checkouts: checkouts.filter(mine).map(({ place, space }) => ({
          space,
          submodules: held
            .filter((sub) => sub.holder?.space.id === space.id)
            .map((sub) => ({
              name: sub.place.top.slice(place.top.length + 1),
              space: sub.space,
            })),
        })),
        name: baseName(path),
        orphans: held
          .filter((sub) => sub.holder === undefined && mine(sub))
          .map((sub) => ({ name: baseName(sub.place.top), space: sub.space })),
        path,
      };
    }),
    roots: forge.spaces.filter((space) => (git[space.id] ?? null) === null),
  };
};

/**
 * Where the sessions of a repository itself start (a spec session), from the space a forge shows: the main checkout of
 * that space's repository, in the space open on it, else in the space shown. A space outside git is in no repository:
 * no folder, its own space.
 * @param {Forge} forge
 * @param {string} shown the shown space's id
 * @param {Record<string, PlaceGit | null>} git by space id
 * @returns {{ folder: string, space: string }}
 */
export const mainCheckoutOf = (forge, shown, git) => {
  const place = git[shown] ?? null;
  if (place === null) return { folder: "", space: shown };
  const repo = repoOf(place);
  const open = forge.spaces.find((space) => {
    const one = git[space.id] ?? null;
    return (
      one !== null && !one.linked && !isSubmodule(one) && repoOf(one) === repo
    );
  });
  return { folder: checkoutOf(repo), space: open?.id ?? shown };
};

/**
 * What a forge's gnome, its brother and what the human chose for them are kept by, the same whichever of its spaces is
 * open: its repository; outside git, its one space (the folder the
 * app gives a space is where its new terminals start, not where it is).
 * A parent folder of repositories keeps the look its space had before forgerdr grouped them under it: its space's.
 * @param {{ key: string, main: { id: string } }} forge
 */
export const lookKeyOf = ({ key, main }) => {
  if (key.endsWith("/.git")) return checkoutOf(key);
  return key.startsWith("space:") ? key : `space:${main.id}`;
};

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
