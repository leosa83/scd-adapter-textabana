import { runAdapters } from "./adapters.js";
import { createChannelBus } from "./channels.js";
import { createEditorKernel } from "./editor-kernel.js";
import { buildInvalidationPreview, compileExecutionGraph, describeFunctionExecution, materializeCacheKey } from "./execution-graph.js";
import { buildCapabilities, buildConformanceReport } from "./lab-conformance.js";
import { normalizePath, serializableValue, sourceHash, valueSummary } from "./lab-values.js";
import { verifyLoadedModuleContracts, verifyModulePackages } from "./module-admission.js";
import { createModuleLoader } from "./module-loader.js";
import { parseDocument } from "./parser.js";
import { buildResultEnvelope } from "./result-envelope.js";
import { createRunControl, normalizeRunPolicy, rejectedRunPolicyReport } from "./run-policy.js";
import { cacheContractError, cancellationDiagnosticCode, cancellationError, planningError } from "./runtime-errors.js";
import { createIdentityContext, identifyIR, identifyPlan, identifyResult } from "./semantic-identity.js";
import { cloneParallelValue, createStageCacheTransaction, finalizeStageCacheTransaction, observeStageCache, recordStageResolution, resolveStageCache, snapshotCacheValue, snapshotParallelValue, stageCacheExecutionReport, stageCacheWitness } from "./stage-cache.js";

const activeRuns = new Set();
const cancelledRuns = new Set();
const queuedRuns = new Set();
let runQueue = Promise.resolve();
let runInstanceSequence = 0;
const editor = createEditorKernel({ postMessage: (message) => self.postMessage(message), isRunBusy: () => activeRuns.size > 0 || queuedRuns.size > 0 });
const { analyzeEditorDocument, applyEditorChange, captureEditorRun, completeEditorRun, creditEditorSubscription, editorProtocolCapabilities, editorProtocolError, exportEditorCache, importEditorCache, openEditorDocument, parseEditorSnapshot, subscribeEditorDocument } = editor;
const moduleLoader = createModuleLoader();
const { loadModule } = moduleLoader;


function withoutSystemArgs(args) {
  return Object.fromEntries(Object.entries(args).filter(([key]) => !key.startsWith("@")));
}

function cloneInvocationValue(value) {
  if (Array.isArray(value)) return value.map(cloneInvocationValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).map((key) => [key, cloneInvocationValue(value[key])]));
  }
  return value;
}

function detachParallelOutput(value, stageName) {
  const snapshot = snapshotParallelValue(value);
  if (!snapshot.ok) {
    throw cacheContractError(
      "TBA-PARALLEL-OUTPUT-NOT-DETACHABLE-LAB",
      `Parallel candidate “${stageName}” returned a value outside the portable TextabanaValue domain: ${snapshot.detail || snapshot.reason}.`,
    );
  }
  try {
    return cloneParallelValue(snapshot);
  } catch (error) {
    throw cacheContractError(
      "TBA-PARALLEL-OUTPUT-NOT-DETACHABLE-LAB",
      `Parallel candidate “${stageName}” could not be detached without loss: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

function serializableMeta(name, descriptor, modulePath, moduleDigest) {
  const execution = describeFunctionExecution({ descriptor, modulePath, moduleDigest });
  return {
    name,
    modulePath,
    moduleDigest,
    description: descriptor.description || "No description provided.",
    args: descriptor.args || {},
    accepts: descriptor.accepts || "text",
    returns: descriptor.returns || "text",
    behavior: descriptor.behavior || "unspecified",
    execution,
    outputs: Array.isArray(descriptor.outputs) && descriptor.outputs.length
      ? descriptor.outputs.map(String)
      : ["render"],
    channels: serializableValue(descriptor.channels || {}),
  };
}

function stringifyResult(value) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("\n");
  return `\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}

async function callFunction(stage, input, registry, diagnostics, channelBus, contextExtra = {}, runtimeHooks = {}) {
  channelBus.throwIfCancelled();
  const entry = registry.get(stage.name);
  if (!entry) throw Object.assign(new Error(`Line ${stage.line}: unknown function “${stage.name}”.`), { code: "TBA-RUN-LAB", line: stage.line });
  for (const [channelName, descriptor] of Object.entries(entry.descriptor.channels || {})) {
    channelBus.declare(channelName, descriptor);
  }
  const warnings = [];
  const source = contextExtra.source || { startLine: stage.line, endLine: stage.line };
  const execution = contextExtra.execution || channelBus.createExecution({
    functionName: stage.name,
    modulePath: entry.modulePath,
    modality: contextExtra.modality || "block",
    scopeId: contextExtra.scopeId,
    stageLine: stage.line,
    syntaxStageId: stage.stageId || null,
    syntaxSpan: stage.sourceSpan || null,
    planNodeRef: contextExtra.planNode?.nodeId || null,
    planOrderKey: contextExtra.planNode?.orderKey || null,
    cachePlan: contextExtra.planNode?.cache || null,
    executionMode: "fresh-transform",
    source,
  });
  let invocationLeaseOpen = true;
  const assertEffectAllowed = () => {
    if (!invocationLeaseOpen) {
      throw cacheContractError("TBA-STAGE-LEASE-CLOSED-LAB", `Function “${stage.name}” attempted to emit after its invocation ended.`);
    }
    if (runtimeHooks.enforceNoEffects) {
      const parallelOnly = runtimeHooks.enforceNoEffects === "parallel";
      throw cacheContractError(
        parallelOnly ? "TBA-PARALLEL-EFFECT-VIOLATION-LAB" : "TBA-CACHE-EFFECT-VIOLATION-LAB",
        `${parallelOnly ? "Parallel candidate" : "Cache candidate"} “${stage.name}” declared effects=[] but attempted to produce an observable effect.`,
      );
    }
  };
  const emit = (channel, value, location) => {
    assertEffectAllowed();
    return channelBus.emit(channel, value, location, execution);
  };
  const systemOut = (value, location) => emit("system.out", value, location);
  systemOut.line = (value, location = {}) => emit("system.out", value, { ...location, mode: location.mode || "line" });
  systemOut.row = (rowId, value, location = {}) => emit("system.out", value, {
    ...location,
    rowId,
    mode: location.mode || "row",
  });
  const context = {
    functionName: stage.name,
    modulePath: entry.modulePath,
    modality: contextExtra.modality || "block",
    scopeId: contextExtra.scopeId || null,
    source: { ...source, stageLine: stage.line },
    ...(contextExtra.authoredInput === undefined ? {} : { authoredInput: contextExtra.authoredInput }),
    emit,
    signal: {
      get aborted() { return channelBus.isCancelled(); },
      get reason() { return channelBus.abortReason(); },
      throwIfAborted() { channelBus.throwIfCancelled(); },
    },
    checkpoint() {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            channelBus.checkpoint();
            resolve();
          } catch (error) {
            reject(error);
          }
        }, 0);
      });
    },
    system: { out: systemOut },
    annotate(value, location = {}) { return emit("system.out", value, { ...location, kind: location.kind || "annotation" }); },
    warn(message, location) {
      assertEffectAllowed();
      const normalized = String(message);
      warnings.push({ message: normalized, location });
      return channelBus.emit("diagnostics", { severity: "warning", level: "warning", message: normalized }, { ...location, kind: "diagnostic" }, execution);
    },
  };
  const authoredArgs = cloneInvocationValue(withoutSystemArgs(stage.args));
  const args = cloneInvocationValue(authoredArgs);
  const recordStage = runtimeHooks.recordStage || ((record) => channelBus.recordStage(record));
  const started = performance.now();
  let output;
  try {
    output = await entry.descriptor.transform(input, args, context);
    invocationLeaseOpen = false;
    channelBus.throwIfCancelled();
    const cacheResolution = runtimeHooks.validateSuccess
      ? runtimeHooks.validateSuccess({ input, output, execution })
      : runtimeHooks.lookup?.resolution || null;
    recordStage({
      execution,
      args: authoredArgs,
      input,
      output,
      status: "succeeded",
      duration: performance.now() - started,
      cacheResolution,
    });
  } catch (error) {
    invocationLeaseOpen = false;
    recordStage({
      execution,
      args: authoredArgs,
      input,
      output: null,
      status: error?.code === cancellationDiagnosticCode ? "cancelled" : "failed",
      duration: performance.now() - started,
      cacheResolution: runtimeHooks.lookup?.resolution || null,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    invocationLeaseOpen = false;
  }
  for (const warning of warnings) {
    const warningLine = Number(warning.location?.line);
    const warningOffset = Number(warning.location?.lineOffset);
    diagnostics.push({
      level: "warning",
      line: Number.isInteger(warningLine) && warningLine > 0
        ? warningLine
        : Number.isInteger(warningOffset)
          ? Math.max(1, source.startLine + warningOffset)
          : source.startLine,
      message: warning.message,
    });
  }
  return output;
}

async function executeExecutionGraph(compiled, registry, diagnostics, channelBus, cacheTransaction, runControl) {
  const values = new Map();
  const publicNodes = new Map(compiled.plan.graph.nodes.map((node) => [node.nodeId, node]));
  const operationOrder = new Map(compiled.operations.map((operation, index) => [operation.nodeId, index]));
  const pending = new Map(compiled.operations.map((operation) => [operation.nodeId, operation]));
  const stageOperations = compiled.operations.filter((operation) => operation.kind === "stage");
  const reservedExecutions = new Map(stageOperations.map((operation) => {
    const planNode = publicNodes.get(operation.nodeId);
    if (!planNode || planNode.kind !== "stage") throw planningError(`Stage-operationen ${operation.nodeId} saknar motsvarande grafnod.`);
    return [operation.nodeId, channelBus.createExecution({
      functionName: operation.stage.name,
      modulePath: planNode.module,
      modality: operation.context.modality || "block",
      scopeId: operation.context.scopeId,
      stageLine: operation.stage.line,
      syntaxStageId: operation.stage.stageId || null,
      syntaxSpan: operation.stage.sourceSpan || null,
      planNodeRef: planNode.nodeId,
      planOrderKey: planNode.orderKey,
      cachePlan: planNode.cache,
      executionMode: "fresh-transform",
      source: operation.context.source,
    })];
  }));
  const pendingStageCommits = new Map();
  let nextStageCommitIndex = 0;
  const dependencies = (operation) => {
    if (operation.kind === "source") return [];
    if (operation.kind === "merge") return operation.inputNodeIds;
    if (operation.kind === "stage" || operation.kind === "render") return [operation.inputNodeId];
    throw planningError(`Unknown operation type “${operation.kind}”.`);
  };
  const sortOperations = (operations) => [...operations]
    .sort((left, right) => operationOrder.get(left.nodeId) - operationOrder.get(right.nodeId));
  const readyOperations = () => sortOperations([...pending.values()]
    .filter((operation) => dependencies(operation).every((nodeId) => values.has(nodeId))));
  const isStaticParallelCandidate = (operation) => publicNodes.get(operation.nodeId)?.contract?.parallelEligibility === "candidate";
  const isRuntimeParallelCandidate = (operation) => {
    if (!isStaticParallelCandidate(operation) || !values.has(operation.inputNodeId)) return false;
    return snapshotCacheValue(values.get(operation.inputNodeId)).ok;
  };

  const prepareStage = (operation) => {
    const planNode = publicNodes.get(operation.nodeId);
    if (!planNode || planNode.kind !== "stage") {
      throw planningError(`Stage-operationen ${operation.nodeId} saknar motsvarande grafnod.`);
    }
    if (!values.has(operation.inputNodeId)) {
      throw planningError(`Stage node ${operation.nodeId} is missing its planned input value.`);
    }
    const input = values.get(operation.inputNodeId);
    const parallelCandidate = planNode.contract.parallelEligibility === "candidate";
    const cacheEligible = cacheTransaction.enabled && planNode.contract.cacheEligibility === "candidate";
    const inputSnapshot = cacheEligible || parallelCandidate
      ? snapshotCacheValue(input)
      : { ok: false, reason: cacheTransaction.enabled ? "contract-ineligible" : "cache-disabled" };
    const semanticKey = materializeCacheKey(planNode, inputSnapshot.ok ? inputSnapshot.digest : null);
    const witnessSnapshot = cacheEligible
      ? stageCacheWitness({
          nodeId: operation.nodeId,
          witnessBase: operation.cacheWitnessBase,
          inputSnapshot,
        })
      : { ok: false, reason: inputSnapshot.reason };
    const lookup = resolveStageCache(cacheTransaction, {
      nodeId: operation.nodeId,
      semanticKey,
      witness: witnessSnapshot.ok ? witnessSnapshot.wire : null,
      witnessFailure: witnessSnapshot.ok ? null : witnessSnapshot,
      eligibility: planNode.contract.cacheEligibility,
      inputSnapshot,
    });
    const execution = reservedExecutions.get(operation.nodeId);
    if (!execution) throw planningError(`Stage-operationen ${operation.nodeId} saknar reserverad execution-identitet.`);
    if (lookup.hit) {
      execution.executionMode = "cache-reuse";
      execution.activityId = execution.activityId.replace("activity:invocation:", "activity:cache-materialization:");
    }
    return { operation, planNode, input, inputSnapshot, lookup, execution, cacheEligible, parallelCandidate, record: null };
  };

  const commitStageOutcome = (outcome) => {
    const { item } = outcome;
    if (outcome.kind === "cache-hit") {
      channelBus.recordStage({
        execution: item.execution,
        args: cloneInvocationValue(withoutSystemArgs(item.operation.stage.args)),
        input: item.input,
        output: outcome.traceOutput,
        status: "succeeded",
        duration: 0,
        cacheResolution: item.lookup.resolution,
        functionInvoked: false,
      });
    } else {
      if (outcome.kind === "succeeded" && item.cacheEligible) {
        observeStageCache(cacheTransaction, item.lookup, outcome.outputSnapshot);
      }
      if (item.record) channelBus.recordStage(item.record);
    }
    recordStageResolution(cacheTransaction, item.lookup.resolution);
  };
  const flushStageCommits = (force = false) => {
    if (force) {
      const orderedPending = stageOperations
        .slice(nextStageCommitIndex)
        .map((operation) => pendingStageCommits.get(operation.nodeId))
        .filter(Boolean);
      orderedPending.forEach(commitStageOutcome);
      orderedPending.forEach((outcome) => pendingStageCommits.delete(outcome.item.operation.nodeId));
      return;
    }
    while (nextStageCommitIndex < stageOperations.length) {
      const operation = stageOperations[nextStageCommitIndex];
      const outcome = pendingStageCommits.get(operation.nodeId);
      if (!outcome) break;
      commitStageOutcome(outcome);
      pendingStageCommits.delete(operation.nodeId);
      nextStageCommitIndex += 1;
    }
  };

  const resolveStageWave = async (operations, requestedMode) => {
    runControl.assertActive();
    const prepared = operations.map(prepareStage);
    const fresh = prepared.filter((item) => !item.lookup.hit);
    const requiresDetachedOutput = fresh.length > 1;
    cacheTransaction.stats.executed += fresh.length;
    const settlements = await Promise.allSettled(fresh.map(async (item) => {
      const output = await callFunction(
        item.operation.stage,
        item.input,
        registry,
        diagnostics,
        channelBus,
        { ...item.operation.context, planNode: item.planNode, execution: item.execution },
        {
          lookup: item.lookup,
          enforceNoEffects: item.cacheEligible ? "cache" : item.parallelCandidate ? "parallel" : false,
          recordStage(record) {
            const recordedOutput = record.status === "succeeded" && item.outputDetached
              ? item.detachedOutput
              : record.output;
            item.record = {
              ...record,
              output: recordedOutput,
              inputSummary: valueSummary(record.input),
              outputSummary: valueSummary(recordedOutput),
            };
          },
          validateSuccess({ output: invocationOutput }) {
            if (item.inputSnapshot.ok) {
              const inputAfter = snapshotCacheValue(item.input);
              if (!inputAfter.ok || inputAfter.wire !== item.inputSnapshot.wire || inputAfter.digest !== item.inputSnapshot.digest) {
                const parallelOnly = item.parallelCandidate && !item.cacheEligible;
                throw cacheContractError(
                  parallelOnly ? "TBA-PARALLEL-INPUT-MUTATION-LAB" : "TBA-CACHE-INPUT-MUTATION-LAB",
                  `${parallelOnly ? "Parallel candidate" : "Cache candidate"} “${item.operation.stage.name}” mutated its input value; the run is rolled back.`,
                );
              }
            }
            item.cacheOutputSnapshot = item.cacheEligible ? snapshotCacheValue(invocationOutput) : null;
            if (requiresDetachedOutput) {
              item.detachedOutput = detachParallelOutput(invocationOutput, item.operation.stage.name);
              item.outputDetached = true;
            }
            return item.lookup.resolution;
          },
        },
      );
      return {
        output: item.outputDetached ? item.detachedOutput : output,
        outputSnapshot: item.cacheEligible ? item.cacheOutputSnapshot : null,
      };
    }));
    fresh.forEach((item, index) => { item.settlement = settlements[index]; });
    const errors = [];
    for (const item of prepared) {
      if (item.lookup.hit) {
        values.set(item.operation.nodeId, item.lookup.output);
        pendingStageCommits.set(item.operation.nodeId, {
          kind: "cache-hit",
          item,
          traceOutput: cloneInvocationValue(item.lookup.output),
        });
        continue;
      }
      if (item.settlement?.status === "fulfilled") {
        values.set(item.operation.nodeId, item.settlement.value.output);
        pendingStageCommits.set(item.operation.nodeId, {
          kind: "succeeded",
          item,
          outputSnapshot: item.cacheEligible ? item.settlement.value.outputSnapshot : null,
        });
        continue;
      }
      const error = item.settlement?.reason || planningError(`Stage-noden ${item.operation.nodeId} saknar terminalt utfall.`);
      item.lookup.resolution.reason = error?.code || "function-failed";
      pendingStageCommits.set(item.operation.nodeId, { kind: "failed", item, error });
      errors.push(error);
    }
    const freshNodeRefs = fresh.map((item) => item.operation.nodeId);
    const reusedNodeRefs = prepared.filter((item) => item.lookup.hit).map((item) => item.operation.nodeId);
    const mode = requestedMode === "barrier"
      ? "barrier"
      : freshNodeRefs.length > 1 ? "concurrent" : freshNodeRefs.length ? "safe-single" : "cache-materialization";
    runControl.recordWave({
      nodeRefs: prepared.map((item) => item.operation.nodeId),
      freshNodeRefs,
      reusedNodeRefs,
      mode,
    });
    runControl.assertActive();
    if (errors.length) {
      flushStageCommits(true);
      throw errors[0];
    }
    flushStageCommits(false);
  };

  try {
    while (pending.size) {
      runControl.assertActive();
      const ready = readyOperations();
      if (!ready.length) throw planningError("ExecutionGraph could not produce a ready set.");
      const synchronous = ready.filter((operation) => operation.kind !== "stage");
      if (synchronous.length) {
        for (const operation of synchronous) {
          runControl.assertActive();
          if (operation.kind === "source") values.set(operation.nodeId, operation.text);
          else if (operation.kind === "merge") {
            const missing = operation.inputNodeIds.find((nodeId) => !values.has(nodeId));
            if (missing) throw planningError(`Merge node ${operation.nodeId} is missing input from ${missing}.`);
            values.set(operation.nodeId, operation.inputNodeIds.map((nodeId) => stringifyResult(values.get(nodeId))).join(""));
          } else if (operation.kind === "render") {
            if (!values.has(operation.inputNodeId)) throw planningError(`Render node ${operation.nodeId} is missing its planned input value.`);
            const render = String(values.get(operation.inputNodeId));
            runControl.checkRender(render);
            values.set(operation.nodeId, render);
          } else throw planningError(`Unknown operation type “${operation.kind}”.`);
          pending.delete(operation.nodeId);
        }
        continue;
      }
      const firstPendingStaticBarrier = stageOperations.find((operation) => (
        pending.has(operation.nodeId) && !isStaticParallelCandidate(operation)
      ));
      const barrierOrder = firstPendingStaticBarrier
        ? operationOrder.get(firstPendingStaticBarrier.nodeId)
        : Number.POSITIVE_INFINITY;
      const readyStages = ready
        .filter((operation) => operation.kind === "stage")
        .filter((operation) => operationOrder.get(operation.nodeId) <= barrierOrder);
      const first = readyStages[0];
      if (!first) throw planningError("ExecutionGraph has no executable operation in its ready set.");
      if (!isRuntimeParallelCandidate(first)) {
        await resolveStageWave([first], isStaticParallelCandidate(first) ? "safe" : "barrier");
        pending.delete(first.nodeId);
        continue;
      }
      const selected = [];
      for (const operation of readyStages) {
        if (selected.length >= runControl.report().scheduling.maxConcurrency) break;
        if (!isRuntimeParallelCandidate(operation)) break;
        selected.push(operation);
      }
      await resolveStageWave(selected, "safe");
      selected.forEach((operation) => pending.delete(operation.nodeId));
    }
  } catch (error) {
    flushStageCommits(true);
    throw error;
  }
  flushStageCommits(false);

  const plannedStages = compiled.plan.graph.nodes.filter((node) => node.kind === "stage").map((node) => node.nodeId);
  const observedStages = channelBus.traceSnapshot().map((step) => step.planNodeRef);
  if (plannedStages.length !== observedStages.length || plannedStages.some((nodeId, index) => nodeId !== observedStages[index])) {
    throw planningError("Execution trace diverged from the precompiled stage order; commit is not allowed.");
  }
  return values.get(compiled.plan.graph.terminalNodeId) || "";
}

function synchronizeCommittedCacheTrace(executionTrace, executionReport) {
  const resolutions = new Map((executionReport?.nodeResolutions || []).map((resolution) => [resolution.planNodeRef, resolution]));
  for (const step of executionTrace || []) {
    const resolution = resolutions.get(step.planNodeRef);
    if (!step.cache || !resolution) continue;
    step.cache.write = resolution.cache.write;
    step.cache.lookup = resolution.lookup;
    step.cache.reason = resolution.reason;
    step.cache.evidence = resolution.cache.evidence;
    step.cache.cacheEntryId = resolution.cache.cacheEntryId;
    step.cache.outputDigest = resolution.cache.outputDigest;
    step.cache.evidenceRefs = resolution.cache.evidenceRefs;
    step.cache.evidenceRecords = resolution.cache.evidenceRecords;
    step.cache.verification = resolution.cache.verification;
  }
}

async function executeRun(payload) {
  const { runId, documentSource, modules = [], documentPath = "document.md", documentId = null, options = {}, editorSnapshot = null } = payload;
  runInstanceSequence += 1;
  const runInstanceId = `run-instance:${String(runInstanceSequence).padStart(6, "0")}`;
  const started = performance.now();
  const diagnostics = [];
  queuedRuns.delete(runId);
  activeRuns.add(runId);
  const runProfile = "fresh";
  moduleLoader.clear();
  let runPolicyError = null;
  let runPolicy;
  try {
    runPolicy = normalizeRunPolicy(options);
  } catch (error) {
    runPolicyError = error;
    runPolicy = normalizeRunPolicy();
  }
  const runControl = createRunControl({
    policy: runPolicy,
    startedAt: started,
    now: () => performance.now(),
    isCancelled: () => cancelledRuns.has(runId),
    cancellationError,
  });
  const channelBus = createChannelBus({
    runId,
    runInstanceId,
    documentVersion: sourceHash(documentSource),
    documentPath,
    documentId,
    documentSource,
    strictChannels: Boolean(options.strictChannels),
    isCancelled: () => cancelledRuns.has(runId),
    runControl,
  });
  const registry = new Map();
  const loaded = new Set();
  let inspection = null;
  let plan = null;
  let invalidationPreview = null;
  let cacheTransaction = null;
  let semanticIdentity = null;
  try {
    if (runPolicyError) throw runPolicyError;
    channelBus.throwIfCancelled();
    if (options.semanticIdentity === true) {
      semanticIdentity = await createIdentityContext({ documentSource, documentPath, documentId,
        modules: modules.map((module) => ({ ...module, path: normalizePath(module.path) })), options, runPolicy, profile: runProfile });
    }
    const verifiedModules = await verifyModulePackages(modules, options);
    const parseResolution = editorSnapshot
      ? parseEditorSnapshot(editorSnapshot)
      : { parsed: parseDocument(documentSource, { documentPath, documentId }), reuse: "fresh" };
    const parsed = parseResolution.parsed;
    inspection = parsed.ir;
    if (semanticIdentity) semanticIdentity.ir = await identifyIR(semanticIdentity, inspection, documentSource);
    diagnostics.push(...parsed.diagnostics);
    if (!parsed.executable) {
      const primary = parsed.diagnostics[0];
      const error = new Error(primary?.message || "The document contains a syntax error.");
      error.code = primary?.code || "TBA-PARSE-LAB";
      error.phase = "parsing";
      error.parseFailure = true;
      error.diagnostic = primary || null;
      throw error;
    }
    channelBus.throwIfCancelled();
    const normalizedModules = verifiedModules.map((module) => ({ ...module, path: normalizePath(module.path) }));
    if (new Set(normalizedModules.map((module) => module.path)).size !== normalizedModules.length) {
      throw new Error("The module manifest contains duplicate normalized paths.");
    }
    const files = Object.fromEntries(normalizedModules.map((module) => [module.path, module.content]));
    const loading = new Set();
    const config = { scopeOrder: inspection.configuration.scopeOrder, documentPath };
    for (const directive of parsed.directives) {
      if (directive.kind === "IncludeDirective") await loadModule(directive.path, files, registry, loaded, loading);
    }
    verifyLoadedModuleContracts(normalizedModules, registry);
    channelBus.throwIfCancelled();
    const moduleSet = [...loaded].map((path) => ({
      path,
      digest: `fnv1a-lab:${sourceHash(String(files[path] || ""))}`,
      source: String(files[path] || ""),
    }));
    const compiled = compileExecutionGraph({
      program: parsed.program,
      documentSource,
      documentPath,
      ir: inspection,
      registry,
      config,
      runProfile,
      cacheRuntime: Boolean(editorSnapshot),
      moduleSet,
    });
    plan = compiled.plan;
    if (semanticIdentity) semanticIdentity.plan = await identifyPlan(semanticIdentity, plan, compiled.operations, [...loaded]);
    invalidationPreview = buildInvalidationPreview(plan, editorSnapshot?.previousPlanBaseline || null);
    cacheTransaction = createStageCacheTransaction({
      enabled: Boolean(editorSnapshot),
      store: editorSnapshot?.stageCacheBaseline || null,
      runId,
      runInstanceId,
      sessionId: editorSnapshot?.sessionId || null,
      documentRevision: editorSnapshot?.documentRevision ?? null,
      documentVersion: editorSnapshot?.documentVersion || null,
      retainedCandidateNodeIds: invalidationPreview.retainedCandidateNodeIds,
      planned: plan.graph.nodes.filter((node) => node.kind === "stage").length,
    });
    runControl.registerPlan(cacheTransaction.stats.planned);
    const output = await executeExecutionGraph(compiled, registry, diagnostics, channelBus, cacheTransaction, runControl);
    channelBus.throwIfCancelled();
    const channels = semanticIdentity ? structuredClone(channelBus.snapshot()) : channelBus.snapshot();
    const channelDescriptors = semanticIdentity ? structuredClone(channelBus.descriptorSnapshot()) : channelBus.descriptorSnapshot();
    const executionTrace = channelBus.traceSnapshot();
    const duration = performance.now() - started;
    let resultEnvelope = buildResultEnvelope({
      runId,
      runInstanceId,
      profile: runProfile,
      ok: true,
      output,
      diagnostics,
      channels,
      descriptors: channelDescriptors,
      anchors: channelBus.anchorSnapshot(),
      sourceMaps: channelBus.sourceMapSnapshot(),
      executionTrace,
      ir: inspection,
      duration,
    });
    const capabilities = buildCapabilities(inspection);
    if (semanticIdentity) {
      resultEnvelope = structuredClone(resultEnvelope);
      semanticIdentity.result = await identifyResult(semanticIdentity, resultEnvelope, plan, { channels, descriptors: channelDescriptors });
    }
    const adapterRun = runAdapters(resultEnvelope, options.adapters, capabilities.implemented);
    const conformanceReport = buildConformanceReport({
      fixtureId: String(options.fixtureId || "ad-hoc"),
      result: resultEnvelope,
      inspection,
      plan,
      executionTrace,
      adapterRun,
      capabilities,
      modules,
    });
    runControl.assertActive();
    activeRuns.delete(runId);
    cancelledRuns.delete(runId);
    const message = {
      ...(editorSnapshot ? { type: "run-result" } : {}),
      runId,
      requestId: payload.requestId || null,
      ok: true,
      output,
      channels,
      channelDescriptors,
      emissions: channelBus.size,
      diagnostics,
      inspection,
      plan,
      invalidationPreview,
      anchors: semanticIdentity ? resultEnvelope.anchors : channelBus.anchorSnapshot(),
      sourceMaps: semanticIdentity ? resultEnvelope.sourceMaps : channelBus.sourceMapSnapshot(),
      executionTrace,
      executionReport: null,
      executionStats: null,
      resultEnvelope,
      adapterRun,
      conformanceReport,
      capabilities,
      functions: [...registry.values()].map((entry) => serializableMeta(entry.name, entry.descriptor, entry.modulePath, entry.moduleDigest)),
      ...(semanticIdentity ? { semanticIdentity } : {}),
      modulesLoaded: loaded.size,
      duration,
    };
    if (editorSnapshot) message.editorKernel = completeEditorRun(editorSnapshot, message, cacheTransaction);
    else finalizeStageCacheTransaction(cacheTransaction, { commit: false, currentStore: null, reason: "disabled" });
    message.executionReport = stageCacheExecutionReport(cacheTransaction, runControl.report());
    message.executionStats = message.executionReport.stats;
    synchronizeCommittedCacheTrace(message.executionTrace, message.executionReport);
    self.postMessage(message);
  } catch (error) {
    if (semanticIdentity) semanticIdentity.result = null;
    runControl.markError(error);
    const message = error instanceof Error ? error.message : String(error);
    const cancelled = error?.code === cancellationDiagnosticCode;
    // Preserve legacy classification of untyped module exceptions. Kernel-owned
    // translated errors carry explicit codes instead of depending on this prose.
    const diagnostic = error?.diagnostic || {
      diagnosticId: `diag:run:${runId}:${String(diagnostics.length + 1).padStart(3, "0")}`,
      code: error?.code || (cancelled ? cancellationDiagnosticCode : /include|Modulen|Cirkulär/.test(message) ? "TBA-RESOLVE-LAB" : /kanal|ChannelDescriptor|payload/.test(message) ? "TBA-TYPE-CHANNEL-LAB" : /okänd funktion/.test(message) ? "TBA-RUN-LAB" : /Rad|block|intervall|markör/.test(message) ? "TBA-PARSE-LAB" : "TBA-RUN-LAB"),
      severity: "error",
      level: "error",
      message,
      phase: error?.phase || "run",
      line: error?.line || Number(message.match(/Rad (\d+)/)?.[1] || 1),
    };
    if (!diagnostics.includes(diagnostic)) diagnostics.push(diagnostic);
    const duration = performance.now() - started;
    const executionTrace = channelBus.traceSnapshot();
    if (!cacheTransaction) {
      cacheTransaction = createStageCacheTransaction({
        enabled: false,
        store: null,
        runId,
        runInstanceId,
        sessionId: editorSnapshot?.sessionId || null,
        documentRevision: editorSnapshot?.documentRevision ?? null,
        documentVersion: editorSnapshot?.documentVersion || null,
        planned: plan?.graph?.nodes?.filter((node) => node.kind === "stage").length || 0,
      });
      cacheTransaction.stats.executed = executionTrace.filter((step) => step.functionInvoked !== false).length;
    }
    const resultEnvelope = buildResultEnvelope({
      runId,
      runInstanceId,
      profile: runProfile,
      ok: false,
      status: cancelled ? "cancelled" : "failed",
      output: "",
      error: message,
      diagnostics,
      channels: {},
      descriptors: {},
      anchors: [],
      sourceMaps: [],
      executionTrace,
      ir: inspection,
      duration,
    });
    const capabilities = buildCapabilities(inspection);
    const adapterRun = runAdapters(resultEnvelope, options.adapters, capabilities.implemented);
    const conformanceReport = buildConformanceReport({
      fixtureId: String(options.fixtureId || "ad-hoc"),
      result: resultEnvelope,
      inspection,
      plan,
      executionTrace,
      adapterRun,
      capabilities,
      modules,
    });
    activeRuns.delete(runId);
    cancelledRuns.delete(runId);
    const resultMessage = {
      ...(editorSnapshot ? { type: "run-result" } : {}),
      runId,
      requestId: payload.requestId || null,
      ok: false,
      cancelled,
      output: "",
      error: message,
      diagnostics,
      channels: {},
      channelDescriptors: {},
      emissions: 0,
      inspection,
      plan,
      invalidationPreview,
      anchors: [],
      sourceMaps: [],
      executionTrace,
      executionReport: null,
      executionStats: null,
      resultEnvelope,
      adapterRun,
      conformanceReport,
      capabilities,
      ...(semanticIdentity ? { semanticIdentity } : {}),
      functions: [...registry.values()].map((entry) => serializableMeta(entry.name, entry.descriptor, entry.modulePath, entry.moduleDigest)),
      modulesLoaded: loaded.size,
      duration,
    };
    if (editorSnapshot) resultMessage.editorKernel = completeEditorRun(editorSnapshot, resultMessage, cacheTransaction);
    else finalizeStageCacheTransaction(cacheTransaction, { commit: false, currentStore: null, reason: "disabled" });
    resultMessage.executionReport = stageCacheExecutionReport(cacheTransaction, runControl.report());
    resultMessage.executionStats = resultMessage.executionReport.stats;
    synchronizeCommittedCacheTrace(resultMessage.executionTrace, resultMessage.executionReport);
    self.postMessage(resultMessage);
  }
}

self.postEditorProtocolResponse = (payload, command, response) => {
  self.postMessage({
    type: "kernel-response",
    schema: "textabana.editor-kernel-response/lab-v1",
    protocol: "textabana.editor-kernel/lab-v1",
    requestId: payload.requestId || null,
    command,
    ok: true,
    ...response,
    capabilities: editorProtocolCapabilities(),
  });
};

function postEditorProtocolError(payload, command, error) {
  self.postMessage({
    type: "kernel-response",
    schema: "textabana.editor-kernel-response/lab-v1",
    protocol: "textabana.editor-kernel/lab-v1",
    requestId: payload.requestId || null,
    command,
    ok: false,
    error: {
      code: error?.code || "TBA-EDITOR-PROTOCOL-LAB",
      message: error instanceof Error ? error.message : String(error),
      details: serializableValue(error?.details || {}),
    },
    capabilities: editorProtocolCapabilities(),
  });
}

function postRejectedEditorRun(payload, error, includeEditorKernel = true) {
  const message = error instanceof Error ? error.message : String(error);
  const diagnostic = {
    diagnosticId: `diag:editor-protocol:${payload.runId || "unknown"}`,
    code: error?.code || "TBA-EDITOR-PROTOCOL-LAB",
    severity: "error",
    level: "error",
    line: 1,
    message,
    phase: "editor-protocol",
  };
  const runtimeReport = rejectedRunPolicyReport();
  self.postMessage({
    ...(includeEditorKernel ? { type: "run-result" } : {}),
    runId: payload.runId,
    requestId: payload.requestId || null,
    ok: false,
    output: "",
    error: message,
    diagnostics: [diagnostic],
    channels: {},
    channelDescriptors: {},
    anchors: [],
    sourceMaps: [],
    inspection: null,
    plan: null,
    invalidationPreview: null,
    executionTrace: [],
    executionReport: {
      schema: "textabana.execution-report/lab-v1",
      mode: "fresh-cache-disabled",
      transactionState: "rejected",
      sessionId: null,
      documentRevision: null,
      verificationPolicy: "two-distinct-committed-revisions",
      nodeResolutions: [],
      stats: { planned: 0, executed: 0, reads: 0, hits: 0, misses: 0, reused: 0, bypassed: 0, observations: 0, observationAttempts: 0, verified: 0, writes: 0, writeAttempts: 0, quarantined: 0 },
      limits: { scope: "single-editor-session-memory", maxEntries: 128, maxValueBytes: 65536, maxTotalValueBytes: 1048576, maxWitnessBytes: 131072, maxQuarantines: 128, maxQuarantineBytes: 16777216, persistent: false, shared: false },
      ...runtimeReport,
    },
    executionStats: { planned: 0, executed: 0, reads: 0, hits: 0, misses: 0, reused: 0, bypassed: 0, observations: 0, observationAttempts: 0, verified: 0, writes: 0, writeAttempts: 0, quarantined: 0 },
    resultEnvelope: null,
    adapterRun: null,
    conformanceReport: null,
    capabilities: null,
    cancelled: false,
    emissions: 0,
    functions: [],
    modulesLoaded: 0,
    duration: 0,
    ...(includeEditorKernel ? { editorKernel: {
      schema: "textabana.editor-kernel-run/lab-v1",
      protocol: "textabana.editor-kernel/lab-v1",
      run: { runId: payload.runId, status: "rejected", committed: false, resultId: null },
      error: diagnostic,
      capabilities: editorProtocolCapabilities(),
      extensions: { "textabana.playground": { canonical: false, fullProfileConformance: false } },
    } } : {}),
  });
}

self.onmessage = (event) => {
  const payload = event.data || {};
  if (payload.type === "cancel") {
    const runId = payload.runId;
    const accepted = activeRuns.has(runId) || queuedRuns.has(runId);
    if (accepted) cancelledRuns.add(runId);
    if (payload.requestId) self.postEditorProtocolResponse(payload, "cancel", { runId, accepted });
    return Promise.resolve();
  }
  if (payload.type === "open") {
    try { self.postEditorProtocolResponse(payload, "open", openEditorDocument(payload)); }
    catch (error) { postEditorProtocolError(payload, "open", error); }
    return Promise.resolve();
  }
  if (payload.type === "change") {
    try { self.postEditorProtocolResponse(payload, "change", applyEditorChange(payload)); }
    catch (error) { postEditorProtocolError(payload, "change", error); }
    return Promise.resolve();
  }
  if (payload.type === "analyze") {
    try { self.postEditorProtocolResponse(payload, "analyze", analyzeEditorDocument(payload)); }
    catch (error) { postEditorProtocolError(payload, "analyze", error); }
    return Promise.resolve();
  }
  if (payload.type === "subscribe") {
    try { self.postEditorProtocolResponse(payload, "subscribe", subscribeEditorDocument(payload)); }
    catch (error) { postEditorProtocolError(payload, "subscribe", error); }
    return Promise.resolve();
  }
  if (payload.type === "credit") {
    try { self.postEditorProtocolResponse(payload, "credit", creditEditorSubscription(payload)); }
    catch (error) { postEditorProtocolError(payload, "credit", error); }
    return Promise.resolve();
  }
  if (payload.type === "cache-export") {
    try { self.postEditorProtocolResponse(payload, "cache-export", exportEditorCache(payload)); }
    catch (error) { postEditorProtocolError(payload, "cache-export", error); }
    return Promise.resolve();
  }
  if (payload.type === "cache-import") {
    try { self.postEditorProtocolResponse(payload, "cache-import", importEditorCache(payload)); }
    catch (error) { postEditorProtocolError(payload, "cache-import", error); }
    return Promise.resolve();
  }
  const editorRun = payload.type === "run";
  if (activeRuns.has(payload.runId) || queuedRuns.has(payload.runId)) {
    postRejectedEditorRun(payload, editorProtocolError(
      editorRun ? "TBA-EDITOR-RUN-ID-INFLIGHT-LAB" : "TBA-RUN-ID-INFLIGHT-LAB",
      `runId ${String(payload.runId)} is already used by an active or queued run.`,
      { runId: payload.runId },
    ), editorRun);
    return Promise.resolve();
  }
  let runPayload = payload;
  if (editorRun) {
    try {
      const editorSnapshot = captureEditorRun(payload);
      runPayload = {
        ...payload,
        documentPath: editorSnapshot.path,
        documentSource: editorSnapshot.source,
        editorSnapshot,
      };
    } catch (error) {
      postRejectedEditorRun(payload, error);
      return Promise.resolve();
    }
  }
  queuedRuns.add(runPayload.runId);
  const task = runQueue.then(() => executeRun(runPayload));
  runQueue = task.catch(() => undefined);
  return task;
};
