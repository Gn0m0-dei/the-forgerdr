// The forgerdr mod's pure logic, which imports neither herdr nor gpui-kit, under Node's own runner. Node is not herdr's
// runtime: herdr-app check and the gallery cover that.
// Run: node --test test/herdr-mod.test.mjs
import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import {
  forgeMood,
  forgeMoves,
  forgeState,
  forgeSummary,
  groupForges,
  lookKeyOf,
} from "../herdr/mods/forgerdr/forges.js";
import { keyLabel } from "../herdr/mods/forgerdr/format.js";
import { brotherOf, hatColourOf } from "../herdr/mods/forgerdr/identity.js";
import {
  byUrgency,
  elapsed,
  golemStatus,
  lanesHeight,
  lanesOf,
  spaceLanes,
} from "../herdr/mods/forgerdr/lanes.js";
import {
  folderLabel,
  newSwipe,
  paneLabel,
  programKind,
  swipeTab,
  tabLabel,
} from "../herdr/mods/forgerdr/sessions.js";
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
  deepStrictEqual(forgeState([]), { badge: undefined, mood: "idle" });
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

test("a forge's golems in a line, and its gnome's mood", () => {
  const agents = [
    { status: "working" },
    { status: "working" },
    { status: "blocked" },
    { status: "idle" },
  ];
  strictEqual(forgeSummary(agents), "2 forging · 1 waiting");
  strictEqual(forgeSummary([]), "no golems at work");
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
  // Its main checkout's folder, so it does not change once git answers.
  strictEqual(
    lookKeyOf({
      key: "/w/api/.git",
      main: { folder: "/w/api-login", name: "login" },
    }),
    "/w/api",
  );
  strictEqual(
    lookKeyOf({ key: "space:7", main: { folder: "/w/notes", name: "notes" } }),
    "/w/notes",
  );
  strictEqual(
    lookKeyOf({ key: "space:8", main: { folder: "", name: "scratch" } }),
    "scratch",
  );
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
