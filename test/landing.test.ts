import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const LANDING = {
  file: "dist/index.html",
  install:
    "curl -fsSL https://raw.githubusercontent.com/Gn0m0-dei/the-forgerdr/main/install.sh | bash",
  maxEyebrows: 2,
  ogImage: "https://gn0m0-dei.github.io/the-forgerdr/og.png",
};

const html = (): string => readFileSync(LANDING.file, "utf8");

const count = (text: string, pattern: RegExp): number =>
  [...text.matchAll(pattern)].length;

describe("the landing page", () => {
  test("has a single h1", () => {
    assert.equal(count(html(), /<h1[\s>]/g), 1);
  });

  test("keeps eyebrows rare", () => {
    assert.ok(count(html(), /class="[^"]*\beyebrow\b/g) <= LANDING.maxEyebrows);
  });

  test("offers the install command, whole, at the top and at the end", () => {
    assert.equal(count(html(), new RegExp(LANDING.install.replaceAll(/[.|/]/g, "\\$&"), "g")), 2);
  });

  test("lets the visitor stamp the gate card with a real button", () => {
    assert.match(html(), /<button[^>]*data-stamp[^>]*>/);
    assert.match(html(), /aria-live="polite"/);
  });

  test("plays the walkthrough muted and inline, and only when the script says so", () => {
    const video = html().match(/<video[^>]*>/)?.join("") ?? "";
    ["muted", "loop", "playsinline", "poster="].forEach((attribute) => assert.ok(video.includes(attribute), attribute));
    assert.doesNotMatch(video, /\sautoplay/);
    assert.match(html(), /<button[^>]*data-video-toggle[^>]*>/);
  });

  test("walks the nine steps, each with what you decide", () => {
    assert.match(html(), /<section[^>]*id="how-it-works"/);
    assert.equal(count(html(), /data-step="\d+"/g), 9);
    assert.equal(count(html(), />You decide</g), 9);
  });

  test("labels the forge at a glance with six numbered pins", () => {
    assert.equal(count(html(), /data-pin="\d"/g), 6);
    assert.equal(count(html(), /data-legend="\d"/g), 6);
  });

  test("shares with the social image", () => {
    assert.match(
      html(),
      new RegExp(`<meta property="og:image" content="${LANDING.ogImage}"`),
    );
  });
});
