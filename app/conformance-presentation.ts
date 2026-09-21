import type { ConformanceReport, ConformanceRequirement } from "../sdk/typescript/runtime-types";

// Strings only: never manufacture a translated report with an existing reportId.
function supported(report: ConformanceReport) {
  return report.schema === "textabana.conformance-report/lab-v1"
    && report.suite.suiteId === "textabana.playground/interop-0.7"
    && report.suite.version === "1.4.0-lab.1";
}

type Wording = Partial<Record<ConformanceRequirement["status"], string>>;
const requirements: Record<string, Wording> = {
  "LANG-SOURCE-IR": { passed: "IR is bound to the exact source snapshot.", failed: "IR is missing or refers to a different source snapshot." },
  "LANG-DETERMINISTIC-PLAN": { passed: "The pre-execution graph has deterministic order and every stage has a successful trace entry.", failed: "The plan is missing, graph order is nondeterministic, or the trace is incomplete." },
  "LANG-SYNTAX-ERASED": { passed: "Authored control syntax was lowered from a lossless CST; only literal or generated marker text may remain in the render.", failed: "The parser projection is invalid or lossless source coverage could not be verified." },
  "LANG-ACTIVE-SUCCESS": { "not-run": "The language profile is checked only after a successful core run; this case checks a terminal failure." },
  "RUNTIME-RESULT-SCHEMA": { passed: "The result envelope has the expected playground schema.", failed: "The result envelope does not have the expected schema." },
  "RUNTIME-ATOMIC-TERMINAL": { passed: "Terminal status and the commit boundary are atomically consistent.", failed: "Terminal status leaked render, channels, anchors, source maps or provenance." },
  "RUNTIME-DESCRIPTORS": { passed: "Every durable snapshot has a declared descriptor and committed events.", failed: "A committed snapshot lacks a descriptor or contains tentative events." },
  "RUNTIME-CACHE-PROVENANCE": { passed: "Every cache materialization has two unique, resolvable, output-bound observations.", failed: "A cache materialization lacks exactly matching, resolvable observations." },
  "EDITOR-BINDINGS": { passed: "Every event resolves to an anchor, source map and provenance activity.", failed: "An event has an unresolved anchor, source-map or provenance reference." },
  "EDITOR-POSITIONS": { passed: "All events have a physical line and logical anchorRef.", failed: "An event lacks a line or anchorRef." },
  "EDITOR-EVENTS": { "not-run": "The current fixture emitted no position-bound events." },
  "ADAPTER-IMMUTABLE": { passed: "Post-commit fan-out left the source result byte-equivalent.", failed: "Adapter execution mutated its source result or could not verify it." },
  "ADAPTER-REFERENCE": { passed: "The reference adapter produced a source-bound projection.", failed: "The reference adapter is missing, failed, or refers to the wrong result." },
  "ADAPTER-CONTRACT-BOUNDARY": { passed: "Contract-only adapters produced no fabricated output.", failed: "A contract-only adapter produced a successful projection." },
  "ADAPTER-NO-FAILED-PROJECTION": { passed: "No requested adapter projection failed.", failed: "At least one requested adapter projection failed." },
  "ADAPTER-POST-COMMIT": { "not-run": "Adapters were correctly skipped because the core run did not commit." },
  "ML-CONTRACT-ONLY": { passed: "ml-lineage/1 remains a declared, non-claimable contract boundary.", failed: "ml-lineage/1 lacks a contract-only declaration or fabricated a successful projection." },
  "GOLDEN-STRUCTURE": { passed: "The normalized structure matches the versioned golden baseline.", failed: "The normalized structure differs from the versioned golden baseline." },
  "CANCELLATION-ATOMIC": { failed: "Cancellation did not reach an atomic cancelled terminal status." },
};
for (const [id, profile, prefix] of [
  ["DATA-PROJECTION", "data/1", "data."],
  ["NOTEBOOK-PROJECTION", "notebook/1", "notebook."],
  ["ANNOTATION-PROJECTION", "annotation/1", "annotation."],
]) requirements[id] = {
  passed: `${profile} produced a verified source-bound projection.`,
  failed: `${profile} has no successful source-bound projection.`,
  "not-run": `The current fixture emitted no ${prefix}* channels.`,
};

export function presentConformanceRequirement(report: ConformanceReport, item: ConformanceRequirement) {
  if (!supported(report)) return item.message;
  if (item.requirementId === "CASE-OUTCOME") {
    if (item.status === "passed") return `The case produced the expected terminal outcome ${report.case.expectedOutcome}.`;
    if (item.status === "failed") return `The case expected ${report.case.expectedOutcome} but produced ${report.case.actualOutcome}.`;
  }
  if (item.requirementId === "CASE-DIAGNOSTIC" && report.case.expectedDiagnosticCode) {
    if (item.status === "passed") return `Expected diagnostic code ${report.case.expectedDiagnosticCode} was observed.`;
    if (item.status === "failed") return `Expected diagnostic code ${report.case.expectedDiagnosticCode} is missing.`;
  }
  const entry = Object.hasOwn(requirements, item.requirementId) ? requirements[item.requirementId] : undefined;
  return entry && Object.hasOwn(entry, item.status) ? entry[item.status]! : item.message;
}

const stages: Record<string, Wording> = {
  source: { passed: "A versioned source snapshot is available.", failed: "The source snapshot is missing." },
  ir: { passed: "An IR projection was produced.", failed: "The IR projection is missing." },
  plan: { passed: "The pre-execution graph was verified against a complete successful trace.", failed: "The pre-execution graph could not be verified against a complete successful trace.", "not-run": "No plan claim is made for a terminal failure case." },
  result: { passed: "The result boundary is atomically consistent.", failed: "The result boundary is inconsistent." },
  projection: { passed: "Post-commit projections ran without mutating the source result.", failed: "Post-commit source-result immutability could not be verified.", "not-run": "Adapters were skipped before commit." },
};

export function presentConformanceStage(report: ConformanceReport, item: ConformanceReport["stages"][number]) {
  if (!supported(report)) return item.message;
  if (item.stage === "result" && item.status === "passed") {
    return report.case.actualOutcome === "succeeded" ? "The result was atomically committed." : "The terminal failure rolled back all durable output.";
  }
  const entry = Object.hasOwn(stages, item.stage) ? stages[item.stage] : undefined;
  return entry && Object.hasOwn(entry, item.status) ? entry[item.status]! : item.message;
}

export function presentNegativeFixture(report: ConformanceReport, item: ConformanceReport["negativeFixtures"][number]) {
  if (!supported(report) || item.expectedOutcome !== "failed") return item.purpose;
  const entries = [
    ["failed-run", "negative-undeclared-channel", "TBA-TYPE-CHANNEL-LAB", "An undeclared channel must be rejected atomically in strict mode."],
    ["negative-unknown-function", "negative-unknown-function", "TBA-RUN-LAB", "An unknown function must not produce a partial result."],
    ["negative-unclosed-block", "negative-unclosed-block", "TBA-PARSE-BLOCK-UNCLOSED-LAB", "An unbalanced block marker must produce a position-bound parser error."],
  ];
  return entries.find(([fixture, name, code]) => fixture === item.fixtureId && name === item.caseId && code === item.expectedDiagnosticCode)?.[3] ?? item.purpose;
}

export function presentCancellationLimit(report: ConformanceReport) {
  return supported(report) && report.cancellation.support === "cooperative-runtime-boundary"
    ? "Cancellation and optional deadlines are checked at runtime/checkpoint boundaries. Synchronous CPU loops and promises that never settle cannot be preempted; external side effects cannot be rolled back."
    : report.cancellation.limitation;
}
