// A forge's mode dialog: how the forge works, which decides what Start work offers. Chat designs in the conversation;
// OpenSpec keeps its changes in the repository or in a store, a folder of its own that OpenSpec registers (or makes);
// Azure DevOps, GitHub and GitLab take their work from a backlog: the origin's project or repository when the origin is
// on that provider, else (or when the work lives elsewhere) the one the human names. Opened from the mode at the foot
// of the sidebar. Kept per project with bin/forge-config.sh, where the forgerdr skills read the spec mode it sets.
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import { div } from "gpui-kit";
import { checking, closeOverlay, openOverlay, pickFolder, props } from "herdr";
import {
  keepAzdospec,
  keepMode,
  readForge,
  registerStore,
  setupStore,
} from "../bridges/forge.js";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import {
  callout,
  checkBox,
  choice,
  choices,
  fieldLabel,
  radio,
} from "../kit/forms.js";
import { ICON, icon } from "../kit/sprites.js";
import { fill, text, wrapped } from "../kit/text.js";
import { BRAND, tokens } from "../kit/tokens.js";
import { backlogOf, backlogTyped, codeOf, MODE, modeKind } from "../modes.js";
import { MOD } from "../name.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../bridges/forge.js").ForgeInfo} ForgeInfo */
/** @typedef {import("../modes.js").ModeKind} ModeKind */
/** @typedef {import("./role.js").Role} Role */

/** @typedef {{ forge: string, dir: string }} ModeTarget */

/** @type {() => (Partial<ModeTarget> & { overlay?: string }) | null} */
const readProps = props;

const DIALOG = Object.freeze({ height: 620, kind: "dialog", width: 720 });

// The providers' names, as the dialog says them.
/** @type {Partial<Record<ModeKind, string>>} */
const PROVIDER = Object.freeze({
  azure: "Azure DevOps",
  github: "GitHub",
  gitlab: "GitLab",
});

// The modes, in the order the dialog lists them, each with what it means in a line.
const MODES = Object.freeze([
  {
    about: "Say what you want; the design stays in the conversation.",
    kind: MODE.chat,
    name: "Chat",
  },
  {
    about: "Changes in openspec/, in the repository or a store of their own.",
    kind: MODE.openspec,
    name: "OpenSpec",
  },
  {
    about: "Work items on Azure Boards, of the origin's project or another.",
    kind: MODE.azure,
    name: "Azure DevOps",
  },
  {
    about: "Issues on GitHub, of the origin's repository or another.",
    kind: MODE.github,
    name: "GitHub",
  },
  {
    about: "Issues on GitLab, of the origin's project or another.",
    kind: MODE.gitlab,
    name: "GitLab",
  },
]);

/**
 * Opens a forge's mode dialog.
 * @param {ModeTarget} target its name, and where the space it shows is
 */
export const openMode = (target) =>
  openOverlay({ ...DIALOG, mod: MOD, props: { ...target, role: "mode" } });

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const modeDialog = (cx) => {
  const given = readProps() ?? {};
  const target = { dir: given.dir ?? "", forge: given.forge ?? "" };
  const close = () => closeOverlay(given.overlay ?? "");

  /** @type {import("../bridges/forge.js").Loaded<ForgeInfo>} */
  let info = { state: "loading" };
  /** @type {ModeKind} */
  let kind = MODE.chat;
  /** @type {"repository" | "store"} */
  let openspecIn = "repository";
  let store = "";
  /** @type {{ busy: boolean, error: string, fix: string, setup: boolean, folder: string }} */
  let storeState = {
    busy: false,
    error: "",
    fix: "",
    folder: "",
    setup: false,
  };
  let saving = "";
  // Whether the forge's work comes from another backlog than its origin's, which an origin elsewhere always needs.
  let otherBacklog = false;
  // Each provider's backlog field, with the URL it takes for an example.
  const backlogField = {
    azure: InputState.new({ placeholder: "https://dev.azure.com/org/project" }),
    github: InputState.new({ placeholder: "https://github.com/owner/repo" }),
    gitlab: InputState.new({ placeholder: "https://gitlab.com/group/project" }),
  };

  /**
   * Readies the box and the field of a kind of mode: ticked, with the backlog the forge keeps for it, when it keeps
   * one; empty otherwise, so its example shows.
   * @param {ForgeInfo} forge
   * @param {ModeKind} now
   */
  const prefill = (forge, now) => {
    const current = backlogOf(forge, now);
    otherBacklog = current !== "" && current !== originBacklog(forge, now);
    if (now === MODE.azure || now === MODE.github || now === MODE.gitlab)
      backlogField[now].set_value(otherBacklog ? current : "");
  };

  const loading =
    checking() || target.dir === ""
      ? null
      : cx.spawn(async (cx) => {
          info = await readForge(target.dir);
          if (info.state === "ready") {
            const { mode } = info.value;
            kind = modeKind(mode);
            if (mode.startsWith("openspec:")) {
              openspecIn = "store";
              store = mode.slice("openspec:".length);
            }
            prefill(info.value, kind);
          }
          cx.notify();
        });

  /** @param {ForgeInfo} forge the backlog /azdo:init keeps in its clone's git config, "" when none */
  const azdospecOf = (forge) => forge.azdospec_backlog ?? "";

  /**
   * The backlog a forge's origin gives a kind of mode: its project or repository on that provider, else "".
   * @param {ForgeInfo} forge
   * @param {ModeKind} now
   */
  const originBacklog = (forge, now) =>
    backlogOf({ ...forge, azdospec_backlog: "", backlog: "" }, now);

  /**
   * The backlog the field names for a kind of mode, as forge-config.sh keeps it: "-" when it is the origin's own, null
   * while it names none.
   * @param {ForgeInfo} forge
   * @param {typeof MODE.azure | typeof MODE.github | typeof MODE.gitlab} now
   */
  const backlogSetting = (forge, now) => {
    const typed = backlogTyped(now, backlogField[now].value(), forge);
    if (typed === null) return null;
    const as = { ...forge, mode: now };
    return backlogOf({ ...as, backlog: "" }) ===
      backlogOf({ ...as, backlog: typed })
      ? "-"
      : typed;
  };

  /** What the dialog would keep: the mode, its backlog, or why it cannot yet. */
  const chosen = () => {
    if (info.state !== "ready") return { why: "Reading the forge…" };
    if (kind === MODE.openspec && openspecIn === "store")
      return store === ""
        ? { why: "Pick the store's folder first." }
        : { mode: `openspec:${store}` };
    if (kind === MODE.azure || kind === MODE.github || kind === MODE.gitlab) {
      const forge = info.value;
      const typed = backlogSetting(forge, kind);
      const useOrigin = forge.provider === kind && !otherBacklog;
      // On a clone /azdo:init set up, the backlog lives where the azdospec skills read it: it is changed there.
      if (kind === MODE.azure && azdospecOf(forge) !== "") {
        const url = useOrigin
          ? originBacklog(forge, kind)
          : typed === "-"
            ? originBacklog(forge, kind)
            : typed;
        if (url !== null && url !== "")
          return { azdospec: url, backlog: "-", mode: kind };
      } else if (useOrigin) return { backlog: "-", mode: kind };
      else if (typed !== null) return { backlog: typed, mode: kind };
      return {
        why:
          kind === MODE.azure
            ? "Name the backlog's project by its URL."
            : kind === MODE.gitlab
              ? "Name the project its issues are in."
              : "Name the repository its issues are in.",
      };
    }
    return { mode: kind };
  };

  /** @param {Context} cx */
  const keep = (cx) => {
    const { mode, backlog, azdospec, why } = chosen();
    if (mode === undefined || info.state !== "ready") {
      saving = why ?? "";
      cx.notify();
      return;
    }
    const key = info.value.key;
    saving = "Keeping…";
    cx.notify();
    cx.spawn(async (cx) => {
      const failed =
        (azdospec === undefined
          ? null
          : await keepAzdospec(target.dir, azdospec)) ??
        (await keepMode(key, mode, backlog));
      if (failed === null) {
        close();
        return;
      }
      saving = failed;
      cx.notify();
    });
  };

  /**
   * Registers the store in a folder, or makes one there.
   * @param {Context} cx
   * @param {"pick" | "make"} how
   */
  const storeIn = (cx, how) => {
    storeState = { ...storeState, busy: true, error: "" };
    cx.notify();
    cx.spawn(async (cx) => {
      const folder =
        how === "make"
          ? storeState.folder
          : await pickFolder({ prompt: "Use" });
      if (folder === null || folder === "") {
        storeState = { ...storeState, busy: false };
        cx.notify();
        return;
      }
      const made =
        how === "make" ? await setupStore(folder) : await registerStore(folder);
      if (made.state === "ready") {
        store = made.value.id;
        storeState = { busy: false, error: "", fix: "", folder, setup: false };
      } else if (made.state === "error") {
        storeState = {
          busy: false,
          error: made.error,
          fix: made.fix ?? "",
          folder,
          setup: made.setup === true,
        };
      }
      cx.notify();
    });
  };

  /** @param {Context} _cx */
  const render = (_cx) => {
    const k = tokens();
    const forge = info.state === "ready" ? info.value : null;

    /** @param {string} content */
    const note = (content) => wrapped(content, "ui", 12, k.muted);
    /** @param {string} content */
    const warn = (content) =>
      callout(wrapped(content, "ui", 12, k.fg), k.needs);
    /**
     * @param {string} label
     * @param {string} value
     */
    const fact = (label, value) =>
      h_flex()
        .gap(10)
        .items_center()
        .child(div().w(96).child(fieldLabel(label)))
        .child(fill(value, "mono", 12, k.fg));

    /**
     * @param {import("gpui-base").InputState} state
     */
    const inputOf = (state) =>
      Input.new(state)
        .h(32)
        .px(10)
        .border(2)
        .border_color(k.line)
        .bg(k.bg0)
        .text_size(13)
        .text_color(k.fg);

    /**
     * Where a forge's work comes from on a provider: its origin's project or repository, unless the box says another
     * backlog, which an origin elsewhere always needs (the yellow note says so).
     * @param {ModeKind} now
     */
    const backlogBlock = (now) => {
      const azdospec =
        now === MODE.azure && forge !== null && azdospecOf(forge) !== "";
      const name = PROVIDER[now] ?? now;
      const unit = now === MODE.github ? "repository" : "project";
      const elsewhere = forge !== null && forge.provider !== now;
      const other = elsewhere || otherBacklog;
      const items = now === MODE.azure ? "work items" : "issues";
      const field =
        now === MODE.azure || now === MODE.github || now === MODE.gitlab
          ? inputOf(backlogField[now])
          : null;
      return v_flex()
        .gap(10)
        .child(
          forge === null
            ? note("Reading the forge…")
            : fact("Code", codeOf(forge) || "no origin remote"),
        )
        .when(elsewhere && forge !== null, (el) =>
          el.child(
            warn(
              forge?.origin === ""
                ? `This forge has no origin remote: its ${items} come from the backlog you name below.`
                : `This forge's origin is not on ${name}: ${forge?.origin ?? ""}. Its ${items} come from the backlog you name below.`,
            ),
          ),
        )
        .child(
          control(
            h_flex()
              .gap(10)
              .items_center()
              .p(10)
              .border(2)
              .border_color(other ? BRAND.forgeGold : k.line)
              .child(checkBox(other))
              .child(
                v_flex()
                  .flex_1()
                  .min_w(0)
                  .gap(2)
                  .child(text("Work with another backlog", "ui", 13, k.fg))
                  .child(
                    wrapped(
                      elsewhere
                        ? `Needed: the origin is not on ${name}.`
                        : `The ${items} of another ${unit} than the origin's.`,
                      "ui",
                      11,
                      k.muted,
                    ),
                  ),
              ),
            "mode-other-backlog",
            (cx) => {
              if (elsewhere) return;
              otherBacklog = !otherBacklog;
              saving = "";
              cx.notify();
            },
          ),
        )
        .when(other && field !== null, (el) =>
          el.child(fieldLabel(`Backlog · ${unit}`)).child(field ?? div()),
        )
        .child(
          note(
            now === MODE.azure
              ? `Any URL of the project will do.${azdospec ? " It is kept where the azdospec skills read it, this clone's git config, which /azdo:init set up." : ""} Start work completes the ids you type with the backlog; a work item of another organization than the repository's gets a branch named EXT-<id>.`
              : `Any URL of the ${unit} will do. Start work takes its issues by URL or #number, a number completed with the backlog.`,
          ),
        );
    };

    const settings = () => {
      switch (kind) {
        case MODE.openspec:
          return v_flex()
            .gap(10)
            .child(
              choices(
                [
                  { label: "This repository", value: "repository" },
                  { label: "Another folder", value: "store" },
                ].map((option) =>
                  control(
                    choice(option.label, openspecIn === option.value),
                    `mode-openspec-${option.value}`,
                    (cx) => {
                      openspecIn =
                        option.value === "store" ? "store" : "repository";
                      cx.notify();
                    },
                  ),
                ),
              ),
            )
            .child(
              openspecIn === "repository"
                ? note(
                    "Changes live in openspec/ of this repository, versioned with the code: a worktree sees its branch's.",
                  )
                : v_flex()
                    .gap(8)
                    .child(
                      note(
                        "Changes live in a folder of their own, an OpenSpec store, so specs and code can be two projects.",
                      ),
                    )
                    .child(fact("Store", store === "" ? "none yet" : store))
                    .child(
                      control(
                        keyButton(
                          KEY_BUTTON.secondary,
                          storeState.busy ? "Working…" : "Pick a folder…",
                        ),
                        "mode-store-pick",
                        (cx) => storeIn(cx, "pick"),
                      ),
                    )
                    .when(storeState.error !== "", (el) =>
                      el.child(
                        warn(
                          [storeState.error, storeState.fix]
                            .filter(Boolean)
                            .join(" "),
                        ),
                      ),
                    )
                    .when(storeState.setup, (el) =>
                      el.child(
                        control(
                          keyButton(KEY_BUTTON.secondary, "Make a store there"),
                          "mode-store-make",
                          (cx) => storeIn(cx, "make"),
                        ),
                      ),
                    ),
            );
        case MODE.azure:
          return backlogBlock(MODE.azure);
        case MODE.github:
          return backlogBlock(MODE.github);
        case MODE.gitlab:
          return backlogBlock(MODE.gitlab);
        default:
          return note(
            "Start work asks what you want to work on, and each session designs it with you in the conversation before any code. Nothing is kept anywhere else.",
          );
      }
    };

    const { why } = chosen();
    return v_flex()
      .id("mode-dialog")
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
          .child(icon(ICON.settings, BRAND.forgeGold, 2))
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(4)
              .child(
                fill(
                  `FORGE MODE · ${target.forge.toUpperCase()}`,
                  "display",
                  13,
                  k.fg,
                ),
              )
              .child(
                fill(
                  "How this forge works: Start work offers what its mode takes.",
                  "ui",
                  12,
                  k.muted,
                ),
              ),
          ),
      )
      .child(
        h_flex()
          .flex_1()
          .min_h(0)
          .items_start()
          .gap(20)
          .p(20)
          .child(
            v_flex()
              .w(240)
              .flex_none()
              .gap(4)
              .children(
                MODES.map((mode) =>
                  control(
                    h_flex()
                      .gap(10)
                      .items_start()
                      .p(8)
                      .border(2)
                      .border_color(kind === mode.kind ? k.accent : k.bg1)
                      .hover((style) => style.bg(k.bg2))
                      .child(radio(kind === mode.kind))
                      .child(
                        v_flex()
                          .flex_1()
                          .min_w(0)
                          .gap(2)
                          .child(text(mode.name, "ui", 13, k.fg))
                          .child(wrapped(mode.about, "ui", 11, k.muted)),
                      ),
                    `mode-${mode.kind}`,
                    (cx) => {
                      if (kind !== mode.kind && info.state === "ready")
                        prefill(info.value, mode.kind);
                      kind = mode.kind;
                      saving = "";
                      cx.notify();
                    },
                  ),
                ),
              )
              .child(
                h_flex()
                  .gap(10)
                  .p(8)
                  .child(icon(ICON.lock, k.line))
                  .child(text("Jira · later", "ui", 13, k.line)),
              ),
          )
          .child(v_flex().flex_1().min_w(0).gap(10).child(settings())),
      )
      .child(
        h_flex()
          .items_center()
          .gap(12)
          .px(20)
          .py(12)
          .border_t(2)
          .border_color(k.line)
          .child(
            fill(
              info.state === "error"
                ? info.error
                : saving ||
                    (why ?? `Keeps ${target.forge}'s mode for this project.`),
              "ui",
              12,
              info.state === "error" || saving !== "" ? k.needs : k.muted,
            ),
          )
          .child(
            control(
              keyButton(KEY_BUTTON.ghost, "Cancel"),
              "mode-cancel",
              close,
            ),
          )
          .child(
            control(
              keyButton(
                why === undefined ? KEY_BUTTON.primary : KEY_BUTTON.ghost,
                "Keep",
              ),
              "mode-keep",
              keep,
            ),
          ),
      );
  };

  return {
    close: () => {
      loading?.cancel();
      for (const one of Object.values(backlogField)) one.release();
    },
    render,
  };
};
