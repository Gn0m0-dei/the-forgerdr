import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

const SITE = Object.freeze({
  base: "/the-forgerdr/",
  dist: "dist",
  pages: ["index.html", "docs/index.html"],
  media: "public/media",
  mediaBudget: 7 * 1024 * 1024,
  screens: "public/screens",
  screensBudget: 4 * 1024 * 1024,
});

const folderBytes = (folder: string) =>
  readdirSync(folder)
    .map((name) => statSync(join(folder, name)).size)
    .reduce((total, size) => total + size, 0);

// A root-relative path in an href, a src or a poster, without what follows a ? or a #.
const ROOT_PATH = /(?<=\s(?:href|src|poster)=")\/(?!\/)[^"?#]*/g;

const htmlFiles = () =>
  readdirSync(SITE.dist, { encoding: "utf8", recursive: true })
    .filter((file) => file.endsWith(".html"))
    .map((file) => join(SITE.dist, file));

const read = (file: string) => readFileSync(file, "utf8");

const rootPaths = (html: string) => html.match(ROOT_PATH) ?? [];

const builtFile = (path: string) => {
  const inside = join(SITE.dist, decodeURI(path.slice(SITE.base.length)));
  return path.endsWith("/") ? join(inside, "index.html") : inside;
};

describe("the built site", () => {
  test("has the landing page and the docs home", () => {
    SITE.pages.forEach((page) => assert.ok(existsSync(join(SITE.dist, page)), `${page} is missing`));
  });

  test("is dark on every page, with no theme picker", () => {
    htmlFiles().forEach((file) => {
      const html = read(file);
      assert.match(html, /<html[^>]*data-theme="dark"/, file);
      assert.doesNotMatch(html, /<starlight-theme-select/, file);
    });
  });

  test("prefixes every root path with the base", () => {
    htmlFiles().forEach((file) => {
      const outside = rootPaths(read(file)).filter((path) => !path.startsWith(SITE.base));
      assert.deepEqual(outside, [], file);
    });
  });

  test("points every root path at a file it ships", () => {
    htmlFiles().forEach((file) => {
      const missing = rootPaths(read(file))
        .filter((path) => path.startsWith(SITE.base))
        .filter((path) => !existsSync(builtFile(path)));
      assert.deepEqual(missing, [], file);
    });
  });

  test("keeps the screens and the video within their budgets", () => {
    assert.ok(folderBytes(SITE.screens) <= SITE.screensBudget, `${folderBytes(SITE.screens)} bytes of screens`);
    assert.ok(folderBytes(SITE.media) <= SITE.mediaBudget, `${folderBytes(SITE.media)} bytes of video`);
  });
});
