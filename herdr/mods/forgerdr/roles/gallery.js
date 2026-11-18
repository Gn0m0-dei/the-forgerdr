// Every piece of the kit and the pixel art on one page, laid out like the design's 00 Components and 03 Sprites, to
// look at beside them. Open it as a tab of the dev mod:
//   herdr-app do tab.new --name gallery --mod forgerdr-dev --props '{"role":"gallery"}'
import { h_flex, v_flex } from "gpui-base";
import {
  inboxButton,
  KEY_BUTTON,
  kbdHint,
  keyButton,
  paletteHint,
} from "../kit/buttons.js";
import { agentChip, statusChip } from "../kit/chips.js";
import { heatMeter, steppedBar } from "../kit/meters.js";
import {
  emptyState,
  gnomeHeader,
  paneHeader,
  splitControls,
  toast,
} from "../kit/panels.js";
import {
  ACCESSORY,
  BEARD,
  EYES,
  glyph,
  gnome,
  golem,
  HAT,
  ICON,
  icon,
  MOOD,
} from "../kit/sprites.js";
import { addTab, forgeTab, panelToggle, sessionTab } from "../kit/tabs.js";
import { text } from "../kit/text.js";
import { BRAND, TONE, tokens } from "../kit/tokens.js";
import {
  agentRow,
  repoRow,
  subagentRow,
  warningRow,
  worktreeRow,
} from "../kit/tree.js";

/** @typedef {import("./role.js").Role} Role */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../kit/sprites.js").GlyphName} GlyphName */
/** @typedef {import("../kit/sprites.js").GolemRole} GolemRole */
/** @typedef {import("../kit/sprites.js").HatColour} HatColour */
/** @typedef {import("../kit/sprites.js").Mood} Mood */
/** @typedef {import("../kit/tokens.js").Tone} Tone */

// In the design's order, not the sets' sorted keys.
/** @type {Tone[]} */
const TONES = [TONE.working, TONE.needs, TONE.done, TONE.failed, TONE.quiet];

/** @type {Mood[]} */
const MOODS = [
  MOOD.idle,
  MOOD.working,
  MOOD.needs,
  MOOD.done,
  MOOD.error,
  MOOD.asleep,
];

/** @type {GolemRole[]} */
const GOLEMS = ["iron", "stone", "clay"];

/** @type {GlyphName[]} */
const GLYPHS = ["flame", "needs", "spark", "smoke", "asleep"];

/** @type {HatColour[]} */
const HAT_COLOUR_NAMES = [
  "crimson",
  "forest",
  "indigo",
  "ochre",
  "plum",
  "teal",
];

/**
 * @param {string} title
 * @param {NativeElement[]} rows
 */
const section = (title, rows) => {
  const k = tokens();
  return v_flex()
    .gap(12)
    .child(text(title, "display", 10, BRAND.ember))
    .child(
      v_flex()
        .gap(14)
        .p(16)
        .bg(k.bg0)
        .border(1)
        .border_color(k.line)
        .children(rows),
    );
};

/** @param {NativeElement[]} pieces */
const row = (pieces) =>
  h_flex().flex_wrap().items_center().gap(12).children(pieces);

/**
 * @param {string} name
 * @param {NativeElement} piece
 */
const named = (name, piece) =>
  v_flex()
    .flex_none()
    .items_center()
    .gap(6)
    .child(piece)
    .child(text(name, "display", 8, tokens().muted));

const actions = () =>
  section("ACTIONS", [
    row([
      keyButton(KEY_BUTTON.primary, "Next: branches"),
      keyButton(KEY_BUTTON.stamp, "Stamp gnomemark", { key: "⌘⏎" }),
      keyButton(KEY_BUTTON.secondary, "Request changes", { key: "R" }),
      keyButton(KEY_BUTTON.ghost, "Release notes"),
      kbdHint("⌘"),
      inboxButton(2),
      inboxButton(0),
      paletteHint(),
    ]),
  ]);

const statusAndMeters = () => {
  const k = tokens();
  const band = { gap: 1, height: 9, share: 1, steps: 3, width: 6 };
  return section("STATUS AND METERS", [
    row(TONES.map((tone) => statusChip(tone))),
    row(TONES.map((tone) => agentChip(tone))),
    row([
      heatMeter({
        after: "WEEK 41%",
        detail: "62% · resets 1h 12m",
        label: "5H",
        percent: 62,
      }),
    ]),
    row([
      steppedBar({ ...band, colour: k.ok }),
      text("under 80%", "ui", 12, k.muted),
      steppedBar({ ...band, colour: k.needs }),
      text("80% · gnome warns", "ui", 12, k.muted),
      steppedBar({ ...band, colour: k.failed }),
      text("95% · warns again", "ui", 12, k.muted),
    ]),
    row([steppedBar({ colour: k.working, share: 7 / 12, steps: 12 })]),
  ]);
};

const navigation = () =>
  section("NAVIGATION", [
    row([
      forgeTab({
        active: true,
        badge: { content: "3", tone: TONE.working },
        name: "forgerdr",
      }),
      forgeTab({
        badge: { content: "!", tone: TONE.needs },
        look: { colour: "forest" },
        name: "acme-shop",
      }),
      forgeTab({ look: { colour: "indigo" }, name: "dotfiles" }),
      addTab(),
    ]),
    row([
      sessionTab({
        active: true,
        icon: ICON.golem,
        label: "claude · main",
        tone: TONE.working,
      }),
      sessionTab({ icon: ICON.server, label: "dev server" }),
      sessionTab({ icon: ICON.terminal, label: "shell" }),
      splitControls(),
      panelToggle("Files", true),
      panelToggle("Changes", false),
    ]),
    v_flex()
      .w(300)
      .bg(tokens().bg1)
      .child(repoRow("forgerdr"))
      .child(worktreeRow({ branch: "main", selected: true }))
      .child(
        agentRow({
          name: "claude · main",
          selected: true,
          tone: TONE.working,
          unseen: true,
        }),
      )
      .child(subagentRow({ name: "explore", tone: TONE.working }))
      .child(subagentRow({ name: "code review", tone: TONE.done }))
      .child(
        worktreeRow({
          branch: "feature/#42-login",
          dirty: true,
          item: "#42",
          port: 3001,
          sync: "↑2 ↓1",
        }),
      )
      .child(agentRow({ name: "claude · login", tone: TONE.needs }))
      .child(warningRow("claude · login asks about src/cart.rs"))
      .child(agentRow({ name: "claude · resize", tone: TONE.failed })),
  ]);

const containers = () =>
  section("CONTAINERS AND FEEDBACK", [
    v_flex()
      .w(640)
      .child(
        paneHeader({
          folder: "~/projects/forgerdr",
          title: "claude · main",
          tone: TONE.working,
        }),
      )
      .child(
        paneHeader({
          folder: "cargo xtask dev",
          running: true,
          title: "dev server",
        }),
      ),
    row([
      v_flex()
        .w(272)
        .bg(tokens().bg1)
        .child(
          gnomeHeader({
            forge: "forgerdr",
            mood: "working · 3 golems",
            name: "Brother Anvilbeard",
            tone: TONE.working,
          }),
        ),
      v_flex()
        .w(389)
        .child(
          toast({
            from: "Brother Anvilbeard · forgerdr",
            message: "claude · login needs your mark: git push",
          }),
        ),
    ]),
    v_flex()
      .w(421)
      .h(300)
      .child(
        emptyState({
          caption: "Empty inbox",
          sub: "Brother Anvilbeard will knock when a golem needs you.",
          title: "Nothing waits on your mark.",
        }),
      ),
  ]);

const sprites = () =>
  section("SPRITES", [
    row(MOODS.map((mood) => named(mood, gnome({ mood, scale: 4 })))),
    row([
      ...Object.values(HAT).map((hat) => named(hat, gnome({ hat, scale: 4 }))),
      ...Object.values(BEARD).map((beard) =>
        named(beard, gnome({ beard, scale: 4 })),
      ),
      ...Object.values(EYES).map((eyes) =>
        named(eyes, gnome({ eyes, scale: 4 })),
      ),
      ...Object.values(ACCESSORY).map((accessory) =>
        named(accessory, gnome({ accessory, scale: 4 })),
      ),
    ]),
    row(
      HAT_COLOUR_NAMES.map((colour) =>
        named(colour, gnome({ colour, scale: 4 })),
      ),
    ),
    ...GOLEMS.map((role) =>
      row(
        TONES.map((tone) =>
          named(`${role} ${tone}`, golem(role, tone, role === "clay" ? 6 : 4)),
        ),
      ),
    ),
    row(GLYPHS.map((name) => named(name, glyph(name, 4)))),
  ]);

const icons = () =>
  section("ICONS · 12×12 · ONE INK, TINTED BY STATE", [
    row(
      Object.values(ICON).map((name) =>
        named(
          name,
          h_flex()
            .items_end()
            .gap(6)
            .child(icon(name, tokens().fg, 3))
            .child(icon(name, tokens().fg, 1)),
        ),
      ),
    ),
  ]);

const page = () =>
  v_flex()
    .id("gallery")
    .size_full()
    .overflow_y_scrollbar()
    .bg(tokens().bg1)
    .p(24)
    .gap(24)
    .child(text("COMPONENTS", "display", 16, BRAND.forgeGold))
    .child(actions())
    .child(statusAndMeters())
    .child(navigation())
    .child(containers())
    .child(sprites())
    .child(icons());

/** @returns {Role} */
export const gallery = () => ({ render: page });
