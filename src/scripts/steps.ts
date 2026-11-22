// The step crossing the middle of the viewport lights up, and the stage shows its screen.
const MIDDLE_BAND = "-45% 0px -45% 0px";

const steps = [...document.querySelectorAll<HTMLElement>("[data-step]")];
const shots = [...document.querySelectorAll<HTMLElement>("[data-stage-step]")];
const cells = [...document.querySelectorAll<HTMLElement>("[data-progress]")];

const activate = (current: number) => {
  steps.forEach((step, index) => step.classList.toggle("active", index === current));
  shots.forEach((shot, index) => shot.classList.toggle("active", index === current));
  cells.forEach((cell, index) => {
    cell.classList.toggle("active", index === current);
    cell.classList.toggle("done", index < current);
  });
};

const observer = new IntersectionObserver(
  (entries) =>
    entries
      .filter((entry) => entry.isIntersecting)
      .forEach((entry) => activate(steps.findIndex((step) => step === entry.target))),
  { rootMargin: MIDDLE_BAND },
);

steps.forEach((step) => observer.observe(step));
