// forgerdr's look for the herdr app is this one mod, in roles, as Herdr 98 does it: a mod cannot import another mod's
// files, so every role shares this folder. A layout block picks its role with props.role; a role this version does not
// know draws nothing, so a layout from a newer forgerdr never breaks an older mod.
import { div, View } from "gpui-kit";
import { props } from "herdr";
import { empty } from "./roles/empty.js";
import { forgeMenu } from "./roles/forge-menu.js";
import { gallery } from "./roles/gallery.js";
import { gnomeDialog } from "./roles/gnome.js";
import { heat } from "./roles/heat.js";
import { lanes } from "./roles/lanes.js";
import { manual } from "./roles/manual.js";
import { modeDialog } from "./roles/mode.js";
import { pane } from "./roles/pane.js";
import { sessions } from "./roles/sessions.js";
import { sidebar } from "./roles/sidebar.js";
import { start } from "./roles/start.js";
import { statusbar } from "./roles/statusbar.js";
import { toast } from "./roles/toast.js";
import { topbar } from "./roles/topbar.js";

/** @typedef {import("gpui-kit").AsyncContext} AsyncContext */
/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("./roles/role.js").Role} Role */
/** @typedef {{ role?: string, title?: string, overlay?: string }} ForgerdrProps */

/** @type {() => ForgerdrProps} */
const readProps = props;

/** @type {Record<string, (cx: AsyncContext) => Role>} */
const ROLES = {
  empty,
  "forge-menu": forgeMenu,
  gallery,
  gnome: gnomeDialog,
  heat,
  lanes,
  manual,
  mode: modeDialog,
  pane,
  sessions,
  sidebar,
  start,
  statusbar,
  toast,
  topbar,
};

/**
 * The role a copy plays: the one its props name; the toast when the app opens it to show a notification (the layout's
 * "toast"), whose props are the notification's, with no role.
 * @param {ForgerdrProps | null} given
 */
const roleOf = (given) => {
  if (given?.role !== undefined) return given.role;
  return given?.overlay !== undefined && given.title !== undefined
    ? "toast"
    : "";
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
    this.role = ROLES[roleOf(readProps())]?.(cx);
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
