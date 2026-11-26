// The forge's sidebar (design 04): its gnome, the tree of the forge the window shows (the repository, its main
// checkout and worktrees, the golems at work in each and their subagents; for a parent folder of repositories, the
// folder with its own golems and every repository under it; a space inside a submodule under the checkout that holds
// it) and the forge's heat at its foot. Narrower
// than a rail, it shows the golems alone (design 04b). Under the gnome, START WORK opens the forge's Start work
// (roles/start.js), a hammer on the rail, and the cog beside it the forge's settings (its gnome's dialog, for now); at its foot, the forge's mode opens the mode dialog (roles/mode.js). A double
// click on the gnome opens its dialog (roles/gnome.js), a right click the forge's menu, as on its tab. A review session
// is drawn as the reviewer golem (specials.js), and once parked behind its view leaves the tree for its PULL REQUESTS
// group, a row each, which a click takes to the review; a security session, parked behind its Security tab, is drawn
// as the warden reading TRIAGE, under the session that launched it, and a click takes to its tab. It also asks git
// about every space's place, which the app does not tell, and publishes it for the top bar (bridges/git.js), keeping
// what it knew until git answers again.
import { h_flex, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { checking, focused, notify, run, spaces, terminals } from "herdr";
import {
  forgeIndexed,
  INDEX_STATE,
  modesSaved,
  readForge,
  readIndex,
  readRepos,
  startIndex,
} from "../bridges/forge.js";
import {
  placeGit,
  publishFolders,
  publishSpacesGit,
  readFolders,
  readSpacesGit,
} from "../bridges/git.js";
import { readGnomes } from "../bridges/gnomes.js";
import { foldSidebar, RAIL } from "../bridges/layout.js";
import { readNames } from "../bridges/names.js";
import { placeOf } from "../bridges/places.js";
import { readReviews } from "../bridges/reviews.js";
import { readAgents, readTerminals } from "../bridges/terminals.js";
import { readContexts } from "../bridges/usage.js";
import {
  forgeMood,
  forgeState,
  forgeTree,
  groupForges,
  knownGit,
  lookKeyOf,
} from "../forges.js";
import { gnomeLookOf, nameOf } from "../identity.js";
import { reviewTabOf } from "../inbox.js";
import { settingsButton, startButton } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { SIGN } from "../kit/motion.js";
import {
  emptyState,
  forgeMode,
  gnomeHeader,
  indexLine,
} from "../kit/panels.js";
import { gnome, golem, ICON, icon, iconButton } from "../kit/sprites.js";
import { BRAND, TONE, tokens, toneOf } from "../kit/tokens.js";
import {
  agentRow,
  prRow,
  pullRequestsRow,
  repoRow,
  subagentRow,
  submoduleRow,
  TREE_STEP,
  worktreeRow,
} from "../kit/tree.js";
import { orphanedReviews, parentOf } from "../lanes.js";
import { modeLabel, shortLabel } from "../modes.js";
import {
  reviewLine,
  reviewLook,
  reviewsOfSpaces,
  rowLook,
  terminalGolem,
  treeLeads,
} from "../specials.js";
import { newWorktreeOn, openForgeMenu } from "./forge-menu.js";
import { openGnome } from "./gnome.js";
import { openMode } from "./mode.js";
import { openNewWorktree } from "./new-worktree.js";
import { openStart } from "./start.js";

/** @typedef {import("herdr").AgentInfo} AgentInfo */
/** @typedef {import("herdr").SpaceInfo} SpaceInfo */
/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../forges.js").Folder} Folder */
/** @typedef {import("../forges.js").PlaceGit} PlaceGit */
/** @typedef {import("../lanes.js").LaneTerminal} LaneTerminal */
/** @typedef {import("../review.js").Review} Review */
/** @typedef {import("./role.js").Role} Role */

// A space git has not answered for yet (a new one) is asked at the next step, not the next poll.
const TIMING = Object.freeze({ fresh: 30_000, poll: 5_000, step: 250 });

// Places asked about together (four git runs each), as the app's space list does.
const AT_ONCE = 6;

// The sign beside the forge's gnome, by its mood; a forge with no golem sleeps.
/** @type {Partial<Record<import("../kit/sprites.js").Mood, import("../kit/motion.js").SignName>>} */
const MOOD_SIGN = Object.freeze({
  asleep: SIGN.zz,
  done: SIGN.spark,
  error: SIGN.smoke,
  needs: SIGN.needs,
  working: SIGN.flame,
});

/** @param {string} branch the work item a branch is for, as #42 */
const itemOf = (branch) => /#\d+/.exec(branch)?.[0];

/** @param {PlaceGit} git ahead and behind its upstream, as ↑2 ↓1 */
const syncOf = (git) =>
  [git.ahead > 0 ? `↑${git.ahead}` : "", git.behind > 0 ? `↓${git.behind}` : ""]
    .filter(Boolean)
    .join(" ") || undefined;

// An agent in a pane gets the focus; a session parked behind its view (a review, a security triage) shows its view's
// tab; any other agent with no pane is peeked at.
/** @param {AgentInfo} agent */
const openAgent = (agent) => {
  const reviewTab = reviewTabOf(agent.address, readTerminals());
  if (agent.pane) run("pane.focus", { terminal: agent.address });
  else if (reviewTab !== "") run("tab.select", { id: reviewTab });
  else run("terminal.peek", { terminal: agent.address });
};

/** @param {AgentInfo} agent */
const agentName = (agent) => agent.title || agent.tab_name;

/**
 * @param {NativeElement} element
 * @param {string} id
 * @param {() => void} action
 */
const clickable = (element, id, action) =>
  element
    .id(id)
    .cursor_pointer()
    .on_click((_event, cx) => {
      cx.stop_propagation();
      action();
    });

/**
 * A row that stands for a space, as the app's own space list does: a click shows it, a double click renames it and a
 * right click opens the forge's menu on it (roles/forge-menu.js: what the app's space menu does, with forgerdr's own
 * worktree dialogs).
 * @param {NativeElement} element
 * @param {string} id
 * @param {string} spaceId
 * @param {(spaceId: string) => void} menu
 */
const spaceRow = (element, id, spaceId, menu) =>
  element
    .id(id)
    .cursor_pointer()
    .on_mouse_down("right", (_event, cx) => {
      cx.stop_propagation();
      menu(spaceId);
    })
    .on_click((event) =>
      event.click_count === 2
        ? run("space.rename", { id: spaceId })
        : run("space.select", { id: spaceId }),
    );

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const sidebar = (cx) => {
  /**
   * What each place is: what git says of it and, outside git on this machine, the repositories its folder holds.
   * @type {Map<string, { git: PlaceGit | null, folder: Folder | undefined, at: number }>}
   */
  const places = new Map();
  /** @type {Set<string>} the places git was asked about, answered or not */
  const tried = new Set();
  /** @type {Record<string, { used: number, at: number }>} each golem's session context, by its terminal */
  let contexts = {};
  /** @type {Review[]} every review kept (bin/forge-pr.sh list), the last list read */
  let reviews = [];
  let width = Number.POSITIVE_INFINITY;

  /** @param {{ on: string | null, where: string }} place */
  const keyOf = ({ on, where }) => `${on ?? ""}|${where}`;

  // Asks git about the places that are new or not asked for a while, a few at a time as the app's space list does (all
  // at once, many spaces run out of open files or past a machine's running commands), then publishes every space's.
  const refresh = async () => {
    const now = Date.now();
    const all = spaces().map((space) => ({
      id: space.id,
      on: space.machine,
      where: placeOf(space),
    }));
    const due = all.filter((place) => {
      const known = places.get(keyOf(place));
      return (
        place.where !== "" &&
        (known === undefined || now - known.at >= TIMING.fresh)
      );
    });
    for (let start = 0; start < due.length; start += AT_ONCE) {
      await Promise.all(
        due.slice(start, start + AT_ONCE).map(async (place) => {
          tried.add(keyOf(place));
          try {
            const git = await placeGit(place.where, place.on);
            // forgerdr's scripts run on this machine alone.
            const repos =
              git === null && place.on === null
                ? await readRepos(place.where)
                : undefined;
            places.set(keyOf(place), {
              at: now,
              // A read that fails keeps what the folder held: its forge does not fall apart until the next one.
              folder:
                repos === undefined
                  ? undefined
                  : repos.state === "ready"
                    ? repos.value.repos.length > 0
                      ? repos.value
                      : undefined
                    : places.get(keyOf(place))?.folder,
              git,
            });
          } catch {
            // The machine is away or git cannot run: asked again next time.
          }
        }),
      );
    }
    // Places no space is in any more are forgotten.
    const current = new Set(all.map(keyOf));
    for (const key of places.keys()) if (!current.has(key)) places.delete(key);
    for (const key of tried) if (!current.has(key)) tried.delete(key);
    /** @type {Map<string, PlaceGit | null>} */
    const fresh = new Map();
    for (const place of all) {
      const known = places.get(keyOf(place));
      if (known !== undefined) fresh.set(place.id, known.git);
    }
    publishSpacesGit(
      knownGit(
        all.map((place) => place.id),
        fresh,
        readSpacesGit(),
      ),
    );
    // A space not asked yet keeps the folder it had, so a start never shows a parent folder's repositories as forges
    // of their own; before the app has its spaces, everything known stays.
    const before = readFolders();
    if (all.length > 0)
      publishFolders(
        Object.fromEntries(
          all.flatMap((place) => {
            const known = places.get(keyOf(place));
            const folder =
              known === undefined ? before[place.id] : known.folder;
            return folder === undefined ? [] : [[place.id, folder]];
          }),
        ),
      );
  };

  // Whether a space waits for git: one in a place git was never asked about (a new space, or one that moved).
  const waiting = () =>
    spaces().some((space) => {
      const where = placeOf(space);
      return where !== "" && !tried.has(keyOf({ on: space.machine, where }));
    });

  /**
   * The mode of each forge shown, by forge key: what forge-start.sh said, when, and the save it had seen.
   * @type {Map<string, { info: import("../bridges/forge.js").ForgeInfo | null, at: number, saved: number }>}
   */
  const modes = new Map();

  /**
   * What a mode is kept by: the space shown as well as its forge, since each repository of a parent folder has its own.
   * @param {{ key: string }} forge
   * @param {{ id: string }} shown
   */
  const modeKey = (forge, shown) => `${forge.key}|${shown.id}`;

  // The forge shown and the space it shows, else null.
  const shownForge = () => {
    const all = spaces();
    const forge = groupForges(all, readSpacesGit(), readFolders()).find((one) =>
      one.spaces.some((space) => space.active),
    );
    const shown = forge?.spaces.find((space) => space.active);
    return forge === undefined || shown === undefined ? null : { forge, shown };
  };

  // Whether the forge shown waits for its mode: never read, kept anew in the mode dialog, or read a while ago.
  const modeDue = () => {
    const now = shownForge();
    if (now === null || now.forge.main.machine !== null) return false;
    const known = modes.get(modeKey(now.forge, now.shown));
    return (
      known === undefined ||
      known.saved !== modesSaved() ||
      Date.now() - known.at >= TIMING.fresh
    );
  };

  /**
   * How the indexing of each forge shown stands, by forge key, as forge-start.sh last said; null while it could not be
   * read.
   * @type {Map<string, import("../bridges/forge.js").IndexInfo | null>}
   */
  const indexes = new Map();
  /** @type {Map<string, string>} what went wrong in each forge's indexing that the human was already told, by key */
  const toldIndexErrors = new Map();

  // Where a forge is indexed from: its parent folder's space, or the checkout shown.
  /** @param {{ forge: import("../forges.js").Forge, shown: SpaceInfo }} now */
  const indexDir = (now) =>
    placeOf(
      (readSpacesGit()[now.forge.main.id] ?? null) === null
        ? now.forge.main
        : now.shown,
    );

  // Whether the forge shown waits for its indexing to be read: never read yet.
  const indexDue = () => {
    const now = shownForge();
    if (now === null || now.forge.main.machine !== null) return false;
    return !indexes.has(now.forge.key);
  };

  /**
   * Keeps what forge-start.sh said of a forge's indexing: a run that ended means its repositories took their folder's
   * key and mode, which are read again; what went wrong in it is told once, since nobody waits on a run of its own.
   * @param {string} key the forge's
   * @param {import("../bridges/forge.js").Loaded<import("../bridges/forge.js").IndexInfo>} read
   */
  const keepIndex = (key, read) => {
    if (read.state !== "ready") {
      // Said once, not at every poll: a read that keeps failing would fill the log.
      if (indexes.get(key) !== null)
        console.error(
          "forgerdr sidebar: the forge's indexing could not be read",
          read,
        );
      indexes.set(key, null);
      return;
    }
    const before = indexes.get(key) ?? null;
    indexes.set(key, read.value);
    if (
      before?.state === INDEX_STATE.indexing &&
      read.value.state !== INDEX_STATE.indexing
    )
      forgeIndexed();
    if (read.value.failed === "") toldIndexErrors.delete(key);
    else if (toldIndexErrors.get(key) !== read.value.failed) {
      toldIndexErrors.set(key, read.value.failed);
      notify({
        body: read.value.failed,
        level: "error",
        title: "The forge was not indexed",
      });
    }
  };

  // Reads the indexing of the forge shown, at every poll: a session can index it too, and it is one quick script.
  const readIndexing = async () => {
    const now = shownForge();
    if (now === null || now.forge.main.machine !== null) return;
    keepIndex(now.forge.key, await readIndex(indexDir(now)));
  };

  /**
   * Starts the indexing of the forge shown, on a click on its "not indexed": a run of its own, whose state the poll
   * follows from then on.
   * @param {Context} click the click's context, which starts the task
   */
  const index = (click) => {
    const now = shownForge();
    if (now === null) return;
    const { key } = now.forge;
    const dir = indexDir(now);
    click.spawn(async (task) => {
      keepIndex(key, await startIndex(dir));
      task.notify();
    });
  };

  // Reads the mode of the forge shown when it is due; a forge on another machine keeps none.
  const readMode = async () => {
    // The modes kept for spaces that are gone are forgotten.
    const open = new Set(spaces().map((space) => space.id));
    for (const key of modes.keys())
      if (!open.has(key.slice(key.lastIndexOf("|") + 1))) modes.delete(key);
    const now = shownForge();
    if (now === null || !modeDue()) return;
    const saved = modesSaved();
    const read = await readForge(placeOf(now.shown));
    modes.set(modeKey(now.forge, now.shown), {
      at: Date.now(),
      info: read.state === "ready" ? read.value : null,
      saved,
    });
  };

  // The review sessions parked behind a view whose tab is gone end with it (lanes.js orphanedReviews): their view does
  // not end them, since herdr closes views on quit too.
  /** @type {Set<string>} */
  let reviewTabs = new Set();
  const sweepReviews = () => {
    const swept = orphanedReviews(readTerminals(), spaces(), reviewTabs);
    reviewTabs = swept.seen;
    for (const address of swept.orphans)
      run("terminal.kill", { terminal: address });
  };

  // A list that cannot be read keeps the last one: the group stays as it was until the next poll.
  const refreshReviews = async () => {
    try {
      reviews = await readReviews();
    } catch (error) {
      console.error("forgerdr sidebar: the reviews could not be listed", error);
    }
  };

  const task = checking()
    ? null
    : cx.spawn(async (cx) => {
        for (;;) {
          sweepReviews();
          await refreshReviews();
          await refresh();
          await readMode();
          await readIndexing();
          contexts = await readContexts(
            readAgents().map((agent) => agent.address),
          );
          cx.notify();
          for (
            let slept = 0;
            slept < TIMING.poll && !waiting() && !modeDue() && !indexDue();
            slept += TIMING.step
          )
            await cx.sleep(TIMING.step);
        }
      });

  /**
   * The golems of one space: its agents, each with what works under it at any depth: the agents it dispatched and the
   * security sessions it launched, theirs in turn, and the subagents inside each one's session (Claude Code's records: a
   * Task, a background shell).
   * @param {SpaceInfo} space
   * @param {AgentInfo[]} everyone
   * @param {Map<string, string | null>} parents
   * @param {string | null} looking the terminal that has the keyboard
   * @param {(agent: AgentInfo) => import("../kit/tokens.js").Tone} toneOfAgent
   * @param {Map<string, LaneTerminal>} byAddress every terminal, for its subagents inside it and its special
   * @param {Review[]} pullRequests the forge's PULL REQUESTS group, whose sessions the tree leaves out
   */
  const golemsOf = (
    space,
    everyone,
    parents,
    looking,
    toneOfAgent,
    byAddress,
    pullRequests,
  ) => {
    const mine = everyone.filter((agent) => agent.space === space.id);
    const agentAddresses = new Set(everyone.map((agent) => agent.address));
    const leads = treeLeads(
      mine.filter(
        (agent) => !agentAddresses.has(parents.get(agent.address) ?? ""),
      ),
      pullRequests,
    );
    /**
     * The subagents inside an agent's session: no terminal of their own, so a click goes to the agent.
     * @param {AgentInfo} owner
     * @param {number} depth
     */
    const inside = (owner, depth) =>
      Object.entries(byAddress.get(owner.address)?.records ?? {}).map(
        ([id, record]) =>
          clickable(
            subagentRow({
              depth,
              name: record.title || "subagent",
              role: "clay",
              tone: toneOf(
                /** @type {import("herdr").Status} */ (
                  record.state ?? "working"
                ),
              ),
            }),
            `subagent-${owner.address}-${id}`,
            () => openAgent(owner),
          ),
      );
    /**
     * What works under an agent, a step further in each level: the agents it dispatched and the security sessions it
     * launched (the warden, reading TRIAGE), each with what works under it in turn (an agent can dispatch agents of its
     * own), then the subagents inside its session.
     * @param {AgentInfo} owner
     * @param {number} depth
     * @param {Set<string>} seen the agents already in the tree above, so two that name each other end
     * @returns {NativeElement[]}
     */
    const under = (owner, depth, seen) => [
      ...everyone
        .filter(
          (agent) =>
            parents.get(agent.address) === owner.address &&
            !seen.has(agent.address),
        )
        .flatMap((sub) => [
          clickable(
            subagentRow({
              ...rowLook(byAddress.get(sub.address)),
              context: contexts[sub.address]?.used,
              depth,
              name: agentName(sub),
              tone: toneOfAgent(sub),
            }),
            `agent-${sub.address}`,
            () => openAgent(sub),
          ),
          ...under(sub, depth + 1, new Set([...seen, sub.address])),
        ]),
      ...inside(owner, depth),
    ];
    return leads.flatMap((lead) => [
      clickable(
        agentRow({
          ...rowLook(byAddress.get(lead.address)),
          context: contexts[lead.address]?.used,
          name: agentName(lead),
          selected: lead.address === looking,
          tone: toneOfAgent(lead),
          unseen: lead.status === "done",
        }),
        `agent-${lead.address}`,
        () => openAgent(lead),
      ),
      ...under(lead, 0, new Set([lead.address])),
    ]);
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const all = spaces();
    const git = readSpacesGit();
    const forge = groupForges(all, git, readFolders()).find((group) =>
      group.spaces.some((space) => space.active),
    );
    const root = v_flex()
      .id("sidebar")
      .size_full()
      .bg(k.chrome)
      .on_size_change((size, cx) => {
        if (width === size.width) return;
        width = size.width;
        cx.notify();
      });
    if (forge === undefined) {
      return root.child(
        emptyState({
          caption: "No forge yet",
          sub: "Open a folder to light one.",
          title: "Nothing burns here.",
        }),
      );
    }
    const everyone = readAgents();
    const forgeAgents = everyone.filter((agent) =>
      forge.spaces.some((space) => space.id === agent.space),
    );
    const terminalList = readTerminals();
    /** @type {Map<string, LaneTerminal>} */
    const byAddress = new Map(
      terminalList.map((terminal) => [terminal.address, terminal]),
    );
    /** @type {Map<string, string | null>} */
    const parents = new Map(
      terminalList.map((terminal) => [terminal.address, parentOf(terminal)]),
    );
    // A golem marked cracked (hooks/golem-state.sh) shows so, whatever herdr says of it.
    const cracked = new Set(
      terminals()
        .filter((terminal) => terminal.labels?.["forge.state"] === "cracked")
        .map((terminal) => String(terminal.address)),
    );
    /** @param {AgentInfo} agent */
    const toneOfAgent = (agent) =>
      cracked.has(agent.address) ? TONE.failed : toneOf(agent.status);
    const focus = focused();
    const looking = focus?.terminal ?? null;
    const key = lookKeyOf(forge);
    // The forge's golems as the forge counts them, a cracked one as cracked.
    const golems = forgeAgents.map((agent) => ({
      status: cracked.has(agent.address) ? "cracked" : agent.status,
    }));
    const state = forgeState(golems);
    const look = { ...gnomeLookOf(key, readGnomes()[key]), mood: state.mood };
    const name = nameOf(key, readNames());

    const shown = forge.spaces.find((space) => space.active) ?? forge.main;
    /**
     * The forge's menu on one of its spaces; its Rename renames that space, as the app's space menu does on a row.
     * @param {string} spaceId
     */
    const menuOn = (spaceId) =>
      openForgeMenu({
        forge: forge.main.name,
        key,
        main: forge.main.id,
        name,
        rename: spaceId,
        space: spaceId,
      });
    const startWork = () => openStart(forge, shown);
    // The forge's indexing, under its gnome's name: none on another machine or before it is read; a click on "not
    // indexed" indexes it.
    const indexOf = () => {
      const info = indexes.get(forge.key) ?? null;
      if (forge.main.machine !== null || info === null) return undefined;
      if (info.state !== INDEX_STATE.none) return indexLine(info.state);
      return control(
        indexLine(info.failed === "" ? "none" : "failed"),
        "forge-index",
        index,
      );
    };
    // The forge's settings: its gnome, for now.
    const editForge = () => openGnome({ forge: forge.main.name, key, name });

    if (width < RAIL) {
      return root
        .items_center()
        .gap(10)
        .py(12)
        .child(
          clickable(
            gnome({ ...look, scale: 2 }),
            "sidebar-unfold",
            foldSidebar,
          ),
        )
        .child(
          clickable(
            div()
              .p(4)
              .border(2)
              .border_color(BRAND.forgeGold)
              .child(icon(ICON.hammer, BRAND.forgeGold)),
            "rail-start-work",
            startWork,
          ),
        )
        .children(
          forgeAgents.map((agent) =>
            clickable(
              golem(
                terminalGolem(byAddress.get(agent.address)),
                toneOfAgent(agent),
                2,
                contexts[agent.address]?.used,
              ),
              `rail-${agent.address}`,
              () => openAgent(agent),
            ),
          ),
        );
    }

    const agentOf = new Map(everyone.map((agent) => [agent.address, agent]));
    const pullRequests = reviewsOfSpaces(
      reviews,
      terminalList,
      all,
      forge.spaces.map((space) => space.id),
    );
    /** @param {Review} review */
    const pullRequestRow = (review) => {
      const agent = agentOf.get(review.terminal);
      const tab = reviewTabOf(review.terminal, terminalList);
      const look = reviewLook(review);
      return clickable(
        prRow({
          chip: look.chip,
          context: contexts[review.terminal]?.used,
          line: reviewLine(review),
          role: look.golem,
          selected: tab === focus?.tab,
          tone: agent === undefined ? TONE.quiet : toneOfAgent(agent),
        }),
        `pull-request-${review.terminal}`,
        () => run("tab.select", { id: tab }),
      );
    };

    /** @param {SpaceInfo} space */
    const golemsIn = (space) =>
      golemsOf(
        space,
        everyone,
        parents,
        looking,
        toneOfAgent,
        byAddress,
        pullRequests,
      );
    /** @param {SpaceInfo} space a checkout's row, by its branch, and its golems */
    const checkoutRows = (space) => {
      const placeGitOf = git[space.id];
      const branch = placeGitOf?.branch ?? space.branch ?? "";
      return [
        spaceRow(
          worktreeRow({
            branch,
            item: itemOf(branch),
            selected: space.active,
            sync: placeGitOf ? syncOf(placeGitOf) : undefined,
          }),
          `space-${space.id}`,
          space.id,
          menuOn,
        ),
        ...golemsIn(space),
      ];
    };
    /** @param {import("../forges.js").TreeSubmodule} submodule its folder, a step in, and the golems at work in it */
    const submoduleRows = ({ name, space }) => [
      v_flex()
        .pl(TREE_STEP)
        .child(
          spaceRow(
            submoduleRow(name, space.active),
            `space-${space.id}`,
            space.id,
            menuOn,
          ),
        )
        .children(golemsIn(space)),
    ];
    /** @param {import("../forges.js").TreeRepo} repo its checkouts open, each with the submodules open in it */
    const repoRows = (repo) => [
      ...repo.checkouts.flatMap((checkout) => [
        ...checkoutRows(checkout.space),
        ...checkout.submodules.flatMap(submoduleRows),
      ]),
      ...repo.orphans.flatMap(submoduleRows),
    ];
    /**
     * @param {string} of the repository it is for
     * @param {() => void} open
     */
    const newWorktree = (of, open) =>
      control(
        div().p(2).child(icon(ICON.add, k.muted)),
        `forge-new-worktree-${of}`,
        open,
      );
    // The tree: a forge of one repository is that repository; a parent folder is a level above its repositories, every
    // one of them, where its own golems hang; a forge outside git is its one row.
    const treeRows = () => {
      const tree = forgeTree(forge, git, readFolders());
      const own = tree.roots.length > 0;
      // Each space outside git has its row (a folder open twice has two); one git has not answered for yet keeps its
      // branch's row, as the app tells it.
      const head = tree.roots.flatMap((space) => [
        spaceRow(
          repoRow(space.name),
          `forge-root-${space.id}`,
          space.id,
          menuOn,
        ),
        ...(git[space.id] === undefined &&
        space.branch !== null &&
        space.branch !== undefined
          ? checkoutRows(space)
          : golemsIn(space)),
      ]);
      if (!own)
        return tree.repos.flatMap((repo) => [
          spaceRow(
            repoRow(
              forge.main.name,
              // The repository's own, even when the one space open is inside a submodule of it.
              newWorktree(repo.path, () =>
                forge.main.machine === null
                  ? openNewWorktree({ dir: repo.path, forge: forge.main.name })
                  : newWorktreeOn(forge.main, forge.main.name),
              ),
            ),
            "forge-repo",
            forge.main.id,
            menuOn,
          ),
          ...repoRows(repo),
        ]);
      return [
        ...head,
        ...tree.repos.map((repo) => {
          const [first] = repo.checkouts;
          // A repository with nothing open opens on its main checkout; one that is open shows it.
          const show = () =>
            first === undefined
              ? run("space.new", { folder: repo.path })
              : run("space.select", { id: first.space.id });
          return v_flex()
            .pl(TREE_STEP)
            .child(
              repoRow(
                repo.name,
                newWorktree(repo.path, () =>
                  openNewWorktree({ dir: repo.path, forge: repo.name }),
                ),
              )
                .id(`forge-repo-${repo.path}`)
                .cursor_pointer()
                .on_mouse_down("right", (_event, cx) => {
                  cx.stop_propagation();
                  if (first !== undefined) menuOn(first.space.id);
                })
                .on_click(show),
            )
            .children(repoRows(repo));
        }),
      ];
    };

    return root
      .child(
        gnomeHeader({
          action: h_flex()
            .gap(6)
            .child(control(settingsButton(), "forge-settings", editForge))
            .child(control(startButton().flex_1(), "start-work", startWork)),
          forge: forge.main.name,
          index: indexOf(),
          look,
          mood: forgeMood(golems),
          name,
          sign: MOOD_SIGN[state.mood],
          tone: state.badge?.tone ?? "quiet",
        })
          .id("gnome-header")
          .relative()
          .on_click((event) => {
            if (event.click_count === 2)
              openGnome({ forge: forge.main.name, key, name });
          })
          .on_mouse_down("right", (_event, cx) => {
            cx.stop_propagation();
            // On the gnome, the menu is the forge's tab's: its Rename renames the forge.
            openForgeMenu({
              forge: forge.main.name,
              key,
              main: forge.main.id,
              name,
              rename: forge.main.id,
              space: shown.id,
            });
          })
          .child(
            clickable(
              iconButton(ICON.chevronLeft, k.muted),
              "sidebar-fold",
              foldSidebar,
            )
              .absolute()
              .top(10)
              .right(10),
          ),
      )
      .child(
        v_flex()
          .id("forge-tree")
          .flex_1()
          .min_h(0)
          .py(8)
          .overflow_y_scrollbar()
          .children(treeRows())
          .when(pullRequests.length > 0, (el) =>
            el
              .child(pullRequestsRow())
              .children(pullRequests.map(pullRequestRow)),
          ),
      )
      .child(
        control(
          forgeMode(
            forge.main.machine !== null
              ? { detail: "on another machine", name: "Unknown" }
              : modes.has(modeKey(forge, shown))
                ? shortLabel(
                    modeLabel(
                      modes.get(modeKey(forge, shown))?.info ?? {
                        mode: "chat",
                      },
                    ),
                  )
                : { detail: "reading the forge…", name: "…" },
          ),
          "forge-mode",
          () => openMode({ dir: placeOf(shown), forge: forge.main.name }),
        ),
      );
  };

  return { close: () => task?.cancel(), render };
};
