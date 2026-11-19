// The forgerdr mod's pure logic, which imports neither herdr nor gpui-kit, under Node's own runner. Node is not herdr's
// runtime: herdr-app check and the gallery cover that.
// Run: node --test test/herdr-mod.test.mjs
import { deepStrictEqual, strictEqual } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
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
  byUrgency,
  elapsed,
  golemStatus,
  lanesHeight,
  lanesOf,
  spaceLanes,
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

const FORGNOME = {
  org: undefined,
  project: "Gn0m0-dei/forgnome",
  provider: "github",
  repo: "forgnome",
};
const SHOP = {
  azure_project: "Shop Platform",
  org: "https://dev.azure.com/acme",
  provider: "azure",
  repo: "Check.Out",
};

test("a pasted line is a pull request, an item or skipped", () => {
  deepStrictEqual(linkOf(" https://github.com/Gn0m0-dei/forgnome/pull/42 "), {
    id: "42",
    kind: "pr",
    project: "Gn0m0-dei/forgnome",
    provider: "github",
    repo: "forgnome",
    url: "https://github.com/Gn0m0-dei/forgnome/pull/42",
  });
  strictEqual(
    linkOf("https://github.com/Gn0m0-dei/forgnome/issues/31#top").kind,
    "item",
  );
  strictEqual(
    linkOf("https://github.com/Gn0m0-dei/forgnome/issues/31#top").url,
    "https://github.com/Gn0m0-dei/forgnome/issues/31",
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
    belongsTo(link("https://github.com/gn0m0-dei/FORGNOME/issues/1"), FORGNOME),
    true,
  );
  strictEqual(
    belongsTo(link("https://github.com/Gn0m0-dei/other/issues/1"), FORGNOME),
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
    belongsTo(link("https://dev.azure.com/acme/X/_workitems/edit/4"), FORGNOME),
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
    modeLabel({ ...FORGNOME, host: "github.com", mode: "github" }),
    {
      detail: "Gn0m0-dei/forgnome",
      name: "GitHub",
    },
  );
  deepStrictEqual(
    modeLabel({ ...FORGNOME, host: "github.com", mode: "gitlab" }),
    {
      detail: "no project yet",
      name: "GitLab",
    },
  );
  // Work that comes from elsewhere than the code shows both, as the mode dialog does.
  deepStrictEqual(
    modeLabel({
      ...FORGNOME,
      backlog: "https://gitlab.com/team/issues",
      host: "github.com",
      mode: "gitlab",
    }),
    { code: "Gn0m0-dei/forgnome", detail: "team/issues", name: "GitLab" },
  );
  deepStrictEqual(
    modeLabel({
      ...FORGNOME,
      backlog: "https://github.com/Gn0m0-dei/forgnome",
      host: "github.com",
      mode: "github",
    }),
    { detail: "Gn0m0-dei/forgnome", name: "GitHub" },
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
  deepStrictEqual(
    shortLabel({ detail: "Gn0m0-dei/forgnome", name: "GitHub" }),
    {
      detail: "Gn0m0-dei",
      name: "GitHub",
    },
  );
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
    backlogOf({ ...FORGNOME, backlog: "", host: "github.com", mode: "github" }),
    "https://github.com/Gn0m0-dei/forgnome",
  );
  strictEqual(
    backlogOf({ ...FORGNOME, backlog: "", host: "github.com", mode: "gitlab" }),
    "",
  );
  strictEqual(
    backlogOf({
      ...FORGNOME,
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
      ...FORGNOME,
      azdospec_backlog: "https://dev.azure.com/contoso/X",
      host: "github.com",
      mode: "github",
    }),
    "https://github.com/Gn0m0-dei/forgnome",
  );
});

test("the backlog typed in the mode dialog, as a URL", () => {
  const github = { ...FORGNOME, host: "github.com" };
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
    "https://github.com/Gn0m0-dei/forgnome/issues/12\n#15\n  20 \n\nhttps://github.com/Gn0m0-dei/forgnome/pull/42\nhttps://github.com/x/y/issues/1\nfix the login",
    { ...FORGNOME, host: "github.com", mode: "github" },
    WAY,
  );
  deepStrictEqual(
    rows.map((row) => [row.kind, row.label, row.value ?? row.action]),
    [
      [
        "item",
        "forgnome#12",
        "https://github.com/Gn0m0-dei/forgnome/issues/12",
      ],
      [
        "item",
        "forgnome#15",
        "https://github.com/Gn0m0-dei/forgnome/issues/15",
      ],
      [
        "item",
        "forgnome#20",
        "https://github.com/Gn0m0-dei/forgnome/issues/20",
      ],
      ["skip", "forgnome#42", "a pull request: review it in Review"],
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
    "#7\nhttps://github.com/Gn0m0-dei/forgnome/issues/3",
    {
      ...FORGNOME,
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
      "#15\nhttps://github.com/Gn0m0-dei/forgnome/issues/15",
      { ...FORGNOME, host: "github.com", mode: "github" },
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
      { ...FORGNOME, host: "github.com", mode: "github" },
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
      [...work, ...reviewRows("https://github.com/Gn0m0-dei/forgnome/pull/42")],
      { dev: true, flow: "auto", where: "worktrees" },
      "/p/bin/forge-prompt.sh",
    ),
    [
      {
        argv: [
          "claude",
          "/forgerdr:worktree --auto add-inbox | https://github.com/Gn0m0-dei/forgnome/issues/12",
        ],
        name: "forgerdr worktree",
      },
      {
        argv: [
          "bash",
          "/p/bin/forge-prompt.sh",
          "review",
          "https://github.com/Gn0m0-dei/forgnome/pull/42",
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
    ...FORGNOME,
    backlog: "",
    host: "github.com",
    mode: "github",
  };
  deepStrictEqual(itemArg("", github), { value: "" });
  deepStrictEqual(itemArg(" #12 ", github), {
    value: "https://github.com/Gn0m0-dei/forgnome/issues/12",
  });
  deepStrictEqual(itemArg("https://github.com/someone/else/issues/3", github), {
    error: "another repository: start it from its forge",
  });
  deepStrictEqual(
    itemArg("https://github.com/Gn0m0-dei/forgnome/pull/4", github),
    {
      error: "a pull request: review it in Review",
    },
  );
  const azure = { ...SHOP, backlog: "", host: "dev.azure.com", mode: "azure" };
  deepStrictEqual(itemArg("AB#77", azure), {
    value: "https://dev.azure.com/acme/Shop%20Platform/_workitems/edit/77",
  });
  // Chat and OpenSpec keep no backlog: an id names the branch as it is.
  deepStrictEqual(itemArg("#12", { ...FORGNOME, mode: "chat" }), {
    value: "#12",
  });
  // An item of an external backlog, as forgerdr writes its id, in any mode.
  deepStrictEqual(itemArg("EXT-231", { ...FORGNOME, mode: "chat" }), {
    value: "EXT-231",
  });
  deepStrictEqual(itemArg("ext-231", azure), { value: "ext-231" });
  deepStrictEqual(itemArg("make it", { ...FORGNOME, mode: "chat" }), {
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
