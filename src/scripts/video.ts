import { Playback, type PlaybackButton } from "#model/video.ts";

// The walkthrough moves for more than five seconds, so it can always be paused (WCAG 2.2.2), never starts for
// someone who asked for reduced motion, and rests while it is off screen.
const BUTTON: Readonly<Record<Playback, PlaybackButton>> = Object.freeze({
  [Playback.Paused]: { label: "Play the walkthrough", text: "▶ Play" },
  [Playback.Playing]: { label: "Pause the walkthrough", text: "❚❚ Pause" },
});

const bindWalkthrough = (frame: HTMLElement) => {
  const video = frame.querySelector<HTMLVideoElement>("[data-walkthrough]");
  const button = frame.querySelector<HTMLButtonElement>("[data-video-toggle]");
  if (!video || !button) {
    throw new Error("The walkthrough's frame is missing its video or its play and pause button.");
  }
  const isReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let isPausedByVisitor = isReducedMotion;

  const show = (playback: Playback) => {
    button.textContent = BUTTON[playback].text;
    button.setAttribute("aria-label", BUTTON[playback].label);
  };

  const play = async () => {
    try {
      await video.play();
      show(Playback.Playing);
    } catch (error) {
      console.error("The walkthrough could not start", error);
      show(Playback.Paused);
    }
  };

  const pause = () => {
    video.pause();
    show(Playback.Paused);
  };

  button.addEventListener("click", () => {
    isPausedByVisitor = !video.paused;
    isPausedByVisitor ? pause() : play();
  });

  new IntersectionObserver((entries) =>
    entries.forEach((entry) => (entry.isIntersecting && !isPausedByVisitor ? play() : video.pause())),
  ).observe(video);

  show(Playback.Paused);
};

document.querySelectorAll<HTMLElement>("[data-walkthrough-frame]").forEach(bindWalkthrough);
