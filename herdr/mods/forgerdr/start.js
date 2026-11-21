// What the Start work dialog (roles/start.js) starts: a forge's work as its mode takes it (issues, work items, OpenSpec
// changes, ideas), the pull requests to review, the preview of what each line starts, and the sessions that start
// them, which run the forgerdr skills a human would type. Pure: Node tests it (test/herdr-mod.test.mjs).
import { backlogOf, backlogParts, MODE, modeKind } from "./modes.js";

/**
 * A pasted line that names a pull request or a work item.
 * @typedef {object} Link
 * @property {"github" | "gitlab" | "azure"} provider
 * @property {"pr" | "item"} kind
 * @property {string} id
 * @property {string} url as pasted, without its query or fragment
 * @property {string} [project] GitHub and GitLab: owner/repo or group/.../repo
 * @property {string} [org] Azure DevOps: https://dev.azure.com/<org>, lowercase
 * @property {string} [repo] its repository's name; an Azure work item has none
 */

/** @typedef {{ kind: "skip", line: string, reason: string }} Skipped */

/**
 * What forge-start.sh info says of a forge's origin.
 * @typedef {object} Origin
 * @property {string} provider github, gitlab, azure, unknown or none
 * @property {string} [project]
 * @property {string} [org]
 * @property {string} [repo]
 */

/**
 * Where the work items start and how far they go alone: here, in the checkout shown, or each in a worktree of its own,
 * whose dev server starts with it unless dev is off; manual stops for the human at every step, auto only at the gates.
 * @typedef {{ where: "here" | "worktrees", flow: "manual" | "auto", dev: boolean }} Way
 */

/**
 * A row of the preview: a change, an item or a pull request that starts, with what starts it, or a skipped line.
 * @typedef {object} PreviewRow
 * @property {"change" | "item" | "pr" | "skip"} kind
 * @property {string} label
 * @property {string} action
 * @property {string} [value] what the skill is given: a change's name or a URL
 */

/**
 * A session to open, as a tab running its argv.
 * @typedef {{ name: string, argv: string[], main?: boolean }} Launch
 */

const AZURE_HOST =
  /^https?:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\//;
const AZURE_LEGACY =
  /^https?:\/\/([^./]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\//;

/** @param {string} text */
const decoded = (text) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/**
 * A pasted line read as a pull request or a work item, or why it is skipped.
 * @param {string} line
 * @returns {Link | Skipped}
 */
export const linkOf = (line) => {
  const given = line.trim();
  const url = given.replace(/[?#].*$/, "");
  const github =
    /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)\/?$/.exec(
      url,
    );
  if (github !== null) {
    const [, owner, repo, kind, id] = github;
    return {
      id,
      kind: kind === "pull" ? "pr" : "item",
      project: `${owner}/${repo}`,
      provider: "github",
      repo,
      url,
    };
  }
  const gitlab =
    /^https?:\/\/[^/]*gitlab[^/]*\/(.+?)\/-\/(merge_requests|issues)\/(\d+)\/?$/.exec(
      url,
    );
  if (gitlab !== null) {
    const [, project, kind, id] = gitlab;
    return {
      id,
      kind: kind === "merge_requests" ? "pr" : "item",
      project,
      provider: "gitlab",
      repo: project.split("/").at(-1) ?? project,
      url,
    };
  }
  const azure = AZURE_HOST.exec(url) ?? AZURE_LEGACY.exec(url);
  if (azure !== null) {
    const org = `https://dev.azure.com/${azure[1].toLowerCase()}`;
    const rest = url.slice(azure[0].length);
    const pr = /^_git\/([^/]+)\/pullrequest\/(\d+)\/?$/.exec(rest);
    if (pr !== null)
      return {
        id: pr[2],
        kind: "pr",
        org,
        provider: "azure",
        repo: decoded(pr[1]),
        url,
      };
    const item = /^_workitems\/edit\/(\d+)\/?$/.exec(rest);
    if (item !== null)
      return { id: item[1], kind: "item", org, provider: "azure", url };
  }
  return { kind: "skip", line: given, reason: "not a supported URL" };
};

/**
 * Whether a link is the forge's to start: a pull request or an issue of its repository, or a work item of any Azure
 * DevOps organization when the forge is on Azure DevOps (forgerdr names an item of another organization EXT-<id>).
 * @param {Link} link
 * @param {Origin} origin
 */
export const belongsTo = (link, origin) => {
  if (link.provider !== origin.provider) return false;
  const same = (
    /** @type {string | undefined} */ a,
    /** @type {string | undefined} */ b,
  ) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase() && a !== undefined;
  if (link.provider === "azure")
    return (
      link.kind === "item" ||
      (same(link.org, origin.org) && same(link.repo, origin.repo))
    );
  return same(link.project, origin.project);
};

/** @param {Link} link */
const labelOf = (link) =>
  link.provider === "azure" && link.kind === "item"
    ? `AB#${link.id}`
    : `${link.repo}#${link.id}`;

/**
 * The flags of the skill that works the items, as typed after its name: a worktree's dev server only matters there.
 * @param {Way} way
 */
const wayFlags = ({ flow, where, dev }) =>
  `${flow === "auto" ? " --auto" : ""}${where === "worktrees" && !dev ? " --no-dev" : ""}`;

/** @param {Way} way */
const workAction = (way) =>
  `${way.where === "worktrees" ? "worktree · /forgerdr:worktree" : "here · /forgerdr:workitem"}${wayFlags(way)}`;

/** @param {boolean | undefined} mine */
const reviewAction = (mine) =>
  `review · /forgerdr:review${mine === undefined ? "" : mine ? "-own" : "-other"}`;

/**
 * The changes picked in an OpenSpec forge, each worked as the way says.
 * @param {string[]} names
 * @param {Way} way
 * @returns {PreviewRow[]}
 */
export const changeRows = (names, way) =>
  names.map((name) => ({
    action: workAction(way),
    kind: "change",
    label: name,
    value: name,
  }));

/**
 * The lines of a text, trimmed, without the empty ones.
 * @param {string} text
 */
const linesOf = (text) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

/**
 * A work item's or an issue's URL from its number, in a forge's backlog; empty without one.
 * @param {import("./modes.js").ModeKind} kind
 * @param {string} backlog
 * @param {string} id
 */
const itemUrl = (kind, backlog, id) => {
  if (backlog === "") return "";
  if (kind === MODE.azure) return `${backlog}/_workitems/edit/${id}`;
  return kind === MODE.gitlab
    ? `${backlog}/-/issues/${id}`
    : `${backlog}/issues/${id}`;
};

/**
 * A forge's work as its mode takes it, a line each, with what starts it: on GitHub and GitLab the issues of its
 * backlog by URL or number (#12), on Azure DevOps its work items by URL or id (1234, AB#1234), a number completed with
 * the backlog (modes.js). A line it cannot start is skipped and says why; an item given twice starts once.
 * @param {string} text
 * @param {import("./modes.js").ModeInfo & Origin & { host?: string }} info
 * @param {Way} way
 * @returns {PreviewRow[]}
 */
export const workRows = (text, info, way) => {
  const kind = modeKind(info.mode);
  const azure = kind === MODE.azure;
  const backlog = backlogOf(info);
  // The repository the issues are of, as a link names it.
  const home = { project: backlogParts(backlog).path, provider: kind };
  const what = azure ? "a work item URL or id" : "an issue URL or number";
  /** @type {PreviewRow[]} */
  const rows = [];
  const seen = new Set();
  /** @param {Link} link */
  const add = (link) => {
    if (seen.has(link.url)) return;
    seen.add(link.url);
    rows.push({
      action: workAction(way),
      kind: "item",
      label: labelOf(link),
      value: link.url,
    });
  };
  for (const line of linesOf(text)) {
    const id = (azure ? /^(?:AB)?#?(\d+)$/i : /^#?(\d+)$/).exec(line)?.[1];
    if (id !== undefined) {
      const link = linkOf(itemUrl(kind, backlog, id));
      if (link.kind !== "skip") {
        add(link);
        continue;
      }
    }
    const link = linkOf(line);
    if (link.kind === "skip") {
      rows.push({ action: `not ${what}`, kind: "skip", label: line });
    } else if (link.kind === "pr") {
      rows.push({
        action: "a pull request: review it in Review",
        kind: "skip",
        label: labelOf(link),
      });
    } else if (azure ? link.provider !== "azure" : !belongsTo(link, home)) {
      rows.push({
        action: azure
          ? `not ${what}`
          : "another repository: start it from its forge",
        kind: "skip",
        label: labelOf(link),
      });
    } else {
      add(link);
    }
  }
  return rows;
};

/**
 * The pull requests to review, a URL a line, of any provider whatever the forge's mode: the review picks its CLI by
 * the URL. A line that is not a pull request is skipped and says why.
 * @param {string} text
 * @returns {PreviewRow[]}
 */
export const reviewRows = (text) => {
  /** @type {PreviewRow[]} */
  const rows = [];
  const seen = new Set();
  for (const line of linesOf(text)) {
    const link = linkOf(line);
    if (link.kind === "skip") {
      rows.push({ action: link.reason, kind: "skip", label: link.line });
      continue;
    }
    if (link.kind !== "pr") {
      rows.push({
        action: "not a pull request: start it in the work tab",
        kind: "skip",
        label: labelOf(link),
      });
      continue;
    }
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    rows.push({
      action: reviewAction(undefined),
      kind: "pr",
      label: labelOf(link),
      value: link.url,
    });
  }
  return rows;
};

/**
 * The session a skill runs in, for work given as one line: its items separated by |.
 * @param {string[]} work
 * @param {Way} way
 * @returns {Launch}
 */
const workLaunch = (work, way) => {
  const skill = way.where === "worktrees" ? "worktree" : "workitem";
  return {
    argv: ["claude", `/forgerdr:${skill}${wayFlags(way)} ${work.join(" | ")}`],
    name: `forgerdr ${skill}`,
  };
};

/**
 * What starts the preview's rows: one session that works the changes and items (as /forgerdr:worktree or
 * /forgerdr:workitem would be typed), and one prompt tab that opens a review per pull request, as the review key does,
 * each in a tab of its own with its view in the copy of the mod given.
 * @param {PreviewRow[]} rows
 * @param {Way} way
 * @param {string} prompt forge-prompt.sh, which runs the reviews and closes its tab
 * @param {string} [mod] the copy of the forgerdr mod the review views run in
 * @returns {Launch[]}
 */
export const startLaunches = (rows, way, prompt, mod) => {
  const given = (/** @type {PreviewRow} */ row) => row.value ?? "";
  const work = rows
    .filter((row) => row.kind === "change" || row.kind === "item")
    .map(given);
  const prs = rows.filter((row) => row.kind === "pr").map(given);
  return [
    ...(work.length === 0 ? [] : [workLaunch(work, way)]),
    ...(prs.length === 0
      ? []
      : [
          {
            argv: [
              "bash",
              prompt,
              "review",
              ...(mod === undefined ? [] : ["--mod", mod]),
              ...prs,
            ],
            name: "forgerdr review",
          },
        ]),
  ];
};

// How long a session's title is, as forgerdr cuts a branch's slug.
const TITLE = 40;

/**
 * A session's title from an idea: its words, cut short at a word under 40 characters (a single long word at 40).
 * @param {string} idea
 */
export const titleOf = (idea) => {
  const words = idea.trim();
  if (words.length <= TITLE) return words;
  const cut = words.slice(0, TITLE + 1).replace(/\s*\S*$/, "");
  return cut === "" ? words.slice(0, TITLE) : cut;
};

/**
 * What starts the ideas: with a spec, a spec session each in the main checkout (/forgerdr:spec); without, one session
 * that works them all, here or in worktrees. An idea is one line, and a | in it would split it in two items.
 * @param {string[]} ideas
 * @param {Way & { spec: boolean }} way
 * @returns {Launch[]}
 */
export const ideaLaunches = (ideas, way) => {
  const clean = ideas
    .map((idea) =>
      idea
        .replace(/\s*\n\s*/g, " ")
        .replaceAll("|", "/")
        .trim(),
    )
    .filter((idea) => idea !== "");
  if (clean.length === 0) return [];
  if (!way.spec) return [workLaunch(clean, way)];
  return clean.map((idea) => {
    const title = titleOf(idea);
    return {
      argv: [
        "env",
        `FORGE_SESSION_TITLE=${title}`,
        "claude",
        `/forgerdr:spec ${idea}`,
      ],
      main: true,
      name: title,
    };
  });
};
