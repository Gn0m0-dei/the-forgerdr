import type { SiteConfig } from "#model/site.ts";

const REPOSITORY = "https://github.com/Gn0m0-dei/the-forgerdr";

export const SITE: SiteConfig = Object.freeze({
  base: "/the-forgerdr",
  changelog: `${REPOSITORY}/blob/main/CHANGELOG.md`,
  contributing: `${REPOSITORY}/blob/main/CONTRIBUTING.md`,
  description:
    "Run many Claude Code agents at once in the herdr app, and review everything they do before it leaves your machine.",
  install: "curl -fsSL https://raw.githubusercontent.com/Gn0m0-dei/the-forgerdr/main/install.sh | bash",
  origin: "https://gn0m0-dei.github.io",
  repository: REPOSITORY,
  security: `${REPOSITORY}/blob/main/SECURITY.md`,
  tagline: "Forge once. Herd many.",
  title: "the forgerdr",
});
