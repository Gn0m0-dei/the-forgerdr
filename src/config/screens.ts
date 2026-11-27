import { ScreenId, type Screen } from "#model/screen.ts";

const APP = { height: 900, width: 1440 };

export const SCREENS: Readonly<Record<ScreenId, Screen>> = Object.freeze({
  [ScreenId.Agents]: {
    alt: "The forgerdr layout on the-forgerdr's own repository: forge tabs, the gnome, the tree of worktrees and their golems, the golem lanes, the inbox and the forge heat.",
    file: "04d-main-window-agents.png",
    size: APP,
  },
  [ScreenId.Changes]: {
    alt: "The Changes panel beside a session: the forge's checkouts with what each changed, a file's diff with your comment under a line, and the session the comments will go to.",
    file: "18-changes-panel.png",
    size: APP,
  },
  [ScreenId.Floor]: {
    alt: "The forge floor: each item's cells, its build tasks red and green, and what it waits on.",
    file: "13-forge-floor.png",
    size: APP,
  },
  [ScreenId.InboxDesign]: {
    alt: "The inbox open on a session's design question, waiting for its approval.",
    file: "05c-inbox-design.png",
    size: APP,
  },
  [ScreenId.InboxPlan]: {
    alt: "The inbox: a plan to approve, a commit gate, a permission and the comments waiting in their views.",
    file: "05-inbox.png",
    size: APP,
  },
  [ScreenId.InboxShip]: {
    alt: "The inbox open on a pull request's gate, its push gate under it.",
    file: "05d-inbox-ship.png",
    size: APP,
  },
  [ScreenId.MainWindow]: {
    alt: "The herdr app with the forgerdr layout on the-forgerdr's own repository: a session waits at its commit gate while the other golems work in their worktrees.",
    file: "04-main-window.png",
    size: APP,
  },
  [ScreenId.PrColleague]: {
    alt: "A colleague's pull request: the findings by severity and the comments drafted for your stamp.",
    file: "06b-pr-review-colleague.png",
    size: APP,
  },
  [ScreenId.ReviewRound]: {
    alt: "A review round: what a session changed, line by line, with your comment on a line.",
    file: "06-review-round.png",
    size: APP,
  },
  [ScreenId.Security]: {
    alt: "The security triage: a confirmed finding, one to validate and one rejected, with the fix plan you stamp.",
    file: "06d-security-triage.png",
    size: APP,
  },
  [ScreenId.StartWork]: {
    alt: "The Start work dialog: what you want to work on, here or in worktrees, in the manual or the auto flow.",
    file: "12c-start-work-new.png",
    size: APP,
  },
});
