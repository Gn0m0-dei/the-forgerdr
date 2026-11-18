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
import { scrollTarget, stripState } from "../herdr/mods/forgerdr/strip.js";

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
