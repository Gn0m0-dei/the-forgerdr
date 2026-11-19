// The New worktree dialog (design 16): a branch of the forge's repository and a folder for it where the app keeps its
// worktrees, opened as a space with a shell and, when the forge has one and the box is ticked, its dev server on a free
// port. The branch is named as forgerdr names them (bin/forge-worktree.sh): by the kind, the item's id and the title,
// or it is the branch that already carries the id. The preview says what Create makes, as forge-worktree.sh --plan
// says it once the typing stops. Agents are Start work's: this makes the worktree only. Opened from a forge's menu, the
// + of the sidebar's repository row and forgerdr.worktree-new; Enter in a field creates it.
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { checking, closeOverlay, home, openOverlay, props, run } from "herdr";
import { makeWorktree, planWorktree, readForge } from "../bridges/forge.js";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { checkBox, choice, choices, fieldLabel } from "../kit/forms.js";
import { ICON, icon } from "../kit/sprites.js";
import { fill, text, wrapped } from "../kit/text.js";
import { tokens } from "../kit/tokens.js";
import { MOD } from "../name.js";
import { folderLabel } from "../sessions.js";
import {
  folderOf,
  itemArg,
  WORKTREE_KIND,
  WORKTREE_KINDS,
} from "../worktrees.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").Task} Task */
/** @typedef {import("../bridges/forge.js").ForgeInfo} ForgeInfo */
/** @typedef {import("../bridges/forge.js").WorktreePlan} WorktreePlan */
/** @typedef {import("../worktrees.js").WorktreeForm} WorktreeForm */
/** @typedef {import("../worktrees.js").WorktreeKind} WorktreeKind */
/** @typedef {import("./role.js").Role} Role */
/**
 * @template T
 * @typedef {import("../bridges/forge.js").Loaded<T>} Loaded
 */

/** @typedef {{ forge: string, dir: string }} NewWorktreeTarget its name, and where the space it shows is */

/** @type {() => (Partial<NewWorktreeTarget> & { overlay?: string }) | null} */
const readProps = props;

const DIALOG = Object.freeze({ height: 470, kind: "dialog", width: 640 });

// How long the preview waits for the typing to stop before it asks the script again, and how long the dialog takes to
// get the keyboard after it opens.
const WAIT = Object.freeze({ focusMs: 300, settleMs: 300 });

/**
 * Opens the New worktree dialog of a forge.
 * @param {NewWorktreeTarget} target
 */
export const openNewWorktree = (target) =>
  openOverlay({
    ...DIALOG,
    mod: MOD,
    props: { ...target, role: "worktree-new" },
  });

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const newWorktree = (cx) => {
  const given = readProps() ?? {};
  const target = { dir: given.dir ?? "", forge: given.forge ?? "" };
  const close = () => closeOverlay(given.overlay ?? "");
  const item = InputState.new({ placeholder: "#12, or its URL" });
  const title = InputState.new({ placeholder: "What the branch is for" });
  /** @type {Loaded<ForgeInfo>} */
  let info = { state: "loading" };
  /** @type {WorktreeKind} */
  let kind = WORKTREE_KIND.feature;
  let dev = true;
  // What the script says the worktree would be; null while there is nothing to plan.
  /** @type {Loaded<WorktreePlan> | null} */
  let plan = null;
  let asked = 0;
  /** @type {Task | null} */
  let settling = null;
  let busy = false;
  let failed = "";

  /**
   * The form as the fields hold it, or why the item cannot be; null while it has no title.
   * @param {boolean} withDev
   * @returns {{ form: WorktreeForm } | { error: string } | null}
   */
  const formOf = (withDev) => {
    if (info.state !== "ready") return null;
    const parsed = itemArg(item.value(), info.value);
    if ("error" in parsed) return parsed;
    const named = title.value().trim();
    return named === ""
      ? null
      : {
          form: {
            dev: withDev,
            item: parsed.value,
            kind,
            repo: target.dir,
            title: named,
          },
        };
  };

  // The plan always asks for the dev server, so the box can say which command it starts; Create sends the box's.
  /** @param {AsyncContext} later */
  const replan = (later) => {
    asked += 1;
    const now = asked;
    const asking = formOf(true);
    if (asking === null || "error" in asking) {
      plan = null;
      later.notify();
      return;
    }
    plan = plan ?? { state: "loading" };
    later.spawn(async (task) => {
      const answer = await planWorktree(asking.form);
      if (now !== asked) return;
      plan = answer;
      task.notify();
    });
  };

  // A field changed: the answer on its way is for the fields as they were.
  /** @param {Context} cx */
  const settle = (cx) => {
    settling?.cancel();
    asked += 1;
    failed = "";
    settling = cx.timer.after(WAIT.settleMs, replan);
    cx.notify();
  };

  // Create plans the fields as they are now and makes what that plan shows, so a preview that has not caught up with the
  // typing never makes another branch; only one origin gained since its last fetch, carrying the item's id, can still win.
  /** @param {Context} cx */
  const create = (cx) => {
    const making = formOf(dev);
    if (busy || making === null || "error" in making) return;
    settling?.cancel();
    asked += 1;
    busy = true;
    failed = "";
    cx.spawn(async (task) => {
      plan = await planWorktree({ ...making.form, dev: true });
      if (plan.state !== "ready") {
        busy = false;
        task.notify();
        return;
      }
      task.notify();
      const made = await makeWorktree(making.form);
      busy = false;
      if (made.state === "ready") {
        close();
        run("space.select", { id: made.value.space });
        return;
      }
      failed = made.state === "error" ? made.error : "";
      task.notify();
    });
    cx.notify();
  };

  item.on("change", (_event, cx) => settle(cx));
  title.on("change", (_event, cx) => settle(cx));
  item.on("submit", (_event, cx) => create(cx));
  title.on("submit", (_event, cx) => create(cx));
  item.focus();
  // The dialog takes the keyboard a moment after it opens.
  cx.timer.after(WAIT.focusMs, () => item.focus());

  const loading =
    checking() || target.dir === ""
      ? null
      : cx.spawn(async (cx) => {
          info = await readForge(target.dir);
          replan(cx);
        });

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const ready = plan?.state === "ready" ? plan.value : null;
    const parsed =
      info.state === "ready"
        ? itemArg(item.value(), info.value)
        : { value: "" };
    const itemError = "error" in parsed ? parsed.error : "";
    const port = dev && ready !== null ? ready.port : "";
    const named = title.value().trim() !== "";
    const canCreate = !busy && ready !== null && itemError === "" && named;

    /**
     * A field: its label, its input and a line under it.
     * @param {string} label
     * @param {import("gpui-base").InputState} state
     * @param {string} note
     * @param {string} error
     */
    const field = (label, state, note, error) =>
      v_flex()
        .gap(6)
        .child(fieldLabel(label))
        .child(
          Input.new(state)
            .h(34)
            .px(10)
            .border(2)
            .border_color(error === "" ? k.line : k.failed)
            .bg(k.bg0)
            .text_size(13)
            .text_color(k.fg),
        )
        .child(
          // Its own column: a long line wraps under its field, never over the next.
          wrapped(
            error === "" ? note : error,
            "ui",
            11,
            error === "" ? k.muted : k.failed,
          ),
        );

    const startsFrom =
      ready === null
        ? ""
        : ready.from === ready.branch
          ? "· the branch exists: checked out as it is"
          : ready.from === `origin/${ready.branch}`
            ? "· from the branch on origin"
            : "";

    const foot = busy
      ? { colour: k.muted, words: "Forging the worktree…" }
      : failed !== ""
        ? { colour: k.failed, words: failed }
        : info.state === "error"
          ? { colour: k.failed, words: info.error }
          : itemError !== ""
            ? { colour: k.muted, words: "Fix the item to name its branch." }
            : plan?.state === "error"
              ? { colour: k.failed, words: plan.error }
              : ready !== null
                ? {
                    colour: k.muted,
                    words: `Worktree ${ready.worktrees} of this forge${port === "" ? "" : ` · port ${port} is free`}`,
                  }
                : {
                    colour: k.muted,
                    words: "Give it a title to name its branch.",
                  };

    return v_flex()
      .id("new-worktree")
      .size_full()
      .bg(k.bg1)
      .border(2)
      .border_color(k.line)
      .child(
        h_flex()
          .items_center()
          .gap(14)
          .px(20)
          .py(14)
          .border_b(2)
          .border_color(k.line)
          .child(icon(ICON.worktreeAdd, k.fg, 2))
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(4)
              .child(
                fill(
                  `CREATE A WORKTREE · ${target.forge.toUpperCase()}`,
                  "display",
                  13,
                  k.fg,
                ),
              )
              .child(
                fill(
                  ready === null
                    ? "A branch and a folder of its own, opened as a space."
                    : `A branch and a folder under ${folderLabel(folderOf(ready.path), home())}/, opened as a space.`,
                  "ui",
                  12,
                  k.muted,
                ),
              ),
          ),
      )
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .gap(14)
          .px(20)
          .py(16)
          .child(
            h_flex()
              .items_start()
              .gap(14)
              .child(
                div()
                  .w(190)
                  .flex_none()
                  .child(
                    field(
                      "Item",
                      item,
                      "issue or work item, if any",
                      itemError,
                    ),
                  ),
              )
              .child(
                div()
                  .flex_1()
                  .min_w(0)
                  .child(
                    field(
                      "Title",
                      title,
                      kind === WORKTREE_KIND.release
                        ? "its version, as v1.2.0: the branch's name"
                        : "the branch's name comes from it",
                      "",
                    ),
                  ),
              ),
          )
          .child(
            h_flex()
              .items_center()
              .gap(10)
              .child(fieldLabel("Kind"))
              .child(
                choices(
                  WORKTREE_KINDS.map((each) =>
                    control(
                      choice(each, kind === each),
                      `worktree-kind-${each}`,
                      (cx) => {
                        kind = each;
                        settle(cx);
                      },
                    ),
                  ),
                ),
              ),
          )
          .when(ready !== null && ready.dev !== "", (el) =>
            el.child(
              control(
                h_flex()
                  .items_center()
                  .gap(8)
                  .child(checkBox(dev))
                  .child(
                    text(
                      `Start the dev server (${ready?.dev ?? ""})`,
                      "ui",
                      13,
                      k.fg,
                    ),
                  ),
                "worktree-dev",
                (cx) => {
                  dev = !dev;
                  cx.notify();
                },
              ),
            ),
          )
          .when(ready !== null, (el) =>
            el.child(
              h_flex()
                .items_center()
                .gap(8)
                .child(icon(ICON.branch, k.muted))
                .child(
                  text(`Base: origin/${ready?.base ?? ""}`, "ui", 12, k.fg),
                )
                .child(fill(startsFrom, "ui", 12, k.muted)),
            ),
          )
          .child(
            v_flex()
              .gap(6)
              .p(14)
              .bg(k.bg0)
              .border(2)
              .border_color(k.line)
              .child(fieldLabel("Branch"))
              .child(
                ready === null
                  ? fill(
                      itemError !== ""
                        ? "Its name shows here once the item is right."
                        : plan?.state === "error"
                          ? "No branch to name: see why below."
                          : named
                            ? "Naming it…"
                            : "Its name shows here once it has a title.",
                      "ui",
                      13,
                      k.muted,
                    )
                  : fill(ready.branch, "mono", 18, k.fg),
              )
              .when(ready !== null, (el) =>
                el.child(
                  fill(
                    `${folderLabel(ready?.path ?? "", home())}${port === "" ? "" : ` · dev :${port}`}`,
                    "ui",
                    12,
                    k.muted,
                  ),
                ),
              ),
          ),
      )
      .child(
        h_flex()
          .items_center()
          .gap(12)
          .px(20)
          .py(12)
          .border_t(2)
          .border_color(k.line)
          .child(fill(foot.words, "ui", 13, foot.colour))
          .child(
            control(
              keyButton(KEY_BUTTON.ghost, "Cancel"),
              "worktree-cancel",
              // While it works, the dialog stays: closing it would drop the space it opens or the error it says.
              () => busy || close(),
            ),
          )
          .child(
            control(
              keyButton(
                canCreate ? KEY_BUTTON.primary : KEY_BUTTON.ghost,
                "Create",
                { icon: ICON.worktreeAdd, key: "↵" },
              ),
              "worktree-create",
              create,
            ),
          ),
      );
  };

  return {
    close: () => {
      loading?.cancel();
      settling?.cancel();
      item.release();
      title.release();
    },
    render,
  };
};
