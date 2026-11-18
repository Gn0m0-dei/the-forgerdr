// Makes the Forgerdr Glyphs font from herdr/tools/design/motion-frames.txt: each colour layer of each frame of a sign is
// one character of the Private Use Area, drawn as square pixels, so the forgerdr mod steps a sign's layers through
// their frames as text with .frames() (herdr/mods/forgerdr/kit/motion.js). Also writes which character is which as
// herdr/mods/forgerdr/kit/motion-glyphs.js. A plain TrueType font of square outlines, written here: no dependency, no
// hinting, no dates, so the same frames always make the same bytes.
// Run: node herdr/tools/glyphs.mts [--out <folder>]   (the folder that holds fonts/ and kit/; default the mod's)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Bitmap = string[];
type Sign = { name: string; frames: Bitmap[] };
type Rect = { x: number; y: number; w: number; h: number };
type Glyph = { rects: Rect[] };

const here = dirname(fileURLToPath(import.meta.url));
const outIndex = process.argv.indexOf("--out");
const out =
  outIndex > 0
    ? process.argv[outIndex + 1]
    : join(here, "..", "mods", "forgerdr");

const SIDE = 8;
const UNIT = 128;
const EM = SIDE * UNIT;
const FIRST = 0xe000;
const FAMILY = "Forgerdr Glyphs";
const POSTSCRIPT = "ForgerdrGlyphs-Regular";
const VERSION = "Version 1.000";

const parse = (text: string): Sign[] => {
  const signs: Sign[] = [];
  let frame: Bitmap | null = null;
  for (const line of text.split("\n")) {
    const opened = /^== (\w+)$/.exec(line);
    if (opened) {
      signs.push({ frames: [], name: opened[1] });
      frame = null;
    } else if (/^-- \d+$/.test(line)) {
      frame = [];
      signs.at(-1)?.frames.push(frame);
    } else if (
      frame !== null &&
      frame.length < SIDE &&
      /^[.A-Za-z]{8}$/.test(line)
    ) {
      frame.push(line);
    }
  }
  for (const sign of signs) {
    sign.frames.forEach((rows, index) => {
      if (rows.length !== SIDE) {
        throw new Error(
          `${sign.name}, frame ${index + 1}: ${rows.length} rows, not ${SIDE}`,
        );
      }
    });
  }
  return signs;
};

// One layer of a frame: its letter's pixels as #, the rest as dots.
const layer = (rows: Bitmap, letter: string): Bitmap =>
  rows.map((row) =>
    [...row].map((cell) => (cell === letter ? "#" : ".")).join(""),
  );

// The pixels as few rectangles as a greedy sweep finds: runs along a row, grown down while the rows below match.
const rectangles = (rows: Bitmap): Rect[] => {
  const used = rows.map(() => Array<boolean>(SIDE).fill(false));
  const lit = (x: number, y: number) => rows[y][x] === "#" && !used[y][x];
  const found: Rect[] = [];
  for (let y = 0; y < SIDE; y += 1) {
    for (let x = 0; x < SIDE; x += 1) {
      if (!lit(x, y)) continue;
      let w = 1;
      while (x + w < SIDE && lit(x + w, y)) w += 1;
      let h = 1;
      while (
        y + h < SIDE &&
        Array.from({ length: w }, (_, i) => lit(x + i, y + h)).every(Boolean)
      )
        h += 1;
      for (let dy = 0; dy < h; dy += 1)
        for (let dx = 0; dx < w; dx += 1) used[y + dy][x + dx] = true;
      found.push({ h, w, x, y });
    }
  }
  return found;
};

// A big-endian byte writer.
const bytes = () => {
  const parts: number[] = [];
  const self = {
    done: () => Uint8Array.from(parts),
    i16: (value: number) => self.u16(value & 0xffff),
    raw: (values: Iterable<number>) => {
      for (const value of values) parts.push(value & 0xff);
      return self;
    },
    tag: (text: string) => self.raw([...text].map((c) => c.charCodeAt(0))),
    u8: (value: number) => {
      parts.push(value & 0xff);
      return self;
    },
    u16: (value: number) => self.u8(value >> 8).u8(value),
    u32: (value: number) => self.u16(value >>> 16).u16(value & 0xffff),
  };
  return self;
};

const padded = (data: Uint8Array) => {
  const out = new Uint8Array(Math.ceil(data.length / 4) * 4);
  out.set(data);
  return out;
};

const checksum = (data: Uint8Array) => {
  const words = padded(data);
  const view = new DataView(words.buffer);
  let sum = 0;
  for (let at = 0; at < words.length; at += 4)
    sum = (sum + view.getUint32(at)) >>> 0;
  return sum;
};

// A rectangle's outline, clockwise as TrueType fills it: the font's y runs up from the baseline at the sign's foot.
const corners = ({ x, y, w, h }: Rect): [number, number][] => {
  const left = x * UNIT;
  const right = (x + w) * UNIT;
  const top = (SIDE - y) * UNIT;
  const bottom = (SIDE - y - h) * UNIT;
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
};

const bounds = (glyph: Glyph) => {
  const points = glyph.rects.flatMap(corners);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    xMax: Math.max(...xs),
    xMin: Math.min(...xs),
    yMax: Math.max(...ys),
    yMin: Math.min(...ys),
  };
};

const glyfOf = (glyph: Glyph) => {
  if (glyph.rects.length === 0) return new Uint8Array();
  const box = bounds(glyph);
  const points = glyph.rects.flatMap(corners);
  const out = bytes()
    .i16(glyph.rects.length)
    .i16(box.xMin)
    .i16(box.yMin)
    .i16(box.xMax)
    .i16(box.yMax);
  for (const index of glyph.rects.keys()) out.u16(index * 4 + 3);
  out.u16(0);
  for (const _point of points) out.u8(0x01);
  // Coordinates are deltas from the point before, x for every point then y.
  for (const axis of [0, 1]) {
    let previous = 0;
    for (const point of points) {
      out.i16(point[axis] - previous);
      previous = point[axis];
    }
  }
  return padded(out.done());
};

// Characters the font maps besides its signs, each to a blank glyph of a full advance. GPUI, which draws the herdr
// app, measures text with "m" and leaves out a font without one; the space keeps text shaping plain.
const PLAIN = [0x20, 0x6d];

const font = (signs: Glyph[]) => {
  const glyphs: Glyph[] = [
    { rects: [] },
    ...signs,
    ...PLAIN.map(() => ({ rects: [] })),
  ];
  const count = glyphs.length;
  const drawn = glyphs.filter((glyph) => glyph.rects.length > 0);
  const boxes = drawn.map(bounds);
  const box = {
    xMax: Math.max(...boxes.map((b) => b.xMax)),
    xMin: Math.min(...boxes.map((b) => b.xMin)),
    yMax: Math.max(...boxes.map((b) => b.yMax)),
    yMin: Math.min(...boxes.map((b) => b.yMin)),
  };
  const glyf = glyphs.map(glyfOf);
  const offsets = [0];
  for (const data of glyf)
    offsets.push(offsets[offsets.length - 1] + data.length);
  const last = FIRST + signs.length - 1;

  const head = bytes()
    .u32(0x00010000)
    .u32(0x00010000)
    .u32(0)
    .u32(0x5f0f3cf5)
    .u16(0x0009)
    .u16(EM)
    .u32(0)
    .u32(0)
    .u32(0)
    .u32(0)
    .i16(box.xMin)
    .i16(box.yMin)
    .i16(box.xMax)
    .i16(box.yMax)
    .u16(0)
    .u16(8)
    .i16(2)
    .i16(1)
    .i16(0)
    .done();

  const hhea = bytes()
    .u32(0x00010000)
    .i16(EM)
    .i16(0)
    .i16(0)
    .u16(EM)
    .i16(box.xMin)
    .i16(EM - box.xMax)
    .i16(box.xMax)
    .i16(1)
    .i16(0)
    .i16(0)
    .raw([0, 0, 0, 0, 0, 0, 0, 0])
    .i16(0)
    .u16(count)
    .done();

  const maxp = bytes()
    .u32(0x00010000)
    .u16(count)
    .u16(Math.max(...glyphs.map((g) => g.rects.length * 4)))
    .u16(Math.max(...glyphs.map((g) => g.rects.length)))
    .u16(0)
    .u16(0)
    .u16(2)
    .raw(Array(16).fill(0))
    .done();

  const hmtx = bytes();
  for (const glyph of glyphs)
    hmtx.u16(EM).i16(glyph.rects.length > 0 ? bounds(glyph).xMin : 0);

  const loca = bytes();
  for (const offset of offsets) loca.u32(offset);

  // Format 4: each plain character a segment of its own, then the signs from FIRST, then the closing segment.
  const segments = [
    ...PLAIN.map((code, index) => ({
      delta: (signs.length + 1 + index - code) & 0xffff,
      end: code,
      start: code,
    })),
    { delta: (1 - FIRST) & 0xffff, end: last, start: FIRST },
    { delta: 1, end: 0xffff, start: 0xffff },
  ];
  const power = 2 ** Math.floor(Math.log2(segments.length));
  const subtable = bytes()
    .u16(4)
    .u16(16 + 8 * segments.length)
    .u16(0)
    .u16(segments.length * 2)
    .u16(power * 2)
    .u16(Math.log2(power))
    .u16(segments.length * 2 - power * 2);
  for (const s of segments) subtable.u16(s.end);
  subtable.u16(0);
  for (const s of segments) subtable.u16(s.start);
  for (const s of segments) subtable.u16(s.delta);
  for (const _ of segments) subtable.u16(0);
  const cmap = bytes()
    .u16(0)
    .u16(2)
    .u16(0)
    .u16(3)
    .u32(20)
    .u16(3)
    .u16(1)
    .u32(20)
    .raw(subtable.done())
    .done();

  const names: [number, string][] = [
    [1, FAMILY],
    [2, "Regular"],
    [3, `${FAMILY} Regular`],
    [4, FAMILY],
    [5, VERSION],
    [6, POSTSCRIPT],
  ];
  const mac = names.map(([id, text]) => ({
    data: Uint8Array.from([...text].map((c) => c.charCodeAt(0))),
    id,
    platform: [1, 0, 0],
  }));
  const win = names.map(([id, text]) => ({
    data: Uint8Array.from(
      [...text].flatMap((c) => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 0xff]),
    ),
    id,
    platform: [3, 1, 0x409],
  }));
  const records = [...mac, ...win];
  const name = bytes()
    .u16(0)
    .u16(records.length)
    .u16(6 + 12 * records.length);
  records.reduce((offset, record) => {
    name
      .u16(record.platform[0])
      .u16(record.platform[1])
      .u16(record.platform[2])
      .u16(record.id)
      .u16(record.data.length)
      .u16(offset);
    return offset + record.data.length;
  }, 0);
  for (const record of records) name.raw(record.data);

  const os2 = bytes()
    .u16(4)
    .i16(EM)
    .u16(400)
    .u16(5)
    .u16(0)
    .raw(Array(16).fill(0))
    .i16(UNIT)
    .i16(EM / 2)
    .i16(0)
    .raw(Array(10).fill(0))
    .u32(0)
    .u32(1 << 28)
    .u32(0)
    .u32(0)
    .tag("FGDR")
    .u16(0x0040)
    .u16(PLAIN[0])
    .u16(last)
    .i16(EM)
    .i16(0)
    .i16(0)
    .u16(EM)
    .u16(0)
    .u32(1)
    .u32(0)
    .i16(0)
    .i16(EM)
    .u16(0)
    .u16(0x20)
    .u16(1)
    .done();

  const post = bytes()
    .u32(0x00030000)
    .u32(0)
    .i16(-UNIT)
    .i16(UNIT / 2)
    .u32(1)
    .u32(0)
    .u32(0)
    .u32(0)
    .u32(0)
    .done();

  const tables: [string, Uint8Array][] = [
    ["OS/2", os2],
    ["cmap", cmap],
    ["glyf", Uint8Array.from(glyf.flatMap((data) => [...data]))],
    ["head", head],
    ["hhea", hhea],
    ["hmtx", hmtx.done()],
    ["loca", loca.done()],
    ["maxp", maxp],
    ["name", name.done()],
    ["post", post],
  ];
  const level = Math.floor(Math.log2(tables.length));
  const directory = bytes()
    .u32(0x00010000)
    .u16(tables.length)
    .u16(16 * 2 ** level)
    .u16(level)
    .u16(tables.length * 16 - 16 * 2 ** level);
  let offset = 12 + 16 * tables.length;
  const body: Uint8Array[] = [];
  let headAt = 0;
  for (const [tag, data] of tables) {
    directory.tag(tag).u32(checksum(data)).u32(offset).u32(data.length);
    if (tag === "head") headAt = offset;
    const block = padded(data);
    body.push(block);
    offset += block.length;
  }
  const file = new Uint8Array(offset);
  file.set(directory.done());
  let at = 12 + 16 * tables.length;
  for (const block of body) {
    file.set(block, at);
    at += block.length;
  }
  new DataView(file.buffer).setUint32(
    headAt + 8,
    (0xb1b0afba - checksum(file)) >>> 0,
  );
  return file;
};

const signs = parse(
  readFileSync(join(here, "design", "motion-frames.txt"), "utf8"),
);

// Every distinct layer is one glyph, after .notdef; a sign's frames share the layers they have in common (the blank).
const keys: string[] = [];
const frames = signs.map((sign) => {
  const letters = [
    ...new Set(sign.frames.flat().join("").replaceAll(".", "")),
  ].toSorted();
  const layers = letters.map((letter) => {
    const chars = sign.frames.map((rows) => {
      const key = layer(rows, letter).join("/");
      if (!keys.includes(key)) keys.push(key);
      return FIRST + keys.indexOf(key);
    });
    return { chars, letter };
  });
  return { layers, name: sign.name };
});
const signGlyphs: Glyph[] = keys.map((key) => ({
  rects: rectangles(key.split("/")),
}));

mkdirSync(join(out, "fonts"), { recursive: true });
mkdirSync(join(out, "kit"), { recursive: true });
writeFileSync(join(out, "fonts", "ForgerdrGlyphs.ttf"), font(signGlyphs));

const hex = (code: number) => `"\\u${code.toString(16)}"`;
const module = [
  "// Generated by herdr/tools/glyphs.mts from herdr/tools/design/motion-frames.txt: do not edit. The characters of the",
  "// Forgerdr Glyphs font, by sign, then by colour layer (its letter in the design file), one per frame.",
  "",
  `export const GLYPH_FONT = "${FAMILY}";`,
  "",
  "export const GLYPH_FRAMES = Object.freeze({",
  ...frames
    .toSorted((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((sign) => [
      `  ${sign.name}: {`,
      ...sign.layers.map(
        (l) => `    ${l.letter}: [${l.chars.map(hex).join(", ")}],`,
      ),
      "  },",
    ]),
  "});",
  "",
].join("\n");
writeFileSync(join(out, "kit", "motion-glyphs.js"), module);
console.log(
  `glyphs: ${signGlyphs.length} glyphs for ${signs.length} signs into ${out}`,
);
