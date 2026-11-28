// What ide-term shows while it shows no ttt, as the IDE panel's header tells it (bridges/ide.js): a quiet line while ttt
// opens; why it cannot run, with forgerdr's installer to run in a tab (bridges/update.js) and another try; that the ttt
// shown has ended (the person quit it) or could not be opened, with Open again; why the forge's checkouts could not be
// read, with another try; or that the forge has no checkout here. The installer's tab asks for the person's password,
// so the panel shuts first: maximized, it would hide that tab; its switch shows it again.
import { h_flex, v_flex } from "gpui-base";
import { askChanges } from "../bridges/changes.js";
import { ensureIde, readIdePanel } from "../bridges/ide.js";
import { hidePanel } from "../bridges/layout.js";
import { finishInTab } from "../bridges/update.js";
import { IDE_LABEL, IDE_SHOWS, placeholderOf } from "../ide.js";
import { KEY_BUTTON, keyButton } from "../kit/buttons.js";
import { control } from "../kit/control.js";
import { emptyState } from "../kit/panels.js";
import { text, wrapped } from "../kit/text.js";
import { tokens } from "../kit/tokens.js";

/** @typedef {import("gpui-kit").Context} Context */
/** @typedef {import("gpui-kit").NativeElement} NativeElement */
/** @typedef {import("../ide.js").IdeShows} IdeShows */
/** @typedef {import("./role.js").Role} Role */

const openInstaller = () => {
  hidePanel();
  finishInTab();
};

/**
 * What another try does: the forge's checkouts read again when they could not be, else the checkout's ttt ensured
 * again; none without a checkout.
 * @param {IdeShows} shows
 * @param {string | null} checkout
 * @returns {((cx: Context) => void) | null}
 */
const retryOf = (shows, checkout) => {
  if (shows.kind === IDE_SHOWS.unread) return () => askChanges();
  return checkout === null
    ? null
    : (cx) => {
        cx.spawn(() => ensureIde(checkout));
      };
};

/** @returns {Role} */
export const ideEmpty = () => ({
  render: () => {
    const k = tokens();
    const panel = readIdePanel();
    const shows = panel?.shows ?? { kind: IDE_SHOWS.opening };
    const says = placeholderOf(shows);
    if (says.quiet)
      return v_flex()
        .size_full()
        .items_center()
        .justify_center()
        .bg(k.bg1)
        .child(text(says.title, "ui", 13, k.muted));
    const retry = retryOf(shows, panel?.checkout ?? null);
    /** @type {NativeElement[]} */
    const buttons = [
      ...(says.install === null
        ? []
        : [
            control(
              keyButton(KEY_BUTTON.primary, says.install),
              "ide-install",
              openInstaller,
            ),
          ]),
      ...(says.again === null || retry === null
        ? []
        : [
            control(
              keyButton(
                says.install === null ? KEY_BUTTON.primary : KEY_BUTTON.ghost,
                says.again,
              ),
              "ide-again",
              retry,
            ),
          ]),
    ];
    return emptyState({
      action:
        buttons.length === 0 ? undefined : h_flex().gap(8).children(buttons),
      caption: IDE_LABEL.panel,
      sub: wrapped(says.sub, "ui", 12, k.muted).text_center(),
      title: says.title,
    });
  },
});
