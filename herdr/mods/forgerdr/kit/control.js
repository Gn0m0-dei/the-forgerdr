// What makes a piece a control: an id, the hand pointer and an action on a click. A press on it stops there, so a
// control inside a block that drags the window (the bars) does not drag it.

/** @typedef {import("gpui-kit").NativeElement} NativeElement */

/**
 * @param {NativeElement} element
 * @param {string} id
 * @param {() => void} action
 */
export const control = (element, id, action) =>
  element
    .id(id)
    .cursor_pointer()
    .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
    .on_click(() => action());
