// The security view: the audit a security session runs and what it found, as the session beside it reports it through
// bin/forge-security.sh, and what the view answers that session. Confirmed findings group by severity, then the ones
// that need validation, then the rejected; the human picks the findings to fix and the ones to note or to remember, and
// the view answers the session's question headed "Security fix" with those picks through the inbox.
// Pure: Node tests it (test/herdr-security.test.mjs).
import { counted } from "./format.js";
import { questionAnswer, questionsOf, REVIEW_ASK_HEADER } from "./inbox.js";

/** @typedef {import("./inbox.js").InboxAnswer} InboxAnswer */
/** @typedef {import("./inbox.js").InboxRequest} InboxRequest */
/** @typedef {import("./inbox.js").Question} Question */

export const FINDING_STATUS = Object.freeze({
  confirmed: "confirmed",
  needsValidation: "needs-validation",
  rejected: "rejected",
});

/** @typedef {typeof FINDING_STATUS[keyof typeof FINDING_STATUS]} FindingStatus */

const SECURITY_SEVERITY = Object.freeze({
  critical: "critical",
  high: "high",
  low: "low",
  medium: "medium",
});

/** @typedef {typeof SECURITY_SEVERITY[keyof typeof SECURITY_SEVERITY]} SecuritySeverity */

// The severities in the order the view groups the confirmed findings, the most serious first.
/** @type {readonly SecuritySeverity[]} */
const SECURITY_SEVERITY_ORDER = Object.freeze([
  SECURITY_SEVERITY.critical,
  SECURITY_SEVERITY.high,
  SECURITY_SEVERITY.medium,
  SECURITY_SEVERITY.low,
]);

export const VERDICT = Object.freeze({
  confirmed: "confirmed",
  downgraded: "downgraded",
  needsValidation: "needs-validation",
  rejected: "rejected",
});

/** @typedef {typeof VERDICT[keyof typeof VERDICT]} Verdict */

// The tones the view paints with: each names a key of tokens() (kit/tokens.js), whose colour the view reads directly.
export const SECURITY_TONE = Object.freeze({
  accent: "accent",
  failed: "failed",
  muted: "muted",
  needs: "needs",
  ok: "ok",
});

/** @typedef {typeof SECURITY_TONE[keyof typeof SECURITY_TONE]} SecurityTone */

/**
 * What a security verifier decided about a finding the auditor confirmed.
 * @typedef {object} Verification
 * @property {Verdict} verdict
 * @property {SecuritySeverity | ""} was the severity the auditor gave before a downgrade, "" when none is told
 */

/**
 * A finding as bin/forge-security.sh show prints it: every text is there, "" when its status does not tell it.
 * @typedef {object} SecurityFinding
 * @property {string} id
 * @property {FindingStatus} status
 * @property {SecuritySeverity | ""} severity "" when it has none, as a finding that needs validation may
 * @property {string} path "" when it has no file
 * @property {number | null} line
 * @property {string} title
 * @property {string} who who can reach it
 * @property {string} input what they send
 * @property {string} control the control that fails
 * @property {string} trace the path from the entry to the effect
 * @property {string} effect
 * @property {string} fix
 * @property {string} test the regression test for the fix
 * @property {string} fact what the auditor could not settle, for a finding that needs validation
 * @property {string} check how to settle it
 * @property {string} reason why it was rejected
 * @property {Verification | null} verifier null when no verifier checked it
 */

/**
 * @typedef {object} Audit
 * @property {string} title
 * @property {string} scope
 * @property {string} item the work item it is for, "" when none
 */

/**
 * A terminal's triage, as bin/forge-security.sh show prints it.
 * @typedef {object} Triage
 * @property {string} terminal
 * @property {number} updated ms
 * @property {number} sent when the findings were sent, in ms; 0 before they are
 * @property {string} tab the security view's
 * @property {Audit} audit
 * @property {SecurityFinding[]} findings in the order the skill reported them
 */

/**
 * What a group the view lists is keyed by: the severity of its confirmed findings, or the status of the others.
 * @typedef {SecuritySeverity | Exclude<FindingStatus, typeof FINDING_STATUS.confirmed>} GroupKey
 */

/**
 * @typedef {object} SecurityGroup
 * @property {GroupKey} key
 * @property {string} label
 * @property {SecurityTone} tone
 * @property {SecurityFinding[]} findings
 */

/** @type {Readonly<Record<SecuritySeverity, SecurityTone>>} */
const SEVERITY_TONE = Object.freeze({
  critical: SECURITY_TONE.failed,
  high: SECURITY_TONE.failed,
  low: SECURITY_TONE.muted,
  medium: SECURITY_TONE.needs,
});

// The groups the view lists, in its order: the confirmed findings by severity, the most serious first, then the ones
// that need validation, then the rejected.
/** @type {readonly Omit<SecurityGroup, "findings">[]} */
const GROUPS = Object.freeze([
  ...SECURITY_SEVERITY_ORDER.map((severity) => ({
    key: severity,
    label: `CONFIRMED · ${severity.toUpperCase()}`,
    tone: SEVERITY_TONE[severity],
  })),
  {
    key: FINDING_STATUS.needsValidation,
    label: "NEEDS VALIDATION",
    tone: SECURITY_TONE.accent,
  },
  {
    key: FINDING_STATUS.rejected,
    label: "REJECTED",
    tone: SECURITY_TONE.muted,
  },
]);

/**
 * The key of the group a finding goes in: its status, or a confirmed finding's severity. A confirmed finding with no
 * severity the view knows goes to the low group, so that none is left out unseen.
 * @param {SecurityFinding} finding
 * @returns {GroupKey}
 */
const groupKeyOf = ({ status, severity }) => {
  if (status !== FINDING_STATUS.confirmed) return status;
  return (
    SECURITY_SEVERITY_ORDER.find((known) => known === severity) ??
    SECURITY_SEVERITY.low
  );
};

/**
 * The findings grouped as the view lists them, each group in the order the skill reported its findings; groups with no
 * finding are left out.
 * @param {SecurityFinding[]} findings
 * @returns {SecurityGroup[]}
 */
export const securityGroups = (findings) => {
  const byKey = Object.groupBy(findings, groupKeyOf);
  return GROUPS.flatMap((group) => {
    const members = byKey[group.key] ?? [];
    return members.length ? [{ ...group, findings: members }] : [];
  });
};

/**
 * What the auditor found, by status, zeros included.
 * @param {SecurityFinding[]} findings
 */
export const auditLine = (findings) => {
  /** @param {FindingStatus} status */
  const count = (status) =>
    findings.filter((finding) => finding.status === status).length;
  return `auditor: ${count(FINDING_STATUS.confirmed)} confirmed · ${count(FINDING_STATUS.needsValidation)} needs validation · ${count(FINDING_STATUS.rejected)} rejected`;
};

/**
 * How many findings a verifier checked, or that none ran.
 * @param {SecurityFinding[]} findings
 */
export const verifierLine = (findings) => {
  const checked = findings.filter((finding) => finding.verifier).length;
  return checked
    ? `verifier checked ${counted(checked, "finding")}`
    : "no verifier ran";
};

/** @type {Readonly<Record<Verdict, string>>} */
const VERDICT_WORDS = Object.freeze({
  confirmed: "CONFIRMED",
  downgraded: "DOWNGRADED",
  "needs-validation": "NEEDS VALIDATION",
  rejected: "REJECTED",
});

/** @type {Readonly<Record<Verdict, SecurityTone>>} */
const VERDICT_TONE = Object.freeze({
  confirmed: SECURITY_TONE.ok,
  downgraded: SECURITY_TONE.needs,
  "needs-validation": SECURITY_TONE.accent,
  rejected: SECURITY_TONE.muted,
});

/**
 * The tag that says what the verifier decided, with the severity a downgrade took away; "" when none checked it.
 * @param {SecurityFinding} finding
 */
export const verdictTag = ({ verifier }) => {
  if (!verifier) return "";
  const from =
    verifier.verdict === VERDICT.downgraded && verifier.was
      ? ` FROM ${verifier.was.toUpperCase()}`
      : "";
  return `VERIFIER: ${VERDICT_WORDS[verifier.verdict]}${from}`;
};

/**
 * The tone of the verifier's tag; muted when none checked the finding.
 * @param {SecurityFinding} finding
 * @returns {SecurityTone}
 */
export const verdictTone = ({ verifier }) =>
  verifier ? VERDICT_TONE[verifier.verdict] : SECURITY_TONE.muted;

/**
 * Whether the view tags a finding as the one to fix: a confirmed critical one. It is never picked for the human.
 * @param {SecurityFinding} finding
 */
export const recommended = ({ status, severity }) =>
  status === FINDING_STATUS.confirmed &&
  severity === SECURITY_SEVERITY.critical;

/**
 * Where a finding is: its path and line, its path alone, or "" when it has no file.
 * @param {SecurityFinding} finding
 */
export const placeOf = ({ path, line }) =>
  path === "" || line === null ? path : `${path}:${line}`;

/**
 * The texts of a finding its detail can tell.
 * @typedef {"check" | "control" | "effect" | "fact" | "fix" | "input" | "reason" | "test" | "trace" | "who"} FindingText
 */

/** @typedef {{ label: string, text: FindingText }} DetailField */

/**
 * @typedef {object} DetailLine
 * @property {string} label
 * @property {string} text
 */

// What a finding's detail tells, by its status, in the order the security skill reports it.
/** @type {Readonly<Record<FindingStatus, readonly DetailField[]>>} */
const DETAIL = Object.freeze({
  confirmed: [
    { label: "WHO", text: "who" },
    { label: "INPUT", text: "input" },
    { label: "CONTROL", text: "control" },
    { label: "PATH", text: "trace" },
    { label: "EFFECT", text: "effect" },
    { label: "FIX", text: "fix" },
    { label: "TEST", text: "test" },
  ],
  "needs-validation": [
    { label: "FACT", text: "fact" },
    { label: "CHECK", text: "check" },
  ],
  rejected: [{ label: "WHY", text: "reason" }],
});

/**
 * A finding's detail as the view shows it: what its status tells, each text under its label; empty texts left out.
 * @param {SecurityFinding} finding
 * @returns {DetailLine[]}
 */
export const detailOf = (finding) =>
  DETAIL[finding.status]
    .map(({ label, text }) => ({ label, text: finding[text] }))
    .filter((line) => line.text);

/**
 * What the human picked in the view, by finding id: the confirmed findings to fix, and the ones that need validation
 * to note or to remember.
 * @typedef {object} TriagePicks
 * @property {string[]} fix
 * @property {string[]} note
 * @property {string[]} remember
 */

// The words of the answer to the session's fix question, which the security skill reads.
const ANSWER = Object.freeze({
  fix: "Fix",
  none: "none",
  note: "Note",
  remember: "Remember",
});

/**
 * The findings of a status whose ids were picked, in the order the view lists them; any other id is dropped.
 * @param {Iterable<string>} ids
 * @param {FindingStatus} status
 * @param {SecurityFinding[]} findings
 */
export const pickedFindings = (ids, status, findings) => {
  const picked = new Set(ids);
  return securityGroups(findings)
    .flatMap((group) => group.findings)
    .filter((finding) => finding.status === status && picked.has(finding.id));
};

/**
 * The ids of the findings of a status that were picked, in the order the view lists them.
 * @param {string[]} ids
 * @param {FindingStatus} status
 * @param {SecurityFinding[]} findings
 */
const pickedOf = (ids, status, findings) =>
  pickedFindings(ids, status, findings).map((finding) => finding.id);

/**
 * @param {string} label
 * @param {string[]} ids
 */
const answerPart = (label, ids) => `${label}: ${ids.join(", ")}`;

/**
 * The answer to the session's fix question: the confirmed findings to fix, or none, then the ones that need validation
 * to note and to remember when any is picked.
 * @param {TriagePicks} picks
 * @param {SecurityFinding[]} findings
 */
export const fixAnswer = (picks, findings) => {
  const fixed = pickedOf(picks.fix, FINDING_STATUS.confirmed, findings);
  const noted = pickedOf(picks.note, FINDING_STATUS.needsValidation, findings);
  const remembered = pickedOf(
    picks.remember,
    FINDING_STATUS.needsValidation,
    findings,
  );
  return [
    answerPart(ANSWER.fix, fixed.length ? fixed : [ANSWER.none]),
    ...(noted.length ? [answerPart(ANSWER.note, noted)] : []),
    ...(remembered.length ? [answerPart(ANSWER.remember, remembered)] : []),
  ].join("; ");
};

/**
 * How many confirmed findings the picks send to be fixed, or none.
 * @param {TriagePicks} picks
 * @param {SecurityFinding[]} findings
 */
const fixedWord = (picks, findings) =>
  `fix ${pickedOf(picks.fix, FINDING_STATUS.confirmed, findings).length || ANSWER.none}`;

/**
 * The stamp's words: how many confirmed findings it sends to be fixed, or none.
 * @param {TriagePicks} picks
 * @param {SecurityFinding[]} findings
 */
export const stampWords = (picks, findings) =>
  `Stamp: ${fixedWord(picks, findings)}`;

/**
 * What the view says once stamped: how many confirmed findings it sent to be fixed, or none.
 * @param {TriagePicks} picks
 * @param {SecurityFinding[]} findings
 */
export const stampedWords = (picks, findings) =>
  `stamped · ${fixedWord(picks, findings)}`;

/**
 * Whether the picks send the session nothing to do: no confirmed finding to fix, and none that needs validation to
 * note or to remember.
 * @param {TriagePicks} picks
 * @param {SecurityFinding[]} findings
 */
export const pickedNothing = (picks, findings) =>
  !pickedOf(picks.fix, FINDING_STATUS.confirmed, findings).length &&
  !pickedOf(picks.note, FINDING_STATUS.needsValidation, findings).length &&
  !pickedOf(picks.remember, FINDING_STATUS.needsValidation, findings).length;

/**
 * What the view's picks rest on: when the findings were sent and which they are. A new key (findings sent again, a
 * triage opened afresh) starts the view's picks over.
 * @param {Triage} triage
 */
export const triageKey = ({ sent, findings }) =>
  [sent, ...findings.map((finding) => finding.id)].join(" ");

/**
 * @typedef {object} PendingFix
 * @property {InboxRequest} request
 * @property {Question} question
 */

/**
 * The fix question the security session in a terminal waits on the view for: its oldest one asked once the findings
 * were sent; null before they are, or when it asks none. A question asked before the findings were sent is never
 * answered from the view.
 * @param {InboxRequest[]} requests
 * @param {string} terminal
 * @param {number} sent when the findings were sent, in ms; 0 before they are
 * @returns {PendingFix | null}
 */
export const pendingFix = (requests, terminal, sent) => {
  /** @param {InboxRequest} request */
  const asksFix = (request) =>
    sent > 0 &&
    request.terminal === terminal &&
    request.created >= sent &&
    questionsOf(request).at(0)?.header === REVIEW_ASK_HEADER.fix;
  const request = requests
    .filter(asksFix)
    .toSorted((one, other) => one.created - other.created)
    .at(0);
  if (!request) return null;
  const [question] = questionsOf(request);
  return { question, request };
};

/**
 * The inbox answer that gives the session's fix question a text.
 * @param {PendingFix} pending
 * @param {string} text
 * @returns {InboxAnswer}
 */
export const fixReply = (pending, text) =>
  questionAnswer({ [pending.question.question]: text });
