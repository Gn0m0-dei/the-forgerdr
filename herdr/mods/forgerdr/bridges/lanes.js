// Whether the golem lanes are unfolded, in shared state: the lanes draw it and the session bar sizes their block to it.
import { setShared, shared } from "herdr";

const OPEN_KEY = "forgerdr.lanes.open";

export const lanesOpen = () => shared(OPEN_KEY) === true;

export const toggleLanes = () => setShared(OPEN_KEY, !lanesOpen());
