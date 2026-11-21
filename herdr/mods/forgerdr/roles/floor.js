// The forge floor (design 13), a dialog over the window that FLOOR in the top bar opens (and forgerdr.floor): every
// item the Claude sessions work, in every forge, as an accordion with a header per forge (its gnome, its name, its
// counts) that folds and unfolds on a click, each forge on its own, all open at first and remembered; each item a card
// with its type and mode, what it waits on or does, its branch and its dev server's port, its flow's cells (how many
// times each ran) and its build tasks; then the forge's sessions that report no flow. It never answers what an item
// waits on: its WAITING chip opens the inbox. Discuss goes to the item's pane. A finished item leaves the floor once its
// session ends; nothing is dismissed by hand. Esc or its ✕ closes it.
import { h_flex, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import {
  checking,
  closeOverlay,
  openOverlay,
  panes,
  props,
  run,
  setShared,
  shared,
  spaces,
} from "herdr";
import { followFlows } from "../bridges/flows.js";
import { readSpacesGit } from "../bridges/git.js";
import { readGnomes } from "../bridges/gnomes.js";
import { followInbox, inboxOpen, toggleInbox } from "../bridges/inbox.js";
import { readNames } from "../bridges/names.js";
import { readTerminals } from "../bridges/terminals.js";
import { CARD_STATUS, floorCounts, floorMood, floorOf } from "../floor.js";
import { groupForges, lookKeyOf } from "../forges.js";
import { gnomeLookOf, nameOf } from "../identity.js";
import { statusChip } from "../kit/chips.js";
import { control } from "../kit/control.js";
import {
  cardFrame,
  countsLine,
  flowTags,
  forgeHeader,
  forgeSection,
  progressRow,
  STATUS_TONE,
  stageCell,
  untrackedRow,
} from "../kit/floor.js";
import { emptyState } from "../kit/panels.js";
import { ICON, icon, iconButton } from "../kit/sprites.js";
import { text } from "../kit/text.js";
import { tokens } from "../kit/tokens.js";
import { MOD } from "../name.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("../floor.js").FloorCard} FloorCard */
/** @typedef {import("../floor.js").FloorForge} FloorForge */
/** @typedef {import("../floor.js").Flow} Flow */
/** @typedef {import("../inbox.js").InboxRequest} InboxRequest */
/** @typedef {import("./role.js").Role} Role */

/** @typedef {import("../main.js").ForgerdrProps} ForgerdrProps */

/** @type {() => ForgerdrProps | null} */
const readProps = props;

// As big as the window lets it be, short of its edges.
const DIALOG = Object.freeze({ height: 0.9, kind: "dialog", width: 0.9 });
// The forges folded, kept in shared state: each opening of the dialog is a copy of its own, with storage of its own.
const FOLDED_KEY = "forgerdr.floor.folded";

export const openFloor = () =>
  openOverlay({ ...DIALOG, mod: MOD, props: { role: "floor" } });

/** @returns {Set<string>} the forges folded, by key */
const readFolded = () => {
  const stored = shared(FOLDED_KEY);
  return new Set(
    Array.isArray(stored)
      ? stored.filter((key) => typeof key === "string")
      : [],
  );
};

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const floor = (cx) => {
  /** @type {Flow[]} */
  let flows = [];
  /** @type {InboxRequest[]} */
  let requests = [];
  const following = checking()
    ? null
    : followFlows(cx, (read) => {
        flows = read;
      });
  const inbox = checking()
    ? null
    : followInbox(cx, (read) => {
        requests = read;
      });

  const close = () => closeOverlay(readProps()?.overlay ?? "");

  /** @param {string} terminal */
  const discuss = (terminal) => {
    close();
    // agent.focus reaches an agent's pane, or brings up one that has none.
    run("agent.focus", { terminal });
  };

  const toInbox = () => {
    close();
    if (!inboxOpen()) toggleInbox();
  };

  /** @param {string} key */
  const fold = (key) => {
    const folded = readFolded();
    setShared(
      FOLDED_KEY,
      folded.has(key)
        ? [...folded].filter((each) => each !== key)
        : [...folded, key],
    );
  };

  /** @param {FloorCard} card */
  // What a card waits on opens where it is answered: a request in the inbox, else the session's pane (a gate of
  // understanding, asked in the chat, or a dialog in the pane the inbox does not hold).
  const statusOfCard = (card) => {
    const chip = statusChip(STATUS_TONE[card.status.kind], card.status.label);
    if (card.status.kind !== CARD_STATUS.waiting) return chip;
    const asked = requests.some(
      (request) => request.terminal === card.terminal,
    );
    return control(chip, `floor-gate-${card.terminal}`, () =>
      asked ? toInbox() : discuss(card.terminal),
    );
  };

  /** @param {FloorCard} card */
  const cardOf = (card) => {
    const k = tokens();
    const where = [
      card.branch,
      card.port === undefined ? null : `:${card.port}`,
    ]
      .filter((part) => part !== null)
      .join(" · ");
    const ended = card.status.kind === CARD_STATUS.ended;
    const head = h_flex()
      .items_center()
      .gap(10)
      .when(card.key !== "", (el) =>
        el.child(text(card.key, "display", 13, k.fg)),
      )
      .child(
        div()
          .flex_1()
          .min_w(0)
          .child(
            text(card.title === "" ? "untitled" : card.title, "ui", 15, k.fg),
          ),
      )
      .child(flowTags(card.type, card.mode))
      .child(statusOfCard(card))
      .when(where !== "", (el) => el.child(text(where, "mono", 12, k.muted)))
      // A session that has ended has no pane to discuss in.
      .when(!ended, (el) =>
        el.child(
          control(
            h_flex()
              .flex_none()
              .items_center()
              .gap(6)
              .px(8)
              .py(3)
              .border(1)
              .border_color(k.line)
              .child(icon(ICON.notify, k.muted))
              .child(text("discuss", "ui", 12, k.muted)),
            `floor-discuss-${card.terminal}`,
            () => discuss(card.terminal),
          ),
        ),
      );
    return cardFrame([
      head,
      h_flex().gap(6).children(card.strip.map(stageCell)),
      progressRow(card.progress, card.tasks),
    ]);
  };

  /** @param {FloorForge} forge */
  const forgeOf = (forge) => {
    const key = lookKeyOf(forge);
    const open = !readFolded().has(forge.key);
    const header = control(
      forgeHeader({
        brother: nameOf(key, readNames()),
        counts: forge.counts,
        forge: forge.name,
        look: {
          ...gnomeLookOf(key, readGnomes()[key]),
          mood: floorMood(forge.counts),
        },
        open,
      }),
      `floor-forge-${forge.key}`,
      () => fold(forge.key),
    );
    return forgeSection(
      header,
      [...forge.cards.map(cardOf), ...forge.untracked.map(untrackedRow)],
      open,
    );
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const forges = groupForges(spaces(), readSpacesGit());
    const floorNow = floorOf({
      flows,
      forges,
      panes: panes(),
      requests,
      terminals: readTerminals(),
    });
    return v_flex()
      .size_full()
      .bg(k.bg0)
      .border(2)
      .border_color(k.line)
      .child(
        h_flex()
          .flex_none()
          .items_center()
          .gap(10)
          .px(16)
          .py(12)
          .border_b(2)
          .border_color(k.line)
          .child(icon(ICON.board, k.fg))
          .child(text("FORGE FLOOR", "display", 11, k.fg))
          .child(div().flex_1())
          .child(countsLine(floorCounts(floorNow), 10))
          .child(
            control(iconButton(ICON.close, k.muted), "floor-close", close),
          ),
      )
      .child(
        floorNow.length === 0
          ? div()
              .flex_1()
              .p(16)
              .child(
                emptyState({
                  caption: "forge floor",
                  sub: "A /forgerdr:workitem, or any /forgerdr command, puts its item here.",
                  title: "no flows on this floor",
                }),
              )
          : v_flex()
              .id("floor-forges")
              .flex_1()
              .min_h(0)
              .gap(14)
              .p(16)
              .overflow_y_scrollbar()
              .children(floorNow.map(forgeOf)),
      );
  };

  return {
    close: () => {
      following?.cancel();
      inbox?.cancel();
    },
    render,
  };
};
