// The special sessions' pure logic, which imports neither herdr nor gpui-kit, under Node's own runner. Node is not
// herdr's runtime: herdr-app check and the gallery cover that.
// Run: node --test test/herdr-specials.test.mjs
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { test } from "node:test";
import { FORGE_LABEL } from "../herdr/mods/forgerdr/lanes.js";
import {
  golemOf,
  isParkedReview,
  laneLook,
  reviewLine,
  reviewLook,
  reviewsOfSpaces,
  rowLook,
  SESSION_GOLEM,
  SPECIAL,
  SPECIAL_LOOK,
  specialOf,
  specialTabOf,
  terminalChip,
  terminalGolem,
  treeLeads,
} from "../herdr/mods/forgerdr/specials.js";

test("the labels the forge scripts set on a special session's terminal are one closed set", () => {
  deepStrictEqual(FORGE_LABEL, {
    review: "forge.review",
    tab: "forge.tab",
    view: "forge.view",
  });
  ok(Object.isFrozen(FORGE_LABEL));
});

test("the specials and their looks are closed sets", () => {
  deepStrictEqual(SPECIAL, {
    mine: "mine",
    review: "review",
    security: "security",
  });
  ok(Object.isFrozen(SPECIAL));
  deepStrictEqual(SPECIAL_LOOK, {
    mine: { chip: "THREADS", golem: "reviewer", icon: "pull-request" },
    review: { chip: "TRIAGE", golem: "reviewer", icon: "pull-request" },
    security: { chip: "TRIAGE", golem: "warden", icon: "shield" },
  });
  ok(Object.isFrozen(SPECIAL_LOOK));
});

test("a session is special by its review label", () => {
  strictEqual(
    specialOf({ address: "t1", labels: { "forge.review": "other" } }),
    "review",
  );
  strictEqual(
    specialOf({ address: "t2", labels: { "forge.review": "own" } }),
    "mine",
  );
  strictEqual(
    specialOf({ address: "t3", labels: { "forge.review": "security" } }),
    "security",
  );
});

test("a session with no review label the view knows is not special", () => {
  strictEqual(
    specialOf({ address: "t4", labels: { "forge.review": "" } }),
    null,
  );
  strictEqual(specialOf({ address: "t5", labels: {} }), null);
  strictEqual(specialOf({ address: "t6" }), null);
  strictEqual(
    specialOf({ address: "t7", labels: { "forge.review": "approve" } }),
    null,
  );
  strictEqual(
    specialOf({ address: "t8", labels: { "forge.review": "toString" } }),
    null,
  );
  strictEqual(specialOf(undefined), null);
});

test("a session is iron", () => {
  strictEqual(SESSION_GOLEM, "iron");
});

test("the iron golem of a review session takes the reviewer", () => {
  strictEqual(golemOf("iron", "review"), "reviewer");
  strictEqual(golemOf("iron", "mine"), "reviewer");
});

test("a security session is the warden, whatever its golem: iron as a session of its own, stone launched by another", () => {
  strictEqual(golemOf("iron", "security"), "warden");
  strictEqual(golemOf("stone", "security"), "warden");
});

test("a review session launched by another session is the reviewer too", () => {
  strictEqual(golemOf("stone", "review"), "reviewer");
  strictEqual(golemOf("stone", "mine"), "reviewer");
});

test("a subagent inside a session, or a session that is not special, keeps its role", () => {
  strictEqual(golemOf("clay", "review"), "clay");
  strictEqual(golemOf("clay", "security"), "clay");
  strictEqual(golemOf("iron", null), "iron");
  strictEqual(golemOf("stone", null), "stone");
});

const OTHERS = {
  address: "t1",
  labels: { "forge.review": "other", "forge.tab": "tb-42" },
};
const OWN = {
  address: "t2",
  labels: { "forge.review": "own", "forge.tab": "tb-40" },
};
const SECURITY = {
  address: "t3",
  labels: {
    "forge.review": "security",
    "forge.tab": "tb-sec",
    "forge.view": "tb-sec",
  },
};
const PLAIN = { address: "t7", labels: { "forge.tab": "tb-plain" } };
const TAB_TERMINALS = [
  OTHERS,
  OWN,
  SECURITY,
  {
    address: "t4",
    labels: {
      "forge.review": "other",
      "forge.tab": "tb-43",
      "forge.view": "tb-elsewhere",
    },
  },
  { address: "t5", labels: { "forge.review": "own", "forge.tab": "" } },
  { address: "t6", labels: { "forge.view": "" } },
  PLAIN,
];

test("a review's tab is the one its forge.tab names", () => {
  deepStrictEqual(specialTabOf("tb-42", TAB_TERMINALS), {
    special: "review",
    terminal: OTHERS,
  });
  deepStrictEqual(specialTabOf("tb-40", TAB_TERMINALS), {
    special: "mine",
    terminal: OWN,
  });
});

test("a security session's tab is the one it is parked behind: launch and open label the same tab", () => {
  deepStrictEqual(specialTabOf("tb-sec", TAB_TERMINALS), {
    special: "security",
    terminal: SECURITY,
  });
});

test("a review's forge.view names no tab of it", () => {
  strictEqual(specialTabOf("tb-elsewhere", TAB_TERMINALS), null);
});

test("a review view's tab keeps its special once its session finished: the view outlives it", () => {
  const finished = {
    address: "t8",
    labels: { "forge.review": "other", "forge.tab": "tb-44" },
    state: "finished",
  };
  deepStrictEqual(specialTabOf("tb-44", [...TAB_TERMINALS, finished]), {
    special: "review",
    terminal: finished,
  });
});

test("no tab, or a tab no special session's view lives in, has no special", () => {
  strictEqual(specialTabOf("", TAB_TERMINALS), null);
  strictEqual(specialTabOf("tb-plain", TAB_TERMINALS), null);
  strictEqual(specialTabOf("tb-9", TAB_TERMINALS), null);
});

/** @param {string} kind @param {string} number @param {string} author @param {number} threads */
const review = (kind, number, author, threads) => ({
  kind,
  pr: { author, number, title: `pull request ${number}` },
  threads: Array.from({ length: threads }, (_, index) => ({
    id: `th${index}`,
  })),
});

test("another's review reads its number and its author", () => {
  strictEqual(
    reviewLine(review("other", "42", "quench-dev", 0)),
    "#42 review · @quench-dev",
  );
  strictEqual(reviewLine(review("other", "42", "", 0)), "#42 review · @?");
});

test("the user's own review reads its number and its threads, counted", () => {
  strictEqual(reviewLine(review("own", "40", "me", 1)), "#40 mine · 1 thread");
  strictEqual(reviewLine(review("own", "40", "me", 4)), "#40 mine · 4 threads");
});

test("a review's row is drawn as its kind's special: TRIAGE for another's, THREADS for the user's own", () => {
  deepStrictEqual(reviewLook({ kind: "other" }), SPECIAL_LOOK.review);
  deepStrictEqual(reviewLook({ kind: "own" }), SPECIAL_LOOK.mine);
  strictEqual(reviewLook({ kind: "other" }).golem, "reviewer");
});

const SPACE_LIST = [
  { id: "sp1", tabs: [{ id: "tb-42" }, { id: "tb-40" }] },
  { id: "sp2", tabs: [{ id: "tb-7" }] },
];

const SPACE_TERMINALS = [
  {
    address: "t1",
    labels: { "forge.review": "other", "forge.tab": "tb-42" },
    state: "live",
  },
  {
    address: "t2",
    labels: { "forge.review": "own", "forge.tab": "tb-40" },
    state: "live",
  },
  {
    address: "t3",
    labels: { "forge.review": "other", "forge.tab": "tb-7" },
    state: "live",
  },
  {
    address: "t4",
    labels: { "forge.review": "other", "forge.tab": "tb-42" },
    state: "finished",
  },
  {
    address: "t5",
    labels: { "forge.review": "other", "forge.tab": "tb-gone" },
    state: "live",
  },
  {
    address: "t6",
    labels: { "forge.review": "", "forge.tab": "tb-42" },
    state: "live",
  },
  {
    address: "t7",
    labels: { "forge.review": "own", "herdr.space": "sp1" },
    state: "live",
  },
];

/** @param {string} terminal */
const sessionReview = (terminal) => ({ kind: "other", terminal });

/** @param {{ terminal: string }[]} reviews */
const terminalsOf = (reviews) => reviews.map((one) => one.terminal);

test("the reviews of some spaces are those whose session shows there, in the order given", () => {
  const reviews = ["t3", "t2", "t1"].map(sessionReview);
  deepStrictEqual(
    terminalsOf(reviewsOfSpaces(reviews, SPACE_TERMINALS, SPACE_LIST, ["sp1"])),
    ["t2", "t1"],
  );
  deepStrictEqual(
    terminalsOf(
      reviewsOfSpaces(reviews, SPACE_TERMINALS, SPACE_LIST, ["sp1", "sp2"]),
    ),
    ["t3", "t2", "t1"],
  );
  deepStrictEqual(
    reviewsOfSpaces(reviews, SPACE_TERMINALS, SPACE_LIST, []),
    [],
  );
});

test("a review whose session is unknown, finished or whose tab is gone is left out", () => {
  const reviews = ["t9", "t4", "t5", "t1"].map(sessionReview);
  deepStrictEqual(
    terminalsOf(
      reviewsOfSpaces(reviews, SPACE_TERMINALS, SPACE_LIST, ["sp1", "sp2"]),
    ),
    ["t1"],
  );
});

test("the review sessions are parked in the PULL REQUESTS group; the security one is not", () => {
  strictEqual(isParkedReview(OTHERS), true);
  strictEqual(isParkedReview(OWN), true);
  strictEqual(isParkedReview(SECURITY), false);
  strictEqual(isParkedReview(PLAIN), false);
  strictEqual(isParkedReview({ address: "t8" }), false);
});

test("a session whose review label was cleared, or a review with no view's tab, is not in the PULL REQUESTS group", () => {
  const cleared = SPACE_TERMINALS.find((one) => one.address === "t6");
  const unparked = SPACE_TERMINALS.find((one) => one.address === "t7");
  strictEqual(isParkedReview(cleared), false);
  strictEqual(isParkedReview(unparked), false);
  strictEqual(
    isParkedReview({
      address: "t5",
      labels: { "forge.review": "own", "forge.tab": "" },
    }),
    false,
  );
  deepStrictEqual(
    terminalsOf(
      reviewsOfSpaces(
        ["t6", "t7", "t1"].map(sessionReview),
        SPACE_TERMINALS,
        SPACE_LIST,
        ["sp1", "sp2"],
      ),
    ),
    ["t1"],
  );
});

/** @param {string} address */
const terminalAt = (address) =>
  SPACE_TERMINALS.find((one) => one.address === address);

/** @param {{ address: string }[]} leads */
const addressesOf = (leads) => leads.map((one) => one.address);

const LEADS = ["t1", "t6", "t9"].map((address) => ({ address }));

test("a parked review whose review is listed is in the PULL REQUESTS group, not in the tree", () => {
  const group = reviewsOfSpaces(
    ["t1"].map(sessionReview),
    SPACE_TERMINALS,
    SPACE_LIST,
    ["sp1"],
  );
  deepStrictEqual(terminalsOf(group), ["t1"]);
  deepStrictEqual(addressesOf(treeLeads(LEADS, group)), ["t6", "t9"]);
});

test("a parked review whose review is not listed (not read yet, or gone) stays in the tree, as the reviewer", () => {
  const group = reviewsOfSpaces([], SPACE_TERMINALS, SPACE_LIST, ["sp1"]);
  deepStrictEqual(addressesOf(treeLeads(LEADS, group)), ["t1", "t6", "t9"]);
  strictEqual(golemOf("iron", specialOf(terminalAt("t1"))), "reviewer");
});

test("a review session whose review label was cleared is in the tree only, as iron", () => {
  const group = reviewsOfSpaces(
    ["t6"].map(sessionReview),
    SPACE_TERMINALS,
    SPACE_LIST,
    ["sp1"],
  );
  deepStrictEqual(group, []);
  deepStrictEqual(addressesOf(treeLeads(LEADS, group)), ["t1", "t6", "t9"]);
  strictEqual(golemOf("iron", specialOf(terminalAt("t6"))), "iron");
});

test("a terminal's golem: iron for a session, the reviewer for a review session, the warden for a security one", () => {
  strictEqual(terminalGolem({ address: "t1" }), "iron");
  strictEqual(terminalGolem(SECURITY), "warden");
  strictEqual(terminalGolem(OTHERS), "reviewer");
  strictEqual(terminalGolem(undefined), "iron");
});

test("a terminal's golem: stone for an agent another session dispatched", () => {
  strictEqual(terminalGolem({ address: "t2", parent: "t1" }), "stone");
  strictEqual(
    terminalGolem({ address: "t3", labels: { "forge.parent": "t1" } }),
    "stone",
  );
});

const LAUNCHED_SECURITY = {
  address: "t4",
  labels: {
    "forge.parent": "t1",
    "forge.review": "security",
    "forge.tab": "tb-sec",
    "forge.view": "tb-sec",
  },
};

test("a security session parked behind its view is the warden, launched by another session or of its own", () => {
  strictEqual(terminalGolem(LAUNCHED_SECURITY), "warden");
  strictEqual(
    terminalGolem({
      address: "t5",
      labels: {
        "forge.review": "security",
        "forge.tab": "tb-sec",
        "forge.view": "tb-sec",
      },
    }),
    "warden",
  );
});

test("a security session's row and lane read TRIAGE in place of its status", () => {
  strictEqual(terminalChip(SECURITY), "TRIAGE");
  strictEqual(terminalChip(LAUNCHED_SECURITY), SPECIAL_LOOK.security.chip);
});

test("any other session's row and lane read its status: a review's chip shows in the PULL REQUESTS group only", () => {
  strictEqual(terminalChip(OTHERS), undefined);
  strictEqual(terminalChip(OWN), undefined);
  strictEqual(terminalChip(PLAIN), undefined);
  strictEqual(terminalChip({ address: "t9", parent: "t1" }), undefined);
  strictEqual(terminalChip(undefined), undefined);
});

test("a row of the agent tree draws a terminal's golem and chip: the warden reading TRIAGE for a security session", () => {
  deepStrictEqual(rowLook(LAUNCHED_SECURITY), {
    chip: "TRIAGE",
    role: "warden",
  });
  deepStrictEqual(rowLook(SECURITY), { chip: "TRIAGE", role: "warden" });
});

test("any other row reads its status: iron for a session, stone for an agent, the reviewer for a review session", () => {
  deepStrictEqual(rowLook({ address: "t1" }), {
    chip: undefined,
    role: "iron",
  });
  deepStrictEqual(
    rowLook({ address: "t2", labels: { "forge.parent": "t1" } }),
    {
      chip: undefined,
      role: "stone",
    },
  );
  deepStrictEqual(rowLook(OTHERS), { chip: undefined, role: "reviewer" });
});

test("a lane draws its terminal's row look: the warden reading TRIAGE for a security session another launched", () => {
  deepStrictEqual(laneLook({ golem: "stone" }, LAUNCHED_SECURITY), {
    chip: "TRIAGE",
    role: "warden",
  });
  deepStrictEqual(
    laneLook({ golem: "stone" }, { address: "t3", parent: "t1" }),
    { chip: undefined, role: "stone" },
  );
});

test("a subagent's lane, with no terminal of its own, keeps its clay golem and reads its status", () => {
  deepStrictEqual(laneLook({ golem: "clay" }, undefined), {
    chip: undefined,
    role: "clay",
  });
});
