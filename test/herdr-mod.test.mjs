// The forgerdr mod's pure logic, which imports neither herdr nor gpui-kit, under Node's own runner. Node is not herdr's
// runtime: herdr-app check and the gallery cover that.
// Run: node --test test/herdr-mod.test.mjs
import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import { forgeState } from "../herdr/mods/forgerdr/forges.js";
import { keyLabel } from "../herdr/mods/forgerdr/format.js";
import { hatColourOf } from "../herdr/mods/forgerdr/identity.js";
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
