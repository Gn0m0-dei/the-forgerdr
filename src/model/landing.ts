export interface Link {
  href: string;
  label: string;
}

export interface Sprite {
  file: string;
  height: number;
  width: number;
}

export interface ChangedFile {
  added: number;
  path: string;
  removed: number;
}

/** A numbered pin on a screen, placed in percent of its width and height. */
export interface Pin {
  label: string;
  left: number;
  top: number;
}

export interface GuardLine {
  command: string;
  isRefused: boolean;
  outcome: string;
}

export interface Fact {
  detail: string;
  title: string;
}

export interface LandingConfig {
  crew: Sprite[];
  facts: Fact[];
  footerLinks: Link[];
  gateFiles: ChangedFile[];
  gateMessage: string;
  guard: GuardLine[];
  marks: string[];
  navLinks: Link[];
  pins: Pin[];
}
