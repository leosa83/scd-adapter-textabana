import { canonicalJson, sourceHash, withoutKeys } from "./lab-values.js";
import { normalizeOperationalReferences, operationalReferenceMap } from "./result-references.js";

function buildResultEnvelope({ runId, runInstanceId, profile = "fresh", ok, status: explicitStatus, output, error, diagnostics, channels, descriptors, anchors, sourceMaps, executionTrace = [], ir, duration }) {
  const status = explicitStatus || (ok ? "succeeded" : "failed");
  const committed = ok && status === "succeeded";
  const committedChannels = committed ? channels : {};
  const channelSnapshots = Object.fromEntries(Object.entries(descriptors)
    .filter(([name]) => committed && descriptors[name].persistence !== "transient" && (committedChannels[name] || descriptors[name].required))
    .map(([name, descriptor]) => [name, { descriptor, events: committedChannels[name] || [] }]));
  const semanticReferences = operationalReferenceMap({
    runInstanceId,
    channelSnapshots,
    sourceMaps,
    activities: executionTrace,
  });
  const semanticChannelSnapshots = Object.fromEntries(Object.entries(channelSnapshots).map(([name, snapshot]) => [
    name,
    {
      descriptor: snapshot.descriptor,
      events: snapshot.events.map((event) => {
        const stable = withoutKeys(event, ["runId", "runRef", "eventId", "id", "provenanceRef"]);
        return normalizeOperationalReferences(
          { ...stable, origin: withoutKeys(event.origin, ["stageId", "invocationId"]) },
          semanticReferences,
        );
      }),
    },
  ]));
  const semanticSeed = canonicalJson({
    status,
    source: ir?.sourceRef || null,
    output: committed ? output : "",
    channels: semanticChannelSnapshots,
    diagnostics: diagnostics.map((diagnostic) => withoutKeys(diagnostic, ["diagnosticId"])),
  });
  const cacheProvenanceEntities = new Map();
  if (committed) {
    for (const step of executionTrace) {
      if (step.functionInvoked !== false || !step.cache?.cacheEntryId) continue;
      cacheProvenanceEntities.set(step.cache.cacheEntryId, {
        entityId: step.cache.cacheEntryId,
        entityType: "cached-stage-output",
        planNodeRef: step.planNodeRef,
        outputDigest: step.cache.outputDigest,
        semanticOutputDigest: step.output.digest,
        evidenceRefs: step.cache.evidenceRefs || [],
      });
      for (const evidence of step.cache.evidenceRecords || []) {
        cacheProvenanceEntities.set(evidence.evidenceId, {
          entityId: evidence.evidenceId,
          entityType: "cache-observation",
          runRef: evidence.runRef,
          documentRevision: evidence.documentRevision,
          documentVersion: evidence.documentVersion,
          planNodeRef: step.planNodeRef,
          outputDigest: evidence.outputDigest,
        });
      }
    }
  }
  return {
    schema: "textabana.result/lab-v1",
    resultId: `lab:${sourceHash(semanticSeed)}`,
    run: {
      runId: `run:${runId}`,
      instanceId: runInstanceId,
      profile,
      status,
      committed,
    },
    source: ir?.sourceRef || null,
    render: {
      kind: "text",
      mediaType: "text/markdown",
      data: committed ? output : "",
    },
    channelSnapshots,
    anchors: committed ? anchors : [],
    sourceMaps: committed ? sourceMaps : [],
    artifacts: [],
    provenance: {
      entities: [...cacheProvenanceEntities.values()],
      activities: committed ? executionTrace.map((step) => ({
        activityId: step.activityId,
        runRef: step.runRef,
        planNodeRef: step.planNodeRef,
        stageId: step.stageId,
        invocationId: step.invocationId,
        function: step.function,
        orderKey: step.orderKey,
        activityType: step.functionInvoked === false ? "cache-materialization" : "transform-invocation",
        executionMode: step.executionMode || "fresh-transform",
        functionInvoked: step.functionInvoked !== false,
        ...(step.functionInvoked === false && step.cache?.cacheEntryId ? {
          cacheEntryRef: step.cache.cacheEntryId,
          evidenceRefs: step.cache.evidenceRefs || [],
        } : {}),
      })) : [],
      agents: [],
    },
    diagnostics,
    hashes: {
      ir: ir ? `fnv1a:${sourceHash(JSON.stringify(ir))}` : null,
      environment: "lab:web-worker:0.7-subset",
    },
    extensions: {
      "textabana.playground": {
        canonical: false,
        note: "Interaktiv Interop 0.7-subset med language-core 0.4 och typed IR lab-v2; använd inte som full profilkonformitet.",
        duration,
        ...(error ? { error } : {}),
      },
    },
  };
}

export { buildResultEnvelope };

