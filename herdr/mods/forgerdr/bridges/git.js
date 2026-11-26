// What git says of each space's place, which the app does not tell: its repository (so a worktree sits under its
// forge), its checkout's folder, its branch and how far it is from its upstream; and, for a space outside git, the
// repositories its folder holds (so they sit under it), which bin/forge-start.sh tells (bridges/forge.js). Ref-only reads, as the app's own space list makes them, so
// no worktree is scanned. The sidebar's copy reads it and publishes it to every copy through shared state; the top bar
// reads it there. This module is the only writer of the key.
import { exec, setShared, shared } from "herdr";

/** @typedef {import("../forges.js").Folder} Folder */
/** @typedef {import("../forges.js").PlaceGit} PlaceGit */
/** @typedef {Record<string, Folder>} SpacesFolders by space id: the parent folders of repositories, on this machine */
/** @typedef {Record<string, PlaceGit | null>} SpacesGit by space id; null outside git */

const GIT_KEY = "forgerdr.git";

const FOLDERS_KEY = "forgerdr.folders";

const GIT = Object.freeze({ program: "git", timeout: 10_000 });

/** @returns {SpacesGit} */
export const readSpacesGit = () =>
  // Only publishSpacesGit writes the key, always as a SpacesGit.
  /** @type {SpacesGit | null} */ (shared(GIT_KEY)) ?? {};

/** @param {SpacesGit} value */
export const publishSpacesGit = (value) => {
  if (JSON.stringify(value) !== JSON.stringify(readSpacesGit()))
    setShared(GIT_KEY, value);
};

/** @returns {SpacesFolders} */
export const readFolders = () =>
  // Only publishFolders writes the key, always as a SpacesFolders.
  /** @type {SpacesFolders | null} */ (shared(FOLDERS_KEY)) ?? {};

/** @param {SpacesFolders} value */
export const publishFolders = (value) => {
  if (JSON.stringify(value) !== JSON.stringify(readFolders()))
    setShared(FOLDERS_KEY, value);
};

/** @param {import("herdr").ExecResult} result */
const output = (result) => result.stdout.replace(/\n$/, "");

/**
 * The git of a folder, on its machine; null outside git or when git cannot tell.
 * @param {string} cwd
 * @param {string | null} on the machine, null for this one
 * @returns {Promise<PlaceGit | null>}
 */
export const placeGit = async (cwd, on) => {
  const options = { cwd, on, timeout: GIT.timeout };
  /** @param {string[]} args */
  const git = (args) => exec(GIT.program, args, options);
  const [top, common] = await Promise.all([
    git(["rev-parse", "--path-format=absolute", "--show-toplevel"]),
    git(["rev-parse", "--path-format=absolute", "--git-common-dir"]),
  ]);
  if (top.code !== 0 || common.code !== 0) return null;
  const [head, counts] = await Promise.all([
    git(["symbolic-ref", "-q", "HEAD"]),
    git(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]),
  ]);
  const [ahead = 0, behind = 0] =
    counts.code === 0 ? output(counts).trim().split(/\s+/).map(Number) : [];
  const repo = output(common);
  return {
    ahead,
    behind,
    branch:
      head.code === 0
        ? output(head).replace(/^refs\/heads\//, "")
        : "(detached)",
    linked: repo !== `${output(top)}/.git`,
    // Two machines can hold the same path.
    repo: on === null ? repo : `${on}:${repo}`,
    top: output(top),
  };
};
