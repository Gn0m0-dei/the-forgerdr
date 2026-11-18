// The forgerdr mod: forgerdr's look for the herdr app, drawn from the forgnome design, is this one mod in roles, as
// Herdr 98 does it. A herdr app mod cannot import another mod's files, so every role shares one folder: its kit, fonts
// and images. A layout block picks its role with props.role; a role this version does not know draws nothing, so a
// layout from a newer forgerdr never breaks an older mod.
import { div, View } from "gpui-kit";
import { props } from "herdr";

/**
 * Each role draws one block of the layout. Filled by the modules of the look, one role each.
 * @type {Record<string, (cx: import("gpui-kit").Context) => import("gpui-kit").Element>}
 */
const roles = {};

export default class Forgerdr extends View {
  /** @param {import("gpui-kit").Context} cx */
  render(cx) {
    const draw = roles[props()?.role ?? ""];
    return draw ? draw(cx) : div();
  }
}
