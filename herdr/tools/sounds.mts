// Generates the forge's sounds, which the herdr app plays for its alerts (settings.json "sounds"): blocked, when a golem
// needs the human, is the hammer working the piece on the anvil, clink… clink; done, when one finishes, is the hiss of
// a quench, hot metal into water; cracked, which the mod plays when an API error breaks a golem, is its stone
// splitting. Synthesised here rather than recorded, so they carry no one else's licence, from a
// seeded noise so every run makes the same sound; encoded to MP3, which the app plays, with lame (or ffmpeg).
// Run: node herdr/tools/sounds.mts [--out <folder>]
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const RATE = 44_100;

// How loud a sound peaks, a little under full scale.
const PEAK = 0.89;

/** A seeded noise in [-1, 1): the same sequence on every run (mulberry32). */
const noise = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
};

/** A two-pole band-pass filter (RBJ's cookbook), with unit gain at its centre. */
const bandPass = (centre: number, q: number) => {
  const w = (2 * Math.PI * centre) / RATE;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const [b0, b2, a1, a2] = [
    alpha / a0,
    -alpha / a0,
    (-2 * Math.cos(w)) / a0,
    (1 - alpha) / a0,
  ];
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  return (x: number) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    [x2, x1, y2, y1] = [x1, x, y1, y];
    return y;
  };
};

/** Fades a sound's ends, so it does not click, then scales it to its peak, so it does not clip. */
const finish = (samples: Float32Array) => {
  const fadeIn = Math.round(RATE * 0.0005);
  const fadeOut = Math.round(RATE * 0.01);
  const faded = samples.map(
    (sample, at) =>
      sample * Math.min(1, at / fadeIn, (samples.length - 1 - at) / fadeOut),
  );
  const peak = faded.reduce(
    (top, sample) => Math.max(top, Math.abs(sample)),
    0,
  );
  return faded.map((sample) => (sample / (peak || 1)) * PEAK);
};

/** A low-pass filter of one pole, to soften a noise into a thud. */
const lowPass = (cutoff: number) => {
  const k = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
  let y = 0;
  return (x: number) => {
    y += k * (x - y);
    return y;
  };
};

/**
 * A small workshop around the anvil: a short Schroeder reverb (four combs, two all-passes), mixed in low so a blow is
 * heard in a room, not in a void.
 */
const room = (dry: Float32Array, mix: number) => {
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((delay) => ({
    at: 0,
    buffer: new Float32Array(Math.round(RATE * delay)),
    feedback: 0.72,
  }));
  const passes = [0.005, 0.0017].map((delay) => ({
    at: 0,
    buffer: new Float32Array(Math.round(RATE * delay)),
  }));
  return dry.map((sample) => {
    let wet = 0;
    for (const comb of combs) {
      const out = comb.buffer[comb.at] ?? 0;
      comb.buffer[comb.at] = sample + out * comb.feedback;
      comb.at = (comb.at + 1) % comb.buffer.length;
      wet += out;
    }
    wet /= combs.length;
    for (const pass of passes) {
      const held = pass.buffer[pass.at] ?? 0;
      const out = held - 0.7 * wet;
      pass.buffer[pass.at] = wet + 0.7 * out;
      pass.at = (pass.at + 1) % pass.buffer.length;
      wet = out;
    }
    return sample + wet * mix;
  });
};

// When each blow lands, how hard and at what pitch: the hammer comes down again a moment later, a touch softer.
export const BLOWS = Object.freeze([
  { at: 0, gain: 1, tune: 1 },
  { at: 0.55, gain: 0.86, tune: 0.985 },
]);

// The hammer bounces on the anvil after each blow, as a smith lets it: two quick ticks, softer each time.
const BOUNCES = Object.freeze([
  { after: 0, gain: 1 },
  { after: 0.062, gain: 0.34 },
  { after: 0.108, gain: 0.12 },
]);

/**
 * The anvil's metal: a cloud of inharmonic modes that die fast, the higher the faster, so it clanks rather than rings
 * like a bell; and three lower ones that ring a little longer, the anvil's own voice.
 */
const anvilModes = (random: () => number) => [
  { amp: 0.7, decay: 0.2, freq: 1130 },
  { amp: 0.85, decay: 0.17, freq: 1690 },
  { amp: 0.6, decay: 0.13, freq: 2470 },
  ...Array.from({ length: 26 }, () => {
    const freq = 1400 * 6.5 ** Math.abs(random());
    return {
      amp: (0.25 + 0.55 * Math.abs(random())) * (1500 / freq) ** 0.35,
      decay: 0.11 * (1500 / freq) ** 0.9,
      freq,
    };
  }),
];

/**
 * One blow of the hammer on the anvil, as many samples long as it sounds: for each touch of the bouncing hammer, the
 * clack of the strike and the clank of the anvil; under the first, the dull thud of the hot piece.
 * @param random the noise the blow is made of
 * @param tune how far its pitch is from the first blow's
 */
const blow = (random: () => number, tune: number) => {
  const length = Math.round(RATE * 0.5);
  const modes = anvilModes(random).map((mode) => ({
    ...mode,
    phase: Math.abs(random()) * 2 * Math.PI,
  }));
  const clack = bandPass(4200, 0.6);
  const thud = lowPass(420);
  return Float32Array.from({ length }, (_, at) => {
    const t = at / RATE;
    const white = random();
    let sound = 0;
    for (const bounce of BOUNCES) {
      const since = t - bounce.after;
      if (since < 0) continue;
      const clank = modes.reduce(
        (sum, mode) =>
          sum +
          mode.amp *
            Math.exp(-since / mode.decay) *
            Math.sin(2 * Math.PI * mode.freq * tune * since + mode.phase),
        0,
      );
      sound +=
        bounce.gain *
        (0.42 * clank + 1.3 * Math.exp(-since / 0.0035) * clack(white));
    }
    return sound + 2.4 * Math.exp(-t / 0.028) * thud(white);
  });
};

/** Blocked: cl-clink… cl-clink, the hammer working the piece on the anvil, in the forge. */
export const blocked = () => {
  const random = noise(0x5eed);
  const length = Math.round(RATE * 1.3);
  const out = new Float32Array(length);
  for (const { at, gain, tune } of BLOWS) {
    const start = Math.round(RATE * at);
    blow(random, tune).forEach((sample, index) => {
      if (start + index < length) out[start + index] += sample * gain;
    });
  }
  return finish(room(out, 0.22));
};

/** Done: the quench, hot metal into water: a bright hiss that flares and fades, sizzling, with a few bubbles under it. */
export const done = () => {
  const random = noise(0xc001);
  const length = Math.round(RATE * 1.5);
  const hiss = bandPass(5200, 0.7);
  const bright = bandPass(8800, 1.2);
  const sizzle = noise(0xb0b);
  let flutter = 0;
  const bubbles = Array.from({ length: 7 }, () => ({
    at: 0.05 + Math.abs(random()) * 0.6,
    freq: 320 + Math.abs(random()) * 380,
  }));
  return finish(
    Float32Array.from({ length }, (_, at) => {
      const t = at / RATE;
      const swell = Math.min(1, t / 0.018);
      // The flare of the first touch, then the long hiss that dies down.
      const envelope =
        swell * (0.35 * Math.exp(-t / 0.09) + 0.65 * Math.exp(-t / 0.5));
      flutter += 0.02 * (sizzle() - flutter);
      const crackle = 0.78 + 0.9 * flutter;
      const steam =
        hiss(random()) * envelope * crackle +
        bright(random()) * swell * 0.45 * Math.exp(-t / 0.14);
      const bubbling = bubbles.reduce((sum, bubble) => {
        const since = t - bubble.at;
        return since < 0 || since > 0.06
          ? sum
          : sum +
              0.05 *
                Math.sin(2 * Math.PI * bubble.freq * (1 + since * 4) * since) *
                Math.exp(-since / 0.02);
      }, 0);
      return steam + bubbling;
    }),
  );
};

/**
 * Cracked: a golem's stone splitting, as an API error breaks one: a few sharp cracks that run along it, the thump of
 * the stone giving way and a trickle of grit after.
 */
export const cracked = () => {
  const random = noise(0xc4ac);
  const length = Math.round(RATE * 1.2);
  const snap = bandPass(2600, 0.8);
  const grit = bandPass(4200, 1.4);
  const cracks = [0, 0.045, 0.11, 0.16].map((at, index) => ({
    at,
    gain: [1, 0.55, 0.8, 0.45][index] ?? 0.5,
  }));
  const grains = Array.from({ length: 60 }, () => ({
    at: 0.18 + Math.abs(random()) * 0.75,
    gain: 0.08 + Math.abs(random()) * 0.22,
  }));
  return finish(
    Float32Array.from({ length }, (_, at) => {
      const t = at / RATE;
      const white = random();
      const crack = cracks.reduce((sum, one) => {
        const since = t - one.at;
        return since < 0 ? sum : sum + one.gain * Math.exp(-since / 0.012);
      }, 0);
      const since = t - 0.16;
      const thump =
        since < 0
          ? 0
          : 0.7 *
            Math.exp(-since / 0.07) *
            Math.sin(2 * Math.PI * (95 - since * 60) * since);
      const falling = grains.reduce((sum, grain) => {
        const after = t - grain.at;
        return after < 0 || after > 0.03
          ? sum
          : sum + grain.gain * Math.exp(-after / 0.006);
      }, 0);
      return snap(white) * crack * 1.6 + thump + grit(white) * falling;
    }),
  );
};

/** A sound as a 16-bit mono WAV file. */
export const wav = (samples: Float32Array) => {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, at) => {
    data.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, sample)) * 32767),
      at * 2,
    );
  });
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
};

/** Encodes a WAV file to MP3 with lame, else ffmpeg; fails saying so when neither is here. */
const mp3 = (from: string, to: string) => {
  for (const [program, args] of [
    ["lame", ["--quiet", "--noreplaygain", "-m", "m", "-b", "96", from, to]],
    [
      "ffmpeg",
      ["-loglevel", "error", "-y", "-i", from, "-ac", "1", "-b:a", "96k", to],
    ],
  ] as const) {
    try {
      execFileSync(program, [...args], { stdio: "inherit" });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(
    "neither lame nor ffmpeg is installed: install one to encode the sounds",
  );
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const here = dirname(fileURLToPath(import.meta.url));
  const at = process.argv.indexOf("--out");
  const out =
    at > 0
      ? (process.argv[at + 1] ?? "")
      : join(here, "..", "mods", "forgerdr", "sounds");
  mkdirSync(out, { recursive: true });
  const scratch = mkdtempSync(join(tmpdir(), "forgerdr-sounds-"));
  try {
    for (const [name, make] of [
      ["blocked", blocked],
      ["done", done],
      ["cracked", cracked],
    ] as const) {
      const source = join(scratch, `${name}.wav`);
      writeFileSync(source, wav(make()));
      mp3(source, join(out, `${name}.mp3`));
    }
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
  console.log(`sounds: blocked.mp3, done.mp3 and cracked.mp3 in ${out}`);
}
