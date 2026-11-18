// Generates the forgerdr mod's pixel art from the forgnome design's exports in herdr/tools/design: the 12x12 icons, the
// gnome heads and the golems, as SVG layers under herdr/mods/forgerdr/img. A layer of fixed colours is drawn with
// image(); a layer of one colour that changes (a hat colour, a theme tone) is drawn with svg(), which the herdr app
// tints with the text colour. The mod stacks them (herdr/mods/forgerdr/kit/sprites.js).
// Run: node herdr/tools/sprites.mts [--out <folder>]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Grid = string[];
type Palette = Record<string, string>;

const here = dirname(fileURLToPath(import.meta.url));
const design = join(here, "design");
const outIndex = process.argv.indexOf("--out");
const out =
  outIndex > 0
    ? process.argv[outIndex + 1]
    : join(here, "..", "mods", "forgerdr", "img");

// The fixed colours of the sprite sheets (gnome-parts.txt and golem-parts.txt, PALETTE).
const GNOME_FIXED: Palette = {
  B: "#8b5a2b",
  C: "#e8a48a",
  E: "#0d0d12",
  G: "#e5a93b",
  L: "#7fd1e0",
  M: "#3a3a44",
  O: "#0d0d12",
  S: "#f3c7a3",
  s: "#d9a27e",
  W: "#f2f2f2",
  w: "#c9c9d1",
};
const GOLEM_FIXED: Palette = {
  C: "#c0703f",
  I: "#8a94a3",
  i: "#5f6875",
  O: "#0d0d12",
  R: "#ffb347",
  S: "#9b9484",
  s: "#6e695c",
  U: "#3a3a44",
  V: "#6f8f4a",
};
// The golem letters that take a theme tone, drawn as one tinted layer.
const GOLEM_TONE = new Set(["W", "N", "D", "F", "Q"]);
const GLYPHS: Record<string, { file: string; fixed: Palette; tone?: string }> =
  {
    "CRACKED · smoke": { file: "smoke", fixed: { M: "#9a96a0", m: "#5d5a66" } },
    "DONE · spark": { file: "spark", fixed: { O: "#fff3d6" }, tone: "D" },
    "FORGING · flame": {
      file: "flame",
      fixed: { D: "#b8380c", O: "#fff3d6", R: "#ff6b1a", Y: "#ffb347" },
    },
    "IDLE · zZ": { file: "asleep", fixed: {}, tone: "Z" },
    "WAITING · exclamation": { file: "needs", fixed: {}, tone: "A" },
  };
const MOODS: Record<string, string> = {
  ASLEEP: "asleep",
  DONE: "done",
  ERROR: "error",
  IDLE: "idle",
  "NEEDS YOU": "needs",
  WORKING: "working",
};

/** The grids of a parts file by title: a title line, maybe a rule under it, then rows of one width. */
function grids(text: string): Map<string, Grid> {
  const found = new Map<string, Grid>();
  const lines = text.split("\n");
  let title = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    const isRow =
      /^[.A-Za-z]+$/.test(line) && [8, 12, 16].includes(line.length);
    if (isRow && title !== "") {
      const rows: Grid = [];
      while (
        i < lines.length &&
        lines[i].trimEnd().length === line.length &&
        /^[.A-Za-z]+$/.test(lines[i].trimEnd())
      ) {
        rows.push(lines[i].trimEnd());
        i++;
      }
      if (rows.length >= 4) found.set(title, rows);
      title = "";
      continue;
    }
    if (line === "" || /^[-=]+$/.test(line)) continue;
    title = line.split(/ \(|\s{2,}/)[0];
  }
  return found;
}

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`the design has no ${what}`);
  return value;
}

/** An SVG of the cells of a grid whose letters pass a test, one path per colour, in 1-pixel runs. */
function svg(
  rows: Grid,
  colourOf: (letter: string) => string | undefined,
): string {
  const width = rows[0].length;
  const paths = new Map<string, string[]>();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const colour = colourOf(row[x]);
      if (colour === undefined) {
        x++;
        continue;
      }
      let end = x;
      while (end + 1 < row.length && row[end + 1] === row[x]) end++;
      const run = end - x + 1;
      const list = paths.get(colour) ?? [];
      list.push(`M${x} ${y}h${run}v1h-${run}z`);
      paths.set(colour, list);
      x = end + 1;
    }
  });
  const body = [...paths]
    .map(([colour, runs]) => `<path fill="${colour}" d="${runs.join("")}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${rows.length}" shape-rendering="crispEdges">${body}</svg>\n`;
}

const written: string[] = [];
/** Writes an SVG, titled after its file ("gnome hat pointed tint"): herdr never shows the title, linters ask for it. */
function write(file: string, content: string): void {
  const path = join(out, file);
  const title = file.replace(/\.svg$/, "").replace(/[/-]/g, " ");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    content.replace(/^(<svg[^>]*>)/, `$1<title>${title}</title>`),
  );
  written.push(file);
}

/**
 * One layer of fixed colours, and when the grid has them, one tinted layer per tinted letter, named by its suffix
 * (letters alone would clash on a case-insensitive disk: H and h).
 */
function layers(
  file: string,
  rows: Grid,
  fixed: Palette,
  tinted: Record<string, string> = {},
): void {
  write(
    `${file}.svg`,
    svg(rows, (letter) => fixed[letter]),
  );
  for (const [letter, suffix] of Object.entries(tinted)) {
    if (rows.some((row) => row.includes(letter)))
      write(
        `${file}-${suffix}.svg`,
        svg(rows, (l) => (l === letter ? "#000000" : undefined)),
      );
  }
}

/** The rows of a grid from first to last, the rest blank, so stacked layers keep their place. */
function only(rows: Grid, first: number, last: number): Grid {
  return rows.map((row, y) =>
    y >= first && y <= last ? row : ".".repeat(row.length),
  );
}

/** The cells of a grid that differ from another, the rest blank. */
function diff(rows: Grid, base: Grid): Grid {
  return rows.map((row, y) =>
    [...row].map((cell, x) => (cell === base[y][x] ? "." : cell)).join(""),
  );
}

rmSync(out, { force: true, recursive: true });

// Icons: one ink, tinted by state.
const icons = JSON.parse(readFileSync(join(design, "icons.json"), "utf8"))
  .icons as Record<string, string>;
for (const [name, d] of Object.entries(icons)) {
  write(
    `icon/${name}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges"><path fill="#000000" d="${d}"/></svg>\n`,
  );
}

// Gnome heads, 16x16, in parts: the hat (rows 0-7, and what a hat changes on row 8), the face (rows 8-11, by eyes and
// mood), the beard (rows 12-15) and an accessory over them.
const gnome = grids(readFileSync(join(design, "gnome-parts.txt"), "utf8"));
const head = need(gnome.get("HAT POINTED"), "default head (HAT POINTED)");
for (const hat of ["POINTED", "FLOPPY", "CAP"]) {
  const rows = need(gnome.get(`HAT ${hat}`), `HAT ${hat}`);
  const row8 = [...rows[8]]
    .map((cell, x) => (cell === head[8][x] ? "." : cell))
    .join("");
  const hatRows = rows.map((row, y) =>
    y <= 7 ? row : y === 8 ? row8 : ".".repeat(row.length),
  );
  layers(`gnome/hat-${hat.toLowerCase()}`, hatRows, GNOME_FIXED, {
    H: "tint",
    h: "shade",
  });
}
for (const beard of ["FULL", "FORKED", "STUBBLE"]) {
  layers(
    `gnome/beard-${beard.toLowerCase()}`,
    only(need(gnome.get(`BEARD ${beard}`), `BEARD ${beard}`), 12, 15),
    GNOME_FIXED,
  );
}
const moodRows = new Map<string, string[]>();
for (const line of readFileSync(join(design, "gnome-parts.txt"), "utf8").split(
  "\n",
)) {
  const match =
    /^(IDLE|WORKING|NEEDS YOU|DONE|ERROR|ASLEEP)\s+row 9\s+(\S+)\s+row 10\s+(\S+)\s+row 11\s+(\S+)/.exec(
      line,
    );
  if (match) moodRows.set(MOODS[match[1]], [match[2], match[3], match[4]]);
}
for (const eyes of ["PLAIN", "SQUINT", "BROWS"]) {
  const rows = need(gnome.get(`EYES ${eyes}`), `EYES ${eyes}`);
  for (const mood of Object.values(MOODS)) {
    // At rest a gnome shows its own eyes; a mood replaces rows 9-11 with the mood's.
    const face =
      mood === "idle"
        ? rows
        : rows.map((row, y) =>
            y >= 9 && y <= 11 ? need(moodRows.get(mood), mood)[y - 9] : row,
          );
    layers(
      `gnome/face-${eyes.toLowerCase()}-${mood}`,
      only(face, 8, 11),
      GNOME_FIXED,
    );
  }
}
for (const accessory of ["GOGGLES", "EYEPATCH", "HEADPHONES", "MONOCLE"]) {
  layers(
    `gnome/accessory-${accessory.toLowerCase()}`,
    diff(need(gnome.get(`ACCESSORY ${accessory}`), accessory), head),
    GNOME_FIXED,
  );
}
layers("glyph/zz", need(gnome.get("zZ GLYPH"), "zZ GLYPH"), {}, { Z: "tone" });

// Golems: iron (a main session), clay (a subagent, 8x8) and stone (a teammate), each mood a fixed layer and a tone.
const golem = grids(readFileSync(join(design, "golem-parts.txt"), "utf8"));
for (const role of ["IRON", "CLAY", "STONE"]) {
  for (const mood of ["FORGING", "WAITING", "DONE", "CRACKED", "IDLE"]) {
    const rows = need(golem.get(`${role} ${mood}`), `${role} ${mood}`);
    const file = `golem/${role.toLowerCase()}-${mood.toLowerCase()}`;
    write(
      `${file}.svg`,
      svg(rows, (letter) => GOLEM_FIXED[letter]),
    );
    write(
      `${file}-tone.svg`,
      svg(rows, (letter) => (GOLEM_TONE.has(letter) ? "#000000" : undefined)),
    );
  }
}
for (const [title, glyph] of Object.entries(GLYPHS)) {
  const rows = need(golem.get(title), title);
  layers(
    `glyph/${glyph.file}`,
    rows,
    glyph.fixed,
    glyph.tone === undefined ? {} : { [glyph.tone]: "tone" },
  );
}

process.stdout.write(`sprites: ${written.length} files in ${out}\n`);
