const FUNCTION_STATES = new Set(["pure", "run", "session", "external"]);
const DETERMINISM_MODES = new Set(["deterministic", "seeded", "nondeterministic", "external"]);

function hashSource(source) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null).map(String))];
}

function withoutSystemArgs(args = {}) {
  return Object.fromEntries(Object.entries(args).filter(([key]) => !key.startsWith("@")));
}

function semanticValue(value) {
  if (value === undefined) return { type: "undefined" };
  if (value === null) return { type: "null", value: null };
  if (typeof value === "number") {
    return {
      type: "number",
      value: Number.isFinite(value) ? Object.is(value, -0) ? "-0" : value : String(value),
    };
  }
  if (typeof value === "string" || typeof value === "boolean") return { type: typeof value, value };
  if (typeof value === "bigint") return { type: "bigint", value: value.toString() };
  if (Array.isArray(value)) return { type: "array", value: value.map(semanticValue) };
  if (typeof value === "object") {
    return {
      type: "object",
      value: Object.fromEntries(Object.keys(value).sort().map((key) => [key, semanticValue(value[key])])),
    };
  }
  return { type: typeof value, value: String(value) };
}

export function semanticValueDigest(value) {
  return `fnv1a-lab:${hashSource(canonicalJson(semanticValue(value)))}`;
}

export function describeFunctionExecution(entry) {
  const descriptor = entry?.descriptor || {};
  const state = FUNCTION_STATES.has(descriptor.state) ? descriptor.state : "unknown";
  const determinism = DETERMINISM_MODES.has(descriptor.determinism) ? descriptor.determinism : "unknown";
  const declaredEffects = Array.isArray(descriptor.effects)
    ? uniqueStrings(descriptor.effects)
    : null;
  const observableEffects = uniqueStrings([
    ...(declaredEffects || []),
    ...Object.keys(descriptor.channels || {}).map((name) => `channel:${name}`),
    ...(Array.isArray(descriptor.outputs) ? descriptor.outputs : [])
      .map(String)
      .filter((name) => name !== "render")
      .map((name) => `output:${name}`),
  ]);
  const cacheBlockers = [];
  if (state !== "pure") cacheBlockers.push(state === "unknown" ? "state-undeclared" : `state-${state}`);
  if (determinism !== "deterministic") {
    cacheBlockers.push(determinism === "unknown" ? "determinism-undeclared" : `determinism-${determinism}`);
  }
  if (declaredEffects === null) cacheBlockers.push("effects-undeclared");
  if (observableEffects.length) cacheBlockers.push("observable-effects");
  return {
    schema: "textabana.function-execution-contract/lab-v1",
    version: descriptor.version == null ? null : String(descriptor.version),
    behavior: descriptor.behavior || "unspecified",
    state,
    determinism,
    effectsDeclared: declaredEffects !== null,
    observableEffects,
    cacheEligibility: cacheBlockers.length ? "ineligible" : "candidate",
    cacheBlockers,
  };
}

function sortScopes(scopes, direction = "asc") {
  return [...scopes].sort((left, right) => {
    const a = Number.isFinite(left.order) ? left.order : left.sequence;
    const b = Number.isFinite(right.order) ? right.order : right.sequence;
    return direction === "desc" ? b - a : a - b;
  });
}

function selectScopes(scopes, controls = {}) {
  const mode = controls.mode || "default";
  const selection = Array.isArray(controls.selection) ? controls.selection.map(String) : [];
  const matches = (scope) => selection.includes(scope.id)
    || selection.includes(`@${scope.id}`)
    || selection.includes(scope.name);
  let selected = scopes;
  if (mode === "none" || mode === "explicit") selected = [];
  if (mode === "only") selected = scopes.filter(matches);
  if (mode === "except") selected = scopes.filter((scope) => !matches(scope));
  return sortScopes(selected, controls.order || "asc");
}

function mergeSpan(nodes, fallback) {
  if (!nodes.length) return fallback;
  const first = nodes[0].sourceSpan;
  const last = nodes.at(-1).sourceSpan;
  return {
    ...first,
    end: last.end,
    endLine: last.endLine,
    endColumn: last.endColumn,
  };
}

function nodeDependency(nodesById, nodeId) {
  return nodesById.get(nodeId)?.dependency || {
    sourceDigests: [],
    irDigests: [],
    signature: semanticValueDigest(null),
  };
}

function digestList(values) {
  return semanticValueDigest([...values].sort());
}

export function compileExecutionGraph({
  program,
  documentSource,
  documentPath,
  ir,
  registry,
  config,
  runProfile = "fresh",
  environmentDigest = "fnv1a-lab:web-worker-0.7",
}) {
  const publicNodes = [];
  const operations = [];
  const edges = [];
  const nodesById = new Map();
  const idOccurrences = new Map();
  const sourceLines = documentSource.split("\n");
  let nodeSequence = 0;
  let edgeSequence = 0;
  let scopeSequence = 0;

  const allocateId = (kind, logicalKey) => {
    const base = `${kind}:${hashSource(canonicalJson(logicalKey))}`;
    const occurrence = (idOccurrences.get(base) || 0) + 1;
    idOccurrences.set(base, occurrence);
    return `plan:${base}:${String(occurrence).padStart(2, "0")}`;
  };

  const addNode = (kind, logicalKey, detail, operation, dependency) => {
    nodeSequence += 1;
    const nodeId = allocateId(kind, logicalKey);
    const publicNode = {
      nodeId,
      kind,
      orderKey: [nodeSequence, 0, 0],
      ...detail,
    };
    publicNodes.push(publicNode);
    operations.push({ nodeId, kind, ...operation });
    nodesById.set(nodeId, { publicNode, dependency });
    return nodeId;
  };

  const addEdge = (kind, fromNodeId, toNodeId, inputIndex = 0) => {
    edgeSequence += 1;
    edges.push({
      edgeId: `edge:${String(edgeSequence).padStart(4, "0")}:${kind}`,
      kind,
      from: { nodeId: fromNodeId, port: "value" },
      to: { nodeId: toNodeId, port: kind === "merge" ? `item:${inputIndex}` : "input" },
      orderKey: [edgeSequence, inputIndex, 0],
    });
  };

  const addSource = (buffer, containerKey, flushIndex) => {
    const text = buffer.map((node) => `${node.renderText ?? ""}${node.lineBreak ?? ""}`).join("");
    const sourceSpan = mergeSpan(buffer, ir.sourceSpan);
    const contentDigest = semanticValueDigest(text);
    const irDigest = semanticValueDigest(buffer.map((node) => ({ kind: node.kind, nodeId: node.nodeId })));
    const dependency = {
      sourceDigests: [contentDigest],
      irDigests: [irDigest],
      signature: semanticValueDigest({ contentDigest, irDigest }),
    };
    return addNode(
      "source",
      { containerKey, flushIndex },
      {
        sourceSpan,
        source: { path: documentPath, startLine: sourceSpan.startLine, endLine: sourceSpan.endLine },
        contentDigest,
        valueKind: "text",
        outputPort: { name: "value", valueKind: "text" },
      },
      { text },
      dependency,
    );
  };

  const addStage = (stage, inputNodeId, context, edgeKind, applicationKey) => {
    const entry = registry.get(stage.name);
    const contract = describeFunctionExecution(entry);
    const args = withoutSystemArgs(stage.args);
    const inputDependency = nodeDependency(nodesById, inputNodeId);
    const stageIrDigest = semanticValueDigest({
      function: stage.name,
      syntaxStageRef: stage.stageId || null,
      syntaxSpan: stage.sourceSpan || null,
      modality: context.modality,
      scopeId: context.scopeId || null,
    });
    const sourceDependencyDigest = digestList(inputDependency.sourceDigests);
    const irDependencyDigest = digestList([...inputDependency.irDigests, stageIrDigest]);
    const keyComponents = {
      sourceDigest: sourceDependencyDigest,
      irDigest: irDependencyDigest,
      moduleDigest: entry?.moduleDigest || null,
      moduleIdentityDigest: semanticValueDigest({ path: entry?.modulePath || null, digest: entry?.moduleDigest || null }),
      inputDigest: null,
      argsDigest: semanticValueDigest(args),
      configDigest: semanticValueDigest(config),
      profileDigest: semanticValueDigest(runProfile),
      environmentDigest,
    };
    const staticKey = semanticValueDigest(keyComponents);
    const ownKey = semanticValueDigest({
      stageIrDigest,
      moduleDigest: keyComponents.moduleDigest,
      moduleIdentityDigest: keyComponents.moduleIdentityDigest,
      argsDigest: keyComponents.argsDigest,
      configDigest: keyComponents.configDigest,
      profileDigest: keyComponents.profileDigest,
      environmentDigest,
      contract,
    });
    const dependency = {
      sourceDigests: inputDependency.sourceDigests,
      irDigests: [...inputDependency.irDigests, stageIrDigest],
      signature: staticKey,
    };
    const nodeId = addNode(
      "stage",
      { applicationKey, syntaxStageRef: stage.stageId || null, modality: context.modality, scopeId: context.scopeId || null },
      {
        syntaxStageRef: stage.stageId || null,
        syntaxSpan: stage.sourceSpan || null,
        function: stage.name,
        module: entry?.modulePath || null,
        moduleDigest: entry?.moduleDigest || null,
        modality: context.modality,
        scopeId: context.scopeId || null,
        source: context.source,
        args,
        inputPort: { name: "input", valueKind: entry?.descriptor?.accepts || "text" },
        outputPort: { name: "value", valueKind: entry?.descriptor?.returns || "text" },
        contract,
        cache: {
          mode: "planning-only",
          eligibility: contract.cacheEligibility,
          blockers: contract.cacheBlockers,
          staticKey,
          ownKey,
          keyComponents,
        },
      },
      { stage, inputNodeId, context },
      dependency,
    );
    addEdge(edgeKind, inputNodeId, nodeId);
    return nodeId;
  };

  const applyScopes = (inputNodeId, scopes, source, controls, applicationKey) => {
    let current = inputNodeId;
    for (const scope of selectScopes(scopes, controls)) {
      current = addStage(
        {
          name: scope.name,
          args: scope.args,
          line: scope.openLine,
          stageId: scope.stageId,
          sourceSpan: scope.sourceSpan,
        },
        current,
        { modality: "interval", scopeId: scope.id, source },
        controls.edgeKind || "interval",
        `${applicationKey}:scope:${scope.scopeId}`,
      );
    }
    return current;
  };

  const addMerge = (inputNodeIds, containerKey, sourceSpan) => {
    const dependencies = inputNodeIds.map((nodeId) => nodeDependency(nodesById, nodeId));
    const dependency = {
      sourceDigests: uniqueStrings(dependencies.flatMap((item) => item.sourceDigests)),
      irDigests: uniqueStrings(dependencies.flatMap((item) => item.irDigests)),
      signature: semanticValueDigest(dependencies.map((item) => item.signature)),
    };
    const nodeId = addNode(
      "merge",
      { containerKey },
      {
        sourceSpan,
        strategy: "ordered-stringify-concatenate",
        deterministic: true,
        inputPorts: inputNodeIds.map((_, index) => ({ name: `item:${index}`, valueKind: "any" })),
        outputPort: { name: "value", valueKind: "text" },
      },
      { inputNodeIds },
      dependency,
    );
    inputNodeIds.forEach((inputNodeId, index) => addEdge("merge", inputNodeId, nodeId, index));
    return nodeId;
  };

  const compileSequence = (nodes, containerKey, containerSpan) => {
    const outputs = [];
    let buffer = [];
    let scopes = [];
    let flushIndex = 0;

    const flush = () => {
      if (!buffer.length) return;
      flushIndex += 1;
      const first = buffer[0];
      const last = buffer.at(-1);
      const source = {
        path: documentPath,
        startLine: first.sourceSpan.startLine,
        endLine: last.sourceSpan.endLine,
      };
      let current = addSource(buffer, containerKey, flushIndex);
      current = applyScopes(current, scopes, source, { order: config.scopeOrder, edgeKind: "interval" }, `${containerKey}:flush:${flushIndex}`);
      outputs.push(current);
      buffer = [];
    };

    for (const node of nodes) {
      if (["Text", "Blank", "Literal", "Property"].includes(node.kind)) {
        buffer.push(node);
        continue;
      }
      if (node.kind === "IncludeDirective" || node.kind === "ConfigDirective") {
        flush();
        continue;
      }
      if (node.kind === "Recovery") throw new Error(`Recovery-noden ${node.recoveryKind} får inte nå planeringsfasen.`);
      if (node.kind === "IntervalOpen") {
        flush();
        scopeSequence += 1;
        const stage = node.stage;
        const requestedOrder = stage.args["@order"] === undefined ? scopeSequence : Number(stage.args["@order"]);
        scopes.push({
          name: stage.name,
          args: withoutSystemArgs(stage.args),
          id: node.id,
          order: Number.isFinite(requestedOrder) ? requestedOrder : scopeSequence,
          sequence: scopeSequence,
          openLine: stage.line,
          scopeId: node.scopeId,
          stageId: stage.stageId,
          sourceSpan: stage.sourceSpan,
        });
        continue;
      }
      if (node.kind === "IntervalClose") {
        flush();
        const found = scopes.findLastIndex((scope) => scope.scopeId === node.scopeId);
        if (found < 0) throw new Error(`Rad ${node.sourceSpan.startLine}: planeringsgrafen refererar ett inaktivt intervall.`);
        scopes.splice(found, 1);
        continue;
      }
      if (node.kind !== "Block") continue;

      flush();
      const ambient = [...scopes];
      let current = compileSequence(node.children, node.blockId, node.sourceSpan);
      const startLine = Math.min(sourceLines.length, node.headerEndLine + 1);
      const endLine = Math.max(startLine, (node.closeLine || sourceLines.length + 1) - 1);
      const blockSource = { path: documentPath, startLine, endLine };
      const authoredInput = sourceLines.slice(startLine - 1, endLine).join("\n");
      const explicitIntervalStage = node.pipeline.some((stage) => stage.name === "@intervals");
      for (let index = 0; index < node.pipeline.length; index += 1) {
        const stage = node.pipeline[index];
        if (stage.name === "@intervals") {
          current = applyScopes(
            current,
            ambient,
            blockSource,
            {
              mode: stage.args.only ? "only" : stage.args.except ? "except" : "default",
              selection: stage.args.only || stage.args.except || [],
              order: stage.args.order || config.scopeOrder,
              edgeKind: "interval-injection",
            },
            `${node.blockId}:pipeline:${index + 1}`,
          );
        } else {
          current = addStage(
            stage,
            current,
            { modality: "block", source: blockSource, authoredInput },
            "pipeline",
            `${node.blockId}:pipeline:${index + 1}`,
          );
        }
      }
      const first = node.pipeline[0];
      const inheritMode = String(first?.args?.["@inherit"] || "default");
      if (!explicitIntervalStage && inheritMode !== "none" && inheritMode !== "explicit") {
        current = applyScopes(
          current,
          ambient,
          blockSource,
          {
            mode: inheritMode,
            selection: first?.args?.["@intervals"] || [],
            order: config.scopeOrder,
            edgeKind: "inheritance",
          },
          `${node.blockId}:inherit`,
        );
      }
      outputs.push(current);
    }

    flush();
    return addMerge(outputs, containerKey, containerSpan);
  };

  const rootNodeId = compileSequence(program.children, "document", ir.sourceSpan);
  const rootDependency = nodeDependency(nodesById, rootNodeId);
  const renderNodeId = addNode(
    "render",
    { documentId: ir.sourceRef.documentId },
    {
      mediaType: "text/markdown",
      inputPort: { name: "input", valueKind: "text" },
      outputPort: { name: "value", valueKind: "text" },
    },
    { inputNodeId: rootNodeId },
    rootDependency,
  );
  addEdge("render", rootNodeId, renderNodeId);

  const graph = {
    schema: "textabana.execution-graph/lab-v1",
    graphId: "",
    nodes: publicNodes,
    edges,
    entryNodeIds: publicNodes.filter((node) => !edges.some((edge) => edge.to.nodeId === node.nodeId)).map((node) => node.nodeId),
    terminalNodeId: renderNodeId,
  };
  graph.graphId = `graph:${hashSource(canonicalJson({ ...graph, graphId: undefined }))}`;
  validateExecutionGraph(graph);

  return {
    plan: {
      schema: "textabana.execution-plan/lab-v2",
      languageVersion: ir.languageVersion,
      sourceRef: ir.sourceRef,
      constructionPhase: "post-module-init-pre-transform",
      deterministic: true,
      graph,
      runtimePolicy: {
        profile: runProfile,
        scheduler: "sequential",
        execution: "full-fresh-run",
        cache: "disabled-planning-only",
        parallel: false,
      },
      unsupported: ["cache-read", "cache-write", "cache-reuse", "selective-execution", "parallel-execution", "streaming", "backpressure", "deadline-timeout"],
    },
    operations,
  };
}

export function validateExecutionGraph(graph) {
  const edgeKinds = new Set(["pipeline", "interval", "interval-injection", "inheritance", "merge", "render"]);
  const nodeKinds = new Set(["source", "stage", "merge", "render"]);
  const nodes = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  if (nodes.size !== graph.nodes.length) throw new Error("ExecutionGraph innehåller duplicerade nodeId.");
  for (const node of graph.nodes) {
    if (!nodeKinds.has(node.kind)) throw new Error(`ExecutionGraph-node ${node.nodeId} har okänd typ ${node.kind}.`);
    if (!node.outputPort?.name || node.outputPort.valueKind === undefined) throw new Error(`ExecutionGraph-node ${node.nodeId} saknar typad outputport.`);
    const declaredInputs = node.kind === "merge" ? node.inputPorts || [] : node.inputPort ? [node.inputPort] : [];
    if (declaredInputs.some((port) => !port.name || port.valueKind === undefined)) throw new Error(`ExecutionGraph-node ${node.nodeId} saknar typad inputport.`);
  }
  const edgeIds = new Set();
  if (!nodes.has(graph.terminalNodeId) || nodes.get(graph.terminalNodeId).kind !== "render") {
    throw new Error("ExecutionGraph måste ha exakt en giltig renderterminal.");
  }
  const incoming = new Map(graph.nodes.map((node) => [node.nodeId, 0]));
  const outgoing = new Map(graph.nodes.map((node) => [node.nodeId, 0]));
  const reverseEdges = new Map(graph.nodes.map((node) => [node.nodeId, []]));
  const connectedInputPorts = new Set();
  const outputPortName = (node) => node.outputPort?.name || null;
  const inputPortNames = (node) => node.kind === "merge"
    ? new Set((node.inputPorts || []).map((port) => port.name))
    : new Set(node.inputPort?.name ? [node.inputPort.name] : []);
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.edgeId)) throw new Error(`ExecutionGraph innehåller duplicerat edgeId ${edge.edgeId}.`);
    edgeIds.add(edge.edgeId);
    if (!edgeKinds.has(edge.kind)) throw new Error(`ExecutionGraph-edge ${edge.edgeId} har okänd typ ${edge.kind}.`);
    const from = nodes.get(edge.from.nodeId);
    const to = nodes.get(edge.to.nodeId);
    if (!from || !to) throw new Error(`ExecutionGraph-edge ${edge.edgeId} refererar en okänd nod.`);
    if (edge.from.port !== outputPortName(from)) throw new Error(`ExecutionGraph-edge ${edge.edgeId} refererar en okänd outputport.`);
    if (!inputPortNames(to).has(edge.to.port)) throw new Error(`ExecutionGraph-edge ${edge.edgeId} refererar en okänd inputport.`);
    const inputKey = `${to.nodeId}:${edge.to.port}`;
    if (connectedInputPorts.has(inputKey)) throw new Error(`ExecutionGraph-input ${inputKey} har flera producenter.`);
    connectedInputPorts.add(inputKey);
    if (edge.kind === "merge" && to.kind !== "merge") throw new Error(`ExecutionGraph-edge ${edge.edgeId} har ogiltig merge-target.`);
    if (edge.kind === "render" && to.kind !== "render") throw new Error(`ExecutionGraph-edge ${edge.edgeId} har ogiltig render-target.`);
    if (!["merge", "render"].includes(edge.kind) && to.kind !== "stage") throw new Error(`ExecutionGraph-edge ${edge.edgeId} har ogiltig stage-target.`);
    if (from.orderKey[0] >= to.orderKey[0]) throw new Error(`ExecutionGraph-edge ${edge.edgeId} bryter topologisk ordning.`);
    incoming.set(to.nodeId, incoming.get(to.nodeId) + 1);
    outgoing.set(from.nodeId, outgoing.get(from.nodeId) + 1);
    reverseEdges.get(to.nodeId).push(from.nodeId);
  }
  const renderNodes = graph.nodes.filter((node) => node.kind === "render");
  if (renderNodes.length !== 1) throw new Error("ExecutionGraph måste innehålla exakt en rendernod.");
  if (incoming.get(graph.terminalNodeId) !== 1) throw new Error("ExecutionGraph-rendernoden måste ha exakt ett inputberoende.");
  if (outgoing.get(graph.terminalNodeId) !== 0) throw new Error("ExecutionGraph-rendernoden måste vara terminal.");
  for (const node of graph.nodes) {
    if (node.kind === "source" && incoming.get(node.nodeId) !== 0) throw new Error(`ExecutionGraph-source ${node.nodeId} får inte ha input.`);
    if (node.kind === "stage" && incoming.get(node.nodeId) !== 1) throw new Error(`ExecutionGraph-stage ${node.nodeId} måste ha exakt ett inputberoende.`);
    if (node.kind === "merge" && incoming.get(node.nodeId) !== (node.inputPorts || []).length) {
      throw new Error(`ExecutionGraph-merge ${node.nodeId} matchar inte deklarerad arity.`);
    }
  }
  const expectedEntries = graph.nodes.filter((node) => incoming.get(node.nodeId) === 0).map((node) => node.nodeId).sort();
  const declaredEntries = [...graph.entryNodeIds].sort();
  if (canonicalJson(expectedEntries) !== canonicalJson(declaredEntries)) throw new Error("ExecutionGraph entryNodeIds matchar inte grafens noll-inputnoder.");
  const reachesTerminal = new Set([graph.terminalNodeId]);
  const queue = [graph.terminalNodeId];
  while (queue.length) {
    const current = queue.shift();
    for (const previous of reverseEdges.get(current) || []) {
      if (reachesTerminal.has(previous)) continue;
      reachesTerminal.add(previous);
      queue.push(previous);
    }
  }
  if (reachesTerminal.size !== graph.nodes.length) throw new Error("ExecutionGraph innehåller noder som inte når renderterminalen.");
  return true;
}

function reachableStageNodes(plan, rootIds) {
  const nodeKinds = new Map(plan.graph.nodes.map((node) => [node.nodeId, node.kind]));
  const outgoing = new Map();
  for (const edge of plan.graph.edges) {
    if (!outgoing.has(edge.from.nodeId)) outgoing.set(edge.from.nodeId, []);
    outgoing.get(edge.from.nodeId).push(edge.to.nodeId);
  }
  const visited = new Set(rootIds);
  const queue = [...rootIds];
  while (queue.length) {
    const current = queue.shift();
    for (const next of outgoing.get(current) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return [...visited].filter((nodeId) => nodeKinds.get(nodeId) === "stage");
}

function firstReachableStageNodes(plan, rootIds) {
  const nodeKinds = new Map(plan.graph.nodes.map((node) => [node.nodeId, node.kind]));
  const outgoing = new Map();
  for (const edge of plan.graph.edges) {
    if (!outgoing.has(edge.from.nodeId)) outgoing.set(edge.from.nodeId, []);
    outgoing.get(edge.from.nodeId).push(edge.to.nodeId);
  }
  const found = new Set();
  const visited = new Set(rootIds);
  const queue = [...rootIds];
  while (queue.length) {
    const current = queue.shift();
    for (const next of outgoing.get(current) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      if (nodeKinds.get(next) === "stage") found.add(next);
      else queue.push(next);
    }
  }
  return [...found];
}

function incomingTopologySignatures(plan) {
  const incoming = new Map(plan.graph.nodes.map((node) => [node.nodeId, []]));
  for (const edge of plan.graph.edges) {
    incoming.get(edge.to.nodeId)?.push({
      kind: edge.kind,
      fromNodeId: edge.from.nodeId,
      fromPort: edge.from.port,
      toPort: edge.to.port,
    });
  }
  return new Map([...incoming.entries()].map(([nodeId, edges]) => [nodeId, semanticValueDigest(edges)]));
}

export function buildInvalidationPreview(plan, previousBaseline = null) {
  const currentNodes = new Map(plan.graph.nodes.map((node) => [node.nodeId, node]));
  const currentStages = plan.graph.nodes.filter((node) => node.kind === "stage");
  const previousPlan = previousBaseline?.plan?.graph ? previousBaseline.plan : null;
  const previousNodes = new Map((previousPlan?.graph?.nodes || []).map((node) => [node.nodeId, node]));
  const currentTopology = incomingTopologySignatures(plan);
  const previousTopology = previousPlan ? incomingTopologySignatures(previousPlan) : new Map();
  const added = [];
  const removed = [];
  const directRoots = [];
  const topologyRoots = [];
  const directlyAffected = [];
  const forcedEffect = [];

  if (!previousPlan) {
    added.push(...currentStages.map((node) => node.nodeId));
    directlyAffected.push(...added);
  } else {
    for (const node of plan.graph.nodes) {
      const previous = previousNodes.get(node.nodeId);
      if (!previous) {
        if (node.kind === "stage") {
          added.push(node.nodeId);
          directlyAffected.push(node.nodeId);
        } else directRoots.push(node.nodeId);
        continue;
      }
      const changed = node.kind === "source"
        ? previous.contentDigest !== node.contentDigest
        : node.kind === "stage"
          ? previous.cache?.ownKey !== node.cache?.ownKey
          : false;
      const topologyChanged = currentTopology.get(node.nodeId) !== previousTopology.get(node.nodeId);
      if ((changed || topologyChanged) && node.kind === "stage") directlyAffected.push(node.nodeId);
      else if (changed || topologyChanged) directRoots.push(node.nodeId);
      if (topologyChanged) topologyRoots.push(node.nodeId);
    }
    for (const node of previousPlan.graph.nodes.filter((candidate) => candidate.kind === "stage")) {
      if (!currentNodes.has(node.nodeId)) removed.push(node.nodeId);
    }
    const firstStages = firstReachableStageNodes(plan, directRoots);
    for (const nodeId of firstStages) {
      if (!directlyAffected.includes(nodeId) && !added.includes(nodeId)) directlyAffected.push(nodeId);
    }
  }

  for (const node of currentStages) {
    if (node.contract.cacheEligibility !== "candidate") forcedEffect.push(node.nodeId);
  }
  let affectedRoots = uniqueStrings([...directlyAffected, ...added, ...forcedEffect]);
  let reached = reachableStageNodes(plan, affectedRoots);
  let transitive = reached.filter((nodeId) => !affectedRoots.includes(nodeId));
  let affected = new Set([...affectedRoots, ...transitive]);
  const unexplainedDependencyChanges = currentStages
    .filter((node) => previousNodes.has(node.nodeId)
      && previousNodes.get(node.nodeId)?.cache?.staticKey !== node.cache.staticKey
      && !affected.has(node.nodeId))
    .map((node) => node.nodeId);
  if (unexplainedDependencyChanges.length) {
    directlyAffected.push(...unexplainedDependencyChanges);
    affectedRoots = uniqueStrings([...affectedRoots, ...unexplainedDependencyChanges]);
    reached = reachableStageNodes(plan, affectedRoots);
    transitive = reached.filter((nodeId) => !affectedRoots.includes(nodeId));
    affected = new Set([...affectedRoots, ...transitive]);
  }
  const unchanged = currentStages
    .filter((node) => previousNodes.has(node.nodeId) && previousNodes.get(node.nodeId)?.cache?.staticKey === node.cache.staticKey && !affected.has(node.nodeId))
    .map((node) => node.nodeId);
  const retainedCandidates = unchanged.filter((nodeId) => currentNodes.get(nodeId)?.contract?.cacheEligibility === "candidate");

  return {
    schema: "textabana.invalidation-preview/lab-v1",
    mode: previousPlan ? "baseline-diff" : "cold-no-baseline",
    advisory: true,
    basis: previousPlan ? {
      documentRevision: previousBaseline.documentRevision,
      documentVersion: previousBaseline.documentVersion,
      graphId: previousPlan.graph.graphId,
    } : null,
    target: { documentVersion: plan.sourceRef.version, graphId: plan.graph.graphId },
    directlyAffectedNodeIds: uniqueStrings([...directlyAffected, ...added]),
    transitivelyAffectedNodeIds: transitive,
    unchangedNodeIds: unchanged,
    addedNodeIds: added,
    removedNodeIds: removed,
    forcedEffectNodeIds: forcedEffect,
    retainedCandidateNodeIds: retainedCandidates,
    executionDisposition: {
      mode: "planned-fresh",
      plannedNodeIds: currentStages.map((node) => node.nodeId),
      reusedNodeIds: [],
    },
    cacheStats: { reads: 0, writes: 0, hits: 0, reused: 0 },
    reasons: [
      ...(!previousPlan ? [{ code: "TBA-INVALIDATION-COLD-LAB", nodeIds: currentStages.map((node) => node.nodeId) }] : []),
      ...(directRoots.length ? [{ code: "TBA-INVALIDATION-DEPENDENCY-LAB", nodeIds: uniqueStrings(directRoots) }] : []),
      ...(topologyRoots.length ? [{ code: "TBA-INVALIDATION-TOPOLOGY-LAB", nodeIds: uniqueStrings(topologyRoots) }] : []),
      ...(unexplainedDependencyChanges.length ? [{ code: "TBA-INVALIDATION-STATIC-KEY-LAB", nodeIds: unexplainedDependencyChanges }] : []),
      ...(forcedEffect.length ? [{ code: "TBA-INVALIDATION-FORCED-EFFECT-LAB", nodeIds: forcedEffect }] : []),
      { code: "TBA-EXECUTION-FRESH-LAB", nodeIds: currentStages.map((node) => node.nodeId) },
    ],
  };
}

export function materializeCacheKey(stageNode, inputDigest) {
  return semanticValueDigest({ ...stageNode.cache.keyComponents, inputDigest });
}
