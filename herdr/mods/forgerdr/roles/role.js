// What a role is: main.js makes it once per copy of the mod, with the copy's context, and hands it every render and
// the copy's close. A role keeps its own state in the closure that makes it.

/**
 * @typedef {object} Role
 * @property {(cx: import("gpui-kit").Context) => import("gpui-kit").NativeElement} render
 * @property {(cx: import("gpui-kit").AsyncContext) => void | Promise<void>} [close] releases what the role holds
 */

export {};
