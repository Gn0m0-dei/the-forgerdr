import type { CropRect, Size } from "#model/zoom.ts";

/** The screens of the demo forge, shot from the herdr app itself. */
export enum ScreenId {
  Agents = "agents",
  Changes = "changes",
  Floor = "floor",
  InboxDesign = "inboxDesign",
  InboxPlan = "inboxPlan",
  InboxShip = "inboxShip",
  MainWindow = "mainWindow",
  PrColleague = "prColleague",
  ReviewRound = "reviewRound",
  Security = "security",
  StartWork = "startWork",
}

export interface Screen {
  alt: string;
  file: string;
  size: Size;
}

export interface Step {
  title: string;
  body: string;
  decide: string;
  screen: ScreenId;
  /** The part the desktop stage zooms onto, at 1x or 2x of the screen's pixels. */
  stage: CropRect;
  /** The tighter part a phone shows, readable at its width. */
  card: CropRect;
}
