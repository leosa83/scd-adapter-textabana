import { canonicalize, canonicalDigest, parseStrictJson } from "./canonical-json.js";

export const SEMANTIC_PROFILE = "textabana.semantic-artifacts/v1";
const omit = (value, fields) => Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
const diagnostic = (value) => omit(value, ["diagnosticId"]);

function fail(message) {
  const error = new Error(message);
  error.code = "TBA-IDENTITY-PROFILE";
  error.phase = "identity";
  throw error;
}

async function bytesDigest(source) {
  if (typeof source !== "string" || !source.isWellFormed()) fail("Semantic identity requires well-formed Unicode source.");
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return `sha256:${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function identified(kind, content) {
  // Detach synchronously before the first crypto await. No live module-owned aliases.
  let artifact;
  try { artifact = parseStrictJson(canonicalize({ schema: `textabana.semantic-${kind}/v1`, ...content })); }
  catch (error) { fail(`Semantic identity requires lossless JSON: ${error.message}`); }
  return { id: await canonicalDigest(artifact), artifact };
}

export async function createIdentityContext({ documentSource, documentPath, documentId, modules, options, runPolicy, profile }) {
  if (!globalThis.crypto?.subtle) fail("Semantic identity requires Web Crypto SHA-256.");
  const source = await identified("source", { documentId: documentId || `doc:${documentPath}`, path: documentPath, contentDigest: await bytesDigest(documentSource) });
  const paths = new Set();
  const moduleArtifacts = [];
  for (const module of modules) {
    if (paths.has(module.path)) fail("Semantic identity rejects duplicate module paths.");
    paths.add(module.path);
    moduleArtifacts.push({ path: module.path, contentDigest: await bytesDigest(module.content), manifest: module.manifest ?? null });
  }
  moduleArtifacts.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const context = await identified("context", {
    sourceId: source.id, modules: moduleArtifacts, moduleLock: options.moduleLock ?? null,
    capabilityGrants: [...new Set((options.capabilityGrants || []).map(String))].sort(),
    profile, strictChannels: Boolean(options.strictChannels), limits: runPolicy.effective,
    language: "textabana/0.4", runtimeSemantics: "textabana/interop-0.7",
  });
  return { schema: "textabana.semantic-bundle/v1", profile: SEMANTIC_PROFILE, serialization: "RFC8785", source, context, ir: null, plan: null, result: null,
    claims: { artifactIdentity: "computed", profileConformance: "not-evaluated", fullRuntimeConformance: false } };
}

export async function identifyIR(bundle, inspection, documentSource) {
  if (inspection.schema !== "textabana.ir/lab-v2") fail("Unsupported IR schema.");
  if (inspection.syntax.cst.nodes.map((node) => node.lexeme).join("") !== documentSource) fail("IR does not describe the exact source bytes.");
  const body = omit(inspection, ["sourceRef", "parser", "unsupported", "diagnostics"]);
  return identified("ir", { sourceId: bundle.source.id, body: { ...body,
    parser: omit(inspection.parser, ["parseMode", "incrementalReuse", "reusedFragmentCount"]),
    diagnostics: inspection.diagnostics.map(diagnostic),
  } });
}

function planReferences(plan) {
  const refs = new Map(plan.graph.nodes.map((node, index) => [node.nodeId, `node:${String(index + 1).padStart(6, "0")}`]));
  if (refs.size !== plan.graph.nodes.length) fail("Plan node IDs must be unique.");
  return (id) => { if (!refs.has(id)) fail(`Unresolved plan reference: ${id}`); return refs.get(id); };
}

export async function identifyPlan(bundle, plan, operations, initializedModules) {
  if (plan.schema !== "textabana.execution-plan/lab-v2" || !bundle.ir) fail("Unsupported plan or missing IR identity.");
  const ref = planReferences(plan);
  const moduleDigests = new Map(bundle.context.artifact.modules.map((module) => [module.path, module.contentDigest]));
  const nodes = [];
  const sourceValues = new Map(operations.filter((operation) => operation.kind === "source").map((operation) => [operation.nodeId, operation.text]));
  for (const node of plan.graph.nodes) {
    const body = omit(node, ["nodeId", "cache", "contentDigest", "moduleDigest"]);
    if (node.module && !moduleDigests.has(node.module)) fail(`Unbound module: ${node.module}`);
    nodes.push({ ...body, nodeId: ref(node.nodeId),
      ...(node.kind === "source" ? { value: { kind: "text", data: sourceValues.get(node.nodeId) }, contentDigest: await bytesDigest(sourceValues.get(node.nodeId)) } : {}),
      ...(node.module ? { moduleDigest: moduleDigests.get(node.module) } : {}),
    });
  }
  return identified("plan", { irId: bundle.ir.id, contextId: bundle.context.id,
    initializedModules: initializedModules.map((path) => {
      if (!moduleDigests.has(path)) fail(`Unbound initialized module: ${path}`);
      return { path, digest: moduleDigests.get(path) };
    }),
    languageVersion: plan.languageVersion, constructionPhase: plan.constructionPhase, deterministic: plan.deterministic,
    runtimePolicy: omit(plan.runtimePolicy, ["execution", "cache"]),
    graph: { schema: plan.graph.schema, nodes,
      edges: plan.graph.edges.map((edge, index) => ({ ...edge, edgeId: `edge:${index + 1}`, from: { ...edge.from, nodeId: ref(edge.from.nodeId) }, to: { ...edge.to, nodeId: ref(edge.to.nodeId) } })),
      entryNodeIds: plan.graph.entryNodeIds.map(ref), terminalNodeId: ref(plan.graph.terminalNodeId),
    },
  });
}

export async function identifyResult(bundle, result, plan, observations = { channels: {}, descriptors: {} }) {
  if (result.schema !== "textabana.result/lab-v1") fail("Unsupported result schema.");
  if (!result.run.committed || result.run.status !== "succeeded") fail("Only committed results receive semantic result identities.");
  const ref = planReferences(plan);
  const activities = new Map(result.provenance.activities.map((activity) => [activity.activityId, ref(activity.planNodeRef)]));
  const events = new Map();
  const channels = Object.keys(result.channelSnapshots).sort();
  for (const name of channels) result.channelSnapshots[name].events.forEach((event, index) => {
    if (typeof event.eventId !== "string" || !event.eventId || event.channel !== name || events.has(event.eventId)) fail("Invalid or duplicate event identity.");
    events.set(event.eventId, `event:${name}:${index + 1}`);
  });
  const allAnchorIds = new Set(result.anchors.map((anchor) => anchor.anchorId));
  if (allAnchorIds.size !== result.anchors.length || activities.size !== result.provenance.activities.length) fail("Duplicate semantic reference.");
  const transientEvents = new Set();
  const transientAnchors = new Set();
  for (const [channel, channelEvents] of Object.entries(observations.channels)) {
    if (observations.descriptors[channel]?.persistence !== "transient") continue;
    for (const event of channelEvents) {
      if (typeof event.eventId !== "string" || !event.eventId || event.channel !== channel || transientEvents.has(event.eventId) || events.has(event.eventId) || !allAnchorIds.has(event.target?.anchorRef) || !activities.has(event.provenanceRef)) fail("Invalid transient event reference.");
      transientEvents.add(event.eventId);
      if (event.target?.anchorRef) transientAnchors.add(event.target.anchorRef);
    }
  }
  for (const mapping of result.sourceMaps) {
    if ((!events.has(mapping.outputRef) && !transientEvents.has(mapping.outputRef)) || mapping.inputAnchorRefs.some((id) => !allAnchorIds.has(id)) || !activities.has(mapping.generatingActivity)) fail("Unresolved source-map reference.");
    if (transientEvents.has(mapping.outputRef)) mapping.inputAnchorRefs.forEach((id) => transientAnchors.add(id));
  }
  const durableMaps = result.sourceMaps.filter((mapping) => events.has(mapping.outputRef));
  const durableAnchors = new Set(durableMaps.flatMap((mapping) => mapping.inputAnchorRefs));
  for (const channel of channels) result.channelSnapshots[channel].events.forEach((event) => durableAnchors.add(event.target.anchorRef));
  const semanticAnchors = result.anchors.filter((anchor) => !transientAnchors.has(anchor.anchorId) || durableAnchors.has(anchor.anchorId));
  const anchors = new Map(semanticAnchors.map((anchor, index) => [anchor.anchorId, `anchor:${index + 1}`]));
  const lookup = (map, id) => { if (!map.has(id)) fail(`Unresolved semantic reference: ${id}`); return map.get(id); };
  const origin = (value) => omit(value, ["stageId", "invocationId"]);
  const snapshots = Object.fromEntries(channels.map((name) => {
    const snapshot = result.channelSnapshots[name];
    return [name, { descriptor: snapshot.descriptor, events: snapshot.events.map((event) => ({
      ...omit(event, ["id", "runId", "runRef", "documentVersion", "eventId", "origin", "target", "provenanceRef"]),
      eventId: lookup(events, event.eventId), sourceId: bundle.source.id,
      target: { ...event.target, anchorRef: lookup(anchors, event.target.anchorRef) },
      origin: origin(event.origin), provenanceRef: lookup(activities, event.provenanceRef),
      // payload and extensions above are copied intact. Never recursively normalize user values.
    })) }];
  }));
  if (semanticAnchors.some((anchor) => anchor.target.view !== "source")) fail("This profile requires source anchors.");
  return identified("result", {
    sourceId: bundle.source.id, contextId: bundle.context.id, irId: bundle.ir.id, planId: bundle.plan.id,
    status: result.run.status, committed: true, render: result.render, channelSnapshots: snapshots,
    anchors: semanticAnchors.map((anchor) => ({ ...anchor, anchorId: lookup(anchors, anchor.anchorId),
      target: { ...anchor.target, version: bundle.source.artifact.contentDigest }, origin: origin(anchor.origin) })),
    sourceMaps: durableMaps.map((mapping, index) => ({ ...mapping, mappingId: `mapping:${index + 1}`,
      outputRef: lookup(events, mapping.outputRef), inputAnchorRefs: mapping.inputAnchorRefs.map((id) => lookup(anchors, id)), generatingActivity: lookup(activities, mapping.generatingActivity) })),
    artifacts: result.artifacts, diagnostics: result.diagnostics.map(diagnostic),
  });
}

export async function verifySemanticBundle(input) {
  // Snapshot before loading the verifier or yielding to Web Crypto.
  let bundle;
  try { bundle = parseStrictJson(canonicalize(input)); }
  catch (cause) {
    const error = new Error(`Semantic JSON: ${cause.message}`);
    error.code = "TBA-IDENTITY-PROFILE"; error.phase = "identity"; error.validationPhase = "json";
    throw error;
  }
  const { verifyDetachedSemanticBundle } = await import("./semantic-verification.js");
  return verifyDetachedSemanticBundle(bundle);
}
