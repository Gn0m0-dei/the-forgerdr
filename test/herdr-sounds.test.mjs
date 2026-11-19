// The forge's sounds as herdr/tools/sounds.mts makes them, under Node's own runner: the same on every run, never
// clipping, two clinks for blocked, a hiss that dies down for done, a crack and its grit for cracked, the clack and
// thud of a rubber stamp for stamp, and the MP3s the mod ships.
// Run: node --test test/herdr-sounds.test.mjs
import { ok, strictEqual } from "node:assert";
import { existsSync, statSync } from "node:fs";
import { test } from "node:test";
import {
  BLOWS,
  blocked,
  cracked,
  done,
  RATE,
  stamp,
  wav,
} from "../herdr/tools/sounds.mts";

/** The loudness of a stretch of a sound, as its root mean square. */
const rms = (samples, from, to) => {
  const part = samples.subarray(Math.round(RATE * from), Math.round(RATE * to));
  return Math.sqrt(
    part.reduce((sum, sample) => sum + sample * sample, 0) / part.length,
  );
};

const peakOf = (samples) =>
  samples.reduce((top, sample) => Math.max(top, Math.abs(sample)), 0);

test("each sound is the same on every run, and never clips", () => {
  for (const make of [blocked, done, cracked, stamp]) {
    const sound = make();
    const again = make();
    strictEqual(sound.length, again.length);
    ok(sound.every((sample, at) => sample === again[at]));
    ok(peakOf(sound) <= 0.9 && peakOf(sound) > 0.85);
  }
});

test("blocked is clink… clink: two ringing blows, apart", () => {
  const sound = blocked();
  const [first, second] = BLOWS;
  // The second lands half a second or more after the first, and stands out of the first's ring.
  ok(second.at - first.at >= 0.5);
  ok(
    rms(sound, second.at, second.at + 0.03) >
      2 * rms(sound, second.at - 0.05, second.at - 0.01),
  );
  // Each rings a while: a clink, not a thud.
  ok(rms(sound, 0.2, 0.3) > 0.15 * rms(sound, 0, 0.03));
  // And the last fades out before the sound ends.
  ok(rms(sound, second.at, second.at + 0.03) > 8 * rms(sound, 1.2, 1.3));
  // Bright: it crosses zero more than a thousand times a second.
  const part = sound.subarray(Math.round(RATE * 0.05), Math.round(RATE * 0.25));
  const crossings = part.reduce(
    (count, sample, at) =>
      at > 0 && Math.sign(sample) !== Math.sign(part[at - 1])
        ? count + 1
        : count,
    0,
  );
  ok(crossings / 0.2 > 2000);
});

test("cracked is a crack, then grit falling, then quiet", () => {
  const sound = cracked();
  ok(rms(sound, 0, 0.2) > 2 * rms(sound, 0.3, 0.9));
  ok(rms(sound, 0.3, 0.9) > 4 * rms(sound, 1.1, 1.2));
});

test("done is a hiss that flares and dies down", () => {
  const sound = done();
  ok(rms(sound, 0.02, 0.2) > 3 * rms(sound, 1.1, 1.4));
  // A hiss is noise: it crosses zero thousands of times a second.
  const part = sound.subarray(Math.round(RATE * 0.1), Math.round(RATE * 0.3));
  const crossings = part.reduce(
    (count, sample, at) =>
      at > 0 && Math.sign(sample) !== Math.sign(part[at - 1])
        ? count + 1
        : count,
    0,
  );
  ok(crossings / 0.2 > 3000);
});

test("stamp is the stamp's clack, then a short low thud on the desk, then quiet", () => {
  const sound = stamp();
  ok(sound.length < RATE * 0.6);
  // The thud is the loud part, and dies within a few tenths of a second.
  ok(rms(sound, 0.03, 0.09) > 6 * rms(sound, 0.3, 0.4));
  // The clack comes first and is bright; the thud is dark: few zero crossings.
  const crossings = (from, to) => {
    const part = sound.subarray(Math.round(RATE * from), Math.round(RATE * to));
    return (
      part.reduce(
        (count, sample, at) =>
          at > 0 && Math.sign(sample) !== Math.sign(part[at - 1])
            ? count + 1
            : count,
        0,
      ) /
      (to - from)
    );
  };
  ok(crossings(0, 0.008) > 4 * crossings(0.05, 0.12));
  ok(crossings(0.05, 0.12) < 900);
});

test("a sound is written as a 16-bit mono WAV, as the encoder takes it", () => {
  const file = wav(new Float32Array([0, 1, -1, 0.5]));
  strictEqual(file.toString("ascii", 0, 4), "RIFF");
  strictEqual(file.readUInt16LE(22), 1);
  strictEqual(file.readUInt32LE(24), RATE);
  strictEqual(file.readUInt16LE(34), 16);
  strictEqual(file.readInt16LE(46), 32767);
  strictEqual(file.length, 44 + 8);
});

test("the mod ships its four sounds as MP3", () => {
  for (const name of ["blocked", "cracked", "done", "stamp"]) {
    const file = new URL(
      `../herdr/mods/forgerdr/sounds/${name}.mp3`,
      import.meta.url,
    );
    ok(existsSync(file));
    ok(statSync(file).size > 4000);
  }
});
