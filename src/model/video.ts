/** Whether the walkthrough plays, which decides what its button offers. */
export enum Playback {
  Paused = "paused",
  Playing = "playing",
}

/** What the walkthrough's button says, aloud and on screen. */
export interface PlaybackButton {
  label: string;
  text: string;
}
