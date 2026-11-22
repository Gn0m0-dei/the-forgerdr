// The security view's pure logic, which imports neither herdr nor gpui-kit, under Node's own runner. Node is not
// herdr's runtime: herdr-app check and the gallery cover that.
// Run: node --test test/herdr-security.test.mjs
import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import {
  afterRead,
  auditLine,
  detailOf,
  fixAnswer,
  fixReply,
  pendingFix,
  pickedFindings,
  pickedNothing,
  placeOf,
  recommended,
  securityGroups,
  stampedWords,
  stampWords,
  triageKey,
  verdictTag,
  verdictTone,
  verifierLine,
} from "../herdr/mods/forgerdr/security.js";

/** @param {string} id @param {string} status @param {object} [more] */
const finding = (id, status, more = {}) => ({
  check: "",
  control: "",
  effect: "",
  fact: "",
  fix: "",
  id,
  input: "",
  line: 57,
  path: "daemon/src/socket.rs",
  reason: "",
  severity: "",
  status,
  test: "",
  title: `finding ${id}`,
  trace: "",
  verifier: null,
  who: "",
  ...more,
});

const FINDINGS = [
  finding("S1", "confirmed", { severity: "medium" }),
  finding("R1", "rejected"),
  finding("S2", "confirmed", { severity: "critical" }),
  finding("N1", "needs-validation"),
  finding("S3", "confirmed", { severity: "high" }),
  finding("S4", "confirmed", { severity: "critical" }),
  finding("N2", "needs-validation", { severity: "high" }),
  finding("R2", "rejected"),
];

test("findings group confirmed by severity, then needs validation, then rejected, each in the skill's order", () => {
  deepStrictEqual(
    securityGroups(FINDINGS).map((group) => [
      group.key,
      group.label,
      group.tone,
      group.findings.map((one) => one.id),
    ]),
    [
      ["critical", "CONFIRMED · CRITICAL", "failed", ["S2", "S4"]],
      ["high", "CONFIRMED · HIGH", "failed", ["S3"]],
      ["medium", "CONFIRMED · MEDIUM", "needs", ["S1"]],
      ["needs-validation", "NEEDS VALIDATION", "accent", ["N1", "N2"]],
      ["rejected", "REJECTED", "muted", ["R1", "R2"]],
    ],
  );
});

test("a confirmed low finding groups muted, and empty groups are left out", () => {
  deepStrictEqual(
    securityGroups([finding("S9", "confirmed", { severity: "low" })]).map(
      (group) => [group.key, group.label, group.tone],
    ),
    [["low", "CONFIRMED · LOW", "muted"]],
  );
  deepStrictEqual(securityGroups([]), []);
});

test("a confirmed finding with no known severity goes to the low group, never dropped", () => {
  deepStrictEqual(
    securityGroups([
      finding("S1", "confirmed", { severity: "low" }),
      finding("S2", "confirmed", { severity: "" }),
      finding("S3", "confirmed", { severity: "urgent" }),
    ]).map((group) => [group.key, group.findings.map((one) => one.id)]),
    [["low", ["S1", "S2", "S3"]]],
  );
});

test("the auditor's line counts every status, zeros included", () => {
  strictEqual(
    auditLine(FINDINGS),
    "auditor: 4 confirmed · 2 needs validation · 2 rejected",
  );
  strictEqual(
    auditLine([finding("S1", "confirmed", { severity: "low" })]),
    "auditor: 1 confirmed · 0 needs validation · 0 rejected",
  );
  strictEqual(
    auditLine([
      finding("R1", "rejected"),
      finding("N1", "needs-validation"),
      finding("R2", "rejected"),
    ]),
    "auditor: 0 confirmed · 1 needs validation · 2 rejected",
  );
});

test("the verifier's line says whether one ran and how many findings it checked", () => {
  strictEqual(verifierLine(FINDINGS), "no verifier ran");
  const verified = (/** @type {string} */ id) =>
    finding(id, "confirmed", {
      severity: "high",
      verifier: { verdict: "confirmed", was: "" },
    });
  strictEqual(
    verifierLine([...FINDINGS, verified("S8")]),
    "verifier checked 1 finding",
  );
  strictEqual(
    verifierLine([verified("S8"), verified("S9")]),
    "verifier checked 2 findings",
  );
});

test("each verifier verdict has its tag and tone; no verifier has neither", () => {
  const judged = (/** @type {string} */ verdict, was = "") =>
    finding("S1", "confirmed", {
      severity: "medium",
      verifier: { verdict, was },
    });
  deepStrictEqual(
    [
      judged("confirmed"),
      judged("confirmed", "high"),
      judged("downgraded", "high"),
      judged("downgraded"),
      judged("needs-validation"),
      judged("rejected"),
      finding("S1", "confirmed", { severity: "medium" }),
    ].map((one) => [verdictTag(one), verdictTone(one)]),
    [
      ["VERIFIER: CONFIRMED", "ok"],
      ["VERIFIER: CONFIRMED", "ok"],
      ["VERIFIER: DOWNGRADED FROM HIGH", "needs"],
      ["VERIFIER: DOWNGRADED", "needs"],
      ["VERIFIER: NEEDS VALIDATION", "accent"],
      ["VERIFIER: REJECTED", "muted"],
      ["", "muted"],
    ],
  );
});

test("only a confirmed critical finding is recommended", () => {
  deepStrictEqual(
    [
      finding("S1", "confirmed", { severity: "critical" }),
      finding("S2", "confirmed", { severity: "high" }),
      finding("N1", "needs-validation", { severity: "critical" }),
      finding("R1", "rejected", { severity: "critical" }),
    ].map(recommended),
    [true, false, false, false],
  );
});

test("a finding's place is its path and line, its path alone, or nothing", () => {
  strictEqual(placeOf(finding("S1", "confirmed")), "daemon/src/socket.rs:57");
  strictEqual(
    placeOf(finding("S1", "confirmed", { line: null })),
    "daemon/src/socket.rs",
  );
  strictEqual(
    placeOf(finding("S1", "confirmed", { line: null, path: "" })),
    "",
  );
  strictEqual(placeOf(finding("S1", "confirmed", { path: "" })), "");
});

test("a finding's detail is what its status tells, empty texts left out", () => {
  const texts = {
    check: "check",
    control: "control",
    effect: "effect",
    fact: "fact",
    fix: "fix",
    input: "input",
    reason: "reason",
    test: "test",
    trace: "trace",
    who: "who",
  };
  deepStrictEqual(detailOf(finding("S1", "confirmed", texts)), [
    { label: "WHO", text: "who" },
    { label: "INPUT", text: "input" },
    { label: "CONTROL", text: "control" },
    { label: "PATH", text: "trace" },
    { label: "EFFECT", text: "effect" },
    { label: "FIX", text: "fix" },
    { label: "TEST", text: "test" },
  ]);
  deepStrictEqual(detailOf(finding("N1", "needs-validation", texts)), [
    { label: "FACT", text: "fact" },
    { label: "CHECK", text: "check" },
  ]);
  deepStrictEqual(detailOf(finding("R1", "rejected", texts)), [
    { label: "WHY", text: "reason" },
  ]);
  deepStrictEqual(
    detailOf(finding("S1", "confirmed", { fix: "fix", who: "who" })),
    [
      { label: "WHO", text: "who" },
      { label: "FIX", text: "fix" },
    ],
  );
});

test("the findings picked are those of the status asked, in the order the view lists them", () => {
  deepStrictEqual(
    pickedFindings(
      new Set(["S1", "R1", "S4", "N1", "X9", "S2"]),
      "confirmed",
      FINDINGS,
    ).map((picked) => picked.id),
    ["S2", "S4", "S1"],
  );
  deepStrictEqual(
    pickedFindings(["N2", "S3", "N1"], "needs-validation", FINDINGS),
    [FINDINGS[3], FINDINGS[6]],
  );
  deepStrictEqual(pickedFindings([], "confirmed", FINDINGS), []);
});

test("the fix answer names the picks in the order the view lists them", () => {
  strictEqual(
    fixAnswer(
      { fix: ["S1", "S4", "S2"], note: ["N2"], remember: ["N2", "N1"] },
      FINDINGS,
    ),
    "Fix: S2, S4, S1; Note: N2; Remember: N1, N2",
  );
});

test("the fix answer says none fixed, and leaves out the empty parts", () => {
  strictEqual(
    fixAnswer({ fix: [], note: [], remember: [] }, FINDINGS),
    "Fix: none",
  );
  strictEqual(
    fixAnswer({ fix: [], note: ["N1"], remember: [] }, FINDINGS),
    "Fix: none; Note: N1",
  );
  strictEqual(
    fixAnswer({ fix: ["S3"], note: [], remember: ["N2"] }, FINDINGS),
    "Fix: S3; Remember: N2",
  );
});

test("the fix answer drops an id its part cannot take", () => {
  strictEqual(
    fixAnswer(
      { fix: ["R1", "S3", "N1", "X9"], note: ["S2", "N1"], remember: ["R2"] },
      FINDINGS,
    ),
    "Fix: S3; Note: N1",
  );
});

test("the stamp counts the findings it fixes", () => {
  strictEqual(
    stampWords({ fix: ["S2", "S1", "R1"], note: [], remember: [] }, FINDINGS),
    "Stamp: fix 2",
  );
  strictEqual(
    stampWords({ fix: ["N1"], note: ["N1"], remember: [] }, FINDINGS),
    "Stamp: fix none",
  );
});

test("once stamped, the view counts the findings it sent to be fixed", () => {
  strictEqual(
    stampedWords({ fix: ["S2", "S1", "R1"], note: [], remember: [] }, FINDINGS),
    "stamped · fix 2",
  );
  strictEqual(
    stampedWords({ fix: [], note: ["N1"], remember: ["N2"] }, FINDINGS),
    "stamped · fix none",
  );
});

test("the picks send nothing when no finding of the right status is picked to fix, note or remember", () => {
  strictEqual(
    pickedNothing({ fix: [], note: [], remember: [] }, FINDINGS),
    true,
  );
  strictEqual(
    pickedNothing(
      { fix: ["R1", "N1"], note: ["S1"], remember: ["R2"] },
      FINDINGS,
    ),
    true,
  );
  strictEqual(
    pickedNothing({ fix: ["S1"], note: [], remember: [] }, FINDINGS),
    false,
  );
  strictEqual(
    pickedNothing({ fix: [], note: ["N1"], remember: [] }, FINDINGS),
    false,
  );
  strictEqual(
    pickedNothing({ fix: [], note: [], remember: ["N2"] }, FINDINGS),
    false,
  );
});

/** @param {number} sent @param {object[]} findings */
const triage = (sent, findings) => ({
  audit: { item: "#7", scope: "git diff main...HEAD", title: "#7 export" },
  findings,
  sent,
  tab: "tb1",
  terminal: "t7",
  updated: sent + 5,
});

test("a triage's key changes when its findings are sent again or it opens afresh, and only then", () => {
  const read = triage(100, FINDINGS);
  strictEqual(triageKey(triage(100, FINDINGS)), triageKey(read));
  strictEqual(
    triageKey({ ...read, updated: 900 }),
    triageKey(read),
    "a write that changes nothing the picks rest on keeps the key",
  );
  strictEqual(triageKey(triage(200, FINDINGS)) === triageKey(read), false);
  strictEqual(triageKey(triage(0, [])) === triageKey(read), false);
  strictEqual(
    triageKey(triage(100, FINDINGS.slice(1))) === triageKey(read),
    false,
  );
});

const OPENING = Object.freeze({
  gone: false,
  key: "",
  seen: false,
  stamped: false,
  triage: null,
});

test("a triage that is not there before one was read is still opening, not gone", () => {
  deepStrictEqual(afterRead(OPENING, null), {
    hold: OPENING,
    restart: false,
  });
});

test("a triage that goes after it showed is gone; the view drops it unless it stamped it", () => {
  const shown = afterRead(OPENING, triage(100, FINDINGS)).hold;
  deepStrictEqual(afterRead(shown, null).hold, {
    ...shown,
    gone: true,
    triage: null,
  });
  deepStrictEqual(afterRead({ ...shown, stamped: true }, null).hold, {
    ...shown,
    gone: true,
    stamped: true,
  });
});

test("a triage opened again after one went starts the view over, stamped or not", () => {
  const read = triage(100, FINDINGS);
  const gone = {
    ...afterRead(OPENING, read).hold,
    gone: true,
    stamped: true,
  };
  const next = triage(0, []);
  deepStrictEqual(afterRead(gone, next), {
    hold: {
      gone: false,
      key: triageKey(next),
      seen: true,
      stamped: false,
      triage: next,
    },
    restart: true,
  });
});

test("the same key read again keeps the view's picks, after it went too", () => {
  const read = triage(0, []);
  const gone = afterRead(afterRead(OPENING, read).hold, null).hold;
  deepStrictEqual(afterRead(gone, read), {
    hold: {
      gone: false,
      key: triageKey(read),
      seen: true,
      stamped: false,
      triage: read,
    },
    restart: false,
  });
});

/** @param {string} id @param {string} terminal @param {string} header @param {number} created */
const request = (id, terminal, header, created) => ({
  agent_type: "",
  created,
  cwd: "/r",
  id,
  kind: "question",
  session_id: "s",
  terminal,
  tool_input: {
    questions: [
      {
        header,
        options: [{ label: "a" }, { label: "b" }],
        question: `${header}?`,
      },
    ],
  },
  tool_name: "AskUserQuestion",
});

test("the view answers its terminal's oldest fix question asked after the findings were sent", () => {
  const requests = [
    request("late", "t7", "Security fix", 30),
    request("other", "t8", "Security fix", 12),
    request("gate", "t7", "Gate commit", 11),
    request("stale", "t7", "Security fix", 5),
    request("first", "t7", "Security fix", 20),
  ];
  const pending = pendingFix(requests, "t7", 10);
  deepStrictEqual(
    [pending?.request.id, pending?.question.question],
    ["first", "Security fix?"],
  );
});

test("no fix question is answered before the findings are sent, nor one from before them", () => {
  strictEqual(
    pendingFix([request("a", "t7", "Security fix", 20)], "t7", 0),
    null,
  );
  strictEqual(
    pendingFix([request("a", "t7", "Security fix", 5)], "t7", 10),
    null,
  );
  strictEqual(
    pendingFix([request("a", "t8", "Security fix", 20)], "t7", 10),
    null,
  );
  strictEqual(
    pendingFix([request("a", "t7", "Review pick", 20)], "t7", 10),
    null,
  );
  strictEqual(
    pendingFix([request("a", "t7", "Security fix", 10)], "t7", 10)?.request.id,
    "a",
  );
});

test("the reply answers the fix question with the text", () => {
  const pending = pendingFix([request("a", "t7", "Security fix", 20)], "t7", 1);
  deepStrictEqual(fixReply(pending, "Fix: S1"), {
    answers: { "Security fix?": "Fix: S1" },
    behavior: "allow",
  });
});
