// forgerdr's look for the herdr app is this one mod, in roles, as Herdr 98 does it: a mod cannot import another mod's
// files, so every role shares this folder. A layout block picks its role with props.role; a role this version does not
// know draws nothing, so a layout from a newer forgerdr never breaks an older mod.
import { div, View } from "gpui-kit";
import { props } from "herdr";
import { empty } from "./roles/empty.js";
import { gallery } from "./roles/gallery.js";
import { heat } from "./roles/heat.js";
import { manual } from "./roles/manual.js";
import { pane } from "./roles/pane.js";
import { sessions } from "./roles/sessions.js";
import { sidebar } from "./roles/sidebar.js";
import { statusbar } from "./roles/statusbar.js";
import { topbar } from "./roles/topbar.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("./roles/role.js").Role} Role */
/** @typedef {{ role?: string }} ForgerdrProps */

/** @type {() => ForgerdrProps} */
const readProps = props;

/** @type {Record<string, (cx: AsyncContext) => Role>} */
const ROLES = {
  empty,
  gallery,
  heat,
  manual,
  pane,
  sessions,
  sidebar,
  statusbar,
  topbar,
};

// herdr asks for a class extending View as the mod's default export. A copy makes its role once and hands it every
// render and its close; the role keeps its own state.
export default class Forgerdr extends View {
  /**
   * @param {unknown} _props
   * @param {AsyncContext} cx
   */
  init(_props, cx) {
    /** @type {Role | undefined} */
    this.role = ROLES[readProps()?.role ?? ""]?.(cx);
  }

  /** @param {Context} cx */
  render(cx) {
    return this.role?.render(cx) ?? div();
  }

  /** @param {AsyncContext} cx */
  async close(cx) {
    await this.role?.close?.(cx);
  }
}
