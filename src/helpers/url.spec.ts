import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { absoluteUrl, withBase } from "#helpers/url.ts";

describe("site urls", () => {
  test("put a path under the site's base", () => {
    assert.equal(withBase("docs/"), "/the-forgerdr/docs/");
  });

  test("make it absolute for other sites", () => {
    assert.equal(absoluteUrl("og.png"), "https://gn0m0-dei.github.io/the-forgerdr/og.png");
  });
});
