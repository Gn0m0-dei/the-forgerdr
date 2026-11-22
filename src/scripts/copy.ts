import { CopyState } from "#model/copy.ts";

const SHOW_RESULT_MS = 2000;

const LABEL: Readonly<Record<CopyState, string>> = Object.freeze({
  [CopyState.Copied]: "Copied",
  [CopyState.Failed]: "Select it",
  [CopyState.Ready]: "Copy",
});

const ANNOUNCEMENT: Readonly<Record<CopyState, string>> = Object.freeze({
  [CopyState.Copied]: "Install command copied.",
  [CopyState.Failed]: "Copying failed: select the command and copy it.",
  [CopyState.Ready]: "",
});

const bindCopyButton = (root: HTMLElement) => {
  const button = root.querySelector<HTMLButtonElement>("[data-copy]");
  const source = root.querySelector<HTMLElement>("[data-copy-source]");
  const status = root.querySelector<HTMLElement>("[data-copy-status]");
  if (!button || !source || !status) {
    throw new Error("An install block is missing its button, command or status.");
  }
  const show = (state: CopyState) => {
    button.textContent = LABEL[state];
    status.textContent = ANNOUNCEMENT[state];
  };
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(source.textContent ?? "");
      show(CopyState.Copied);
    } catch (error) {
      console.error("Copying the install command failed", error);
      show(CopyState.Failed);
    }
    setTimeout(() => show(CopyState.Ready), SHOW_RESULT_MS);
  });
};

document.querySelectorAll<HTMLElement>("[data-copy-root]").forEach(bindCopyButton);
