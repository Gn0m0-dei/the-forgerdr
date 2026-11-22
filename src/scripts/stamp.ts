const STAMPED = Object.freeze({
  announcement: "Stamped. In the app, this would let the commit through.",
  button: "Stamped",
});

const bindStampCard = (card: HTMLElement) => {
  const button = card.querySelector<HTMLButtonElement>("[data-stamp]");
  const status = card.querySelector<HTMLElement>("[data-stamp-status]");
  if (!button || !status) {
    throw new Error("The gate card is missing its stamp button or its status.");
  }
  const stamp = () => {
    card.toggleAttribute("data-stamped", true);
    button.setAttribute("aria-disabled", "true");
    button.textContent = STAMPED.button;
    status.textContent = STAMPED.announcement;
  };
  button.addEventListener("click", stamp, { once: true });
};

document.querySelectorAll<HTMLElement>("[data-stamp-card]").forEach(bindStampCard);
