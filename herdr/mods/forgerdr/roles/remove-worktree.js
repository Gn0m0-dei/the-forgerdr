// The Remove worktree dialog (design 16b): which panes close with the worktree, that its branch stays, and what keeps it
// from going, in one of three ways. With nothing in the way it asks to confirm; with uncommitted files it lists them and
// offers to throw them away with it; one with submodules goes only by force, which git does without looking inside, so
// it says what that takes and asks for it outright; with a golem at work or waiting on the human in one of its spaces it removes
// nothing until the golem is done, and it follows the golem live. The removal is bin/forge-worktree-remove.sh's, which
// checks again. Opened from a forge's menu on a worktree's space and from forgerdr.worktree-remove; Enter removes it,
// Shift+Enter throws the changes away with it, or removes by force.
import { h_flex, v_flex } from "gpui-base";
import {
  checking,
  closeOverlay,
  openOverlay,
  panes,
  props,
  spaces,
} from "herdr";
import { planRemoval, removeWorktree } from "../bridges/forge.js";
import { readTerminals } from "../bridges/terminals.js";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import { agentChip } from "../kit/chips.js";
import { control } from "../kit/control.js";
import { fieldLabel } from "../kit/forms.js";
import { golem, ICON, icon } from "../kit/sprites.js";
import { fill, text, wrapped } from "../kit/text.js";
import { tokens, toneOf } from "../kit/tokens.js";
import { MOD } from "../name.js";
import { PROGRAM_KIND } from "../sessions.js";
import { terminalGolem } from "../specials.js";
import {
  closingPanes,
  golemsAtWork,
  spacesOn,
  stillRemovable,
  terminalsIn,
} from "../worktrees.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("../bridges/forge.js").RemovalPlan} RemovalPlan */
/** @typedef {import("../sessions.js").ProgramKind} ProgramKind */
/** @typedef {import("./role.js").Role} Role */
/**
 * @template T
 * @typedef {import("../bridges/forge.js").Loaded<T>} Loaded
 */

/** @typedef {{ forge: string, dir: string }} RemoveWorktreeTarget its forge's name, and where the space it shows is */

/** @type {() => (Partial<RemoveWorktreeTarget> & { overlay?: string }) | null} */
const readProps = props;

const DIALOG = Object.freeze({ height: 500, kind: "dialog", width: 600 });

// What the human is told before a worktree with submodules goes: the script looks for their work first, but what it
// cannot know of is theirs to weigh.
const FORCED =
  "It has submodules: git removes it only by force, without looking inside. Everything in it goes, files git ignores and folders a submodule left behind too.";

// How many uncommitted files the warning names, and panes the list shows, before they count the rest: the dialog does
// not grow, and what keeps the worktree must stay in view.
const SHOWN = Object.freeze({ files: 6, panes: 4 });

/** @type {Record<ProgramKind, import("../kit/sprites.js").IconName>} */
const PANE_ICON = {
  [PROGRAM_KIND.agent]: ICON.golem,
  [PROGRAM_KIND.program]: ICON.server,
  [PROGRAM_KIND.shell]: ICON.terminal,
};

/**
 * Opens the Remove worktree dialog for the worktree a space shows.
 * @param {RemoveWorktreeTarget} target
 */
export const openRemoveWorktree = (target) =>
  openOverlay({
    ...DIALOG,
    mod: MOD,
    props: { ...target, role: "worktree-remove" },
  });

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const worktreeRemoval = (cx) => {
  const given = readProps() ?? {};
  const target = { dir: given.dir ?? "", forge: given.forge ?? "" };
  const close = () => closeOverlay(given.overlay ?? "");
  const handle = cx.focus_handle();
  handle.focus();
  /** @type {Loaded<RemovalPlan>} */
  let plan = { state: "loading" };
  let busy = false;
  let failed = "";

  const loading =
    checking() || target.dir === ""
      ? null
      : cx.spawn(async (cx) => {
          plan = await planRemoval(target.dir);
          cx.notify();
        });

  /** The golems that keep the worktree now, from the app's live terminals. */
  const keepers = () =>
    plan.state === "ready"
      ? golemsAtWork(
          spacesOn(plan.value.path, spaces()).map((space) => space.id),
          readTerminals(),
          terminalsIn(plan.value.path, panes()),
        )
      : [];

  // It looks again before it removes: a file changed since the dialog opened, a golem that started in the meantime or a
  // plan that cannot be read stops it, and the dialog shows why.
  /** @param {Context} cx */
  const remove = (cx) => {
    if (busy || plan.state !== "ready" || keepers().length > 0) return;
    const known = plan.value;
    busy = true;
    failed = "";
    cx.spawn(async (task) => {
      const fresh = await planRemoval(known.path);
      if (!stillRemovable(fresh, known) || keepers().length > 0) {
        plan = fresh.state === "ready" ? fresh : plan;
        busy = false;
        // A golem that started shows as one; anything else says why nothing was removed.
        failed =
          fresh.state === "error"
            ? fresh.error
            : keepers().length > 0
              ? ""
              : "It changed since this opened: look at it again.";
        task.notify();
        return;
      }
      const refused = await removeWorktree(
        known.path,
        known.changes.length > 0,
      );
      busy = false;
      if (refused === null) {
        close();
        return;
      }
      failed = refused;
      plan = fresh.state === "ready" ? fresh : plan;
      task.notify();
    });
    cx.notify();
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const ready = plan.state === "ready" ? plan.value : null;
    const branch = ready?.branch || "this worktree";
    const golems = keepers();
    const byAddress = new Map(
      readTerminals().map((terminal) => [terminal.address, terminal]),
    );
    const dirty = ready !== null && ready.changes.length > 0;
    const forced = ready?.forced === true;
    const closing =
      ready === null
        ? []
        : closingPanes(spacesOn(ready.path, spaces()), panes());
    const more = (ready?.changes.length ?? 0) - SHOWN.files;
    const shownFiles = (ready?.changes ?? []).slice(0, SHOWN.files).join(" · ");

    const foot =
      plan.state === "error"
        ? { colour: k.failed, words: plan.error }
        : busy
          ? { colour: k.muted, words: "Removing the worktree…" }
          : failed !== ""
            ? { colour: k.failed, words: failed }
            : golems.length > 0
              ? {
                  colour: k.muted,
                  words: "Nothing to remove while a golem works.",
                }
              : { colour: k.muted, words: "" };
    const blocked = ready === null || golems.length > 0;

    // What it lists can outgrow the dialog (many panes, many files, the warning of a forced removal): it scrolls.
    const body = v_flex()
      .id("worktree-remove-body")
      .flex_1()
      .min_h(0)
      .overflow_y_scrollbar()
      .gap(12)
      .px(20)
      .py(16)
      .child(
        wrapped(
          ready !== null
            ? `Remove ${branch}?`
            : plan.state === "error"
              ? "It cannot be removed from here."
              : "Reading the worktree…",
          "ui",
          15,
          k.fg,
        ),
      )
      .when(ready !== null, (el) =>
        el
          .child(fieldLabel("These panes close"))
          .when(closing.length === 0, (el) =>
            el.child(text("No pane is open on it.", "ui", 13, k.muted)),
          )
          .children(
            closing.slice(0, SHOWN.panes).map((pane) =>
              h_flex()
                .items_center()
                .gap(10)
                .child(icon(PANE_ICON[pane.kind], k.muted))
                .child(fill(pane.label, "mono", 13, k.fg)),
            ),
          )
          .when(closing.length > SHOWN.panes, (el) =>
            el.child(
              text(
                `and ${closing.length - SHOWN.panes} more`,
                "ui",
                12,
                k.muted,
              ),
            ),
          )
          .child(
            h_flex()
              .items_center()
              .gap(10)
              .child(icon(ICON.branch, k.muted))
              .child(text("The branch is kept.", "ui", 13, k.fg)),
          ),
      )
      // Before the files, whose list is as long as their paths: this one must stay in view.
      .when(forced && golems.length === 0, (el) =>
        el.child(
          v_flex()
            .gap(6)
            .p(12)
            .border(2)
            .border_color(k.needs)
            .child(
              h_flex()
                .items_center()
                .gap(8)
                .child(icon(ICON.warn, k.needs))
                .child(text("Removed by force", "ui", 13, k.needs)),
            )
            .child(wrapped(FORCED, "ui", 12, k.muted)),
        ),
      )
      .when(dirty && golems.length === 0, (el) =>
        el.child(
          v_flex()
            .gap(6)
            .p(12)
            .border(2)
            .border_color(k.needs)
            .child(
              h_flex()
                .items_center()
                .gap(8)
                .child(icon(ICON.warn, k.needs))
                .child(
                  text(
                    `Uncommitted changes in ${ready?.changes.length ?? 0} ${ready?.changes.length === 1 ? "file" : "files"}`,
                    "ui",
                    13,
                    k.needs,
                  ),
                ),
            )
            .child(
              wrapped(
                more > 0 ? `${shownFiles} · +${more} more` : shownFiles,
                "mono",
                12,
                k.muted,
              ),
            ),
        ),
      )
      .children(
        golems.slice(0, 1).map((one) =>
          v_flex()
            .gap(6)
            .p(12)
            .border(2)
            .border_color(k.working)
            .child(
              h_flex()
                .items_center()
                .gap(10)
                .child(
                  golem(
                    terminalGolem(byAddress.get(one.id)),
                    toneOf(one.status),
                    2,
                  ),
                )
                .child(
                  fill(
                    `${one.name} is still ${one.status === "blocked" ? "waiting on you" : "forging"} here`,
                    "ui",
                    13,
                    k.fg,
                  ),
                )
                .child(agentChip(toneOf(one.status))),
            )
            .child(
              wrapped(
                golems.length > 1
                  ? `So are ${golems.length - 1} more. Finish or stop the sessions first: the worktree stays until then.`
                  : "Finish or stop the session first: the worktree stays until then.",
                "ui",
                12,
                k.muted,
              ),
            ),
        ),
      );

    return v_flex()
      .id("remove-worktree")
      .track_focus(handle)
      .size_full()
      .bg(k.bg1)
      .border(2)
      .border_color(k.line)
      .on_key_down((event, cx) => {
        if (
          event.key !== "enter" ||
          event.modifiers.shift !== (dirty || forced)
        )
          return;
        cx.stop_propagation();
        remove(cx);
      })
      .child(
        h_flex()
          .items_center()
          .gap(14)
          .px(20)
          .py(14)
          .border_b(2)
          .border_color(k.line)
          .child(icon(ICON.trash, k.fg, 2))
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(4)
              .child(fill("REMOVE A WORKTREE", "display", 13, k.fg))
              .child(fill(`${branch} · ${target.forge}`, "ui", 12, k.muted)),
          ),
      )
      .child(body)
      .child(
        h_flex()
          .items_center()
          .gap(12)
          .px(20)
          .py(12)
          .border_t(2)
          .border_color(k.line)
          .child(fill(foot.words, "ui", 13, foot.colour))
          .when(blocked, (el) =>
            el.child(
              control(
                keyButton(KEY_BUTTON.ghost, "Close"),
                "worktree-close",
                close,
              ),
            ),
          )
          .when(!blocked, (el) =>
            el
              .child(
                control(
                  keyButton(KEY_BUTTON.ghost, "Cancel"),
                  "worktree-cancel",
                  // While it works, the dialog stays: closing it would drop the error it says.
                  () => busy || close(),
                ),
              )
              .child(
                control(
                  dirty
                    ? keyButton(KEY_BUTTON.warn, "Discard changes and remove", {
                        key: "⇧↵",
                      })
                    : forced
                      ? keyButton(KEY_BUTTON.warn, "Remove by force", {
                          key: "⇧↵",
                        })
                      : keyButton(KEY_BUTTON.primary, "Remove", {
                          icon: ICON.trash,
                          key: "↵",
                        }),
                  "worktree-remove",
                  remove,
                ),
              ),
          ),
      );
  };

  return {
    close: () => {
      loading?.cancel();
      handle.release();
    },
    render,
  };
};
