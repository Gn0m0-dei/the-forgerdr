// The IDE panel's side of bin/forge-ide.sh and of the layout: a checkout's ttt ensured through the script, how each one
// goes kept for every copy in shared state, what the panel shows now as its header's copy decides it for the others,
// the checkouts picked by hand in it, the live ttts' state files followed in their folder, a ttt ordered to save or
// stopped, the editors installed and a path opened in one, the language servers a checkout lacks and the ones hidden in
// its notice, and the layout file written again with ide-term showing another content. The script's answers are parsed
// by ide.js (test/herdr-ide.test.mjs) and its format tested from bash (test/ide.test.sh).
import {
  appHome,
  exec,
  notify,
  readTextFile,
  setShared,
  shared,
  spaces,
  watchFolder,
  writeTextFile,
} from "herdr";
import { shownForge } from "../changes.js";
import {
  hiddenServersOf,
  holdsMod,
  IDE_NODE,
  IDE_SAVE,
  IDE_STEP,
  IDE_TIMING,
  keptRuns,
  liveIdes,
  parseEditors,
  parseEnsure,
  parseIdeState,
  parseServers,
  sameContent,
  saveAnswer,
  unsavedByName,
  withIdeTerm,
  withPick,
  withRun,
} from "../ide.js";
import { MOD, ROOT } from "../name.js";
import { readChanges } from "./changes.js";
import { followFolder } from "./follow.js";
import { readFolders, readSpacesGit } from "./git.js";
import { nodeIn } from "./layout.js";
import { readTerminals } from "./terminals.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Task} Task */
/** @typedef {import("../changes.js").ShownForge} ShownForge */
/** @typedef {import("../changes.js").TreeRepo} TreeRepo */
/** @typedef {import("../ide.js").Editor} Editor */
/** @typedef {import("../ide.js").IdeRun} IdeRun */
/** @typedef {import("../ide.js").SaveAnswer} SaveAnswer */
/** @typedef {import("../ide.js").IdeShows} IdeShows */
/** @typedef {import("../ide.js").IdeState} IdeState */
/** @typedef {import("../ide.js").HiddenServers} HiddenServers */
/** @typedef {import("../ide.js").IdeTermContent} IdeTermContent */
/** @typedef {import("../ide.js").LanguageServer} LanguageServer */
/** @typedef {import("./layout.js").LayoutNode} LayoutNode */

const SCRIPT = `${ROOT}/bin/forge-ide.sh`;

const KEY = Object.freeze({
  editors: "forgerdr.ide.editors",
  panel: "forgerdr.ide",
  picks: "forgerdr.ide.picks",
  runs: "forgerdr.ide.runs",
  states: "forgerdr.ide.states",
});

// What the header's copy keeps in its own storage: the language servers hidden in the notices.
const STORE = Object.freeze({ hidden: "forgerdr.ide.servers.hidden" });

/** @returns {Record<string, IdeRun>} by checkout */
export const readRuns = () =>
  // Only publishRuns writes the key, always as runs by checkout.
  /** @type {Record<string, IdeRun> | null} */ (shared(KEY.runs)) ?? {};

/** @param {Record<string, IdeRun>} runs */
const publishRuns = (runs) => {
  if (JSON.stringify(runs) !== JSON.stringify(readRuns()))
    setShared(KEY.runs, runs);
};

/** @param {string} checkout @param {IdeRun} run */
const keepRun = (checkout, run) =>
  publishRuns(withRun(readRuns(), checkout, run));

/**
 * Forgets how the ttts went, but for the ensures another copy has on its way: the header's copy, starting, ensures the
 * rest again.
 */
export const forgetRuns = () => publishRuns(keptRuns(readRuns(), Date.now()));

/** @returns {Record<string, string>} the checkout picked by hand in the IDE, by its folder, by space id */
export const readPicks = () =>
  // Only keepPick writes the key, always as folders by space id.
  /** @type {Record<string, string> | null} */ (shared(KEY.picks)) ?? {};

/**
 * Keeps the checkout picked by hand in the IDE for a space, for every copy: the header shows it there from then on.
 * @param {string} space its id
 * @param {string} top the checkout's folder
 */
export const keepPick = (space, top) =>
  setShared(
    KEY.picks,
    withPick(
      readPicks(),
      space,
      top,
      spaces().map(({ id }) => id),
    ),
  );

/**
 * The forge shown now, and its checkouts as the session bar's copy read them.
 * @typedef {object} ShownCheckouts
 * @property {ShownForge | null} forge null with no space shown
 * @property {TreeRepo[] | null} tree null until the session bar's copy has read this forge
 */

/** @returns {ShownCheckouts} */
export const shownCheckouts = () => {
  const forge = shownForge(spaces(), readSpacesGit(), readFolders());
  const read = readChanges();
  return {
    forge,
    tree: forge !== null && read?.forge === forge.key ? read.tree : null,
  };
};

/**
 * Runs one of forge-ide.sh's commands for what it prints, within IDE_TIMING.script unless told otherwise; throws, saying
 * why, when it cannot run or fails.
 * @param {string[]} args the command and its arguments
 * @param {number} [timeout]
 * @returns {Promise<string>}
 */
const ide = async (args, timeout = IDE_TIMING.script) => {
  const { code, stderr, stdout } = await exec("bash", [SCRIPT, ...args], {
    timeout,
  });
  if (code !== 0)
    throw new Error(
      stderr.trim().replace(/^forgerdr: /, "") ||
        `forge-ide.sh ${args.join(" ")}: exit ${code}`,
    );
  return stdout;
};

/**
 * The folder where every ttt writes its state, as forge-ide.sh honours XDG_STATE_HOME and FORGE_IDE_DIR.
 * @returns {Promise<string>}
 */
export const ideStateFolder = async () => {
  const folder = (await ide(["dir"])).trim();
  if (!folder.startsWith("/"))
    throw new Error(`forge-ide.sh dir answered no folder: ${folder}`);
  return folder;
};

/**
 * Leaves a checkout's ttt the order to save every file it holds unsaved.
 * @param {string} checkout
 * @returns {Promise<string>} the order's id, which its ttt's state carries once answered
 */
export const orderSave = async (checkout) => {
  const order = (await ide(["order", checkout, "save"])).trim();
  if (order === "") throw new Error("forge-ide.sh order answered no id");
  return order;
};

/**
 * Stops a checkout's ttt, losing the files it holds unsaved.
 * @param {string} checkout
 */
export const stopIde = async (checkout) => {
  await ide(["stop", "--discard", checkout], IDE_TIMING.stop);
};

/**
 * The editors installed, as forge-ide.sh editors lists them; none when it cannot tell, which is logged with what it
 * said.
 * @returns {Promise<Editor[]>}
 */
const detectEditors = async () => {
  try {
    const text = await ide(["editors"]);
    const editors = parseEditors(text);
    if (editors.length === 0 && text.trim() !== "[]")
      console.error("forgerdr: the editors installed do not read", text);
    return editors;
  } catch (error) {
    console.error("forgerdr: the editors installed could not be told", error);
    return [];
  }
};

/** Tells every copy which editors are installed: once, as the sidebar starts, not on every menu. */
export const publishEditors = async () => {
  const editors = await detectEditors();
  if (JSON.stringify(editors) !== JSON.stringify(readEditors()))
    setShared(KEY.editors, editors);
};

/** @returns {Editor[]} the editors installed, as publishEditors last told; none before it did */
export const readEditors = () =>
  // Only publishEditors writes the key, always as a parsed list.
  /** @type {Editor[] | null} */ (shared(KEY.editors)) ?? [];

/**
 * Opens a path in one of the editors installed; when it cannot, says so to the person and in the log.
 * @param {Editor} editor
 * @param {string} path absolute
 */
export const openInEditor = async ({ id, name }, path) => {
  try {
    await ide(["open", id, path]);
  } catch (error) {
    console.error(`forgerdr: ${path} could not be opened in ${name}`, error);
    notify({
      body: Error.isError(error) ? error.message : String(error),
      level: "error",
      title: `${name} could not open ${path}`,
    });
  }
};

/**
 * The language servers a checkout needs and PATH lacks (forge-ide.sh servers); null when the look failed, or answered
 * what does not read, which is logged with what it said.
 * @param {string} checkout
 * @returns {Promise<LanguageServer[] | null>}
 */
export const lookServers = async (checkout) => {
  try {
    const text = await ide(["servers", checkout]);
    const servers = parseServers(text);
    if (servers.length || text.trim() === "[]") return servers;
    console.error(
      `forgerdr: the language servers ${checkout} lacks do not read`,
      text,
    );
  } catch (error) {
    console.error(
      `forgerdr: the language servers ${checkout} lacks could not be told`,
      error,
    );
  }
  return null;
};

/**
 * The language servers hidden in the notices, by forge and checkout, as this copy's storage keeps them; none when it
 * does not read, which is logged.
 * @returns {HiddenServers}
 */
export const readHiddenServers = () => {
  try {
    const text = localStorage.getItem(STORE.hidden);
    return text === null ? {} : hiddenServersOf(JSON.parse(text));
  } catch (error) {
    console.error(
      "forgerdr: the language servers hidden could not be read",
      error,
    );
    return {};
  }
};

/**
 * Keeps the language servers hidden in the notices in this copy's storage; logs it when it cannot.
 * @param {HiddenServers} hidden
 */
export const keepHiddenServers = (hidden) => {
  try {
    localStorage.setItem(STORE.hidden, JSON.stringify(hidden));
  } catch (error) {
    console.error(
      "forgerdr: the language servers hidden could not be kept",
      error,
    );
  }
};

/** @param {string} why @returns {IdeRun} */
const failed = (why) => {
  console.error(`forgerdr: ${why}`);
  return { step: IDE_STEP.failed, why };
};

/**
 * forge-ide.sh ensure's answer for a checkout, as a run.
 * @param {string} checkout
 * @returns {Promise<IdeRun>}
 */
const ensured = async (checkout) => {
  try {
    const answer = await ide(["ensure", checkout], IDE_TIMING.ensure);
    const result = parseEnsure(answer);
    if (result === null)
      return failed(
        `forge-ide.sh ensure answered what does not read: ${answer.trim()}`,
      );
    return { at: Date.now(), result, step: IDE_STEP.answered };
  } catch (error) {
    return failed(
      `forge-ide.sh ensure: ${Error.isError(error) ? error.message : String(error)}`,
    );
  }
};

/**
 * Ensures a checkout's ttt runs, keeping how it goes for every copy: on its way from the call on, then ensure's answer, or
 * why it failed.
 * @param {string} checkout
 */
export const ensureIde = async (checkout) => {
  keepRun(checkout, { at: Date.now(), step: IDE_STEP.ensuring });
  keepRun(checkout, await ensured(checkout));
};

/**
 * What the IDE panel shows now, as its header's copy decides it for the panel's other copies.
 * @typedef {object} IdePanel
 * @property {string | null} checkout the one shown; null when the forge has none
 * @property {IdeShows} shows what ide-term shows
 * @property {IdeState | null} state the shown ttt's; null while none shows, or until it reads
 */

/** @returns {IdePanel | null} null before the header's copy first told */
export const readIdePanel = () =>
  // Only publishIdePanel writes the key, always as an IdePanel.
  /** @type {IdePanel | null} */ (shared(KEY.panel)) ?? null;

/** @param {IdePanel} panel */
export const publishIdePanel = (panel) => {
  if (JSON.stringify(panel) !== JSON.stringify(readIdePanel()))
    setShared(KEY.panel, panel);
};

/**
 * What a ttt last wrote of itself; null when it wrote nothing that reads, which is logged.
 * @param {string} folder the state folder (ideStateFolder)
 * @param {string} name its terminal's
 * @returns {Promise<IdeState | null>}
 */
export const readIdeState = async (folder, name) => {
  const text = await readTextFile(`${folder}/${name}.json`).catch((error) => {
    console.error(`forgerdr: the state of ${name} could not be read`, error);
    return null;
  });
  const state = parseIdeState(text);
  if (text !== null && state === null)
    console.error(`forgerdr: the state of ${name} does not read`, text);
  return state;
};

/**
 * What every live ttt of the IDE last wrote of itself, by its name; one that wrote nothing that reads is left out.
 * @param {string} folder the state folder
 * @returns {Promise<Record<string, IdeState>>}
 */
const readLiveStates = async (folder) => {
  const read = await Promise.all(
    liveIdes(readTerminals()).map(async ({ name }) => ({
      name,
      state: await readIdeState(folder, name),
    })),
  );
  return Object.fromEntries(
    read.flatMap(({ name, state }) => (state === null ? [] : [[name, state]])),
  );
};

/**
 * What the IDE's live ttts hold unsaved as the header's copy last read it, by ttt name, for every copy: whether one
 * holds unsaved files is known before its checkout is left or removed, without a script.
 * @returns {Record<string, string[]>}
 */
export const readIdeUnsaved = () =>
  // Only tellIdeStates writes the key, always as unsavedByName's record.
  /** @type {Record<string, string[]> | null} */ (shared(KEY.states)) ?? {};

/**
 * Tells every copy what the live ttts hold unsaved, when it changed; hands the states back.
 * @param {Record<string, IdeState>} states by ttt name
 */
const tellIdeStates = (states) => {
  const unsaved = unsavedByName(states);
  if (JSON.stringify(unsaved) !== JSON.stringify(readIdeUnsaved()))
    setShared(KEY.states, unsaved);
  return states;
};

/**
 * Reads the states of the IDE's live ttts now and tells every copy (readIdeUnsaved), as a change in the live ttts calls
 * for: a ttt just started may write its state before the app lists it.
 * @param {string} folder the state folder (ideStateFolder)
 * @returns {Promise<Record<string, IdeState>>}
 */
export const refreshIdeStates = async (folder) =>
  tellIdeStates(await readLiveStates(folder));

/**
 * Reads the states of the IDE's live ttts, now and again on every change in the ttts' state folder, until the copy
 * closes, telling every copy what they hold unsaved (readIdeUnsaved) and handing each read whole to `take`. The folder
 * is there once a ttt was started.
 * @param {AsyncContext} cx
 * @param {string} folder the state folder (ideStateFolder)
 * @param {(states: Record<string, IdeState>) => void} take
 * @returns {Task}
 */
export const followIdeStates = (cx, folder, take) =>
  followFolder(
    cx,
    { folder, read: () => readLiveStates(folder), what: "the IDE's state" },
    (states) => take(tellIdeStates(states)),
  );

/**
 * Waits for a ttt to answer an order to save, reading its state again on every change in the state folder, at most
 * IDE_TIMING.script: past that, the answer is still pending.
 * @param {AsyncContext} cx
 * @param {string} folder the state folder (ideStateFolder)
 * @param {string} name the ttt's
 * @param {string} order the order's id (orderSave)
 * @returns {Promise<SaveAnswer>}
 */
export const waitSaved = async (cx, folder, name, order) => {
  const until = Date.now() + IDE_TIMING.script;
  for (;;) {
    const watch = watchFolder(folder);
    const answer = saveAnswer(await readIdeState(folder, name), order);
    const left = until - Date.now();
    if (answer.kind !== IDE_SAVE.pending || left <= 0) {
      watch.cancel();
      return answer;
    }
    await Promise.race([watch, cx.sleep(left)]);
    watch.cancel();
  }
};

/** A layout file holds a layout's tree. @type {(text: string) => LayoutNode} */
const parseLayout = JSON.parse;

/**
 * Writes the shown layout's file again with ide-term showing a content of its own, which the app takes in as an edit of
 * that field alone: the clicks (the panel shown, its size, the stack's child) stay, as layout.set, which drops them all,
 * would not keep them. Built from the file, never from layout(), which carries the clicks and would write them into it;
 * written only if the file is still the one read, and only when it is this copy's (a copy leaving a layout never writes
 * the next one's) and does not hold the content already. Whether it wrote; throws, saying why, when it cannot.
 * @param {string} name the shown layout's
 * @param {IdeTermContent} content
 * @returns {Promise<boolean>}
 */
export const writeIdeTerm = async (name, content) => {
  const file = `${appHome()}/layouts/${name}.json`;
  const text = await readTextFile(file);
  if (text === null) throw new Error(`${file} is not there`);
  const read = parseLayout(text);
  if (!holdsMod(nodeIn(read, IDE_NODE.head)?.content, MOD))
    throw new Error(`${file} is not ${MOD}'s`);
  if (sameContent(nodeIn(read, IDE_NODE.term)?.content, content)) return false;
  const layout = withIdeTerm(read, content);
  if (layout === null) throw new Error(`${file} has no ${IDE_NODE.view}`);
  await writeTextFile(file, `${JSON.stringify(layout, null, 2)}\n`, text);
  return true;
};
