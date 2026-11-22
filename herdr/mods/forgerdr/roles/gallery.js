// Every piece of the kit and the pixel art on one page, laid out like the design's 00 Components and 03 Sprites, to
// look at beside them. Open it as a tab of the dev mod:
//   herdr-app do tab.new --name gallery --mod forgerdr-dev --props '{"role":"gallery"}'
import { h_flex, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import {
  FLOW_CELL,
  FLOW_MODE,
  FLOW_TYPE,
  STRIP_STATE,
  TASK_CELL,
} from "../floor.js";
import {
  floorButton,
  inboxButton,
  KEY_BUTTON,
  kbdHint,
  keyButton,
  paletteHint,
  quietButton,
  updateChip,
} from "../kit/buttons.js";
import { agentChip, profileSwitch, statusChip } from "../kit/chips.js";
import {
  cardFrame,
  flowTags,
  forgeHeader,
  forgeSection,
  progressRow,
  stageCell,
  untrackedRow,
} from "../kit/floor.js";
import { heatMeter, steppedBar } from "../kit/meters.js";
import { SIGN, sign } from "../kit/motion.js";
import {
  emptyState,
  gnomeHeader,
  paneHeader,
  splitControls,
  toast,
} from "../kit/panels.js";
import {
  checkLine,
  commentBlock,
  diffLine,
  draftCard,
  fileHeader,
  findingFrame,
  findingRow,
  groupHead,
  hunkHead,
  proposalChip,
  roundChip,
  severityChip,
  severityColour,
  stillBox,
  stillText,
  threadCard,
  tickLabel,
} from "../kit/review.js";
import {
  actionToggle,
  fixCard,
  lockNote,
  securityDetail,
  securityToneColour,
} from "../kit/security.js";
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
  prRow,
  pullRequestsRow,
  repoRow,
  subagentRow,
  warningRow,
  worktreeRow,
} from "../kit/tree.js";
import { SECURITY_TONE } from "../security.js";
import { SPECIAL_LOOK } from "../specials.js";

/** @typedef {import("./role.js").Role} Role */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../kit/sprites.js").GlyphName} GlyphName */
/** @typedef {import("../kit/sprites.js").GolemRole} GolemRole */
/** @typedef {import("../kit/sprites.js").HatColour} HatColour */
/** @typedef {import("../kit/sprites.js").Mood} Mood */
/** @typedef {import("../kit/tokens.js").Tone} Tone */
/** @typedef {import("../floor.js").StripCell} StripCell */

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
const GOLEMS = ["iron", "reviewer", "warden", "stone", "clay"];

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
      floorButton(1),
      floorButton(0),
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
      heatMeter({ band: "warn", label: "5H", percent: 84 }),
      heatMeter({ band: "danger", label: "WEEK", percent: 96 }),
    ]),
    row([
      profileSwitch(["OAuth", "OpenRouter"], 0),
      updateChip("0.1.17"),
      quietButton("? Manual"),
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
          context: 61,
          name: "claude · main",
          selected: true,
          tone: TONE.working,
          unseen: true,
        }),
      )
      .child(subagentRow({ context: 34, name: "explore", tone: TONE.working }))
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
      .child(
        agentRow({ context: 93, name: "claude · login", tone: TONE.needs }),
      )
      .child(warningRow("claude · login asks about src/cart.rs"))
      .child(agentRow({ name: "claude · resize", tone: TONE.failed }))
      .child(
        agentRow({ context: 52, name: "claude · checkout", tone: TONE.done }),
      )
      .child(
        subagentRow({
          chip: SPECIAL_LOOK.security.chip,
          context: 48,
          name: "Security #18",
          role: SPECIAL_LOOK.security.golem,
          tone: TONE.needs,
        }),
      )
      .child(pullRequestsRow())
      .child(
        prRow({
          chip: SPECIAL_LOOK.review.chip,
          context: 22,
          line: "#42 review · @quench-dev",
          role: SPECIAL_LOOK.review.golem,
          selected: true,
          tone: TONE.done,
        }),
      )
      .child(
        prRow({
          chip: SPECIAL_LOOK.mine.chip,
          line: "#40 mine · 4 threads",
          role: SPECIAL_LOOK.mine.golem,
          tone: TONE.working,
        }),
      ),
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
    row(
      Object.values(SIGN).map((name) => named(`${name} moving`, sign(name, 4))),
    ),
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

// Every state a cell of the floor's strip can show, and a count.
/** @type {StripCell[]} */
const FLOOR_STRIP = [
  { cell: FLOW_CELL.workitem, runs: 1, state: STRIP_STATE.done },
  { cell: FLOW_CELL.spec, runs: 0, state: STRIP_STATE.pending },
  { cell: FLOW_CELL.plan, runs: 1, state: STRIP_STATE.waiting },
  { cell: FLOW_CELL.build, runs: 2, state: STRIP_STATE.running },
  { cell: FLOW_CELL.review, runs: 3, state: STRIP_STATE.done },
  { cell: FLOW_CELL.security, runs: 1, state: STRIP_STATE.failed },
  { cell: FLOW_CELL.ship, runs: 0, state: STRIP_STATE.skipped },
];

const floorPieces = () =>
  section("FORGE FLOOR", [
    forgeSection(
      forgeHeader({
        brother: "Brother Anvilbeard",
        counts: { cracked: 1, done: 1, forging: 2, waiting: 2 },
        forge: "orders",
        look: { colour: "crimson", mood: MOOD.needs },
        open: true,
      }),
      [
        untrackedRow({
          space: "orders",
          status: "idle",
          title: "claude · docs",
        }),
      ],
      true,
    ),
    cardFrame([
      h_flex()
        .gap(10)
        .child(text("#18 session restore after reboot", "ui", 15, tokens().fg))
        .child(flowTags(FLOW_TYPE.feature, FLOW_MODE.manual)),
      h_flex().gap(6).children(FLOOR_STRIP.map(stageCell)),
      progressRow(
        {
          done: 4,
          of: 7,
          steps: [
            STRIP_STATE.done,
            STRIP_STATE.done,
            STRIP_STATE.skipped,
            STRIP_STATE.done,
            STRIP_STATE.running,
            STRIP_STATE.pending,
            STRIP_STATE.pending,
          ],
        },
        {
          at: 5,
          building: true,
          marks: [
            TASK_CELL.reviewed,
            TASK_CELL.reviewed,
            TASK_CELL.green,
            TASK_CELL.green,
            TASK_CELL.red,
            TASK_CELL.pending,
            TASK_CELL.pending,
            TASK_CELL.pending,
          ],
          name: "restore_reattaches_after_daemon_restart",
          of: 8,
          red: true,
        },
      ),
    ]),
    untrackedRow({ space: "dotfiles", status: "idle", title: "shell" }),
  ]);

// The review views' pieces (designs 06, 06b, 06c), with made-up data.
const reviewPieces = () =>
  section("REVIEWS AND ROUNDS", [
    row([
      severityChip("blocker", 1),
      severityChip("should", 4),
      severityChip("nit", 2),
      severityChip("question", 1),
      severityChip("info", 0),
      proposalChip("fix"),
      proposalChip("reply"),
      proposalChip("ask"),
    ]),
    findingRow({
      actions: [],
      colour: severityColour("should"),
      label: "[2-6]",
      open: false,
      picked: true,
      place: "resize.rs:22 · pane.rs:64",
      tags: [{ text: "GROUP · 2" }],
      tick: stillBox(true),
      title: "magic 16 ms → named debounce constant",
    }),
    draftCard({
      body: stillText(
        "A full channel panics the daemon here. Keep the newest size and drop the rest on Full.",
      ),
      drop: null,
      flagged: [],
      label: "[1]",
      place: "resize.rs:48",
      suggestion: "Ok(()) | Err(TrySendError::Full(_)) => {}",
      threads: 1,
    }),
    threadCard({
      author: "tinker-ana",
      commit: "7c41e2a · fix(ui): virtualize the inbox list · 52 tests passed",
      detail: "Render only the visible cards: two call sites change.",
      picked: true,
      place: "drawer.rs:88",
      proposal: "fix",
      reply: stillText("Done in 7c41e2a: only visible cards are laid out now."),
      request:
        "Can this list virtualize? With 200 items the drawer lays out every card each frame.",
      tick: stillBox(true),
    }),
    checkLine(true, "no tooling mentions in any draft"),
    checkLine(false, "1 draft names AI or its tools"),
    row([
      roundChip(
        "R1",
        "changes requested · 3 comments, all resolved",
        tokens().failed,
        false,
      ),
      roundChip("R2", "open · 4d08bf6..a91c8e0", tokens().needs, true),
    ]),
    v_flex()
      .w_full()
      .child(
        div()
          .h(46)
          .child(
            fileHeader({
              adds: 46,
              comments: 1,
              dels: 15,
              open: true,
              path: "crates/daemon/src/gate.rs",
              status: "M",
              viewed: tickLabel(false, "viewed"),
            }),
          ),
      )
      .child(
        div().h(24).child(hunkHead("@@ -10,10 +10,12 @@ pub struct GateStore")),
      )
      .child(
        div()
          .h(20)
          .child(
            diffLine({
              kind: "ctx",
              new: 11,
              old: 11,
              text: "    pending: HashMap<GateId, Gate>,",
            }),
          ),
      )
      .child(
        div()
          .h(20)
          .child(
            diffLine({
              kind: "del",
              new: null,
              old: 12,
              text: "    resolved: Vec<GateId>,",
            }),
          ),
      )
      .child(
        div()
          .h(20)
          .child(
            diffLine({
              kind: "add",
              new: 12,
              old: null,
              text: "    resolved: HashMap<GateId, Resolution>,",
            }),
          ),
      )
      .child(
        commentBlock({
          actions: [text("Resolve", "ui", 12, tokens().fg)],
          body: "Return the gate's origin with the resolution, so the inbox can jump to the session.",
          state: "open",
          where: "round 2 · new line 12",
        }),
      ),
  ]);

// The security view's pieces (design 06d), with made-up data.
const securityPieces = () => {
  const critical = securityToneColour(SECURITY_TONE.failed);
  return section("SECURITY TRIAGE", [
    groupHead("CONFIRMED · CRITICAL", 1, critical),
    findingFrame(
      findingRow({
        actions: [],
        colour: critical,
        label: "S1",
        open: true,
        picked: true,
        place: "relay/src/listener.rs:57",
        tags: [
          { colour: critical, text: "RECOMMENDED" },
          {
            colour: securityToneColour(SECURITY_TONE.ok),
            text: "VERIFIER: CONFIRMED",
          },
        ],
        tick: stillBox(true),
        title: "the socket is world-connectable until chmod runs",
      }),
      securityDetail([
        { label: "WHO", text: "Another local user on the same machine." },
        { label: "INPUT", text: "A connection to the relay's socket path." },
        {
          label: "PATH",
          text: "bind() creates the socket under the default umask → listen() → chmod(0600) a few ms later.",
        },
        {
          label: "FIX",
          text: "Bind inside a 0700 runtime folder with the umask set before bind.",
        },
        { label: "TEST", text: "socket_is_private_before_listen" },
      ]),
      critical,
    ),
    groupHead("NEEDS VALIDATION", 1, securityToneColour(SECURITY_TONE.accent)),
    findingRow({
      actions: [
        actionToggle("Note on the issue", true),
        actionToggle("Remember", false),
      ],
      colour: securityToneColour(SECURITY_TONE.accent),
      label: "N1",
      open: false,
      picked: false,
      place: "release/src/sign.rs",
      tags: [],
      tick: null,
      title:
        "is the signing key kept only in the CI secrets? Check the repository's secret list.",
    }),
    groupHead("REJECTED", 1, securityToneColour(SECURITY_TONE.muted)),
    findingRow({
      actions: [],
      colour: securityToneColour(SECURITY_TONE.muted),
      label: "R1",
      open: false,
      picked: false,
      place: "",
      tags: [],
      tick: null,
      title:
        "path traversal in the export viewer: refuted, paths are canonicalized first",
    }),
    fixCard({
      id: "S1",
      test: "socket_is_private_before_listen",
      title: "socket world-connectable",
    }),
    lockNote(
      "Findings never leave this machine. Nothing here can be published: a note on the issue is a separate draft you stamp.",
    ),
  ]);
};

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
    .child(floorPieces())
    .child(reviewPieces())
    .child(securityPieces())
    .child(sprites())
    .child(icons());

/** @returns {Role} */
export const gallery = () => ({ render: page });
