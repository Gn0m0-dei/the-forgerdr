// The IDE's active markdown file, rendered by the app's own markdown view in ttt's place while Rendered is on
// (roles/ide.js). It follows the file only while it is markdown and the view shows it, the IDE being the side panel on
// show: read when it comes, and again when a change in its folder names it (a save among them); the watch goes when
// another file comes, the view goes back to ttt, the panel shuts or shows Changes, or the copy closes.
import { TextView, v_flex } from "gpui-base";
import { checking, readTextFile, watchFolder } from "herdr";
import { readIdePanel } from "../bridges/ide.js";
import { nodeIn, panelOnShow, shownLayout } from "../bridges/layout.js";
import { folderOf, IDE_NODE, ideMarkdownPath, namesFile } from "../ide.js";
import { wrapped } from "../kit/text.js";
import { tokens } from "../kit/tokens.js";
import { SIDE_PANEL } from "../sessions.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Task} Task */
/** @typedef {import("herdr").FolderWatch} FolderWatch */
/** @typedef {import("./role.js").Role} Role */

// How often the view looks at the file the header published, at the side panel on show and at what ide-view shows.
const SYNC_EVERY = 500;
// While the file's folder cannot be watched, it is read again this often.
const RETRY = 5_000;

/**
 * What the view shows of a file: its markdown, or a plain line saying why not.
 * @typedef {{ markdown: string, line: string }} Shown
 */

/**
 * One follow of a file: its loop and the watch it waits on now, so a follow that ends cancels its own and no other.
 * @typedef {{ task: Task | null, watch: FolderWatch | null }} Follow
 */

/** @type {Readonly<Shown>} */
const BLANK = Object.freeze({ line: "", markdown: "" });

/**
 * A file's markdown; a line saying why not when it is gone, or cannot be read, which is logged: readTextFile refuses a
 * file over 1 MiB ("Text file exceeds 1 MiB") rather than cut it. Read only when the file comes or a change names it.
 * @param {string} path
 * @returns {Promise<Shown>}
 */
const readMarkdown = async (path) => {
  try {
    const text = await readTextFile(path);
    return text === null
      ? { line: `${path} is not there any more.`, markdown: "" }
      : { line: "", markdown: text };
  } catch (error) {
    console.error(`forgerdr: ${path} could not be read`, error);
    return {
      line: `${path} cannot be shown here (${String(error)}): read it in ttt.`,
      markdown: "",
    };
  }
};

/**
 * @param {AsyncContext} cx
 * @returns {Role}
 */
export const ideMarkdown = (cx) => {
  /** @type {string | null} the file followed */
  let path = null;
  /** @type {Readonly<Shown>} */
  let shown = BLANK;
  /** @type {Follow | null} */
  let follow = null;

  const stop = () => {
    follow?.task?.cancel();
    follow?.watch?.cancel();
    follow = null;
  };

  /**
   * Follows a file until another comes or the copy closes: read now, and again when a change in its folder names it.
   * forge: watchFolder has no way to watch a folder alone; on macOS it watches all that is under it, so a checkout's
   * root README watches the whole checkout (node_modules and .git with it), on one of the 64 folders every mod shares
   * at once. Only while Rendered shows a markdown file, and a batch that does not name the file reads nothing.
   * @param {string} file
   * @param {AsyncContext} cx
   */
  const start = (file, cx) => {
    /** @type {Follow} */
    const mine = { task: null, watch: null };
    follow = mine;
    mine.task = cx.spawn(async (task) => {
      let read = true;
      while (follow === mine) {
        const watch = watchFolder(folderOf(file));
        mine.watch = watch;
        if (read) {
          const next = await readMarkdown(file);
          if (follow !== mine) return;
          shown = next;
          task.notify();
        }
        try {
          read = namesFile(await watch, file);
        } catch (error) {
          console.error(
            `forgerdr: the folder of ${file} could not be watched`,
            error,
          );
          await task.sleep(RETRY);
          read = true;
        }
      }
    });
  };

  const syncing = checking()
    ? null
    : cx.timer.every(SYNC_EVERY, (cx) => {
        const layout = shownLayout();
        const want =
          panelOnShow(layout) === SIDE_PANEL.ide
            ? ideMarkdownPath(
                readIdePanel()?.state?.active ?? null,
                nodeIn(layout, IDE_NODE.view)?.active,
              )
            : null;
        if (want === path) return;
        path = want;
        stop();
        if (want === null) {
          shown = BLANK;
          cx.notify();
          return;
        }
        start(want, cx);
      });

  return {
    close: () => {
      syncing?.cancel();
      stop();
    },
    render: () => {
      const k = tokens();
      const root = v_flex()
        .id("ide-markdown")
        .size_full()
        .min_h(0)
        .p(16)
        .bg(k.bg1)
        .border(2)
        .border_color(k.line);
      return shown.line !== ""
        ? root.child(wrapped(shown.line, "ui", 13, k.muted))
        : root.child(
            TextView.markdown("ide-markdown-view", shown.markdown)
              .scrollable(true)
              .selectable(true)
              .flex_1()
              .min_h(0)
              .text_size(14)
              .text_color(k.fg),
          );
    },
  };
};
