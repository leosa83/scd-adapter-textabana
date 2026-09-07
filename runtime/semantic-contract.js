import validateSchema from "./generated/semantic-bundle-validator.js";
import { canonicalize } from "./canonical-json.js";
import { validateExecutionGraph } from "./execution-graph.js";

export const SEMANTIC_CONTRACT = "textabana.semantic-contract/v1";
export function identityError(message, validationPhase) {
  const error = new Error(message);
  error.code = "TBA-IDENTITY-PROFILE";
  error.phase = "identity";
  error.validationPhase = validationPhase;
  throw error;
}
const assertReference = (condition, message) => { if (!condition) identityError(message, "references"); };
const same = (a, b) => canonicalize(a) === canonicalize(b);
const unique = (items, key, label) => {
  const result = new Map(items.map((item) => [item[key], item]));
  assertReference(result.size === items.length, `Duplicate ${label} identity.`);
  return result;
};
const sortedUnique = (values) => values.every((value, index) => index === 0 || values[index - 1] < value);
const normalizedPath = (path) => {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  const parts = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop(); else parts.push(part);
  }
  return parts.join("/");
};
async function digestText(value) {
  const hash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function validateSemanticStructure(bundle) {
  if (!validateSchema(bundle)) {
    const issue = validateSchema.errors[0];
    identityError(`Semantic schema: ${issue.instancePath || "/"} ${issue.message}${issue.params.missingProperty ? ` (${issue.params.missingProperty})` : ""}.`, "schema");
  }
}

// Only explicitly owned carrier fields are inspected. Payload/args/extensions stay opaque JSON.
export async function validateSemanticReferences(bundle) {
  const source = bundle.source.artifact;
  const context = bundle.context.artifact;
  assertReference(sortedUnique(context.modules.map((module) => module.path)), "Modules must have unique paths in canonical order.");
  assertReference(context.modules.every((module) => normalizedPath(module.path) === module.path), "Module paths must be normalized.");
  assertReference(sortedUnique(context.capabilityGrants), "Capability grants must be unique and sorted.");
  const modules = new Map(context.modules.map((module) => [module.path, module.contentDigest]));
  if (!bundle.ir) return;
  const ir = bundle.ir.artifact.body;
  const text = ir.syntax.cst.nodes.map((node) => node.lexeme).join("");
  assertReference(await digestText(text) === source.contentDigest, "IR CST bytes do not match Source contentDigest.");
  const chars = Array.from(text);
  const positions = [{ line: 1, column: 0 }];
  for (const char of chars) {
    const last = positions.at(-1);
    positions.push(char === "\n" ? { line: last.line + 1, column: 0 } : { line: last.line, column: last.column + 1 });
  }
  const span = (value) => {
    const start = positions[value.start], end = positions[value.end];
    assertReference(value.start <= value.end && start && end && value.startLine === start.line && value.startColumn === start.column && value.endLine === end.line && value.endColumn === end.column, "Invalid source span or code-point coordinates.");
  };
  span(ir.sourceSpan);
  assertReference(ir.sourceSpan.start === 0 && ir.sourceSpan.end === chars.length && same(ir.sourceSpan, ir.syntax.cst.sourceSpan) && same(ir.sourceSpan, ir.syntax.ast.sourceSpan), "IR/CST/AST must cover the same complete source.");
  unique(ir.syntax.cst.nodes, "nodeId", "CST node");
  let offset = 0;
  for (const node of ir.syntax.cst.nodes) {
    span(node.sourceSpan);
    assertReference(node.sourceSpan.start === offset && node.sourceSpan.end - offset === Array.from(node.lexeme).length, "CST spans must form a lossless contiguous source partition.");
    offset = node.sourceSpan.end;
  }
  assertReference(offset === chars.length, "CST does not cover Source.");
  const nodes = unique(ir.nodes, "nodeId", "IR node");
  const blocks = unique(ir.blocks, "blockId", "block");
  const scopes = unique(ir.scopes, "scopeId", "scope");
  const scopeAliases = new Set(ir.scopes.map((scope) => scope.id));
  const stages = new Map();
  const addStage = (stage) => {
    span(stage.sourceSpan);
    assertReference(stage.line === stage.sourceSpan.startLine, "Syntax stage line disagrees with its span.");
    stage.arguments.forEach((argument) => span(argument.sourceSpan));
    const body = Object.fromEntries(Object.entries(stage).filter(([key]) => key !== "stage"));
    assertReference(!stages.has(stage.stageId) || same(stages.get(stage.stageId), body), "Conflicting syntax stage identities.");
    stages.set(stage.stageId, body);
  };
  const activeRefs = (node) => {
    assertReference((node.activeScopeIds || []).every((id) => scopeAliases.has(id)) && (node.activeBlockIds || []).every((id) => blocks.has(id)), "Unresolved IR scope/block reference.");
  };
  for (const node of ir.nodes) {
    span(node.sourceSpan); activeRefs(node);
    if (node.openSpan) span(node.openSpan);
    if (node.closeSpan) span(node.closeSpan);
    if (["IntervalOpen", "IntervalClose"].includes(node.kind)) {
      const scope = scopes.get(node.scopeId);
      assertReference(scope && scope.id === node.id && same(node.sourceSpan, node.kind === "IntervalOpen" ? scope.openSpan : scope.closeSpan), "Unresolved interval scope reference.");
    }
    for (const stage of node.pipeline || []) addStage(stage);
    if (node.stage) addStage(node.stage);
  }
  for (const block of ir.blocks) {
    assertReference(nodes.get(block.nodeId)?.kind === "Block" && nodes.get(block.nodeId).blockId === block.blockId && (block.parentBlockId === null || blocks.has(block.parentBlockId)), "Unresolved block reference.");
    span(block.sourceSpan); activeRefs(block);
    assertReference(block.openSpan && same(block.openSpan, nodes.get(block.nodeId).openSpan) && same(block.closeSpan, nodes.get(block.nodeId).closeSpan), "Block spans disagree with bound IR node.");
    span(block.openSpan); if (block.closeSpan) span(block.closeSpan);
    block.pipeline.forEach(addStage);
  }
  const astIds = new Set();
  const astNode = (node, parentBlockId = null) => {
    assertReference(nodes.has(node.nodeId) && !astIds.has(node.nodeId), "Unresolved or duplicate AST node reference.");
    astIds.add(node.nodeId);
    const flat = Object.fromEntries(Object.entries(node).filter(([key]) => !["children", "properties"].includes(key)));
    assertReference(same(flat, nodes.get(node.nodeId)), "AST and IR node bodies disagree.");
    if (node.kind === "Block") assertReference(blocks.has(node.blockId) && blocks.get(node.blockId).parentBlockId === parentBlockId, "Block parent does not match the AST hierarchy.");
    if (node.kind === "IntervalOpen") assertReference(scopes.get(node.scopeId).blockId === parentBlockId, "Scope block does not match the AST hierarchy.");
    const childParent = node.kind === "Block" ? node.blockId : parentBlockId;
    (node.children || []).forEach((child) => astNode(child, childParent)); (node.properties || []).forEach((child) => astNode(child, childParent));
  };
  ir.syntax.ast.children.forEach((node) => astNode(node));
  assertReference(astIds.size === nodes.size, "AST does not cover all IR nodes.");
  assertReference(ir.directives.every((node) => nodes.has(node.nodeId) && same(node, nodes.get(node.nodeId))), "Unresolved directive reference.");
  for (const scope of ir.scopes) {
    assertReference((scope.blockId === null || blocks.has(scope.blockId)) && ir.nodes.filter((node) => node.kind === "IntervalOpen" && node.scopeId === scope.scopeId).length === 1, "Unresolved scope block/open reference.");
    const closes = ir.nodes.filter((node) => node.kind === "IntervalClose" && node.scopeId === scope.scopeId);
    assertReference(closes.length === (scope.closeSpan ? 1 : 0) && scope.openLine === scope.openSpan.startLine && (scope.closeSpan ? scope.closeLine === scope.closeSpan.startLine : scope.closeLine === null), "Inconsistent scope closing span/line.");
    span(scope.sourceSpan); span(scope.openSpan); if (scope.closeSpan) span(scope.closeSpan);
    for (const segment of scope.segments) { span(segment.sourceSpan); assertReference(segment.startLine === segment.sourceSpan.startLine && segment.endLine === segment.sourceSpan.endLine, "Scope segment coordinates disagree."); }
  }
  for (const line of ir.sourceLines) {
    span(line.sourceSpan); activeRefs(line);
    assertReference(line.line === line.sourceSpan.startLine && line.text === chars.slice(line.sourceSpan.start, line.sourceSpan.end).join(""), "Source-line text/number disagrees with source coordinates.");
  }
  assertReference(ir.validity.diagnosticCount === ir.diagnostics.length && ir.validity.recoveryCount === ir.nodes.filter((node) => node.kind === "Recovery").length && ir.validity.executable === ir.syntax.ast.executable && (ir.validity.status === "valid") === ir.validity.executable, "Inconsistent IR validity summary.");
  if (!bundle.plan) return;
  const plan = bundle.plan.artifact;
  assertReference(ir.validity.executable && plan.runtimePolicy.profile === context.profile, "Plan requires executable IR and matching Context policy.");
  try { validateExecutionGraph(plan.graph); } catch (error) { identityError(`Invalid Plan graph: ${error.message}`, "references"); }
  const initialized = unique(plan.initializedModules, "path", "initialized module");
  assertReference(plan.initializedModules.every((module) => modules.get(module.path) === module.digest), "Initialized module digest is not bound to Context.");
  const planNodes = new Map(plan.graph.nodes.map((node) => [node.nodeId, node]));
  for (const [index, node] of plan.graph.nodes.entries()) {
    assertReference(node.nodeId === `node:${String(index + 1).padStart(6, "0")}` && same(node.orderKey, [index + 1, 0, 0]), "Plan node identity/order is not canonical.");
    const inputs = node.kind === "merge" ? node.inputPorts : node.inputPort ? [node.inputPort] : [];
    assertReference(new Set(inputs.map((port) => port.name)).size === inputs.length, "Duplicate Plan input port.");
    if (node.sourceSpan) span(node.sourceSpan);
    if (node.syntaxSpan) span(node.syntaxSpan);
    if (node.source) assertReference(node.source.path === source.path && node.source.startLine <= node.source.endLine && node.source.endLine <= positions.at(-1).line, "Unbound Plan source location.");
    if (node.kind === "source") assertReference(await digestText(node.value.data) === node.contentDigest, "Plan source value does not match contentDigest.");
    if (node.kind === "stage") {
      if (node.module === null) assertReference(bundle.result === null && !Object.hasOwn(node, "moduleDigest") && node.contract.state === "unknown", "Unresolved stages cannot appear in a committed result plan.");
      else assertReference(initialized.has(node.module) && modules.get(node.module) === node.moduleDigest, "Plan stage module is not bound to initialized Context modules.");
      const syntax = stages.get(node.syntaxStageRef);
      assertReference(syntax && syntax.name === node.function && same(syntax.sourceSpan, node.syntaxSpan) && (node.scopeId === null || scopeAliases.has(node.scopeId)), "Unresolved Plan syntax stage/scope reference.");
      assertReference(same(node.args, Object.fromEntries(Object.entries(syntax.args).filter(([key]) => !key.startsWith("@")))), "Plan args disagree with bound IR stage arguments.");
      const contract = node.contract;
      const blockers = [
        ...(contract.state === "pure" ? [] : [contract.state === "unknown" ? "state-undeclared" : `state-${contract.state}`]),
        ...(contract.determinism === "deterministic" ? [] : [contract.determinism === "unknown" ? "determinism-undeclared" : `determinism-${contract.determinism}`]),
        ...(contract.effectsDeclared ? [] : ["effects-undeclared"]),
        ...(contract.observableEffects.length ? ["observable-effects"] : []),
      ];
      const eligibility = blockers.length ? "ineligible" : "candidate";
      assertReference(same(contract.cacheBlockers, blockers) && same(contract.parallelBlockers, blockers) && contract.cacheEligibility === eligibility && contract.parallelEligibility === eligibility, "Function contract eligibility contradicts its declared state/effects.");
    }
  }
  plan.graph.edges.forEach((edge, index) => assertReference(edge.edgeId === `edge:${index + 1}` && edge.orderKey[0] === index + 1, "Plan edge identity/order is not canonical."));
  if (!bundle.result) return;
  const result = bundle.result.artifact;
  const anchors = unique(result.anchors, "anchorId", "anchor");
  const anchorOrigin = (origin) => assertReference([...planNodes.values()].some((node) => node.kind === "stage" && node.function === origin.function && node.module === origin.module), "Unresolved anchor origin.");
  for (const [index, anchor] of result.anchors.entries()) {
    assertReference(anchor.anchorId === `anchor:${index + 1}` && anchor.target.resourceId === source.documentId && anchor.target.version === source.contentDigest, "Anchor identity/target is not bound to Source.");
    const position = anchor.selectors.find((item) => item.type === "TextPositionSelector");
    const quote = anchor.selectors.find((item) => item.type === "TextQuoteSelector");
    assertReference(position && quote && position.start <= position.end && position.end <= chars.length && chars.slice(position.start, position.end).join("") === quote.exact, "Anchor selectors do not match source text.");
    anchorOrigin(anchor.origin);
  }
  const events = new Map(); const sequences = new Set();
  for (const [channel, snapshot] of Object.entries(result.channelSnapshots)) {
    assertReference(/^[A-Za-z][A-Za-z0-9._:-]*$/.test(channel) && snapshot.descriptor.name === channel, "Invalid channel descriptor binding.");
    let previousSequence = 0;
    for (const [index, event] of snapshot.events.entries()) {
      assertReference(event.channel === channel && event.eventId === `event:${channel}:${index + 1}` && !events.has(event.eventId) && event.sourceId === bundle.source.id, "Invalid event identity or Source binding.");
      events.set(event.eventId, event);
      assertReference(event.sequence > previousSequence && !sequences.has(event.sequence), "Event sequence must be globally unique and increasing per channel.");
      sequences.add(event.sequence); previousSequence = event.sequence;
      const stage = planNodes.get(event.provenanceRef);
      assertReference(stage?.kind === "stage" && stage.function === event.origin.function && stage.module === event.origin.module, "Unresolved event provenance stage.");
      assertReference(event.origin.modality === stage.modality && (event.origin.scopeId ?? null) === stage.scopeId && event.origin.stageLine === stage.syntaxSpan.startLine, "Event origin disagrees with its Plan stage.");
      assertReference(anchors.has(event.target.anchorRef), "Unresolved event anchor reference.");
      assertReference(event.source.path === source.path && event.source.startLine <= event.source.endLine && event.source.endLine <= positions.at(-1).line && event.line <= positions.at(-1).line, "Unbound event source location.");
      assertReference(event.type === event.target.mode && event.line === event.target.line && event.row === event.target.row && event.rowId === event.target.rowId, "Event target projections disagree.");
    }
  }
  const mappedEvents = new Set();
  for (const [index, mapping] of result.sourceMaps.entries()) {
    const event = events.get(mapping.outputRef);
    assertReference(mapping.mappingId === `mapping:${index + 1}` && event && !mappedEvents.has(mapping.outputRef) && mapping.generatingActivity === event.provenanceRef && mapping.mapping === event.source.mapping && mapping.inputAnchorRefs.every((id) => anchors.has(id)), "Unresolved or inconsistent source-map reference.");
    mappedEvents.add(mapping.outputRef);
  }
  assertReference(mappedEvents.size === events.size, "Every durable event requires one source map.");
  assertReference(events.size <= context.limits.maxChannelEvents && new TextEncoder().encode(result.render.data).byteLength <= context.limits.maxRenderBytes && plan.graph.nodes.filter((node) => node.kind === "stage").length <= context.limits.maxStageResolutions, "Committed result exceeds its bound resource limits.");
}
