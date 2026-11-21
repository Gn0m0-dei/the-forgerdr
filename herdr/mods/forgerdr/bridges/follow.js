// A state folder forgerdr's scripts write (the inbox, the floor's flows), read again on every change in it: a mod cannot
// list a folder, so a script reads it, and watchFolder says when to.
import { watchFolder } from "herdr";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Task} Task */

/**
 * @template T
 * @typedef {object} FolderSource
 * @property {string} folder
 * @property {() => Promise<T>} read what a script says is in it
 * @property {string} what it holds, for the log
 */

// Before the folder exists, or while a watch cannot start, it is read again this often.
const RETRY = 5000;

/**
 * Reads a folder now and again on every change in it, handing each read to `take`, until the copy closes. The watch
 * starts before the read, so a change between them is not missed. A read that fails is logged and the last good one
 * stands.
 * @template T
 * @param {AsyncContext} cx
 * @param {FolderSource<T>} source
 * @param {(read: T) => void} take
 * @returns {Task}
 */
export const followFolder = (cx, { folder, read, what }, take) =>
  cx.spawn(async (cx) => {
    for (;;) {
      const watch = watchFolder(folder);
      try {
        take(await read());
        cx.notify();
      } catch (error) {
        console.error(`forgerdr: ${what} could not be read`, error);
      }
      try {
        await watch;
      } catch (error) {
        console.error(
          `forgerdr: the folder of ${what} could not be watched`,
          error,
        );
        await cx.sleep(RETRY);
      }
    }
  });
