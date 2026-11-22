const bindMenu = (menu: HTMLDetailsElement) => {
  menu.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      menu.open = false;
    }
  });
};

document.querySelectorAll<HTMLDetailsElement>("details[data-menu]").forEach(bindMenu);
