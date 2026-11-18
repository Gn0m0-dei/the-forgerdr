// The human's switch for the look's motion, kept in shared state so every copy of the mod follows it at once. The top
// bar takes the mod's "motion" command (a key bound to forgerdr.motion in keys.json) and flips it here.
import { setShared } from "herdr";
import { MOTION_KEY, motionOn } from "../kit/tokens.js";

export const toggleMotion = () => setShared(MOTION_KEY, !motionOn());
