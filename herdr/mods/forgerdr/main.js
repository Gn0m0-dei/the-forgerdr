// forgerdr's look for the herdr app is this one mod, in roles, as Herdr 98 does it: a mod cannot import another mod's
// files, so every role shares this folder. A layout block picks its role with props.role; a role this version does not
// know draws nothing, so a layout from a newer forgerdr never breaks an older mod.
import { div, View } from "gpui-kit";
import { props } from "herdr";
import { gallery } from "./roles/gallery.js";

/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {{ role?: string }} ForgerdrProps */

/** @type {() => ForgerdrProps} */
const readProps = props;

/** @type {Record<string, (cx: Context) => NativeElement>} */
const roles = { gallery };

// herdr asks for a class extending View as the mod's default export.
export default class Forgerdr extends View {
  /** @param {Context} cx */
  render(cx) {
    const draw = roles[readProps()?.role ?? ""];
    return draw ? draw(cx) : div();
  }
}
