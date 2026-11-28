// The IDE panel's pure logic, which imports neither herdr nor gpui-kit, under Node's own runner.
// Node is not herdr's runtime: herdr-app check and the gallery cover that.
// Run: node --test test/herdr-ide.test.mjs
import { deepStrictEqual, notStrictEqual, ok, strictEqual } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  afterActions,
  askedFile,
  ensureNotice,
  hiddenServersOf,
  holdsMod,
  IDE_AFTER,
  IDE_EDITOR,
  IDE_HEAD,
  IDE_LABEL,
  IDE_NODE,
  IDE_NOTICE,
  IDE_SAVE,
  IDE_SHOWS,
  IDE_START,
  IDE_STEP,
  IDE_TIMING,
  ideCheckoutAt,
  ideCheckoutOf,
  ideCheckouts,
  ideHeadHeight,
  ideMarkdownPath,
  ideOn,
  idePlan,
  ideShows,
  inCheckout,
  isMarkdown,
  keptRuns,
  liveAddressOf,
  liveIdes,
  liveTerminalNames,
  matchCheckouts,
  namesFile,
  parseEditors,
  parseEnsure,
  parseIdeAfter,
  parseIdeState,
  parseServers,
  placeholderContent,
  placeholderOf,
  removalNeedsAsk,
  SERVER_OFFER,
  SERVERS_LABEL,
  SERVERS_NOTICE,
  sameContent,
  saveAnswer,
  serverRows,
  serversLook,
  termContentOf,
  terminalContent,
  unsavedByName,
  withCheckout,
  withHidden,
  withIdeTerm,
  withPick,
  withRun,
} from "../herdr/mods/forgerdr/ide.js";

const API = "/work/shop/api";
const REFUNDS = "/work/worktrees/api/refunds";
const SPIKE = `${API}/.claude/worktrees/spike`;
const BISECT = "/work/worktrees/api/bisect";
const WEB = "/work/shop/web";
const HOME = "/home/me";

const TREE = [
  {
    name: "api",
    repo: API,
    worktrees: [
      {
        branch: "develop",
        files: 4,
        main: true,
        submodules: [
          { files: 2, name: "vendor/kit", top: `${API}/vendor/kit` },
        ],
        top: API,
      },
      {
        branch: "feature/devolución",
        files: 6,
        main: false,
        submodules: [],
        top: REFUNDS,
      },
      {
        branch: "(detached)",
        files: 0,
        main: false,
        submodules: [],
        top: SPIKE,
      },
      {
        branch: "(detached)",
        files: 1,
        main: false,
        submodules: [],
        top: BISECT,
      },
    ],
  },
  {
    name: "web",
    repo: WEB,
    worktrees: [
      { branch: "main", files: 0, main: true, submodules: [], top: WEB },
    ],
  },
];

/** @param {string} role @param {string} id @param {object} [more] */
const roleBlock = (role, id, more = {}) => ({
  content: { mod: "forgerdr", props: { role } },
  id,
  type: "block",
  ...more,
});

/**
 * A layout's node by its id; undefined when none has it.
 * @param {object} node
 * @param {string} id
 */
const nodeById = (node, id) =>
  node.id === id
    ? node
    : (node.children ?? [])
        .map((child) => nodeById(child, id))
        .find((found) => found !== undefined);

const LAYOUT = {
  children: [
    roleBlock("topbar", "topbar", { size: { px: 44 } }),
    {
      children: [
        {
          active: "files",
          children: [
            {
              children: [
                roleBlock("ide", "ide-head", { size: { px: 34 } }),
                {
                  active: "ide-term",
                  children: [
                    roleBlock("ide-empty", "ide-term"),
                    roleBlock("ide-markdown", "ide-markdown"),
                  ],
                  id: "ide-view",
                  type: "stack",
                },
              ],
              id: "files",
              type: "column",
            },
            roleBlock("changes", "changes"),
          ],
          id: "panel-body",
          type: "stack",
        },
      ],
      hidden: true,
      id: "panel",
      type: "column",
    },
  ],
  font: "Maple Mono NF",
  id: "root",
  type: "column",
};

test("the terminal block shows a ttt by its name, or the placeholder of the mod's copy", () => {
  deepStrictEqual(terminalContent("ide-0123456789ab"), {
    terminal: "ide-0123456789ab",
  });
  deepStrictEqual(placeholderContent("forgerdr"), {
    mod: "forgerdr",
    props: { role: "ide-empty" },
  });
  deepStrictEqual(placeholderContent("forgerdr-dev"), {
    mod: "forgerdr-dev",
    props: { role: "ide-empty" },
  });
});

test("only ide-term's content changes, in a new tree, and the layout given stays as it was", () => {
  const before = structuredClone(LAYOUT);
  const swapped = withIdeTerm(LAYOUT, terminalContent("ide-0123456789ab"));
  const expected = structuredClone(LAYOUT);
  nodeById(expected, IDE_NODE.term).content = {
    terminal: "ide-0123456789ab",
  };
  deepStrictEqual(swapped, expected);
  deepStrictEqual(LAYOUT, before);
  notStrictEqual(swapped, LAYOUT);
  deepStrictEqual(withIdeTerm(swapped, placeholderContent("forgerdr")), before);
});

test("ide-term the app dropped, once the ttt it showed ended, comes back first in ide-view, showing the content", () => {
  const dropped = structuredClone(LAYOUT);
  const view = nodeById(dropped, IDE_NODE.view);
  view.children = view.children.filter(({ id }) => id !== IDE_NODE.term);
  const before = structuredClone(dropped);
  const expected = structuredClone(LAYOUT);
  nodeById(expected, IDE_NODE.term).content = placeholderContent("forgerdr");
  const back = withIdeTerm(dropped, placeholderContent("forgerdr"));
  deepStrictEqual(back, expected);
  deepStrictEqual(dropped, before);
});

test("a layout without ide-term has nothing to swap", () => {
  strictEqual(
    withIdeTerm({ id: "root", type: "column" }, terminalContent("ide-1")),
    null,
  );
  strictEqual(
    withIdeTerm(
      {
        children: [
          roleBlock("changes", "changes"),
          { children: [roleBlock("ide", "ide-head")], id: "files" },
        ],
        id: "root",
      },
      terminalContent("ide-1"),
    ),
    null,
  );
});

test("the real layout puts the IDE where the app keys its Files panel: its header over the stack of the ttt and the markdown", () => {
  const layout = JSON.parse(
    readFileSync(
      new URL("../herdr/layouts/forgerdr.json", import.meta.url),
      "utf8",
    ),
  );
  ok(
    nodeById(layout, "panel-body").children.some(
      (child) => child.id === "files",
    ),
  );
  const files = nodeById(layout, "files");
  strictEqual(files.type, "column");
  deepStrictEqual(
    files.children.map((child) => child.id),
    [IDE_NODE.head, IDE_NODE.view],
  );
  deepStrictEqual(nodeById(layout, IDE_NODE.head).content, {
    mod: "forgerdr",
    props: { role: "ide" },
  });
  const view = nodeById(layout, IDE_NODE.view);
  strictEqual(view.type, "stack");
  strictEqual(view.active, IDE_NODE.term);
  deepStrictEqual(
    view.children.map((child) => child.id),
    [IDE_NODE.term, IDE_NODE.markdown],
  );
  deepStrictEqual(
    nodeById(layout, IDE_NODE.term).content,
    placeholderContent("forgerdr"),
  );
  deepStrictEqual(nodeById(layout, IDE_NODE.markdown).content, {
    mod: "forgerdr",
    props: { role: "ide-markdown" },
  });
  notStrictEqual(withIdeTerm(layout, terminalContent("ide-1")), null);
});

test("ide-term shows the checkout's ttt while it is live; else the placeholder, saying why", () => {
  ok(Object.isFrozen(IDE_SHOWS));
  ok(Object.isFrozen(IDE_STEP));
  const at = 1_000;
  /** @param {object} result @param {number} [when] */
  const answered = (result, when = at) => ({
    at: when,
    result,
    step: IDE_STEP.answered,
  });
  const base = {
    checkout: API,
    failure: null,
    live: new Set(["ide-1"]),
    now: at + 100,
    read: true,
  };
  const opening = { kind: IDE_SHOWS.opening };
  deepStrictEqual(ideShows({ ...base, read: false, run: undefined }), opening);
  deepStrictEqual(
    ideShows({
      ...base,
      failure: "forge-changes.sh tree: exit 1",
      read: false,
      run: undefined,
    }),
    { kind: IDE_SHOWS.unread, why: "forge-changes.sh tree: exit 1" },
  );
  deepStrictEqual(
    ideShows({ ...base, failure: "an older read failed", run: undefined }),
    opening,
  );
  deepStrictEqual(ideShows({ ...base, checkout: null, run: undefined }), {
    kind: IDE_SHOWS.none,
  });
  deepStrictEqual(ideShows({ ...base, run: undefined }), opening);
  deepStrictEqual(
    ideShows({ ...base, run: { at, step: IDE_STEP.ensuring } }),
    opening,
  );
  deepStrictEqual(
    ideShows({
      ...base,
      run: { step: IDE_STEP.failed, why: "hc could not start ttt" },
    }),
    { kind: IDE_SHOWS.failed, why: "hc could not start ttt" },
  );
  for (const state of [IDE_START.live, IDE_START.started])
    deepStrictEqual(
      ideShows({ ...base, run: answered({ name: "ide-1", state }) }),
      { kind: IDE_SHOWS.terminal, name: "ide-1" },
      state,
    );
  const late = answered({ name: "ide-2", state: IDE_START.started });
  deepStrictEqual(ideShows({ ...base, run: late }), opening);
  deepStrictEqual(
    ideShows({ ...base, now: at + IDE_TIMING.appear - 1, run: late }),
    opening,
  );
  deepStrictEqual(
    ideShows({ ...base, now: at + IDE_TIMING.appear, run: late }),
    { kind: IDE_SHOWS.ended },
  );
  deepStrictEqual(
    ideShows({
      ...base,
      now: at + 60_000,
      run: answered({ name: "ide-1", state: IDE_START.live }),
    }),
    { kind: IDE_SHOWS.terminal, name: "ide-1" },
  );
  for (const result of [
    { state: IDE_START.missing },
    { minimum: "1.14.0", state: IDE_START.old, version: "1.9.2" },
    { state: IDE_START.unreadable },
    { state: IDE_START.noprofile },
  ])
    deepStrictEqual(
      ideShows({ ...base, run: answered(result) }),
      { kind: IDE_SHOWS.notice, notice: ensureNotice(result) },
      result.state,
    );
});

test("the placeholder says what ide-term waits on, and offers the installer and another try where they help", () => {
  deepStrictEqual(placeholderOf({ kind: IDE_SHOWS.opening }), {
    again: null,
    install: null,
    quiet: true,
    sub: "",
    title: "Opening ttt…",
  });
  deepStrictEqual(placeholderOf({ kind: IDE_SHOWS.terminal, name: "ide-1" }), {
    again: null,
    install: null,
    quiet: true,
    sub: "",
    title: "Opening ttt…",
  });
  deepStrictEqual(placeholderOf({ kind: IDE_SHOWS.none }), {
    again: null,
    install: null,
    quiet: false,
    sub: "The IDE opens ttt in a git checkout of a forge on this computer.",
    title: "No checkout to open",
  });
  deepStrictEqual(
    placeholderOf({ kind: IDE_SHOWS.unread, why: "forge-changes.sh: exit 1" }),
    {
      again: "Try again",
      install: null,
      quiet: false,
      sub: "forge-changes.sh: exit 1",
      title: "The forge's checkouts could not be read",
    },
  );
  strictEqual(placeholderOf({ kind: IDE_SHOWS.none }).title, IDE_LABEL.none);
  deepStrictEqual(placeholderOf({ kind: IDE_SHOWS.ended }), {
    again: "Open again",
    install: null,
    quiet: false,
    sub: "ttt was quit, or stopped.",
    title: "ttt has ended",
  });
  deepStrictEqual(
    placeholderOf({ kind: IDE_SHOWS.failed, why: "hc could not start ttt" }),
    {
      again: "Open again",
      install: null,
      quiet: false,
      sub: "hc could not start ttt",
      title: "ttt could not be opened",
    },
  );
  const installer =
    "forgerdr's installer sets ttt up: run it in a tab, then try again.";
  for (const [result, install] of [
    [{ state: IDE_START.missing }, "Install ttt"],
    [
      { minimum: "1.14.0", state: IDE_START.old, version: "1.9.2" },
      "Update ttt",
    ],
    [{ state: IDE_START.noprofile }, "Install the profile"],
    [{ state: IDE_START.unreadable }, "Open the installer"],
  ]) {
    const notice = ensureNotice(result);
    deepStrictEqual(
      placeholderOf({ kind: IDE_SHOWS.notice, notice }),
      {
        again: "Try again",
        install,
        quiet: false,
        sub: installer,
        title: notice.text,
      },
      result.state,
    );
  }
});

test("what the header does on a look: ensure a checkout with no run or one left ensuring, write ide-term, leave the markdown; nothing while the IDE is not on show in this copy's layout", () => {
  const at = 1_000;
  const live = {
    at,
    result: { name: "ide-1", state: IDE_START.live },
    step: IDE_STEP.answered,
  };
  const terminal = { kind: IDE_SHOWS.terminal, name: "ide-1" };
  const base = {
    active: `${API}/README.md`,
    address: "t7",
    checkout: API,
    mod: "forgerdr",
    now: at + 100,
    ours: true,
    rendered: false,
    run: live,
    showing: true,
    shows: terminal,
    term: terminalContent("t7"),
  };
  const nothing = { ensure: null, select: false, write: null };
  deepStrictEqual(idePlan(base), nothing);
  deepStrictEqual(
    idePlan({ ...base, run: undefined, showing: false }),
    nothing,
  );
  deepStrictEqual(idePlan({ ...base, ours: false, run: undefined }), nothing);
  deepStrictEqual(idePlan({ ...base, run: undefined }), {
    ...nothing,
    ensure: API,
  });
  deepStrictEqual(
    idePlan({
      ...base,
      checkout: null,
      run: undefined,
      shows: { kind: IDE_SHOWS.none },
    }),
    { ...nothing, write: placeholderContent("forgerdr") },
  );
  const ensuring = { at, step: IDE_STEP.ensuring };
  const opening = {
    ...base,
    run: ensuring,
    shows: { kind: IDE_SHOWS.opening },
    term: placeholderContent("forgerdr"),
  };
  deepStrictEqual(
    idePlan({ ...opening, now: at + IDE_TIMING.stuck - 1 }),
    nothing,
  );
  deepStrictEqual(idePlan({ ...opening, now: at + IDE_TIMING.stuck }), {
    ...nothing,
    ensure: API,
  });
  deepStrictEqual(idePlan({ ...base, term: placeholderContent("forgerdr") }), {
    ...nothing,
    write: terminalContent("t7"),
  });
  // The block names the ttt by its address: herdr's menu and its right-click routing look a terminal up by address.
  deepStrictEqual(idePlan({ ...base, term: terminalContent("ide-1") }), {
    ...nothing,
    write: terminalContent("t7"),
  });
  // A ttt herdr-core does not list yet has no address to show: the placeholder stays until it does.
  deepStrictEqual(
    idePlan({ ...base, address: null, term: placeholderContent("forgerdr") }),
    nothing,
  );
  deepStrictEqual(
    idePlan({ ...base, mod: "forgerdr-dev", shows: { kind: IDE_SHOWS.ended } }),
    { ...nothing, write: placeholderContent("forgerdr-dev") },
  );
  deepStrictEqual(idePlan({ ...base, rendered: true }), nothing);
  deepStrictEqual(
    idePlan({ ...base, active: `${API}/src/main.js`, rendered: true }),
    { ...nothing, select: true },
  );
  deepStrictEqual(idePlan({ ...base, active: null, rendered: true }), {
    ...nothing,
    select: true,
  });
  deepStrictEqual(
    idePlan({
      ...base,
      rendered: true,
      shows: { kind: IDE_SHOWS.ended },
      term: placeholderContent("forgerdr"),
    }),
    { ...nothing, select: true },
  );
  // ide-term dropped by the app when its ttt ended: written back, and nothing selects it until it is there.
  deepStrictEqual(
    idePlan({
      ...base,
      rendered: true,
      shows: { kind: IDE_SHOWS.ended },
      term: undefined,
    }),
    { ...nothing, write: placeholderContent("forgerdr") },
  );
});

test("a layout is a copy's when ide-head is a block of that copy's mod", () => {
  ok(holdsMod({ mod: "forgerdr", props: { role: "ide" } }, "forgerdr"));
  ok(holdsMod({ mod: "forgerdr-dev", props: { role: "ide" } }, "forgerdr-dev"));
  ok(!holdsMod({ mod: "forgerdr-dev", props: { role: "ide" } }, "forgerdr"));
  ok(!holdsMod({ terminal: "ide-1" }, "forgerdr"));
  ok(!holdsMod(undefined, "forgerdr"));
  ok(!holdsMod(null, "forgerdr"));
  ok(!holdsMod("forgerdr", "forgerdr"));
});

test("a run is kept across a header's start only while another copy is ensuring it, until it is stuck", () => {
  const at = 1_000;
  const ensuring = { at, step: IDE_STEP.ensuring };
  const runs = {
    [API]: ensuring,
    [REFUNDS]: {
      at,
      result: { name: "ide-1", state: IDE_START.live },
      step: IDE_STEP.answered,
    },
    [WEB]: { step: IDE_STEP.failed, why: "no" },
  };
  deepStrictEqual(keptRuns(runs, at + 10), { [API]: ensuring });
  deepStrictEqual(keptRuns(runs, at + IDE_TIMING.stuck - 1), {
    [API]: ensuring,
  });
  deepStrictEqual(keptRuns(runs, at + IDE_TIMING.stuck), {});
  deepStrictEqual(keptRuns({}, at), {});
  ok(IDE_TIMING.stuck > IDE_TIMING.ensure);
});

test("a failure never takes the place of a ttt another ensure found running; anything else does", () => {
  const at = 1_000;
  const started = {
    at,
    result: { name: "ide-1", state: IDE_START.started },
    step: IDE_STEP.answered,
  };
  const failed = { step: IDE_STEP.failed, why: "hc could not start ttt" };
  const ensuring = { at: at + 5, step: IDE_STEP.ensuring };
  const old = {
    at,
    result: { minimum: "1.14.0", state: IDE_START.old, version: "1.9.2" },
    step: IDE_STEP.answered,
  };
  const live = {
    at: at + 9,
    result: { name: "ide-1", state: IDE_START.live },
    step: IDE_STEP.answered,
  };
  const before = { [API]: started };
  deepStrictEqual(withRun(before, API, failed), { [API]: started });
  deepStrictEqual(before, { [API]: started });
  deepStrictEqual(withRun(before, API, ensuring), { [API]: ensuring });
  deepStrictEqual(withRun({ [API]: ensuring }, API, failed), {
    [API]: failed,
  });
  deepStrictEqual(withRun({ [API]: old }, API, failed), { [API]: failed });
  deepStrictEqual(withRun({ [API]: failed }, API, live), { [API]: live });
  deepStrictEqual(withRun(before, WEB, failed), {
    [API]: started,
    [WEB]: failed,
  });
});

test("the rendered view follows the active file only while it is markdown and the view shows it", () => {
  strictEqual(
    ideMarkdownPath(`${API}/README.md`, IDE_NODE.markdown),
    `${API}/README.md`,
  );
  strictEqual(ideMarkdownPath(`${API}/README.md`, IDE_NODE.term), null);
  strictEqual(ideMarkdownPath(`${API}/README.md`, undefined), null);
  strictEqual(ideMarkdownPath(`${API}/main.js`, IDE_NODE.markdown), null);
  strictEqual(ideMarkdownPath("untitled", IDE_NODE.markdown), null);
  strictEqual(ideMarkdownPath(null, IDE_NODE.markdown), null);
});

test("a change in a file's folder reads it again only when the batch names it, or its folder whole", () => {
  const file = `${API}/docs/guide.md`;
  ok(namesFile([`${API}/docs/other.md`, file], file));
  ok(namesFile([`${API}/docs`], file));
  ok(!namesFile([`${API}/docs/other.md`, `${API}/docs/guide.md.tmp`], file));
  ok(!namesFile([`${API}/node_modules/x/index.js`], file));
  ok(!namesFile([], file));
  ok(namesFile(["/README.md"], "/README.md"));
  ok(namesFile(["/"], "/README.md"));
});

test("ide-term carries the ttt by its address, and the placeholder of the mod's copy for anything else", () => {
  const terminal = { kind: IDE_SHOWS.terminal, name: "ide-1" };
  deepStrictEqual(
    termContentOf(terminal, "forgerdr-dev", "t7"),
    terminalContent("t7"),
  );
  deepStrictEqual(
    termContentOf(terminal, "forgerdr-dev", null),
    placeholderContent("forgerdr-dev"),
  );
  for (const shows of [
    { kind: IDE_SHOWS.opening },
    { kind: IDE_SHOWS.none },
    { kind: IDE_SHOWS.ended },
    { kind: IDE_SHOWS.failed, why: "no" },
    { kind: IDE_SHOWS.notice, notice: ensureNotice({ state: "missing" }) },
  ])
    deepStrictEqual(
      termContentOf(shows, "forgerdr-dev", "t7"),
      placeholderContent("forgerdr-dev"),
      shows.kind,
    );
});

test("what ide-term carries is told from the content wanted by what it holds, whatever its keys' order", () => {
  ok(
    sameContent(
      { mod: "forgerdr", props: { role: "ide-empty" } },
      placeholderContent("forgerdr"),
    ),
  );
  ok(sameContent({ terminal: "ide-1" }, terminalContent("ide-1")));
  ok(!sameContent({ terminal: "ide-1" }, terminalContent("ide-2")));
  ok(
    !sameContent(
      placeholderContent("forgerdr-dev"),
      placeholderContent("forgerdr"),
    ),
  );
  ok(!sameContent({ terminal: "ide-1" }, placeholderContent("forgerdr")));
  ok(!sameContent(placeholderContent("forgerdr"), terminalContent("ide-1")));
  ok(
    !sameContent(
      { mod: "forgerdr", props: { more: 1, role: "ide-empty" } },
      placeholderContent("forgerdr"),
    ),
  );
  ok(!sameContent(undefined, terminalContent("ide-1")));
  ok(!sameContent(null, terminalContent("ide-1")));
});

test("the terminals live now are known by their names; one without a name, or finished, is none", () => {
  deepStrictEqual(
    liveTerminalNames([
      { address: "t1", state: "live" },
      { address: "t5", name: "ide-1", state: "live" },
      { address: "t6", name: "ide-2", state: "finished" },
      { address: "t7", name: "", state: "live" },
      { address: "t8", name: "ide-3" },
      { address: "t9", name: "ide-4", state: "live" },
    ]),
    new Set(["ide-1", "ide-4"]),
  );
  deepStrictEqual(liveTerminalNames([]), new Set());
});

test("the selector offers every checkout but submodules, in the sidebar's order; a detached one by its folder too", () => {
  deepStrictEqual(ideCheckouts(TREE), [
    {
      branch: "develop",
      label: "api · develop",
      main: true,
      repo: "api",
      top: API,
    },
    {
      branch: "feature/devolución",
      label: "api · feature/devolución",
      main: false,
      repo: "api",
      top: REFUNDS,
    },
    {
      branch: "(detached)",
      label: "api · (detached) · spike",
      main: false,
      repo: "api",
      top: SPIKE,
    },
    {
      branch: "(detached)",
      label: "api · (detached) · bisect",
      main: false,
      repo: "api",
      top: BISECT,
    },
    { branch: "main", label: "web · main", main: true, repo: "web", top: WEB },
  ]);
  deepStrictEqual(ideCheckouts([]), []);
});

test("a search keeps the checkouts that hold every word, by repository and branch (and a detached one's folder), without accents or case", () => {
  const options = ideCheckouts(TREE);
  /** @param {string} query */
  const found = (query) =>
    matchCheckouts(options, query).map((option) => option.top);
  deepStrictEqual(found(""), [API, REFUNDS, SPIKE, BISECT, WEB]);
  deepStrictEqual(found("   "), [API, REFUNDS, SPIKE, BISECT, WEB]);
  deepStrictEqual(found("  DEVOLUCION "), [REFUNDS]);
  deepStrictEqual(found("api feature"), [REFUNDS]);
  deepStrictEqual(found("Develop API"), [API]);
  deepStrictEqual(found("web"), [WEB]);
  deepStrictEqual(found("detached"), [SPIKE, BISECT]);
  deepStrictEqual(found("api BISECT"), [BISECT]);
  deepStrictEqual(found("shop"), []);
  deepStrictEqual(found("nothing"), []);
});

test("the shown space's checkout is the deepest that holds its folder, a submodule's superproject; none outside every one", () => {
  const options = ideCheckouts(TREE);
  strictEqual(ideCheckoutAt(options, API), API);
  strictEqual(ideCheckoutAt(options, `${REFUNDS}/src/orders`), REFUNDS);
  strictEqual(ideCheckoutAt(options, `${SPIKE}/src`), SPIKE);
  strictEqual(ideCheckoutAt(options, `${API}/vendor/kit/lib`), API);
  strictEqual(ideCheckoutAt(options, "/work/shop/api-old"), null);
  strictEqual(ideCheckoutAt(options, "/work/shop"), null);
  strictEqual(ideCheckoutAt([], API), null);
  strictEqual(
    ideCheckoutOf(ideCheckoutAt(options, "/work/shop"), null, options),
    API,
  );
});

test("the IDE shows what was picked while it is there, else the shown checkout, else the first", () => {
  const options = ideCheckouts(TREE);
  strictEqual(ideCheckoutOf(API, REFUNDS, options), REFUNDS);
  strictEqual(ideCheckoutOf(API, null, options), API);
  strictEqual(ideCheckoutOf(WEB, "/work/gone", options), WEB);
  strictEqual(ideCheckoutOf(null, "/work/gone", options), API);
  strictEqual(ideCheckoutOf("/work/elsewhere", null, options), API);
  strictEqual(ideCheckoutOf(null, null, options), API);
  strictEqual(ideCheckoutOf(API, REFUNDS, []), null);
});

test("markdown is told by its extension, whatever its case", () => {
  ok(isMarkdown("/work/shop/api/README.md"));
  ok(isMarkdown("docs/Guide.MARKDOWN"));
  ok(isMarkdown("notes.Md"));
  ok(!isMarkdown("/work/shop/api/src/main.js"));
  ok(!isMarkdown("README.md.bak"));
  ok(!isMarkdown("page.mdx"));
  ok(!isMarkdown("md"));
  ok(!isMarkdown(""));
  ok(!isMarkdown(null));
});

test("the ttt's state reads only in its shape, with its own fields", () => {
  deepStrictEqual(
    parseIdeState(
      JSON.stringify({
        active: `${API}/README.md`,
        checkout: API,
        more: 1,
        unsaved: [`${API}/a.ts`, `${API}/b.ts`],
      }),
    ),
    {
      active: `${API}/README.md`,
      checkout: API,
      order: null,
      unsaved: [`${API}/a.ts`, `${API}/b.ts`],
    },
  );
  deepStrictEqual(
    parseIdeState('{"checkout":"/work/shop/api","active":null,"unsaved":[]}'),
    { active: null, checkout: API, order: null, unsaved: [] },
  );
  deepStrictEqual(
    parseIdeState(
      '{"checkout":"/work/shop/api","active":null,"unsaved":[],"order":"k3x"}',
    ),
    { active: null, checkout: API, order: "k3x", unsaved: [] },
  );
  for (const text of [
    null,
    "",
    "{not json",
    "null",
    "[]",
    '"state"',
    '{"active":null,"unsaved":[]}',
    '{"checkout":"","active":null,"unsaved":[]}',
    '{"checkout":7,"active":null,"unsaved":[]}',
    '{"checkout":"/a","unsaved":[]}',
    '{"checkout":"/a","active":3,"unsaved":[]}',
    '{"checkout":"/a","active":null}',
    '{"checkout":"/a","active":null,"unsaved":{}}',
    '{"checkout":"/a","active":null,"unsaved":"/a/b"}',
    '{"checkout":"/a","active":null,"unsaved":["/a/b",4]}',
    '{"checkout":"/a","active":null,"unsaved":[],"order":7}',
    '{"checkout":"/a","active":null,"unsaved":[],"order":""}',
  ])
    strictEqual(parseIdeState(text), null, String(text));
});

test("removing a worktree asks when a live ttt there holds unsaved files, or its state cannot be read; never with no ttt", () => {
  ok(removalNeedsAsk({ name: "ide-1", unsaved: [`${REFUNDS}/a.ts`] }));
  ok(removalNeedsAsk({ name: "ide-1", unsaved: null }));
  ok(!removalNeedsAsk({ name: "ide-1", unsaved: [] }));
  ok(!removalNeedsAsk(null));
});

test("every copy is told only what the live ttts hold unsaved, by name, not their active file", () => {
  deepStrictEqual(
    unsavedByName({
      "ide-1": {
        active: `${API}/a.ts`,
        checkout: API,
        order: "k3x",
        unsaved: [`${API}/a.ts`],
      },
      "ide-2": { active: null, checkout: REFUNDS, order: null, unsaved: [] },
    }),
    { "ide-1": [`${API}/a.ts`], "ide-2": [] },
  );
  deepStrictEqual(unsavedByName({}), {});
});

test("an order to save is answered once the state carries its id: saved with nothing listed, else ttt asks about a file", () => {
  ok(Object.isFrozen(IDE_SAVE));
  const listed = [`${API}/a.ts`, `${API}/b.ts`];
  const answered = (active, unsaved, order = "k3x") => ({
    active,
    checkout: API,
    order,
    unsaved,
  });
  deepStrictEqual(saveAnswer(null, "k3x"), { kind: IDE_SAVE.pending });
  deepStrictEqual(saveAnswer(answered(null, listed, null), "k3x"), {
    kind: IDE_SAVE.pending,
  });
  deepStrictEqual(saveAnswer(answered(null, [], "old"), "k3x"), {
    kind: IDE_SAVE.pending,
  });
  deepStrictEqual(saveAnswer(answered(`${API}/a.ts`, []), "k3x"), {
    kind: IDE_SAVE.saved,
  });
  deepStrictEqual(saveAnswer(answered(`${API}/b.ts`, listed), "k3x"), {
    file: `${API}/b.ts`,
    kind: IDE_SAVE.asking,
  });
});

test("a pick is kept for its space, the picks of spaces gone dropped, in a new record", () => {
  const picks = { gone: REFUNDS, sp1: API };
  deepStrictEqual(withPick(picks, "sp2", REFUNDS, ["sp1", "sp2"]), {
    sp1: API,
    sp2: REFUNDS,
  });
  deepStrictEqual(withPick(picks, "sp1", REFUNDS, ["sp1"]), { sp1: REFUNDS });
  deepStrictEqual(picks, { gone: REFUNDS, sp1: API });
});

test("the IDE's ttts live now are the live terminals forge-ide.sh labelled with their checkout, by name", () => {
  deepStrictEqual(
    liveIdes([
      {
        address: "t1",
        labels: { "forge.ide": API },
        name: "ide-1",
        state: "live",
      },
      {
        address: "t2",
        labels: { "forge.ide": REFUNDS },
        name: "ide-2",
        state: "finished",
      },
      { address: "t3", labels: {}, name: "ide-3", state: "live" },
      { address: "t4", labels: { "forge.ide": WEB }, state: "live" },
      { address: "t5", name: "ide-5", state: "live" },
      {
        address: "t6",
        labels: { "forge.ide": "" },
        name: "ide-6",
        state: "live",
      },
      {
        address: "t7",
        labels: { "forge.ide": BISECT },
        name: "ide-7",
        state: "live",
      },
    ]),
    [
      { checkout: API, name: "ide-1" },
      { checkout: BISECT, name: "ide-7" },
    ],
  );
  deepStrictEqual(liveIdes([]), []);
});

test("the ttt open on a checkout is the live one there, with what it holds unsaved; none when none runs there", () => {
  const ttts = [
    { checkout: API, name: "ide-1" },
    { checkout: REFUNDS, name: "constructor" },
  ];
  const dirty = [`${API}/a.ts`];
  const states = { "ide-1": dirty, "ide-9": dirty };
  deepStrictEqual(ideOn(ttts, states, API), { name: "ide-1", unsaved: dirty });
  deepStrictEqual(ideOn(ttts, states, REFUNDS), {
    name: "constructor",
    unsaved: null,
  });
  strictEqual(ideOn(ttts, states, WEB), null);
  strictEqual(ideOn([], states, API), null);
});

test("after an order to save, ttt asks about its active file while it stays listed, else the first listed; nothing once every file is saved", () => {
  const listed = [`${API}/a.ts`, `${API}/b.ts`];
  strictEqual(
    askedFile({ active: `${API}/b.ts`, checkout: API, unsaved: listed }),
    `${API}/b.ts`,
  );
  strictEqual(
    askedFile({ active: `${API}/c.ts`, checkout: API, unsaved: listed }),
    `${API}/a.ts`,
  );
  strictEqual(
    askedFile({ active: null, checkout: API, unsaved: listed }),
    `${API}/a.ts`,
  );
  strictEqual(
    askedFile({ active: `${API}/a.ts`, checkout: API, unsaved: [] }),
    null,
  );
});

test("a file shows by its path in its checkout; one outside it, as it is", () => {
  strictEqual(inCheckout(API, `${API}/src/a.ts`), "src/a.ts");
  strictEqual(inCheckout(API, `${API}-old/a.ts`), `${API}-old/a.ts`);
  strictEqual(inCheckout(API, "/elsewhere/a.ts"), "/elsewhere/a.ts");
  strictEqual(inCheckout("/", "/a.ts"), "a.ts");
});

test("what follows a Save or a Discard opens the Remove worktree dialog where it was asked from, switching nothing", () => {
  const calls = [];
  const actions = afterActions({
    openRemoval: (target) => calls.push(["removal", target]),
  });
  ok(Object.isFrozen(actions));
  deepStrictEqual(Object.keys(actions), [IDE_AFTER.remove]);
  actions.remove({ dir: `${REFUNDS}/src`, forge: "api" });
  deepStrictEqual(calls, [
    ["removal", { dir: `${REFUNDS}/src`, forge: "api" }],
  ]);
});

test("what follows a Save or a Discard reads from the dialog's props in its own shape, with its own fields; anything else is none", () => {
  ok(Object.isFrozen(IDE_AFTER));
  deepStrictEqual(
    parseIdeAfter({
      dir: `${REFUNDS}/src`,
      forge: "api",
      kind: "remove",
      more: 1,
    }),
    { dir: `${REFUNDS}/src`, forge: "api", kind: IDE_AFTER.remove },
  );
  for (const value of [
    undefined,
    null,
    "remove",
    [{ dir: REFUNDS, forge: "api", kind: "remove" }],
    {},
    { dir: REFUNDS, kind: "remove" },
    { forge: "api", kind: "remove" },
    { dir: "", forge: "api", kind: "remove" },
    { kind: "show", space: "sp1" },
    { folder: API, kind: "open" },
    { kind: "pick", space: "sp1", top: REFUNDS },
    { dir: REFUNDS, forge: "api", kind: "constructor" },
  ])
    strictEqual(parseIdeAfter(value), null, JSON.stringify(value));
});

test("ensure's answers read in their shapes, with their own fields", () => {
  ok(Object.isFrozen(IDE_START));
  deepStrictEqual(Object.values(IDE_START).toSorted(), [
    "live",
    "missing",
    "noprofile",
    "old",
    "started",
    "unreadable",
  ]);
  deepStrictEqual(parseEnsure('{"state":"live","name":"ide-0123456789ab"}'), {
    name: "ide-0123456789ab",
    state: "live",
  });
  deepStrictEqual(
    parseEnsure('{"state":"started","name":"ide-0123456789ab","pid":4}'),
    { name: "ide-0123456789ab", state: "started" },
  );
  deepStrictEqual(
    parseEnsure('{"state":"old","version":"1.9.2","minimum":"1.14.0"}'),
    { minimum: "1.14.0", state: "old", version: "1.9.2" },
  );
  deepStrictEqual(parseEnsure('{"state":"missing","name":"x"}'), {
    state: "missing",
  });
  deepStrictEqual(parseEnsure('{"state":"unreadable"}'), {
    state: "unreadable",
  });
  deepStrictEqual(parseEnsure('{"state":"noprofile"}'), { state: "noprofile" });
  for (const text of [
    "",
    "{not json",
    "null",
    "[]",
    '"live"',
    "{}",
    '{"state":"live"}',
    '{"state":"started","name":""}',
    '{"state":"live","name":7}',
    '{"state":"old"}',
    '{"state":"old","version":"1.9.2"}',
    '{"state":"old","version":"","minimum":"1.14.0"}',
    '{"state":"old","version":"1.9.2","minimum":""}',
    '{"state":"asleep"}',
    '{"state":"constructor"}',
    '{"state":7}',
  ])
    strictEqual(parseEnsure(text), null, text);
});

test("the panel says why the ttt cannot run, with the minimum ensure gave", () => {
  ok(Object.isFrozen(IDE_NOTICE));
  deepStrictEqual(ensureNotice({ state: "missing" }), {
    kind: "install",
    text: "ttt is not installed",
  });
  deepStrictEqual(
    ensureNotice({ minimum: "1.14.0", state: "old", version: "1.9.2" }),
    {
      kind: "update",
      text: "ttt 1.9.2 is older than the 1.14.0 forgerdr needs",
    },
  );
  deepStrictEqual(
    ensureNotice({ minimum: "2.0.0", state: "old", version: "1.14.0" }),
    {
      kind: "update",
      text: "ttt 1.14.0 is older than the 2.0.0 forgerdr needs",
    },
  );
  deepStrictEqual(ensureNotice({ state: "unreadable" }), {
    kind: "unreadable",
    text: "ttt's version cannot be read",
  });
  deepStrictEqual(ensureNotice({ state: "noprofile" }), {
    kind: "profile",
    text: "forgerdr's ttt profile is missing",
  });
  strictEqual(ensureNotice({ name: "ide-1", state: "live" }), null);
  strictEqual(ensureNotice({ name: "ide-1", state: "started" }), null);
});

test("the language servers read entry by entry: a malformed one is dropped, never thrown", () => {
  const typescript = {
    install: [
      "npm",
      "install",
      "-g",
      "typescript-language-server",
      "typescript@6",
    ],
    language: "TypeScript / JavaScript",
    needs: null,
    server: "typescript-language-server",
  };
  const go = {
    install: [
      "env",
      "GOBIN=/home/someone/.local/bin",
      "go",
      "install",
      "golang.org/x/tools/gopls@latest",
    ],
    language: "Go",
    needs: "env",
    server: "gopls",
  };
  deepStrictEqual(
    parseServers(
      JSON.stringify([
        { ...typescript, more: true },
        { ...go, language: "" },
        { ...go, server: 3 },
        { ...go, install: [] },
        { ...go, install: ["go", 1] },
        { ...go, install: "go install" },
        { ...go, needs: 0 },
        { ...go, needs: "" },
        { install: go.install, language: "Go", server: "gopls" },
        null,
        "gopls",
        [go],
        go,
      ]),
    ),
    [typescript, go],
  );
  deepStrictEqual(parseServers("[]"), []);
  for (const text of ["", "{not json", "null", "{}", '"servers"', "7"])
    deepStrictEqual(parseServers(text), [], text);
});

const TYPESCRIPT = Object.freeze({
  install: [
    "npm",
    "install",
    "-g",
    "typescript-language-server",
    "typescript@6",
  ],
  language: "TypeScript / JavaScript",
  needs: null,
  server: "typescript-language-server",
});
const GOPLS = Object.freeze({
  install: [
    "env",
    "GOBIN=/home/someone/.local/bin",
    "go",
    "install",
    "golang.org/x/tools/gopls@latest",
  ],
  language: "Go",
  needs: "go",
  server: "gopls",
});
const RUST = Object.freeze({
  install: ["rustup", "component", "add", "rust-analyzer"],
  language: "Rust",
  needs: null,
  server: "rust-analyzer",
});

test("the notice lists the language servers missing and not hidden, each with Install in a tab of its own in the user's home, where the servers are looked for, or the program its install needs; nothing when every one is hidden or none is missing", () => {
  ok(Object.isFrozen(SERVERS_LABEL));
  ok(Object.isFrozen(SERVER_OFFER));
  const typescript = {
    label: SERVERS_LABEL.install,
    language: "TypeScript / JavaScript",
    offer: SERVER_OFFER.install,
    server: "typescript-language-server",
    tab: {
      argv: [
        "npm",
        "install",
        "-g",
        "typescript-language-server",
        "typescript@6",
      ],
      folder: HOME,
      name: "install typescript-language-server",
    },
  };
  const rust = {
    label: SERVERS_LABEL.install,
    language: "Rust",
    offer: SERVER_OFFER.install,
    server: "rust-analyzer",
    tab: {
      argv: ["rustup", "component", "add", "rust-analyzer"],
      folder: HOME,
      name: "install rust-analyzer",
    },
  };
  const go = {
    label: "Needs go",
    language: "Go",
    offer: SERVER_OFFER.needs,
    server: "gopls",
  };
  deepStrictEqual(serverRows([TYPESCRIPT, GOPLS, RUST], [], HOME), [
    typescript,
    go,
    rust,
  ]);
  deepStrictEqual(
    serverRows([TYPESCRIPT, GOPLS, RUST], ["gopls", "pyright"], HOME),
    [typescript, rust],
  );
  deepStrictEqual(
    serverRows([TYPESCRIPT, GOPLS], ["gopls", TYPESCRIPT.server], HOME),
    [],
  );
  deepStrictEqual(serverRows([], [], HOME), []);
  deepStrictEqual(serverRows([], ["gopls"], HOME), []);
});

test("the servers are looked at once when another checkout shows, and once when the IDE comes back on show; never while it does not show in this copy's layout", () => {
  const shown = { checkout: API, ours: true, showing: true };
  deepStrictEqual(serversLook(null, shown), { look: API, seen: API });
  deepStrictEqual(serversLook(API, shown), { look: null, seen: API });
  deepStrictEqual(serversLook(API, { ...shown, checkout: WEB }), {
    look: WEB,
    seen: WEB,
  });
  deepStrictEqual(
    serversLook(WEB, { ...shown, checkout: WEB, showing: false }),
    {
      look: null,
      seen: null,
    },
  );
  deepStrictEqual(serversLook(null, { ...shown, checkout: WEB }), {
    look: WEB,
    seen: WEB,
  });
  deepStrictEqual(serversLook(WEB, { ...shown, ours: false }), {
    look: null,
    seen: null,
  });
  deepStrictEqual(serversLook(null, { ...shown, ours: false }), {
    look: null,
    seen: null,
  });
  deepStrictEqual(serversLook(API, { ...shown, checkout: null }), {
    look: null,
    seen: null,
  });
});

test("the header is as tall as its row alone, grows by the notice's title and a line per server it lists, and is the list's height while the checkouts are picked from", () => {
  ok(Object.isFrozen(IDE_HEAD));
  ok(Object.isFrozen(SERVERS_NOTICE));
  strictEqual(ideHeadHeight(false, 0), 60);
  strictEqual(ideHeadHeight(false, 1), 60 + 6 + 12 + 22 + 26);
  strictEqual(ideHeadHeight(false, 2), 60 + 6 + 12 + 22 + 2 * 26);
  strictEqual(ideHeadHeight(true, 0), 360);
  strictEqual(ideHeadHeight(true, 3), 360);
});

test("the language servers each checkout lacks are kept by checkout, in a new record: a checkout that lacks none is let go, and so are the ones the forge no longer holds", () => {
  const before = Object.freeze({
    [REFUNDS]: Object.freeze([RUST]),
    [WEB]: Object.freeze([TYPESCRIPT]),
  });
  const live = [API, WEB];
  deepStrictEqual(withCheckout(before, API, [GOPLS], live), {
    [API]: [GOPLS],
    [WEB]: [TYPESCRIPT],
  });
  deepStrictEqual(withCheckout(before, WEB, [RUST], live), { [WEB]: [RUST] });
  deepStrictEqual(withCheckout(before, WEB, [], live), {});
  deepStrictEqual(withCheckout(before, API, [], [API, WEB, REFUNDS]), before);
  // The checkout just looked at is kept even when the forge's checkouts were read without it.
  deepStrictEqual(withCheckout(before, BISECT, [GOPLS], live), {
    [BISECT]: [GOPLS],
    [WEB]: [TYPESCRIPT],
  });
  deepStrictEqual(before, { [REFUNDS]: [RUST], [WEB]: [TYPESCRIPT] });
});

test("hiding the notice hides what it lists for that checkout of that forge, in a new record: a server missing later shows again, one installed since is let go, the forge's checkouts gone are let go, other forges are left as they were", () => {
  const before = Object.freeze({
    "/work/other": Object.freeze({
      "/work/other/app": Object.freeze(["gopls"]),
    }),
    "/work/shop": Object.freeze({
      [REFUNDS]: Object.freeze(["pyright"]),
      [WEB]: Object.freeze(["pyright"]),
    }),
  });
  const hidden = withHidden(before, {
    checkout: API,
    forge: "/work/shop",
    live: [API, WEB],
    servers: [TYPESCRIPT, GOPLS],
  });
  deepStrictEqual(hidden, {
    "/work/other": { "/work/other/app": ["gopls"] },
    "/work/shop": {
      [API]: ["typescript-language-server", "gopls"],
      [WEB]: ["pyright"],
    },
  });
  deepStrictEqual(before["/work/shop"][REFUNDS], ["pyright"]);
  deepStrictEqual(
    serverRows([TYPESCRIPT, GOPLS], hidden["/work/shop"][API], API),
    [],
  );
  deepStrictEqual(
    serverRows([TYPESCRIPT, GOPLS, RUST], hidden["/work/shop"][API], API).map(
      ({ server }) => server,
    ),
    ["rust-analyzer"],
  );
  deepStrictEqual(
    withHidden(hidden, {
      checkout: API,
      forge: "/work/shop",
      live: [API, WEB],
      servers: [GOPLS, RUST],
    })["/work/shop"][API],
    ["gopls", "rust-analyzer"],
  );
  deepStrictEqual(
    withHidden(
      {},
      { checkout: API, forge: "/work/new", live: [API], servers: [RUST] },
    ),
    { "/work/new": { [API]: ["rust-analyzer"] } },
  );
});

test("the servers hidden read from the header's storage in their shape, by forge and checkout: an entry that is not in it is dropped, never thrown", () => {
  deepStrictEqual(
    hiddenServersOf({
      "/work/list": ["gopls"],
      "/work/other": {},
      "/work/shop": {
        [API]: ["gopls", "pyright"],
        [BISECT]: [1],
        [REFUNDS]: [],
        [WEB]: "gopls",
      },
      "/work/text": "gopls",
    }),
    {
      "/work/other": {},
      "/work/shop": { [API]: ["gopls", "pyright"], [REFUNDS]: [] },
    },
  );
  for (const value of [null, undefined, [], ["gopls"], "gopls", 7])
    deepStrictEqual(hiddenServersOf(value), {}, String(value));
});

test("the editors read entry by entry: one of another id, or malformed, is dropped, never thrown", () => {
  ok(Object.isFrozen(IDE_EDITOR));
  const zed = { id: "zed", name: "Zed" };
  const code = { id: "code", name: "VS Code" };
  deepStrictEqual(
    parseEditors(
      JSON.stringify([
        { ...zed, more: true },
        { id: "vim", name: "Vim" },
        { id: "constructor", name: "Nothing" },
        { id: "zed" },
        { id: "zed", name: "" },
        { id: 1, name: "Zed" },
        null,
        "code",
        [code],
        code,
      ]),
    ),
    [zed, code],
  );
  deepStrictEqual(parseEditors("[]"), []);
  for (const text of ["", "{not json", "null", "{}", '"editors"', "7"])
    deepStrictEqual(parseEditors(text), [], text);
});

test("a live ttt's address, by its name; none for one that is not live or not listed", () => {
  const terminals = [
    { address: "t7", labels: {}, name: "ide-1", state: "live" },
    { address: "t8", labels: {}, name: "ide-2", state: "finished" },
  ];
  strictEqual(liveAddressOf(terminals, "ide-1"), "t7");
  strictEqual(liveAddressOf(terminals, "ide-2"), null);
  strictEqual(liveAddressOf(terminals, "ide-3"), null);
});

test("a switch of checkout asks nothing, unsaved files or not: only Remove worktree goes through the unsaved-files dialog", () => {
  // Each checkout's ttt lives on with its unsaved edits, so a click on a space, a repository, a forge tab or a checkout in
  // the IDE's own list loses nothing and never reaches roles/ide-leave.js; only the forge menu's removal does.
  const roles = new URL("../herdr/mods/forgerdr/roles/", import.meta.url);
  const guarded = readdirSync(roles)
    .filter((name) => name.endsWith(".js"))
    .flatMap((name) => {
      const imported = /import \{([^}]*)\} from "\.\/ide-leave\.js"/.exec(
        readFileSync(new URL(name, roles), "utf8"),
      );
      return imported === null
        ? []
        : [
            [
              name,
              imported[1]
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean),
            ],
          ];
    });
  deepStrictEqual(Object.fromEntries(guarded), {
    "forge-menu.js": ["removeWorktreeAsking"],
  });
});
