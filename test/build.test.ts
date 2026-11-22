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

const read = (file: string) => readFileSync(file, "utf8");

const rootPaths = (html: string) => html.match(ROOT_PATH) ?? [];

// A relative link to another page: not a root path, not an anchor, not another site.
const RELATIVE_LINK = /(?<=\shref=")(?![/#]|[a-z]+:)[^"?#]+/g;

const relativeLinks = (html: string) => html.match(RELATIVE_LINK) ?? [];

// What a browser fetches by itself from another site: a resource attribute, a link that is not
// the canonical address, or a url() in a stylesheet.
const EXTERNAL_FETCH = [
  /\s(?:src|poster|srcset)="(?:https?:)?\/\/[^"]*"/g,
  /<link(?![^>]*rel="canonical")[^>]*href="(?:https?:)?\/\/[^"]*"[^>]*>/g,
  /url\(["']?(?:https?:)?\/\/[^)]*\)/g,
  /@import\s+["']?(?:https?:)?\/\/[^;]*/g,
];

const externalFetches = (text: string) => EXTERNAL_FETCH.flatMap((pattern) => text.match(pattern) ?? []);

const builtFiles = (extension: string) =>
  readdirSync(SITE.dist, { encoding: "utf8", recursive: true })
    .filter((file) => file.endsWith(extension))
    .map((file) => join(SITE.dist, file));

// Where a PNG's header keeps its width and its height.
const PNG_SIZE_AT = Object.freeze({ height: 20, width: 16 });

const pngSize = (file: string) => {
  const header = readFileSync(file);
  return { height: header.readUInt32BE(PNG_SIZE_AT.height), width: header.readUInt32BE(PNG_SIZE_AT.width) };
};

const SCREEN_IMAGE = new RegExp(`<img[^>]*\\ssrc="${SITE.base}screens/[^"]+"[^>]*>`, "g");

const attribute = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}="(?<value>[^"]*)"`))?.groups?.value ?? "";

// The width and the height an image declares keep the shape of the screen it shows.
const misshapen = (tag: string) => {
  const screen = pngSize(join("public", attribute(tag, "src").slice(SITE.base.length)));
  const width = Number(attribute(tag, "width"));
  const height = Number(attribute(tag, "height"));
  return !width || width * screen.height !== height * screen.width;
};

const builtFile = (path: string) => {
  const inside = join(SITE.dist, decodeURI(path.slice(SITE.base.length)));
  return path.endsWith("/") ? join(inside, "index.html") : inside;
};

describe("the built site", () => {
  test("has the landing page and the docs home", () => {
    SITE.pages.forEach((page) => assert.ok(existsSync(join(SITE.dist, page)), `${page} is missing`));
  });

  test("is dark on every page, with no theme picker", () => {
    builtFiles(".html").forEach((file) => {
      const html = read(file);
      assert.match(html, /<html[^>]*data-theme="dark"/, file);
      assert.doesNotMatch(html, /<starlight-theme-select/, file);
    });
  });

  test("prefixes every root path with the base", () => {
    builtFiles(".html").forEach((file) => {
      const outside = rootPaths(read(file)).filter((path) => !path.startsWith(SITE.base));
      assert.deepEqual(outside, [], file);
    });
  });

  test("points every root path at a file it ships", () => {
    builtFiles(".html").forEach((file) => {
      const missing = rootPaths(read(file))
        .filter((path) => path.startsWith(SITE.base))
        .filter((path) => !existsSync(builtFile(path)));
      assert.deepEqual(missing, [], file);
    });
  });

  test("points every relative link at a page it ships", () => {
    builtFiles(".html").forEach((file) => {
      const page = new URL(`file:///${file.replace(/index\.html$/, "")}`);
      const missing = relativeLinks(read(file))
        .map((link) => new URL(link, page).pathname.replace(/^\//, ""))
        .filter((path) => !existsSync(path.endsWith("/") ? join(path, "index.html") : path));
      assert.deepEqual(missing, [], file);
    });
  });

  test("fetches nothing from another site", () => {
    [...builtFiles(".html"), ...builtFiles(".css")].forEach((file) => {
      assert.deepEqual(externalFetches(read(file)), [], file);
    });
  });

  test("declares every screen at the shape it has", () => {
    builtFiles(".html").forEach((file) => {
      const wrong = (read(file).match(SCREEN_IMAGE) ?? []).filter(misshapen).map((tag) => attribute(tag, "src"));
      assert.deepEqual(wrong, [], file);
    });
  });

  test("keeps the screens and the video within their budgets", () => {
    assert.ok(folderBytes(SITE.screens) <= SITE.screensBudget, `${folderBytes(SITE.screens)} bytes of screens`);
    assert.ok(folderBytes(SITE.media) <= SITE.mediaBudget, `${folderBytes(SITE.media)} bytes of video`);
  });
});
