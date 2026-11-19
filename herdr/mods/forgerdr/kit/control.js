// What makes a piece a control: an id, the hand pointer and an action on a click. The press and the click stop there,
// as the app's own buttons stop them: a control inside a block that drags the window (the bars) does not drag it, and
// one inside a block that acts on a click too (a ✕ on a tab, on a pane's header) does not set that block off as well,
// which would select the space being closed or focus the pane just closed.

/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */

/**
 * @param {NativeElement} element
 * @param {string} id
 * @param {(cx: Context) => void} action gets the click's context, to redraw the copy after changing its state
 */
export const control = (element, id, action) =>
  element
    .id(id)
    .cursor_pointer()
    .on_mouse_down("left", (_event, cx) => cx.stop_propagation())
    .on_click((_event, cx) => {
      cx.stop_propagation();
      action(cx);
    });
