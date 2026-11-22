import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cropVariables, zoomTransform } from "#helpers/zoom.ts";

const SCREEN = { height: 900, width: 1440 };
const STAGE = { height: 450, width: 720 };

describe("zoomTransform", () => {
  test("shows half the screen at the app's own pixel size", () => {
    assert.equal(zoomTransform({ scale: 0.5, x: 0.19, y: 0.2 }, SCREEN, STAGE), "translate(-273.6px, -180px) scale(1)");
  });

  test("shows a quarter of the screen at twice its pixel size", () => {
    assert.equal(zoomTransform({ scale: 0.25, x: 0.5, y: 0 }, SCREEN, STAGE), "translate(-1440px, 0px) scale(2)");
  });

  test("refuses a zoom that would blur the pixels", () => {
    assert.throws(() => zoomTransform({ scale: 0.7, x: 0, y: 0 }, SCREEN, STAGE), /1x or 2x/);
  });

  test("refuses a crop that runs off the screen", () => {
    assert.throws(() => zoomTransform({ scale: 0.5, x: 0.6, y: 0 }, SCREEN, STAGE), /off the screen/);
    assert.throws(() => zoomTransform({ scale: 0.5, x: 0, y: 0.6 }, SCREEN, STAGE), /off the screen/);
  });

  test("refuses a crop that starts before the screen", () => {
    assert.throws(() => zoomTransform({ scale: 0.5, x: -0.1, y: 0 }, SCREEN, STAGE), /off the screen/);
    assert.throws(() => zoomTransform({ scale: 0.5, x: 0, y: -0.1 }, SCREEN, STAGE), /off the screen/);
  });

  test("takes a crop that ends on the screen's edge, rounding aside", () => {
    assert.doesNotThrow(() => zoomTransform({ scale: 0.25, x: 0.1 + 0.2 + 0.45, y: 0 }, SCREEN, STAGE));
  });
});

describe("cropVariables", () => {
  test("places a quarter of a 16:10 screen in a 16:10 frame", () => {
    assert.equal(cropVariables({ scale: 0.25, x: 0.5, y: 0.2 }, SCREEN), "--crop-width: 400%; --crop-left: -200%; --crop-top: -80%;");
  });

  test("keeps a taller screen's vertical offset true to the frame", () => {
    assert.equal(
      cropVariables({ scale: 0.5, x: 0, y: 0.3 }, { height: 1800, width: 1440 }),
      "--crop-width: 200%; --crop-left: 0%; --crop-top: -120%;",
    );
  });
});
