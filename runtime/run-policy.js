const HOST_LIMITS = Object.freeze({
  maxParallelism: 8,
  maxStageResolutions: 512,
  maxChannelEvents: 2048,
  maxRenderBytes: 1024 * 1024,
  maxDeadlineMs: 60_000,
});

const DEFAULT_LIMITS = Object.freeze({
  maxParallelism: 4,
  maxStageResolutions: HOST_LIMITS.maxStageResolutions,
  maxChannelEvents: HOST_LIMITS.maxChannelEvents,
  maxRenderBytes: HOST_LIMITS.maxRenderBytes,
  deadlineMs: null,
});

function policyError(message, details = {}) {
  const error = new Error(message);
  error.name = "RunPolicyError";
  error.code = "TBA-RUN-POLICY-LAB";
  error.phase = "execution";
  error.details = details;
  return error;
}

function limitError(code, message) {
  const error = new Error(message);
  error.name = "RunLimitError";
  error.code = code;
  error.phase = "execution";
  return error;
}

function optionalPositiveInteger(value, field) {
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw policyError(`${field} måste vara ett positivt heltal.`, { field, received: value });
  }
  return value;
}

export function normalizeRunPolicy(options = {}) {
  const raw = options?.runtimeLimits;
  if (raw !== undefined && (!raw || typeof raw !== "object" || Array.isArray(raw))) {
    throw policyError("runtimeLimits måste vara ett objekt.", { receivedType: Array.isArray(raw) ? "array" : typeof raw });
  }
  const requested = {
    maxParallelism: optionalPositiveInteger(raw?.maxParallelism, "runtimeLimits.maxParallelism"),
    maxStageResolutions: optionalPositiveInteger(raw?.maxStageResolutions, "runtimeLimits.maxStageResolutions"),
    maxChannelEvents: optionalPositiveInteger(raw?.maxChannelEvents, "runtimeLimits.maxChannelEvents"),
    maxRenderBytes: optionalPositiveInteger(raw?.maxRenderBytes, "runtimeLimits.maxRenderBytes"),
    deadlineMs: optionalPositiveInteger(raw?.deadlineMs, "runtimeLimits.deadlineMs"),
  };
  return {
    schema: "textabana.run-policy/lab-v1",
    requested,
    effective: {
      maxParallelism: Math.min(requested.maxParallelism ?? DEFAULT_LIMITS.maxParallelism, HOST_LIMITS.maxParallelism),
      maxStageResolutions: Math.min(requested.maxStageResolutions ?? DEFAULT_LIMITS.maxStageResolutions, HOST_LIMITS.maxStageResolutions),
      maxChannelEvents: Math.min(requested.maxChannelEvents ?? DEFAULT_LIMITS.maxChannelEvents, HOST_LIMITS.maxChannelEvents),
      maxRenderBytes: Math.min(requested.maxRenderBytes ?? DEFAULT_LIMITS.maxRenderBytes, HOST_LIMITS.maxRenderBytes),
      deadlineMs: requested.deadlineMs === null ? null : Math.min(requested.deadlineMs, HOST_LIMITS.maxDeadlineMs),
    },
    hostCeilings: { ...HOST_LIMITS },
  };
}

export function createRunControl({ policy, startedAt, now, isCancelled, cancellationError }) {
  const waves = [];
  const parallelizedNodeRefs = new Set();
  const barrierNodeRefs = new Set();
  let plannedStageResolutions = 0;
  let resolvedStageResolutions = 0;
  let freshStageInvocations = 0;
  let channelEvents = 0;
  let renderBytes = 0;
  let checkpointCount = 0;
  let peakConcurrency = 0;
  let resourceStatus = "within-limits";
  let diagnosticCode = null;

  const elapsed = () => Math.max(0, now() - startedAt);
  const mark = (status, code) => {
    resourceStatus = status;
    diagnosticCode = code;
  };
  const deadlineError = () => {
    mark("deadline-exceeded", "TBA-RUN-DEADLINE-LAB");
    return limitError("TBA-RUN-DEADLINE-LAB", `Körningens kooperativa deadline på ${policy.effective.deadlineMs} ms överskreds vid en runtimegräns.`);
  };
  const assertActive = () => {
    if (isCancelled()) {
      mark("cancelled", "TBA-RUN-CANCELLED-LAB");
      throw cancellationError();
    }
    if (policy.effective.deadlineMs !== null && elapsed() >= policy.effective.deadlineMs) throw deadlineError();
  };

  return {
    assertActive,
    isAborted() {
      return isCancelled() || (policy.effective.deadlineMs !== null && elapsed() >= policy.effective.deadlineMs);
    },
    abortReason() {
      if (isCancelled()) return "cancelled";
      if (policy.effective.deadlineMs !== null && elapsed() >= policy.effective.deadlineMs) return "deadline-exceeded";
      return null;
    },
    checkpoint() {
      checkpointCount += 1;
      assertActive();
    },
    registerPlan(stageCount) {
      assertActive();
      plannedStageResolutions = stageCount;
      if (stageCount > policy.effective.maxStageResolutions) {
        mark("stage-limit-exceeded", "TBA-RUN-STAGE-LIMIT-LAB");
        throw limitError(
          "TBA-RUN-STAGE-LIMIT-LAB",
          `Planen kräver ${stageCount} stage-resolutioner men run-gränsen är ${policy.effective.maxStageResolutions}.`,
        );
      }
    },
    beforeChannelEvent() {
      assertActive();
      if (channelEvents >= policy.effective.maxChannelEvents) {
        mark("event-limit-exceeded", "TBA-RUN-EVENT-LIMIT-LAB");
        throw limitError(
          "TBA-RUN-EVENT-LIMIT-LAB",
          `Körningen överskred gränsen ${policy.effective.maxChannelEvents} kanalhändelser.`,
        );
      }
    },
    recordChannelEvent() {
      channelEvents += 1;
    },
    checkRender(value) {
      assertActive();
      renderBytes = new TextEncoder().encode(String(value)).byteLength;
      if (renderBytes > policy.effective.maxRenderBytes) {
        mark("render-limit-exceeded", "TBA-RUN-RENDER-LIMIT-LAB");
        throw limitError(
          "TBA-RUN-RENDER-LIMIT-LAB",
          `Renderkandidaten är ${renderBytes} UTF-8-bytes men run-gränsen är ${policy.effective.maxRenderBytes}.`,
        );
      }
    },
    recordWave({ nodeRefs, freshNodeRefs, reusedNodeRefs, mode }) {
      const fresh = [...freshNodeRefs];
      const reused = [...reusedNodeRefs];
      freshStageInvocations += fresh.length;
      resolvedStageResolutions += nodeRefs.length;
      peakConcurrency = Math.max(peakConcurrency, fresh.length);
      if (mode === "concurrent") fresh.forEach((nodeRef) => parallelizedNodeRefs.add(nodeRef));
      if (mode === "barrier") nodeRefs.forEach((nodeRef) => barrierNodeRefs.add(nodeRef));
      waves.push({
        waveId: `wave:${String(waves.length + 1).padStart(3, "0")}`,
        mode,
        nodeRefs: [...nodeRefs],
        freshNodeRefs: fresh,
        reusedNodeRefs: reused,
        commitOrder: "plan-order",
      });
    },
    markError(error) {
      if (error?.code === "TBA-RUN-CANCELLED-LAB") mark("cancelled", error.code);
      else if (error?.code === "TBA-RUN-DEADLINE-LAB") mark("deadline-exceeded", error.code);
      else if (error?.code === "TBA-RUN-STAGE-LIMIT-LAB") mark("stage-limit-exceeded", error.code);
      else if (error?.code === "TBA-RUN-EVENT-LIMIT-LAB") mark("event-limit-exceeded", error.code);
      else if (error?.code === "TBA-RUN-RENDER-LIMIT-LAB") mark("render-limit-exceeded", error.code);
      else if (error?.code === "TBA-RUN-POLICY-LAB") mark("invalid-policy", error.code);
    },
    report() {
      return {
        scheduling: {
          schema: "textabana.scheduler-report/lab-v1",
          mode: "bounded-safe-branch-concurrency",
          eligibility: "pure-deterministic-effects-free-render-only",
          maxConcurrency: policy.effective.maxParallelism,
          peakConcurrency,
          waveCount: waves.length,
          parallelizedNodeRefs: [...parallelizedNodeRefs],
          barrierNodeRefs: [...barrierNodeRefs],
          waves: waves.map((wave) => ({ ...wave, nodeRefs: [...wave.nodeRefs], freshNodeRefs: [...wave.freshNodeRefs], reusedNodeRefs: [...wave.reusedNodeRefs] })),
          commitOrder: "plan-order",
          hostMode: "single-worker-async-overlap",
          cpuParallel: false,
        },
        resources: {
          schema: "textabana.resource-report/lab-v1",
          requested: { ...policy.requested },
          effective: { ...policy.effective },
          hostCeilings: { ...policy.hostCeilings },
          enforcement: {
            deadline: "cooperative-runtime-boundary",
            stageResolutionLimit: "pre-transform-plan-gate",
            channelEventLimit: "pre-event-mutation",
            renderByteLimit: "pre-commit-render-gate",
            synchronousPreemption: false,
            cpuMemorySandbox: false,
          },
          usage: {
            elapsedMs: elapsed(),
            plannedStageResolutions,
            resolvedStageResolutions,
            freshStageInvocations,
            channelEvents,
            renderBytes,
            checkpointCount,
            peakConcurrency,
          },
          status: resourceStatus,
          diagnosticCode,
        },
      };
    },
  };
}

export function rejectedRunPolicyReport() {
  const policy = normalizeRunPolicy();
  return {
    scheduling: {
      schema: "textabana.scheduler-report/lab-v1",
      mode: "bounded-safe-branch-concurrency",
      eligibility: "pure-deterministic-effects-free-render-only",
      maxConcurrency: policy.effective.maxParallelism,
      peakConcurrency: 0,
      waveCount: 0,
      parallelizedNodeRefs: [],
      barrierNodeRefs: [],
      waves: [],
      commitOrder: "plan-order",
      hostMode: "single-worker-async-overlap",
      cpuParallel: false,
    },
    resources: {
      schema: "textabana.resource-report/lab-v1",
      requested: { ...policy.requested },
      effective: { ...policy.effective },
      hostCeilings: { ...policy.hostCeilings },
      enforcement: {
        deadline: "cooperative-runtime-boundary",
        stageResolutionLimit: "pre-transform-plan-gate",
        channelEventLimit: "pre-event-mutation",
        renderByteLimit: "pre-commit-render-gate",
        synchronousPreemption: false,
        cpuMemorySandbox: false,
      },
      usage: { elapsedMs: 0, plannedStageResolutions: 0, resolvedStageResolutions: 0, freshStageInvocations: 0, channelEvents: 0, renderBytes: 0, checkpointCount: 0, peakConcurrency: 0 },
      status: "within-limits",
      diagnosticCode: null,
    },
  };
}
