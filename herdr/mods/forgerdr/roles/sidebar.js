// The forge's sidebar (design 04): its gnome, the tree of the forge the window shows (the repository, its main
// checkout and worktrees, the golems at work in each and their subagents) and the forge's heat at its foot. Narrower
// than a rail, it shows the golems alone (design 04b). Under the gnome, START WORK opens the forge's Start work
// (roles/start.js), a hammer on the rail; at its foot, the forge's mode opens the mode dialog (roles/mode.js). A double click on the gnome opens its dialog (roles/gnome.js), a right click
// the forge's menu, as on its tab. It also asks git about every space's place, which the app does not
// tell, and publishes it for the top bar (bridges/git.js), keeping what it knew until git answers again.
import { v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { checking, focused, run, spaces, terminals } from "herdr";
import { modesSaved, readForge } from "../bridges/forge.js";
import { placeGit, publishSpacesGit, readSpacesGit } from "../bridges/git.js";
import { readGnomes } from "../bridges/gnomes.js";
import { foldSidebar, RAIL } from "../bridges/layout.js";
import { readNames } from "../bridges/names.js";
import { placeOf } from "../bridges/places.js";
import { readAgents, readTerminals } from "../bridges/terminals.js";
import { readContexts } from "../bridges/usage.js";
import {
  forgeMood,
  forgeState,
  groupForges,
  knownGit,
  lookKeyOf,
} from "../forges.js";
import { gnomeLookOf, nameOf } from "../identity.js";
import { reviewTabOf } from "../inbox.js";
import { startButton } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { SIGN } from "../kit/motion.js";
import { emptyState, forgeMode, gnomeHeader } from "../kit/panels.js";
import { gnome, golem, ICON, icon, iconButton } from "../kit/sprites.js";
import { BRAND, TONE, tokens, toneOf } from "../kit/tokens.js";
import { agentRow, repoRow, subagentRow, worktreeRow } from "../kit/tree.js";
import { orphanedReviews, parentOf } from "../lanes.js";
import { modeLabel, shortLabel } from "../modes.js";
import { newWorktreeOn, openForgeMenu } from "./forge-menu.js";
import { openGnome } from "./gnome.js";
import { openMode } from "./mode.js";
import { openStart } from "./start.js";

/** @typedef {import("herdr").AgentInfo} AgentInfo */
/** @typedef {import("herdr").SpaceInfo} SpaceInfo */
/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../forges.js").PlaceGit} PlaceGit */
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

// An agent in a pane gets the focus; a review session parked behind its view shows its view's tab; any other agent
// with no pane is peeked at.
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
  /** @type {Map<string, { git: PlaceGit | null, at: number }>} */
  const places = new Map();
  /** @type {Set<string>} the places git was asked about, answered or not */
  const tried = new Set();
  /** @type {Record<string, { used: number, at: number }>} each golem's session context, by its terminal */
  let contexts = {};
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
            places.set(keyOf(place), {
              at: now,
              git: await placeGit(place.where, place.on),
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

  // The forge shown and the space it shows, else null.
  const shownForge = () => {
    const all = spaces();
    const forge = groupForges(all, readSpacesGit()).find((one) =>
      one.spaces.some((space) => space.active),
    );
    const shown = forge?.spaces.find((space) => space.active);
    return forge === undefined || shown === undefined ? null : { forge, shown };
  };

  // Whether the forge shown waits for its mode: never read, kept anew in the mode dialog, or read a while ago.
  const modeDue = () => {
    const now = shownForge();
    if (now === null || now.forge.main.machine !== null) return false;
    const known = modes.get(now.forge.key);
    return (
      known === undefined ||
      known.saved !== modesSaved() ||
      Date.now() - known.at >= TIMING.fresh
    );
  };

  // Reads the mode of the forge shown when it is due; a forge on another machine keeps none.
  const readMode = async () => {
    const now = shownForge();
    if (now === null || !modeDue()) return;
    const saved = modesSaved();
    const read = await readForge(placeOf(now.shown));
    modes.set(now.forge.key, {
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

  const task = checking()
    ? null
    : cx.spawn(async (cx) => {
        for (;;) {
          sweepReviews();
          await refresh();
          await readMode();
          contexts = await readContexts(
            readAgents().map((agent) => agent.address),
          );
          cx.notify();
          for (
            let slept = 0;
            slept < TIMING.poll && !waiting() && !modeDue();
            slept += TIMING.step
          )
            await cx.sleep(TIMING.step);
        }
      });

  /**
   * The golems of one space: its agents, each with what works under it at any depth: the agents it dispatched, theirs
   * in turn, and the subagents inside each one's session (Claude Code's records: a Task, a background shell).
   * @param {SpaceInfo} space
   * @param {AgentInfo[]} everyone
   * @param {Map<string, string | null>} parents
   * @param {string | null} looking the terminal that has the keyboard
   * @param {(agent: AgentInfo) => import("../kit/tokens.js").Tone} toneOfAgent
   * @param {Map<string, Record<string, { state?: string, title?: string }>>} records each session's subagents inside it
   */
  const golemsOf = (
    space,
    everyone,
    parents,
    looking,
    toneOfAgent,
    records,
  ) => {
    const mine = everyone.filter((agent) => agent.space === space.id);
    const agentAddresses = new Set(everyone.map((agent) => agent.address));
    const leads = mine.filter(
      (agent) => !agentAddresses.has(parents.get(agent.address) ?? ""),
    );
    /**
     * The subagents inside an agent's session: no terminal of their own, so a click goes to the agent.
     * @param {AgentInfo} owner
     * @param {number} depth
     */
    const inside = (owner, depth) =>
      Object.entries(records.get(owner.address) ?? {}).map(([id, record]) =>
        clickable(
          subagentRow({
            depth,
            name: record.title || "subagent",
            role: "clay",
            tone: toneOf(
              /** @type {import("herdr").Status} */ (record.state ?? "working"),
            ),
          }),
          `subagent-${owner.address}-${id}`,
          () => openAgent(owner),
        ),
      );
    /**
     * What works under an agent, a step further in each level: the agents it dispatched, each with what works under it
     * in turn (an agent can dispatch agents of its own), then the subagents inside its session.
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
              context: contexts[sub.address]?.used,
              depth,
              name: agentName(sub),
              role: "stone",
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
    const forge = groupForges(all, git).find((group) =>
      group.spaces.some((space) => space.active),
    );
    const root = v_flex()
      .id("sidebar")
      .size_full()
      .bg(k.bg1)
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
    /** @type {Map<string, string | null>} */
    const parents = new Map(
      readTerminals().map((terminal) => [terminal.address, parentOf(terminal)]),
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
    const looking = focused()?.terminal ?? null;
    const key = lookKeyOf(forge);
    /** @type {Map<string, Record<string, { state?: string, title?: string }>>} */
    const records = new Map(
      readTerminals().map((terminal) => [
        terminal.address,
        terminal.records ?? {},
      ]),
    );
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
                parents.get(agent.address) ? "stone" : "iron",
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

    return root
      .child(
        gnomeHeader({
          action: control(startButton(), "start-work", startWork),
          forge: forge.main.name,
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
          .child(
            spaceRow(
              repoRow(
                forge.main.name,
                git[forge.main.id] === null || git[forge.main.id] === undefined
                  ? undefined
                  : control(
                      div().p(2).child(icon(ICON.add, k.muted)),
                      "forge-new-worktree",
                      () => newWorktreeOn(forge.main, forge.main.name),
                    ),
              ),
              "forge-repo",
              forge.main.id,
              menuOn,
            ),
          )
          .children(
            forge.spaces.flatMap((space) => {
              const placeGitOf = git[space.id];
              const branch = placeGitOf?.branch ?? space.branch;
              // A space outside git has no checkout: its golems hang from the forge's own row.
              const checkout =
                branch === null || branch === undefined
                  ? []
                  : [
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
                    ];
              return [
                ...checkout,
                ...golemsOf(
                  space,
                  everyone,
                  parents,
                  looking,
                  toneOfAgent,
                  records,
                ),
              ];
            }),
          ),
      )
      .child(
        control(
          forgeMode(
            forge.main.machine !== null
              ? { detail: "on another machine", name: "Unknown" }
              : modes.has(forge.key)
                ? shortLabel(
                    modeLabel(modes.get(forge.key)?.info ?? { mode: "chat" }),
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
