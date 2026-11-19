// The forge's own sound, which the app has no alert for: the crack of a golem an API error broke. It plays the mod's
// sounds/cracked.mp3 (herdr/tools/sounds.mts), as the app plays its alerts, unless the person turned sounds off in
// settings.json ("sounds": { "enabled": false }).
import { appHome, playSound, readTextFile } from "herdr";
import { MOD } from "../name.js";

const SOUND = Object.freeze({
  cracked: `mods/${MOD}/sounds/cracked.mp3`,
  settings: "settings.json",
});

/** @returns {Promise<boolean>} whether the person lets the app play sounds; yes when settings.json does not say */
const soundsOn = async () => {
  try {
    const text = await readTextFile(`${appHome()}/${SOUND.settings}`);
    if (text === null) return true;
    /** @type {unknown} */
    const settings = JSON.parse(text);
    if (
      settings === null ||
      typeof settings !== "object" ||
      !("sounds" in settings)
    )
      return true;
    const { sounds } = settings;
    return !(
      sounds !== null &&
      typeof sounds === "object" &&
      "enabled" in sounds &&
      sounds.enabled === false
    );
  } catch {
    return true;
  }
};

/** Plays a golem's crack, when the person lets sounds play. */
export const playCracked = async () => {
  if (await soundsOn()) playSound(SOUND.cracked);
};
