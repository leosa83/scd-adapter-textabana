import type { IrNode, RuntimeDiagnostic } from "../sdk/typescript/runtime-types";

type Recovery = Extract<IrNode, { kind: "Recovery" }>;
type Entry = readonly [code: string, message: string];

// Presentation only. Never merge this view into a diagnostic or semantic artifact.
const messages: Record<string, Entry> = {
  MissingStage: ["MISSING-STAGE", "The pipeline is missing a stage."],
  InvalidStage: ["INVALID-STAGE", "Invalid function stage."],
  InvalidIntervalStage: ["INVALID-STAGE", "An interval must open a function."],
  InvalidBlockStage: ["INVALID-STAGE", "A block must begin with a function."],
  InvalidArgument: ["INVALID-ARGUMENT", "Invalid argument."],
  DuplicateArgument: ["DUPLICATE-ARGUMENT", "An argument is declared more than once."],
  NonFiniteNumber: ["NUMBER-RANGE", "The argument is outside the finite JSON number range."],
  UnknownEngineControl: ["UNKNOWN-CONTROL", "Unknown engine control."],
  InvalidScopeId: ["SCOPE-ID", "@id must be a simple identifier."],
  DuplicateScopeId: ["SCOPE-ID", "An active interval already uses this @id."],
  InvalidOrder: ["INVALID-CONTROL", "@order must be a finite number."],
  InvalidInheritance: ["INVALID-CONTROL", "@inherit must be a supported policy string."],
  InvalidCrossPolicy: ["INVALID-CONTROL", "@cross must be a policy string."],
  UnsupportedCrossPolicy: ["UNSUPPORTED-CROSS", "This @cross policy is defined but not executable in the playground subset."],
  InvalidInheritedIntervals: ["INVALID-CONTROL", "@intervals must be a list of scope names or @id references."],
  UnknownVirtualStage: ["VIRTUAL-STAGE", "Unknown or misplaced virtual stage."],
  InvalidIntervalsArgument: ["INTERVALS-STAGE", "@intervals accepts only only, except and order arguments."],
  ConflictingIntervalsSelection: ["INTERVALS-STAGE", "@intervals cannot combine only and except."],
  InvalidIntervalsSelection: ["INTERVALS-STAGE", "The interval selection must be a list of scope names or @id references."],
  InvalidIntervalsOrder: ["INTERVALS-STAGE", "The interval order must be the string asc or desc."],
  UnterminatedString: ["UNTERMINATED-STRING", "The string was not closed before the end of the line."],
  UnbalancedDelimiter: ["UNBALANCED-DELIMITER", "An unmatched value delimiter was found on this line."],
  InvalidDirective: ["DIRECTIVE", "Invalid configuration directive."],
  UnknownDirective: ["DIRECTIVE", "Unknown or incomplete directive."],
  UnknownConfig: ["UNKNOWN-CONFIG", "Unknown configuration key."],
  InvalidConfig: ["INVALID-CONFIG", "scope-order must be the string declaration:asc or declaration:desc."],
  InvalidIntervalPipeline: ["INTERVAL-PIPELINE", "An interval opens exactly one function; use multiple interval markers for nesting."],
  UnresolvedScopeClose: ["SCOPE-UNRESOLVED", "No active interval matches this closing marker."],
  CrossingScopeClose: ["SCOPE-CROSSING", "The interval crosses a block boundary. The default @cross=error rejects ambiguous partial overlap."],
  MissingScopeClose: ["SCOPE-UNCLOSED", "The interval is still open at a block boundary or the end of the document."],
  MalformedBlockClose: ["BLOCK-CLOSE", "Invalid block closing marker."],
  OrphanBlockClose: ["BLOCK-ORPHAN-CLOSE", "Unexpected closing marker without an open block."],
  MismatchedBlockClose: ["BLOCK-MISMATCH", "The closing marker does not match the open block."],
  MissingBlockClose: ["BLOCK-UNCLOSED", "The block is missing its closing marker."],
  MalformedMarker: ["MARKER", "Incomplete or invalid control marker."],
  OrphanPipelineContinuation: ["ORPHAN-PIPE", "The pipeline continuation does not immediately follow a block header or continuation."],
};

export function presentParserDiagnostic(
  diagnostic: RuntimeDiagnostic,
  recovery: Recovery | undefined,
  parserSchema: string | undefined,
) {
  const entry = recovery && Object.hasOwn(messages, recovery.recoveryKind)
    ? messages[recovery.recoveryKind] : undefined;
  const translated = parserSchema === "textabana.parser/lab-v1"
    && diagnostic.phase === "parsing" && recovery?.nodeId === diagnostic.recoveryNodeId
    && entry !== undefined && diagnostic.code === `TBA-PARSE-${entry[0]}-LAB`;
  let message = translated ? entry[1] : diagnostic.message;
  if (translated && recovery) {
    if (recovery.recoveryKind === "MismatchedBlockClose" && recovery.synthetic) {
      message += " A non-executable synthetic closing marker was inserted before closing an outer block.";
    }
    // Values are authored data, not translation targets; preserve Unicode verbatim.
    if (recovery.actual !== null) message += ` Found: ${recovery.actual}.`;
    if (recovery.expected !== null) message += ` Expected: ${recovery.expected}.`;
  }
  return {
    translated,
    message,
    related: (diagnostic.related ?? []).map((item, index) => {
      let label = item.message;
      if (translated && recovery) {
        if (["MissingScopeClose", "CrossingScopeClose"].includes(recovery.recoveryKind) && index === 0) {
          label = "The interval opened here.";
        } else if (recovery.recoveryKind === "MissingBlockClose" && index === 0) {
          label = "The block opened here.";
        } else if (recovery.recoveryKind === "MismatchedBlockClose") {
          if (index === 0) label = recovery.synthetic ? "The inner block opened here." : "The block opened here.";
          if (index === 1 && recovery.synthetic) label = "The authored closing marker belongs to the outer block.";
        }
      }
      return { message: label, sourceSpan: { ...item.sourceSpan } };
    }),
  };
}
