// Start work (design 12–12e, after the forge's mode): a forge's work started as the forgerdr skills a human would type,
// as its mode takes it (roles/mode.js). Chat asks what to work on; GitHub and GitLab take issues by URL or #number;
// Azure DevOps takes work items by URL or id, an id completed with its backlog; OpenSpec lists its changes to tick and
// takes new ones to spec. The work starts here or each in a worktree (/forgerdr:workitem or /forgerdr:worktree),
// manual or auto, in one session of the space shown; a new change opens a spec session in the main checkout. Review,
// the same in every mode, opens a review per pull request URL of any provider, a field each and + for one more, each
// in a tab of its own beside its review view, as the review key does. Security audits one of the forge's checkouts,
// picked, with its work item when given: its security session parked behind its view, as /forgerdr:security in the
// app does. The preview says what each line starts and skips what it cannot, saying why. ⌘↵ starts it all, Esc or
// Cancel leaves.
import {
  h_flex,
  Input,
  InputState,
  Textarea,
  TextareaState,
  v_flex,
} from "gpui-base";
import { div } from "gpui-kit";
import { checking, closeOverlay, openOverlay, props, run } from "herdr";
import { PROMPT, readChanges, readForge } from "../bridges/forge.js";
import { readSpacesGit } from "../bridges/git.js";
import { placeOf } from "../bridges/places.js";
import { counted } from "../format.js";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import { tag } from "../kit/chips.js";
import { control } from "../kit/control.js";
import {
  callout,
  checkBox,
  choice,
  choices,
  dialogTab,
  fieldLabel,
  kindChip,
  radio,
} from "../kit/forms.js";
import { ICON, icon } from "../kit/sprites.js";
import { fill, text, wrapped } from "../kit/text.js";
import { BRAND, tokens } from "../kit/tokens.js";
import { MODE, modeKind, modeLabel } from "../modes.js";
import { MOD } from "../name.js";
import {
  changeRows,
  checkoutName,
  checkoutsOf,
  ideaLaunches,
  launchPlace,
  pickedCheckout,
  reviewRows,
  securityLaunches,
  securityRows,
  startLaunches,
  workRows,
} from "../start.js";
import { openMode } from "./mode.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../bridges/forge.js").Change} Change */
/** @typedef {import("../bridges/forge.js").ForgeInfo} ForgeInfo */
/** @typedef {import("../modes.js").ModeKind} ModeKind */
/** @typedef {import("../start.js").Checkout} Checkout */
/** @typedef {import("../start.js").Launch} Launch */
/** @typedef {import("../start.js").PreviewRow} PreviewRow */
/** @typedef {import("../start.js").Way} Way */
/** @typedef {import("./role.js").Role} Role */

/**
 * The forge the dialog starts work in.
 * @typedef {object} StartTarget
 * @property {string} forge its name
 * @property {string} space the space shown, where the work starts
 * @property {string} main its main checkout's space, where spec sessions start
 * @property {string} dir where the space shown is
 * @property {string} mainFolder its main checkout's folder, "" when not known
 * @property {string | null} machine
 * @property {Checkout[]} checkouts its checkouts on this computer, its main one first, as the sidebar lists them
 */

/** @type {() => (Partial<StartTarget> & { overlay?: string }) | null} */
const readProps = props;

const DIALOG = Object.freeze({ height: 620, kind: "dialog", width: 880 });

const TAB = Object.freeze({
  review: "review",
  security: "security",
  work: "work",
});

/** @typedef {typeof TAB[keyof typeof TAB]} Tab */

// The work tab of each mode: its icon and name, the question over its text and what the text takes.
/** @type {Record<ModeKind, { glyph: import("../kit/sprites.js").IconName, label: string, ask: string, hint: string }>} */
const WORK = Object.freeze({
  azure: {
    ask: "Work items · one URL or id a line",
    glyph: ICON.board,
    hint: "1234, AB#1234 or https://dev.azure.com/…/_workitems/edit/1234",
    label: "Work items",
  },
  chat: {
    ask: "What do you want to work on?",
    glyph: ICON.idea,
    hint: "An idea, a line or a few…",
    label: "Chat",
  },
  github: {
    ask: "Issues · one URL or #number a line",
    glyph: ICON.board,
    hint: "#12 or https://github.com/owner/repo/issues/12",
    label: "Issues",
  },
  gitlab: {
    ask: "Issues · one URL or #number a line",
    glyph: ICON.board,
    hint: "#12 or https://gitlab.com/group/repo/-/issues/12",
    label: "Issues",
  },
  openspec: {
    ask: "New change · what should it cover?",
    glyph: ICON.book,
    hint: "An idea for a change; its spec session asks the rest.",
    label: "OpenSpec",
  },
});

/**
 * Opens Start work on the space a forge shows.
 * @param {import("../forges.js").Forge} forge
 * @param {import("herdr").SpaceInfo} shown
 */
export const openStart = (forge, shown) => {
  const local = forge.main.machine === null;
  /** @type {StartTarget} */
  const target = {
    // An audit's session runs forgerdr's scripts, which are on this computer.
    checkouts: local ? checkoutsOf(forge.spaces, readSpacesGit(), placeOf) : [],
    dir: placeOf(shown),
    forge: forge.main.name,
    machine: forge.main.machine,
    main: forge.main.id,
    // A forge in git is keyed by its repository's common folder, whose parent is its main checkout.
    mainFolder:
      local && forge.key.endsWith("/.git")
        ? forge.key.slice(0, -"/.git".length)
        : "",
    space: shown.id,
  };
  openOverlay({ ...DIALOG, mod: MOD, props: { ...target, role: "start" } });
};

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const start = (cx) => {
  const given = readProps() ?? {};
  /** @type {StartTarget} */
  const target = {
    checkouts: given.checkouts ?? [],
    dir: given.dir ?? "",
    forge: given.forge ?? "",
    machine: given.machine ?? null,
    main: given.main ?? "",
    mainFolder: given.mainFolder ?? "",
    space: given.space ?? "",
  };
  const close = () => closeOverlay(given.overlay ?? "");

  /** @type {import("../bridges/forge.js").Loaded<ForgeInfo>} */
  let info = { state: "loading" };
  /** @type {import("../bridges/forge.js").Loaded<Change[]>} */
  let changes = { state: "loading" };
  /** @type {Tab} */
  let tab = TAB.work;
  /** @type {Way} */
  let way = { dev: true, flow: "manual", where: "worktrees" };
  /** @type {Set<string>} the changes ticked, by name */
  const picked = new Set();
  /** @type {{ id: number, text: string }[]} ideas waiting to start, each with an id of its own */
  let ideas = [];
  let nextIdea = 0;

  const work = TextareaState.new({ rows: 4 });
  work.on("change", (_event, cx) => cx.notify());

  /** @type {{ id: number, state: InputState }[]} the pull requests to review, a field each, one at least */
  let urls = [];
  let nextUrl = 0;

  /** A field for one more pull request, last. @param {string} [value] */
  const addUrl = (value = "") => {
    const id = nextUrl;
    nextUrl += 1;
    const state = InputState.new({
      placeholder: "A pull request URL: GitHub, GitLab or Azure DevOps",
      value,
    });
    // Several URLs pasted into one field go a field each.
    state.on("change", (_event, cx) => {
      const [first = "", ...more] = state.value().trim().split(/\s+/);
      if (more.length > 0) {
        state.set_value(first);
        for (const one of more) addUrl(one);
      }
      cx.notify();
    });
    state.on("submit", (_event, cx) => {
      addUrl().focus();
      cx.notify();
    });
    urls = [...urls, { id, state }];
    return state;
  };
  addUrl();

  /** @param {number} id */
  const dropUrl = (id) => {
    urls.find((one) => one.id === id)?.state.release();
    urls = urls.filter((one) => one.id !== id);
  };

  // The pull requests given, a line each, as the preview reads them.
  const urlLines = () => urls.map((one) => one.state.value()).join("\n");

  let pickedSpace = target.space;
  const auditedCheckout = () => pickedCheckout(target.checkouts, pickedSpace);

  const item = InputState.new({ placeholder: "#18 · optional" });
  item.on("change", (_event, cx) => cx.notify());

  const kind = () =>
    info.state === "ready" ? modeKind(info.value.mode) : MODE.chat;

  // The forge first, then, in OpenSpec, its changes; a forge on another machine is not read from here.
  const loading =
    checking() || target.dir === ""
      ? null
      : cx.spawn(async (cx) => {
          if (target.machine !== null) {
            info = {
              error:
                "This forge is on another machine: its mode is read on this computer only, so Start work asks what to work on.",
              state: "error",
            };
            cx.notify();
            return;
          }
          info = await readForge(target.dir);
          // Ideas are worked where they are said; items each in a worktree of their own.
          if (kind() === MODE.chat) way = { ...way, where: "here" };
          cx.notify();
          if (kind() !== MODE.openspec) return;
          changes = await readChanges(target.dir);
          cx.notify();
        });

  // Where work starts, and where spec sessions start.
  const checkout = () =>
    info.state === "ready" && info.value.root !== ""
      ? info.value.root
      : target.dir;
  const mainCheckout = () => target.mainFolder || checkout();

  /** @param {Launch[]} launches */
  const launch = (launches) => {
    const shown = { folder: checkout(), space: target.space };
    const main = { folder: mainCheckout(), space: target.main };
    for (const [index, one] of launches.entries()) {
      const { folder, space } = launchPlace(one, shown, main);
      run("tab.new", {
        argv: one.argv,
        focus: index === 0,
        folder,
        name: one.name,
        space,
      });
    }
    if (launches.length > 0) close();
  };

  // The ideas queued and the one being written.
  const ideasNow = () =>
    [...ideas.map((idea) => idea.text), work.value()].filter(
      (idea) => idea.trim() !== "",
    );

  // What the work tab starts: rows for the preview, and ideas.
  const workNow = () => {
    const mode = kind();
    if (mode === MODE.chat) return { ideas: ideasNow(), rows: [] };
    if (mode === MODE.openspec)
      return { ideas: ideasNow(), rows: changeRows([...picked], way) };
    return {
      ideas: [],
      rows:
        info.state === "ready" ? workRows(work.value(), info.value, way) : [],
    };
  };

  /** @type {Record<Tab, () => Launch[]>} */
  const launchesOf = {
    review: () => startLaunches(reviewRows(urlLines()), way, PROMPT, MOD),
    security: () =>
      securityLaunches(auditedCheckout(), item.value(), PROMPT, MOD),
    work: () => {
      const now = workNow();
      return [
        ...startLaunches(now.rows, way, PROMPT, MOD),
        ...ideaLaunches(now.ideas, { ...way, spec: kind() === MODE.openspec }),
      ];
    },
  };

  const launches = () => launchesOf[tab]();

  const act = () => launch(launches());

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const mode = kind();
    const shape = WORK[mode];
    const now = workNow();
    const reviews = reviewRows(urlLines());
    const audited = auditedCheckout();
    const audit = securityRows(audited, item.value());
    /** @type {Record<Tab, PreviewRow[]>} */
    const rowsOf = { review: reviews, security: audit, work: now.rows };
    const rows = rowsOf[tab];

    /**
     * @param {Tab} id
     * @param {import("../kit/sprites.js").IconName} glyph
     * @param {string} label
     */
    const tabOf = (id, glyph, label) =>
      control(
        dialogTab({ glyph, label, off: false, shown: tab === id }),
        `start-tab-${id}`,
        (cx) => {
          tab = id;
          cx.notify();
        },
      );

    /**
     * A setting's choices, one a control.
     * @template {string} T
     * @param {string} id
     * @param {{ value: T, label: string }[]} options
     * @param {T} chosen
     * @param {(value: T) => void} pick
     */
    const setting = (id, options, chosen, pick) =>
      choices(
        options.map((option) =>
          control(
            choice(option.label, option.value === chosen),
            `${id}-${option.value}`,
            (cx) => {
              pick(option.value);
              cx.notify();
            },
          ),
        ),
      );

    // GPUI elements are single-use: each piece below is built anew where it goes.
    const wayRow = () =>
      h_flex()
        .items_center()
        .gap(10)
        .child(fieldLabel("Where"))
        .child(
          setting(
            "start-where",
            [
              { label: "Here", value: /** @type {Way["where"]} */ ("here") },
              {
                label: "In worktrees",
                value: /** @type {Way["where"]} */ ("worktrees"),
              },
            ],
            way.where,
            (where) => {
              way = { ...way, where };
            },
          ),
        )
        .child(div().w(8))
        .child(fieldLabel("Flow"))
        .child(
          setting(
            "start-flow",
            [
              { label: "Manual", value: /** @type {Way["flow"]} */ ("manual") },
              { label: "Auto", value: /** @type {Way["flow"]} */ ("auto") },
            ],
            way.flow,
            (flow) => {
              way = { ...way, flow };
            },
          ),
        )
        .when(way.where === "worktrees", (el) =>
          el.child(div().w(8)).child(
            control(
              h_flex()
                .items_center()
                .gap(8)
                .child(checkBox(way.dev))
                .child(text("Start the dev servers", "ui", 13, k.fg)),
              "start-dev",
              (cx) => {
                way = { ...way, dev: !way.dev };
                cx.notify();
              },
            ),
          ),
        );

    /**
     * A text to write in, framed in the accent.
     * @param {import("gpui-base").TextareaState} state
     * @param {number} height
     */
    const textBox = (state, height) =>
      Textarea.new(state)
        .h(height)
        .border(2)
        .border_color(k.accent)
        .bg(k.bg0)
        .text_size(13)
        .text_color(k.fg);

    /**
     * A line to write in, framed in the accent.
     * @param {import("gpui-base").InputState} state
     * @param {string} id
     */
    const lineBox = (state, id) =>
      div()
        .id(id)
        .min_w(0)
        .h(32)
        .px(8)
        .flex()
        .items_center()
        .bg(k.bg0)
        .border(2)
        .border_color(k.accent)
        .child(Input.new(state).w_full().text_size(13).text_color(k.fg));

    const preview = () =>
      v_flex()
        .w(340)
        .h_full()
        .flex_none()
        .gap(8)
        .child(
          fieldLabel(
            `Preview · ${rows.filter((row) => row.kind !== "skip").length} ready · ${rows.filter((row) => row.kind === "skip").length} skipped`,
          ),
        )
        .child(
          v_flex()
            .id("start-preview")
            .flex_1()
            .min_h(0)
            .overflow_y_scrollbar()
            .border(2)
            .border_color(k.line)
            .when(rows.length === 0, (el) =>
              el.child(
                div()
                  .p(10)
                  .child(
                    wrapped(
                      "Each line shows here with what it starts.",
                      "ui",
                      12,
                      k.muted,
                    ),
                  ),
              ),
            )
            .children(
              rows.map((row) =>
                v_flex()
                  .gap(2)
                  .px(10)
                  .py(6)
                  .border_b(1)
                  .border_color(k.line)
                  .when(row.kind === "skip", (el) => el.bg(k.bg2))
                  .child(
                    h_flex()
                      .gap(8)
                      .items_center()
                      .child(kindChip(row.kind))
                      .child(fill(row.label, "mono", 12, k.fg)),
                  )
                  .child(
                    text(
                      row.action,
                      "ui",
                      11,
                      row.kind === "skip" ? k.failed : k.muted,
                    ),
                  ),
              ),
            ),
        )
        .when(way.flow === "auto" && tab === TAB.work, (el) =>
          el.child(
            callout(
              wrapped(
                "Auto still stops at every gate: designs, plans, commits, pushes, pull requests and comments wait for you.",
                "ui",
                12,
                k.fg,
              ),
              BRAND.forgeGold,
            ),
          ),
        );

    // The ideas waiting to start, and the control that queues the one being written.
    const queue = () =>
      v_flex()
        .gap(6)
        .when(ideas.length > 0, (el) =>
          el.child(fieldLabel("Queued · one session each")).child(
            v_flex()
              .id("start-queue")
              .max_h(150)
              .overflow_y_scrollbar()
              .gap(6)
              .children(
                ideas.map((idea) =>
                  h_flex()
                    .flex_none()
                    .h(30)
                    .px(10)
                    .gap(8)
                    .items_center()
                    .border(1)
                    .border_color(k.line)
                    // One line in the queue, cut short: the whole idea starts, its lines joined, as it would anyway.
                    .child(
                      fill(idea.text.replace(/\s*\n\s*/g, " "), "ui", 13, k.fg),
                    )
                    .child(
                      control(
                        div().p(4).child(icon(ICON.close, k.muted)),
                        `start-idea-drop-${idea.id}`,
                        (cx) => {
                          ideas = ideas.filter((one) => one.id !== idea.id);
                          cx.notify();
                        },
                      ),
                    ),
                ),
              ),
          ),
        )
        .child(
          control(
            h_flex()
              .gap(6)
              .items_center()
              .child(icon(ICON.add, k.accent))
              .child(text("Add another", "ui", 13, k.accent)),
            "start-idea-add",
            (cx) => {
              const idea = work.value().trim();
              if (idea === "") return;
              ideas = [...ideas, { id: nextIdea, text: idea }];
              nextIdea += 1;
              work.set_value("");
              work.focus();
              cx.notify();
            },
          ),
        );

    /**
     * The OpenSpec changes to tick, as they load.
     * @returns {NativeElement}
     */
    const changeList = () => {
      if (changes.state === "loading")
        return div()
          .p(10)
          .child(text("Reading…", "ui", 12, k.muted));
      if (changes.state === "error")
        return div()
          .p(10)
          .child(
            wrapped(
              [changes.error, changes.fix].filter(Boolean).join(" "),
              "ui",
              12,
              k.needs,
            ),
          );
      if (changes.value.length === 0)
        return div()
          .p(10)
          .child(text("No changes yet.", "ui", 12, k.muted));
      return v_flex()
        .id("start-changes")
        .max_h(180)
        .overflow_y_scrollbar()
        .children(
          changes.value.map((change) =>
            control(
              h_flex()
                .h(30)
                .px(10)
                .gap(10)
                .items_center()
                .border_b(1)
                .border_color(k.line)
                .hover((style) => style.bg(k.bg2))
                .child(checkBox(picked.has(change.name)))
                .child(
                  fill(
                    change.name,
                    "mono",
                    12,
                    picked.has(change.name) ? k.fg : k.muted,
                  ),
                )
                .child(
                  text(
                    change.total === 0 ? "—" : `${change.done}/${change.total}`,
                    "mono",
                    12,
                    k.muted,
                  ),
                )
                .child(tag(change.status || "change")),
              `start-change-${change.name}`,
              (cx) => {
                if (picked.has(change.name)) picked.delete(change.name);
                else picked.add(change.name);
                cx.notify();
              },
            ),
          ),
        );
    };

    const workBody = () => {
      if (mode === MODE.chat)
        return v_flex()
          .size_full()
          .gap(10)
          .child(fieldLabel(shape.ask))
          .child(textBox(work, 96))
          .child(queue())
          .child(wayRow())
          .child(
            wrapped(
              "Each idea is worked in a session that designs it with you in the conversation before any code.",
              "ui",
              12,
              k.muted,
            ),
          );
      if (mode === MODE.openspec)
        return h_flex()
          .size_full()
          .items_start()
          .gap(18)
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(8)
              .child(
                v_flex()
                  .border(2)
                  .border_color(k.line)
                  .child(
                    div()
                      .px(10)
                      .py(6)
                      .border_b(1)
                      .border_color(k.line)
                      .child(fieldLabel("Changes")),
                  )
                  .child(changeList()),
              )
              .child(wayRow())
              .child(fieldLabel(shape.ask))
              .child(textBox(work, 60))
              .child(queue()),
          )
          .child(preview());
      return h_flex()
        .size_full()
        .items_start()
        .gap(18)
        .child(
          v_flex()
            .flex_1()
            .min_w(0)
            .gap(10)
            .child(fieldLabel(shape.ask))
            .child(textBox(work, 160))
            .child(wrapped(shape.hint, "ui", 11, k.muted))
            .child(wayRow()),
        )
        .child(preview());
    };

    const reviewBody = () =>
      h_flex()
        .size_full()
        .items_start()
        .gap(18)
        .child(
          v_flex()
            .flex_1()
            .min_w(0)
            .gap(10)
            .child(fieldLabel("Pull requests · one URL a field"))
            .child(
              v_flex()
                .id("start-urls")
                .max_h(240)
                .overflow_y_scrollbar()
                .gap(6)
                .children(
                  urls.map((url) =>
                    h_flex()
                      .flex_none()
                      .gap(8)
                      .items_center()
                      .child(lineBox(url.state, `start-url-${url.id}`).flex_1())
                      .when(urls.length > 1, (el) =>
                        el.child(
                          control(
                            div().p(4).child(icon(ICON.close, k.muted)),
                            `start-url-drop-${url.id}`,
                            (cx) => {
                              dropUrl(url.id);
                              cx.notify();
                            },
                          ),
                        ),
                      ),
                  ),
                ),
            )
            .child(
              control(
                h_flex()
                  .gap(6)
                  .items_center()
                  .child(icon(ICON.add, k.accent))
                  .child(text("Add another", "ui", 13, k.accent)),
                "start-url-add",
                (cx) => {
                  addUrl().focus();
                  cx.notify();
                },
              ),
            )
            .child(
              wrapped(
                "Any provider, whatever the forge's mode: each review picks its CLI by the URL. Yours get review-own, others review-other.",
                "ui",
                11,
                k.muted,
              ),
            ),
        )
        .child(preview());

    const checkoutList = () =>
      v_flex()
        .id("start-checkouts")
        .max_h(240)
        .overflow_y_scrollbar()
        .border(2)
        .border_color(k.line)
        .when(target.checkouts.length === 0, (el) =>
          el.child(
            div()
              .p(10)
              .child(
                wrapped(
                  "No checkout of this forge is known on this computer.",
                  "ui",
                  12,
                  k.muted,
                ),
              ),
          ),
        )
        .children(
          target.checkouts.map((one) => {
            const chosen = one.space === audited?.space;
            return control(
              h_flex()
                .h(30)
                .px(10)
                .gap(10)
                .items_center()
                .border_b(1)
                .border_color(k.line)
                .hover((style) => style.bg(k.bg2))
                .child(radio(chosen))
                .child(fill(one.branch, "mono", 12, chosen ? k.fg : k.muted))
                .child(text(checkoutName(one), "ui", 11, k.muted)),
              `start-checkout-${one.space}`,
              (cx) => {
                pickedSpace = one.space;
                cx.notify();
              },
            );
          }),
        );

    const securityBody = () =>
      h_flex()
        .size_full()
        .items_start()
        .gap(18)
        .child(
          v_flex()
            .flex_1()
            .min_w(0)
            .gap(10)
            .child(fieldLabel("Checkout · the one to audit"))
            .child(checkoutList())
            .child(fieldLabel("Work item"))
            .child(lineBox(item, "start-item").w(220))
            .child(
              wrapped(
                "Its security session audits the branch's diff, parked behind its view in a tab of its own, where you triage what it finds.",
                "ui",
                11,
                k.muted,
              ),
            ),
        )
        .child(preview());

    const ready = launches();
    /** @type {Record<Tab, number>} */
    const counts = {
      review: reviews.filter((row) => row.kind === "pr").length,
      security: audit.filter((row) => row.kind === "security").length,
      work:
        now.rows.filter((row) => row.kind !== "skip").length + now.ideas.length,
    };
    const count = counts[tab];
    const workSummary = () => {
      if (count === 0) return "Nothing to start yet";
      const parts = [
        ...(now.rows.length === 0
          ? []
          : [
              way.where === "worktrees"
                ? counted(
                    now.rows.filter((row) => row.kind !== "skip").length,
                    "worktree",
                  )
                : `${counted(now.rows.filter((row) => row.kind !== "skip").length, "item")} here`,
            ]),
        ...(now.ideas.length === 0
          ? []
          : [
              mode === MODE.openspec
                ? `${counted(now.ideas.length, "spec session")} in the main checkout`
                : `${counted(now.ideas.length, "idea")} worked ${way.where === "here" ? "here" : "in worktrees"}`,
            ]),
      ];
      return `${parts.join(" · ")} · ${way.flow}`;
    };
    /** @type {Record<Tab, () => string>} */
    const summaries = {
      review: () =>
        count
          ? `${counted(count, "review")}, a tab each`
          : "Nothing to review yet",
      security: () =>
        count
          ? "A security session, parked behind its view"
          : "Nothing to audit yet",
      work: workSummary,
    };

    const label = modeLabel(
      info.state === "ready" ? info.value : { mode: "chat" },
    );
    const originLine =
      info.state === "loading"
        ? `${target.forge} · reading the forge…`
        : info.state === "error"
          ? info.error
          : `${target.forge} · ${label.name} · ${label.detail}`;
    /** @type {Record<Tab, string>} */
    const about = {
      review:
        "Review pull requests: each in a tab of its own, its view beside its session.",
      security:
        "Audit a checkout: its security session in a tab of its own, behind its view.",
      work: `As ${target.forge}'s mode takes it: ${label.name}.`,
    };
    /** @type {Record<Tab, () => NativeElement>} */
    const bodies = {
      review: reviewBody,
      security: securityBody,
      work: workBody,
    };
    /** @type {Record<Tab, string>} */
    const goLabels = {
      review: `Review · ${count}`,
      security: `Audit · ${count}`,
      work: `Light the forge · ${count}`,
    };

    return v_flex()
      .id("start-dialog")
      .size_full()
      .bg(k.bg1)
      .border(2)
      .border_color(k.line)
      .on_key_down((event, cx) => {
        if (event.key !== "enter" || !event.modifiers.platform) return;
        cx.stop_propagation();
        act();
      })
      .child(
        h_flex()
          .items_center()
          .gap(14)
          .px(20)
          .py(14)
          .border_b(2)
          .border_color(k.line)
          .child(icon(ICON.hammer, BRAND.forgeGold, 2))
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(4)
              .child(
                fill(
                  `START WORK · ${target.forge.toUpperCase()}`,
                  "display",
                  13,
                  k.fg,
                ),
              )
              .child(fill(about[tab], "ui", 12, k.muted)),
          ),
      )
      .child(
        h_flex()
          .items_end()
          .gap(4)
          .px(20)
          .pt(10)
          .bg(k.bg0)
          .child(tabOf(TAB.work, shape.glyph, shape.label))
          .child(tabOf(TAB.review, ICON.pullRequest, "Review"))
          .child(tabOf(TAB.security, ICON.shield, "Security")),
      )
      .child(
        h_flex()
          .items_center()
          .gap(10)
          .px(20)
          .py(6)
          .border_t(2)
          .border_b(1)
          .border_color(k.line)
          .child(fill(originLine, "ui", 11, k.muted))
          .child(
            control(
              text("CHANGE MODE", "display", 8, k.accent),
              "start-change-mode",
              () => {
                close();
                openMode({ dir: target.dir, forge: target.forge });
              },
            ),
          ),
      )
      .child(v_flex().flex_1().min_h(0).px(20).py(14).child(bodies[tab]()))
      .child(
        h_flex()
          .items_center()
          .gap(12)
          .px(20)
          .py(12)
          .border_t(2)
          .border_color(k.line)
          .child(fill(summaries[tab](), "ui", 13, k.muted))
          .child(
            control(
              keyButton(KEY_BUTTON.ghost, "Cancel"),
              "start-cancel",
              close,
            ),
          )
          .child(
            control(
              keyButton(
                ready.length === 0 ? KEY_BUTTON.ghost : KEY_BUTTON.primary,
                goLabels[tab],
                { icon: ICON.hammer, key: "⌘↵" },
              ),
              "start-go",
              act,
            ),
          ),
      );
  };

  return {
    close: () => {
      loading?.cancel();
      work.release();
      item.release();
      for (const url of urls) url.state.release();
    },
    render,
  };
};
