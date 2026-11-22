import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

// Every heading of the README on main before the site, and the pages that now carry it.
// License stays in the README.
const README_SECTIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  Agents: ["docs/commands/agents"],
  Development: ["docs/reference/development"],
  Flow: ["docs/way-of-working/flow-and-gates", "docs/way-of-working/manual-and-auto"],
  Install: ["docs/getting-started/install", "docs/getting-started/setup"],
  Keys: ["docs/herdr-app/keys"],
  "Memory and MCP servers travel with the plugin": ["docs/way-of-working/memory"],
  Skills: ["docs/commands/skills"],
  "Spec mode": ["docs/way-of-working/spec-modes"],
  "The forgerdr layout": [
    "docs/herdr-app/layout",
    "docs/herdr-app/start-work",
    "docs/herdr-app/inbox",
    "docs/herdr-app/floor",
    "docs/herdr-app/reviews",
    "docs/herdr-app/security-view",
    "docs/herdr-app/heat-updates-manual",
    "docs/herdr-app/sounds-and-motion",
  ],
  "The herdr app": ["docs/reference/scripts"],
  "What runs on every session": ["docs/reference/every-session"],
});

describe("the docs", () => {
  test("carry every section the README had", () => {
    const missing = Object.entries(README_SECTIONS).flatMap(([section, pages]) =>
      pages.filter((page) => !existsSync(join("dist", page, "index.html"))).map((page) => `${section} → ${page}`),
    );
    assert.deepEqual(missing, []);
  });
});
