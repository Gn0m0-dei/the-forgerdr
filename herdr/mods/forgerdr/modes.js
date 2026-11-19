// How a forge works, its mode, as forgerdr keeps it per project (bin/forge-config.sh): where its work comes from and
// where its design is kept. The sidebar shows it at its foot and the mode dialog (roles/mode.js) sets it; Start work
// (roles/start.js) offers what the mode takes. Where the work comes from, its backlog, is its origin's repository or
// project on the mode's provider unless the forge names another: issues on GitLab for code on GitHub, work items of
// another Azure DevOps project. Pure: Node tests it (test/herdr-mod.test.mjs).

// The kinds of mode; an OpenSpec mode keeps its changes in the repository or in a store (openspec:<store>).
export const MODE = Object.freeze({
  azure: "azure",
  chat: "chat",
  github: "github",
  gitlab: "gitlab",
  openspec: "openspec",
});

/** @typedef {typeof MODE[keyof typeof MODE]} ModeKind */

/**
 * What forge-start.sh info says of a forge, as far as its mode goes.
 * @typedef {object} ModeInfo
 * @property {string} mode chat, openspec, openspec:<store>, azure, github or gitlab
 * @property {string} [provider] its origin's: github, gitlab, azure, unknown or none
 * @property {string} [host] its origin's host
 * @property {string} [project] GitHub and GitLab: owner/repo
 * @property {string} [org] Azure DevOps: https://dev.azure.com/<org>
 * @property {string} [azure_project]
 * @property {string} [backlog] where its work comes from when it is not its origin, as a URL
 * @property {string} [azdospec_backlog] Azure DevOps: the backlog /azdo:init keeps in the clone's git config, as a URL
 */

const AZURE = "https://dev.azure.com/";

// The host a provider's repositories are on when nothing says otherwise.
/** @type {Record<string, string>} */
const HOST = Object.freeze({ github: "github.com", gitlab: "gitlab.com" });

/**
 * The kind of a mode; one this version does not know is chat.
 * @param {string} mode
 * @returns {ModeKind}
 */
export const modeKind = (mode) => {
  if (mode === "openspec" || mode.startsWith("openspec:")) return MODE.openspec;
  /** @type {readonly string[]} */
  const known = Object.values(MODE);
  return known.includes(mode) ? /** @type {ModeKind} */ (mode) : MODE.chat;
};

/**
 * An Azure DevOps organization's name from its URL.
 * @param {string} org https://dev.azure.com/<org>
 */
export const orgName = (org) => org.replace(/^https:\/\/dev\.azure\.com\//, "");

/** @param {string} url without its trailing slash or .git */
const bare = (url) =>
  url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");

/**
 * A backlog's URL, its parts: the host and the path after it.
 * @param {string} url
 */
export const backlogParts = (url) => {
  const [, host = "", path = ""] = /^https:\/\/([^/]+)\/(.+)$/.exec(url) ?? [];
  return { host, path };
};

/**
 * Where a forge's work comes from, as a URL, for a kind of mode (its own by default): on Azure DevOps the backlog
 * /azdo:init keeps first, which the azdospec skills work on; else the backlog the forge names for that kind; else its
 * origin's repository (GitHub, GitLab) or project (Azure DevOps) when the origin is on that provider; empty when none.
 * An Azure DevOps project's name comes encoded, as its URLs carry it.
 * @param {ModeInfo} info
 * @param {ModeKind} [kind]
 */
export const backlogOf = (info, kind = modeKind(info.mode)) => {
  if (kind === MODE.azure && (info.azdospec_backlog ?? "") !== "")
    return bare(info.azdospec_backlog ?? "");
  const own = modeKind(info.mode) === kind ? bare(info.backlog ?? "") : "";
  if (own !== "") {
    if (kind !== MODE.azure) return own;
    const { host, path } = backlogParts(own);
    const [org = "", ...project] = path.split("/");
    return host === "dev.azure.com" && org !== ""
      ? `${AZURE}${org}/${encodeURIComponent(decodeURIComponent(project.join("/")))}`
      : own;
  }
  if (info.provider !== kind) return "";
  if (kind === MODE.azure)
    return info.org === undefined
      ? ""
      : `${info.org}/${encodeURIComponent(info.azure_project ?? "")}`;
  if (kind === MODE.github || kind === MODE.gitlab)
    return info.project === undefined
      ? ""
      : `https://${info.host ?? HOST[kind]}/${info.project}`;
  return "";
};

/**
 * The backlog typed in the mode dialog, as a URL, or null while it names none: a GitHub repository or a GitLab project
 * by any URL in it or as owner/repo (on the origin's host when the origin is on that provider), an Azure DevOps project
 * by any URL in it or as org/project.
 * @param {ModeKind} kind
 * @param {string} typed
 * @param {ModeInfo} info
 * @returns {string | null}
 */
export const backlogTyped = (kind, typed, info) => {
  const given = bare(typed);
  if (kind === MODE.azure) {
    const [, org = "", project = ""] =
      /^https:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)/.exec(given) ??
      /^https:\/\/([^./]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)/.exec(
        given,
      ) ??
      /^([^/\s:]+)\/([^/]+)$/.exec(given) ??
      [];
    return org === "" || project.trim() === ""
      ? null
      : `${AZURE}${org}/${encodeURIComponent(decodeURIComponent(project.trim()))}`;
  }
  if (given.startsWith("https://")) {
    const { host, path } = backlogParts(given);
    // A GitLab project ends where its pages start (/-/); a GitHub repository is its owner and name.
    const parts =
      kind === MODE.gitlab
        ? path.split("/-/")[0].split("/")
        : path.split("/").slice(0, 2);
    return host === "" || parts.length < 2 || parts.some((part) => part === "")
      ? null
      : `https://${host}/${parts.join("/")}`;
  }
  if (!/^[^/\s]+(\/[^/\s]+)+$/.test(given)) return null;
  const host =
    info.provider === kind ? (info.host ?? HOST[kind]) : (HOST[kind] ?? "");
  return `https://${host}/${given}`;
};

/**
 * Where a forge's code is, as its origin says: owner/repo (GitHub, GitLab) or org/project/repo (Azure DevOps); empty
 * without an origin forgerdr reads.
 * @param {ModeInfo & { repo?: string }} info
 */
export const codeOf = (info) => {
  if (info.provider === MODE.azure)
    return `${orgName(info.org ?? "")}/${info.azure_project ?? ""}/${info.repo ?? ""}`;
  return info.project ?? "";
};

/**
 * A mode as the sidebar shows it: its name and where it points, and where the code is too when the work comes from
 * elsewhere (code on GitHub and issues on GitLab, work items of another Azure DevOps project), as the mode dialog shows.
 * @param {ModeInfo & { repo?: string }} info
 * @returns {{ name: string, detail: string, code?: string }}
 */
export const modeLabel = (info) => {
  const kind = modeKind(info.mode);
  const backlog = backlogOf(info);
  const { path } = backlogParts(backlog);
  /**
   * @param {string} name
   * @param {string} none what the detail says without a backlog
   */
  const pointing = (name, none) => {
    const detail = path === "" ? none : decodeURIComponent(path);
    const origin = backlogOf({ ...info, azdospec_backlog: "", backlog: "" });
    return backlog !== "" && backlog !== origin
      ? { code: codeOf(info) || "no origin remote", detail, name }
      : { detail, name };
  };
  switch (kind) {
    case MODE.openspec:
      return {
        detail: info.mode.startsWith("openspec:")
          ? `store ${info.mode.slice("openspec:".length)}`
          : "in this repository",
        name: "OpenSpec",
      };
    case MODE.azure:
      return pointing("Azure DevOps", "no backlog yet");
    case MODE.github:
      return pointing("GitHub", "no repository yet");
    case MODE.gitlab:
      return pointing("GitLab", "no project yet");
    default:
      return { detail: "designs in the conversation", name: "Chat" };
  }
};

/**
 * A mode's label cut to the first part of each place, before its first "/": its organization or owner, as the
 * sidebar's foot has room for.
 * @param {{ name: string, detail: string, code?: string }} label
 * @returns {{ name: string, detail: string, code?: string }}
 */
export const shortLabel = ({ name, detail, code }) => {
  /** @param {string} place */
  const first = (place) => place.split("/")[0] ?? place;
  return code === undefined
    ? { detail: first(detail), name }
    : { code: first(code), detail: first(detail), name };
};
