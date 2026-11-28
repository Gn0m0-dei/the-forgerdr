import type { StarlightUserConfig } from "@astrojs/starlight/types";

export const SIDEBAR: StarlightUserConfig["sidebar"] = [
  { label: "Overview", slug: "docs" },
  {
    items: ["docs/getting-started/install", "docs/getting-started/setup"],
    label: "Getting started",
  },
  {
    items: [
      "docs/way-of-working/flow-and-gates",
      "docs/way-of-working/manual-and-auto",
      "docs/way-of-working/spec-modes",
      "docs/way-of-working/items-and-branches",
      "docs/way-of-working/parent-folders",
      "docs/way-of-working/memory",
    ],
    label: "The way of working",
  },
  {
    items: ["docs/commands/skills", "docs/commands/agents"],
    label: "Commands",
  },
  {
    items: [
      "docs/herdr-app/layout",
      "docs/herdr-app/start-work",
      "docs/herdr-app/inbox",
      "docs/herdr-app/floor",
      "docs/herdr-app/ide",
      "docs/herdr-app/changes",
      "docs/herdr-app/reviews",
      "docs/herdr-app/security-view",
      "docs/herdr-app/heat-updates-manual",
      "docs/herdr-app/keys",
      "docs/herdr-app/sounds-and-motion",
    ],
    label: "The herdr app",
  },
  {
    items: ["docs/reference/every-session", "docs/reference/scripts", "docs/reference/development"],
    label: "Reference",
  },
];
