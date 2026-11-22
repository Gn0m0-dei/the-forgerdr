import { SITE } from "#config/site.ts";
import { withBase } from "#helpers/url.ts";
import type { LandingConfig } from "#model/landing.ts";

export const LANDING: LandingConfig = Object.freeze({
  crew: [
    { file: "golem-iron-forging.svg", height: 72, width: 112 },
    { file: "golem-stone-waiting.svg", height: 72, width: 112 },
    { file: "golem-clay-done.svg", height: 72, width: 112 },
  ],
  facts: [
    { detail: "The installer shows every piece and asks before it installs anything.", title: "Asks first" },
    { detail: "Uninstalling keeps your settings, your memory and your sign-ins.", title: "Leaves your data" },
    { detail: "Azure DevOps, GitHub and GitLab through az, gh and glab, signed in as you.", title: "Your own CLIs" },
    { detail: "Security findings and the inbox never leave your computer.", title: "Stays on the machine" },
    { detail: "MIT. Read every hook and every rule before you install.", title: "Open source" },
  ],
  footerLinks: [
    { href: withBase("docs/"), label: "Docs" },
    { href: SITE.changelog, label: "Changelog" },
    { href: SITE.contributing, label: "Contributing" },
    { href: SITE.security, label: "Security" },
    { href: SITE.repository, label: "GitHub" },
  ],
  gateFiles: [
    { added: 19, path: "herdr/mods/forgerdr/floor.js", removed: 0 },
    { added: 11, path: "test/herdr-mod.test.mjs", removed: 0 },
  ],
  gateMessage: "feat(herdr): mute a forge on the floor",
  guard: [
    { command: "git push --force", isRefused: true, outcome: "refused · a force push rewrites what others pulled" },
    { command: "git reset --hard HEAD~1", isRefused: true, outcome: "refused · uncommit with git reset --soft instead" },
    {
      command: "git checkout -b feature/#12-sync origin/main",
      isRefused: true,
      outcome: "refused · a new branch never tracks the shared base",
    },
    { command: "git commit  (with an AI attribution trailer)", isRefused: false, outcome: "trailer stripped · committed, signed only by you" },
  ],
  marks: ["Design", "Plan", "Commit", "Push", "Pull request", "Comment", "Item state"],
  navLinks: [
    { href: "#how-it-works", label: "How it works" },
    { href: withBase("docs/"), label: "Docs" },
    { href: SITE.changelog, label: "Changelog" },
  ],
  pins: [
    { label: "A forge per repository, with its golems' badge", left: 23.4, top: 1.2 },
    { label: "The gnome: its mood follows its golems", left: 0.3, top: 6.2 },
    { label: "Worktrees, sessions and sub-agents, each with its status", left: 0.5, top: 22.7 },
    { label: "Golem lanes: the most urgent first", left: 37.8, top: 82.3 },
    { label: "The inbox: everything that waits on your mark", left: 89.2, top: 4.4 },
    { label: "Forge heat: the subscription's windows", left: 26.5, top: 96.8 },
  ],
});
