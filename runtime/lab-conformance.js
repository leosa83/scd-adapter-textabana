import { adapterManifests, allCommittedEvents, playgroundImplementedCapabilities } from "./adapters.js";
import { canonicalJson, canonicalValue, normalizePath, sourceHash, uniqueStrings, withoutKeys } from "./lab-values.js";
import { cancellationDiagnosticCode } from "./runtime-errors.js";

function buildCapabilities(inspection) {
  return {
    schema: "textabana.capabilities/lab-v1",
    optionalProfiles: [{ profile: "textabana.semantic-artifacts/v1", activation: "options.semanticIdentity=true", available: Boolean(globalThis.crypto?.subtle), scope: "source-bound-artifact-identity", fullRuntimeConformance: false }],
    profiles: {
      "language-core/0.4": "playground-subset",
      "runtime-json/1": "playground-subset",
      "editor/1": "playground-subset",
      "adapter-contract/1": "playground-subset",
      "data/1": "playground-subset",
      "notebook/1": "playground-subset",
      "annotation/1": "playground-subset",
      "ml-lineage/1": "contract-only",
    },
    adapters: adapterManifests.map((manifest) => ({
      adapterId: manifest.adapterId,
      version: manifest.version,
      profile: manifest.profile,
      support: manifest.support,
      manifestDigest: manifest.manifestDigest,
    })),
    limits: {
      digest: "fnv1a-lab-non-cryptographic",
      channelPayload: "structured-clone-compatible JSON subset",
      cancellation: "cooperative runtime boundaries; synchronous transforms and never-settling promises are not preempted",
      scheduler: "bounded async overlap in one browser worker; plan-order commit",
      runBudgets: "stage resolutions, channel events, render UTF-8 bytes and optional cooperative deadline",
      artifacts: "inline control plane only",
    },
    valueKinds: ["text", "object", "array", "number", "boolean", "null"],
    runtimes: [{ id: "browser-worker", support: "playground-subset", moduleLanguage: "javascript" }],
    extensions: { namespace: "textabana.playground", canonical: false },
    implemented: playgroundImplementedCapabilities,
    unsupported: [...new Set([
      ...(inspection?.unsupported || []),
      "cached-event-replay",
      "streaming-execution",
      "persistent-document-history",
      "collaborative-merge",
      "canonical-structural-reanchor",
      "fuzzy-reanchor",
      "lsp",
      "preemptive-synchronous-cancellation",
      "multicore-stage-execution",
      "effectful-branch-concurrency",
      "preemptive-synchronous-timeout",
      "hard-cpu-quota",
      "hard-memory-quota",
      "external-side-effect-rollback",
      "artifacts",
      "adapter-dependency-graph",
      "stateful-adapters",
      "sink-bindings",
      "arrow-ipc",
      "parquet",
      "duckdb",
      "artifact-store",
      "openlineage-export",
      "jupyter-messaging",
      "nbformat-roundtrip",
      "session-kernel-execution",
      "attached-kernel-execution",
      "jupyter-comms-widgets",
      "model-invocation",
      "persistent-review-store",
      "w3c-prov",
      "label-studio-api-roundtrip",
      "doccano-prodigy-brat",
      "mlflow-export",
      "otel-correlation",
    ])],
  };
}

const negativeConformanceFixtures = [
  {
    fixtureId: "failed-run",
    caseId: "negative-undeclared-channel",
    expectedOutcome: "failed",
    expectedDiagnosticCode: "TBA-TYPE-CHANNEL-LAB",
    purpose: "En odeklarerad kanal måste stoppas atomiskt i strict mode.",
  },
  {
    fixtureId: "negative-unknown-function",
    caseId: "negative-unknown-function",
    expectedOutcome: "failed",
    expectedDiagnosticCode: "TBA-RUN-LAB",
    purpose: "En okänd funktion får inte ge ett partiellt resultat.",
  },
  {
    fixtureId: "negative-unclosed-block",
    caseId: "negative-unclosed-block",
    expectedOutcome: "failed",
    expectedDiagnosticCode: "TBA-PARSE-BLOCK-UNCLOSED-LAB",
    purpose: "En obalanserad blockmarkör måste ge ett positionsbundet parse-fel.",
  },
];

const conformanceCases = new Map([
  ["conformance-golden", { caseId: "golden-core-chain", expectedOutcome: "succeeded" }],
  ["cancellation-probe", { caseId: "cooperative-cancellation", expectedOutcome: "cancelled", expectedDiagnosticCode: cancellationDiagnosticCode }],
  ...negativeConformanceFixtures.map((fixture) => [fixture.fixtureId, fixture]),
]);

const conformanceGoldenBaselines = {
  "conformance-golden": "fnv1a-lab:s960f",
};

const conformanceProfileOrder = [
  "language-core/0.4",
  "runtime-json/1",
  "editor/1",
  "adapter-contract/1",
  "data/1",
  "notebook/1",
  "annotation/1",
  "ml-lineage/1",
];

function conformanceRequirement(requirementId, status, message, evidenceRefs = []) {
  return { requirementId, status, message, evidenceRefs: uniqueStrings(evidenceRefs) };
}

function checkedRequirement(requirementId, condition, passMessage, failMessage, evidenceRefs = []) {
  return conformanceRequirement(requirementId, condition ? "passed" : "failed", condition ? passMessage : failMessage, evidenceRefs);
}

function notRunRequirement(requirementId, message) {
  return conformanceRequirement(requirementId, "not-run", message, []);
}

function profileResult(profile, declaredSupport, applicable, requirements) {
  const failed = requirements.some((requirement) => requirement.status === "failed");
  const passed = requirements.length > 0 && requirements.every((requirement) => requirement.status === "passed");
  const status = applicable ? (failed ? "failed" : passed ? "passed" : "not-run") : "not-run";
  const derivedSupport = status === "failed"
    ? "unsupported"
    : status !== "passed"
      ? null
      : declaredSupport === "contract-only"
        ? "contract-only"
        : "playground-subset";
  return {
    profile,
    declaredSupport,
    status,
    derivedSupport,
    applicable,
    claimable: status === "passed" && derivedSupport === "playground-subset",
    requirements,
  };
}

function committedBindingsResolve(result) {
  const events = allCommittedEvents(result);
  const anchors = new Set((result.anchors || []).map((anchor) => anchor.anchorId));
  const mappings = new Map((result.sourceMaps || []).map((mapping) => [mapping.outputRef, mapping]));
  const activities = new Set((result.provenance?.activities || []).map((activity) => activity.activityId));
  return events.every((event) => {
    const mapping = mappings.get(event.eventId);
    return anchors.has(event.target?.anchorRef)
      && mapping
      && mapping.inputAnchorRefs?.every((anchorRef) => anchors.has(anchorRef))
      && activities.has(event.provenanceRef)
      && mapping.generatingActivity === event.provenanceRef;
  });
}

function cacheProvenanceResolves(result) {
  const entities = result.provenance?.entities || [];
  const entityById = new Map(entities.map((entity) => [entity.entityId, entity]));
  if (entityById.size !== entities.length) return false;
  const materializations = (result.provenance?.activities || []).filter((activity) => activity.activityType === "cache-materialization");
  return materializations.every((activity) => {
    const cacheEntity = entityById.get(activity.cacheEntryRef);
    const evidenceRefs = activity.evidenceRefs || [];
    if (cacheEntity?.entityType !== "cached-stage-output"
      || cacheEntity.planNodeRef !== activity.planNodeRef
      || evidenceRefs.length !== 2
      || new Set(evidenceRefs).size !== evidenceRefs.length
      || JSON.stringify(cacheEntity.evidenceRefs || []) !== JSON.stringify(evidenceRefs)) return false;
    return evidenceRefs.every((evidenceRef) => {
      const evidence = entityById.get(evidenceRef);
      return evidence?.entityType === "cache-observation"
        && evidence.planNodeRef === cacheEntity.planNodeRef
        && evidence.outputDigest === cacheEntity.outputDigest
        && typeof evidence.runRef === "string"
        && evidence.runRef.length > 0;
    });
  });
}

function buildStructuralSnapshot({ result, inspection, plan, executionTrace = [], adapterRun, capabilities, modules }) {
  const channels = Object.fromEntries(Object.entries(result.channelSnapshots || {}).map(([name, snapshot]) => [
    name,
    {
      descriptor: snapshot.descriptor,
      events: (snapshot.events || []).map((event) => ({
        sequence: event.sequence,
        channel: event.channel,
        kind: event.kind,
        target: event.target,
        payload: event.payload,
        source: event.source,
        origin: withoutKeys(event.origin, ["stageId", "invocationId"]),
        state: event.state,
      })),
    },
  ]));
  const normalizedExecutionTrace = executionTrace.map((step) => ({
    ...withoutKeys(step, ["duration", "runRef", "stageId", "invocationId", "activityId", "executionMode", "functionInvoked"]),
    cache: step.cache ? {
      eligibility: step.cache.eligibility,
      staticKey: step.cache.staticKey,
      semanticKey: step.cache.semanticKey,
    } : null,
  }));
  return canonicalValue({
    normalization: {
      policy: "textabana.structural-snapshot/lab-v1",
      ignoredPaths: [
        "/transport/runId",
        "/result/extensions/textabana.playground/duration",
        "/events/*/runId",
        "/events/*/runRef",
        "/events/*/eventId",
        "/events/*/id",
        "/events/*/provenanceRef",
        "/events/*/origin/{stageId,invocationId}",
        "/executionTrace/*/duration",
        "/executionTrace/*/runRef",
        "/executionTrace/*/stageId",
        "/executionTrace/*/executionMode",
        "/executionTrace/*/functionInvoked",
        "/executionTrace/*/cache/{mode,read,write,hit,reused,lookup,reason,evidence,verification}",
        "/result/anchors/*/origin/{stageId,invocationId}",
        "/result/sourceMaps/*/{mappingId,outputRef,generatingActivity}",
        "/adapterRun/adapterRunId",
        "/diagnostics/*/diagnosticId",
        "/cancellation/cancelToken",
      ],
    },
    source: result.source,
    modules: [...(modules || [])]
      .map((module) => ({ path: normalizePath(module.path), digest: `fnv1a-lab:${sourceHash(String(module.content || ""))}` }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    ir: inspection ? {
      schema: inspection.schema,
      languageVersion: inspection.languageVersion,
      parser: inspection.parser,
      sourceRef: inspection.sourceRef,
      sourceSpan: inspection.sourceSpan,
      validity: inspection.validity,
      configuration: inspection.configuration,
      syntax: {
        cst: {
          schema: inspection.syntax?.cst?.schema,
          grammarVersion: inspection.syntax?.cst?.grammarVersion,
          lossless: inspection.syntax?.cst?.lossless,
        },
        ast: {
          schema: inspection.syntax?.ast?.schema,
          grammarVersion: inspection.syntax?.ast?.grammarVersion,
          executable: inspection.syntax?.ast?.executable,
        },
      },
      nodes: inspection.nodes.map((node) => withoutKeys(node, ["nodeId"])),
      scopes: inspection.scopes,
      blocks: inspection.blocks,
      directives: inspection.directives,
      unsupported: inspection.unsupported,
    } : null,
    plan: plan ? {
      schema: plan.schema,
      languageVersion: plan.languageVersion,
      sourceRef: plan.sourceRef,
      constructionPhase: plan.constructionPhase,
      deterministic: plan.deterministic,
      graph: plan.graph,
      runtimePolicy: plan.runtimePolicy,
      unsupported: plan.unsupported,
    } : null,
    executionTrace: normalizedExecutionTrace,
    result: {
      schema: result.schema,
      resultId: result.resultId,
      status: result.run.status,
      committed: result.run.committed,
      render: { kind: result.render.kind, mediaType: result.render.mediaType, digest: `fnv1a-lab:${sourceHash(String(result.render.data || ""))}` },
      channels,
      anchors: result.anchors.map((anchor) => ({
        ...anchor,
        origin: withoutKeys(anchor.origin, ["stageId", "invocationId"]),
      })),
      sourceMaps: result.sourceMaps.map((mapping) => withoutKeys(mapping, ["mappingId", "outputRef", "generatingActivity"])),
      diagnostics: (result.diagnostics || []).map((diagnostic) => withoutKeys(diagnostic, ["diagnosticId"])),
    },
    projection: adapterRun ? {
      status: adapterRun.status,
      immutable: adapterRun.verification?.immutable === true,
      manifests: adapterRun.manifests.map((manifest) => ({ adapterId: manifest.adapterId, version: manifest.version, profile: manifest.profile, support: manifest.support, manifestDigest: manifest.manifestDigest })),
      projections: adapterRun.projections.map((projection) => ({
        adapterId: projection.adapterRef.adapterId,
        projectionId: projection.projectionId,
        status: projection.status,
        outputDigest: projection.output ? `fnv1a-lab:${sourceHash(canonicalJson(projection.output))}` : null,
        fidelity: projection.fidelity,
      })),
    } : null,
    capabilities: {
      profiles: capabilities.profiles,
      implemented: capabilities.implemented,
      unsupported: capabilities.unsupported,
      limits: capabilities.limits,
    },
  });
}

function buildConformanceReport({ fixtureId = "ad-hoc", result, inspection, plan, executionTrace = [], adapterRun, capabilities, modules }) {
  const knownCase = conformanceCases.get(fixtureId);
  const expected = knownCase || { caseId: fixtureId === "ad-hoc" ? "ad-hoc-success" : `unregistered:${fixtureId}`, expectedOutcome: "succeeded" };
  const actualOutcome = ["succeeded", "failed", "cancelled"].includes(result.run.status) ? result.run.status : "failed";
  const isSuccessful = actualOutcome === "succeeded" && result.run.committed;
  const isTerminalWithoutCommit = actualOutcome !== "succeeded" && !result.run.committed
    && result.render.data === ""
    && Object.keys(result.channelSnapshots || {}).length === 0
    && (result.anchors || []).length === 0
    && (result.sourceMaps || []).length === 0
    && (result.provenance?.activities || []).length === 0;
  const diagnosticCodes = (result.diagnostics || []).map((diagnostic) => diagnostic.code).filter(Boolean);
  const events = allCommittedEvents(result);
  const channelNames = Object.keys(result.channelSnapshots || {});
  const projectionFor = (profile) => adapterRun?.projections.find((projection) => {
    const manifest = adapterRun.manifests.find((candidate) => candidate.adapterId === projection.adapterRef.adapterId);
    return manifest?.profile === profile;
  });
  const resultRef = result.resultId;
  const irRef = inspection?.sourceRef?.version || "ir:not-produced";
  const planRef = plan?.schema || "plan:not-produced";
  const adapterRef = adapterRun?.sourceResultRef || "adapter:not-run";

  const languageApplicable = isSuccessful;
  const languageRequirements = languageApplicable ? [
    checkedRequirement("LANG-SOURCE-IR", Boolean(inspection && inspection.sourceRef?.version === result.source?.version), "IR är bunden till exakt source snapshot.", "IR saknas eller pekar på en annan source snapshot.", [irRef, result.source?.version]),
    checkedRequirement("LANG-DETERMINISTIC-PLAN", Boolean(plan?.deterministic && executionTrace.every((step) => step.status === "succeeded") && executionTrace.length === plan.graph.nodes.filter((node) => node.kind === "stage").length), "Pre-execution-grafen har deterministisk ordning och varje stage bands till en lyckad trace-post.", "Planen saknas, grafordningen är icke-deterministisk eller trace är ofullständig.", [planRef]),
    checkedRequirement("LANG-SYNTAX-ERASED", Boolean(inspection?.validity?.executable && inspection?.syntax?.cst?.lossless), "Authored kontrollsyntax sänktes från en lossless CST och bara literal/genererad markörtext kan finnas i renderingen.", "Parserprojektionen är ogiltig eller kunde inte verifiera lossless source coverage.", [resultRef]),
  ] : [notRunRequirement("LANG-ACTIVE-SUCCESS", "Language-profilen verifieras endast på en lyckad core run; detta case verifierar terminalfel.")];

  const runtimeRequirements = [
    checkedRequirement("RUNTIME-RESULT-SCHEMA", result.schema === "textabana.result/lab-v1", "Result-envelope har förväntat playgroundschema.", "Result-envelope saknar förväntat schema.", [resultRef]),
    checkedRequirement("RUNTIME-ATOMIC-TERMINAL", isSuccessful || isTerminalWithoutCommit, "Terminalstatus och commitgräns är atomiskt konsistenta.", "Terminalstatus läckte render, channels, anchors, SourceMaps eller provenance.", [resultRef]),
    checkedRequirement("RUNTIME-DESCRIPTORS", !isSuccessful || Object.values(result.channelSnapshots || {}).every((snapshot) => snapshot.descriptor?.declared !== false && snapshot.events.every((event) => event.state === "committed")), "Alla durable snapshots har deklarerade descriptors och committed events.", "Ett committed snapshot saknar descriptor eller innehåller tentative events.", [resultRef]),
    checkedRequirement("RUNTIME-CACHE-PROVENANCE", cacheProvenanceResolves(result), "Varje cachematerialisering har två unika, resolverbara och outputbundna observationsposter.", "En cachematerialisering saknar exakt matchande och resolverbara observationsposter.", [resultRef]),
  ];

  const editorApplicable = isSuccessful && events.length > 0;
  const editorRequirements = editorApplicable ? [
    checkedRequirement("EDITOR-BINDINGS", committedBindingsResolve(result), "Varje event löser till Anchor, SourceMap och provenanceaktivitet.", "Minst ett event har en oresolverbar Anchor-, SourceMap- eller provenance-referens.", [resultRef]),
    checkedRequirement("EDITOR-POSITIONS", events.every((event) => Number.isInteger(event.line) && event.line > 0 && event.target?.anchorRef), "Alla events har fysisk line och logisk anchorRef.", "Ett event saknar line eller anchorRef.", events.map((event) => event.target?.anchorRef)),
  ] : [notRunRequirement("EDITOR-EVENTS", "Aktuell fixture emitterade inga positionsbundna events.")];

  const contractApplicable = isSuccessful;
  const resultSummary = projectionFor("adapter-contract/1");
  const contractOnlySucceeded = adapterRun?.projections.some((projection) => {
    const manifest = adapterRun.manifests.find((candidate) => candidate.adapterId === projection.adapterRef.adapterId);
    return manifest?.support === "contract-only" && projection.status === "succeeded";
  });
  const adapterRequirements = contractApplicable ? [
    checkedRequirement("ADAPTER-IMMUTABLE", adapterRun?.verification?.immutable === true && adapterRun.verification.beforeDigest === adapterRun.verification.afterDigest, "Post-commit fan-out lämnade canonical Result byte-ekvivalent.", "Adapterkörningen muterade eller kunde inte verifiera sitt source result.", [adapterRef]),
    checkedRequirement("ADAPTER-REFERENCE", resultSummary?.status === "succeeded" && resultSummary.sourceResultRef.resultId === resultRef, "Referensadaptern gav en source-bound projektion.", "Referensadaptern saknas, misslyckades eller pekar på fel resultat.", [resultSummary?.projectionId, resultRef]),
    checkedRequirement("ADAPTER-CONTRACT-BOUNDARY", !contractOnlySucceeded, "Contract-only-adaptrar producerade ingen fabricerad output.", "En contract-only-adapter producerade en lyckad projektion.", adapterRun?.manifests.filter((manifest) => manifest.support === "contract-only").map((manifest) => manifest.adapterId)),
    checkedRequirement("ADAPTER-NO-FAILED-PROJECTION", !adapterRun?.projections.some((projection) => projection.status === "failed"), "Ingen begärd adapterprojektion misslyckades.", "Minst en begärd adapterprojektion misslyckades.", [adapterRef, ...(adapterRun?.projections.filter((projection) => projection.status === "failed").map((projection) => projection.projectionId) || [])]),
  ] : [notRunRequirement("ADAPTER-POST-COMMIT", "Adapters är korrekt skippade när core run inte committar.")];

  const domainProfile = (profile, prefix, requirementId) => {
    const applicable = isSuccessful && channelNames.some((name) => name.startsWith(prefix));
    const projection = projectionFor(profile);
    const requirements = applicable ? [
      checkedRequirement(requirementId, projection?.status === "succeeded" && projection.sourceResultRef.resultId === resultRef, `${profile} producerade en verifierad source-bound projektion.`, `${profile} saknar en lyckad source-bound projektion.`, [projection?.projectionId, resultRef]),
    ] : [notRunRequirement(requirementId, `Aktuell fixture emitterade inga ${prefix}*-kanaler.`)];
    return { applicable, requirements };
  };
  const data = domainProfile("data/1", "data.", "DATA-PROJECTION");
  const notebook = domainProfile("notebook/1", "notebook.", "NOTEBOOK-PROJECTION");
  const annotation = domainProfile("annotation/1", "annotation.", "ANNOTATION-PROJECTION");
  const mlManifest = adapterRun?.manifests.find((manifest) => manifest.profile === "ml-lineage/1");
  const mlProjection = projectionFor("ml-lineage/1");
  const mlRequirements = [
    checkedRequirement("ML-CONTRACT-ONLY", mlManifest?.support === "contract-only" && mlProjection?.status !== "succeeded", "ml-lineage/1 stannar vid en deklarerad, icke-claimable kontraktsgräns.", "ml-lineage/1 saknar contract-only-markering eller fabricerade en lyckad projektion.", [mlManifest?.adapterId, mlProjection?.projectionId]),
  ];

  const profiles = [
    profileResult("language-core/0.4", capabilities.profiles["language-core/0.4"], languageApplicable, languageRequirements),
    profileResult("runtime-json/1", capabilities.profiles["runtime-json/1"], true, runtimeRequirements),
    profileResult("editor/1", capabilities.profiles["editor/1"], editorApplicable, editorRequirements),
    profileResult("adapter-contract/1", capabilities.profiles["adapter-contract/1"], contractApplicable, adapterRequirements),
    profileResult("data/1", capabilities.profiles["data/1"], data.applicable, data.requirements),
    profileResult("notebook/1", capabilities.profiles["notebook/1"], notebook.applicable, notebook.requirements),
    profileResult("annotation/1", capabilities.profiles["annotation/1"], annotation.applicable, annotation.requirements),
    profileResult("ml-lineage/1", capabilities.profiles["ml-lineage/1"], true, mlRequirements),
  ];

  const stages = [
    { stage: "source", status: result.source ? "passed" : "failed", message: result.source ? "Versionerad source snapshot finns." : "Source snapshot saknas.", evidenceRefs: result.source ? [result.source.version] : [] },
    { stage: "ir", status: inspection ? "passed" : "failed", message: inspection ? "IR-projektion producerades." : "IR-projektion saknas.", evidenceRefs: inspection ? [inspection.schema, inspection.sourceRef.version] : [] },
    { stage: "plan", status: isSuccessful ? (plan?.deterministic && executionTrace.every((step) => step.status === "succeeded") && executionTrace.length === plan.graph.nodes.filter((node) => node.kind === "stage").length ? "passed" : "failed") : "not-run", message: isSuccessful ? "Pre-execution-grafen verifierades mot en komplett lyckad trace." : "Planclaim görs inte för terminalt felcase.", evidenceRefs: plan ? [plan.schema, plan.graph.graphId] : [] },
    { stage: "result", status: isSuccessful || isTerminalWithoutCommit ? "passed" : "failed", message: isSuccessful ? "Resultatet är atomiskt committed." : isTerminalWithoutCommit ? "Terminalfelet rullade tillbaka all durable output." : "Resultatgränsen är inkonsistent.", evidenceRefs: [resultRef] },
    { stage: "projection", status: isSuccessful ? (adapterRun?.verification?.immutable ? "passed" : "failed") : "not-run", message: isSuccessful ? "Post-commit-projektioner kördes isolerat." : "Adapters skippades före commit.", evidenceRefs: adapterRun ? [adapterRef] : [] },
  ];

  const caseRequirements = [
    checkedRequirement("CASE-OUTCOME", actualOutcome === expected.expectedOutcome, `Caset gav förväntad terminalstatus ${expected.expectedOutcome}.`, `Caset väntade ${expected.expectedOutcome} men gav ${actualOutcome}.`, [resultRef]),
    ...(expected.expectedDiagnosticCode ? [checkedRequirement("CASE-DIAGNOSTIC", diagnosticCodes.includes(expected.expectedDiagnosticCode), `Förväntad diagnostikkod ${expected.expectedDiagnosticCode} observerades.`, `Förväntad diagnostikkod ${expected.expectedDiagnosticCode} saknas.`, diagnosticCodes)] : []),
  ];

  const structuralSnapshot = buildStructuralSnapshot({ result, inspection, plan, executionTrace, adapterRun, capabilities, modules });
  const structuralDigest = `fnv1a-lab:${sourceHash(canonicalJson(structuralSnapshot))}`;
  const expectedStructuralDigest = conformanceGoldenBaselines[fixtureId] || null;
  const goldenStatus = expectedStructuralDigest
    ? expectedStructuralDigest === structuralDigest ? "passed" : "failed"
    : "not-run";
  if (expectedStructuralDigest) {
    caseRequirements.push(checkedRequirement("GOLDEN-STRUCTURE", goldenStatus === "passed", "Aktuell normaliserad struktur matchar den versionssatta golden-baselinen.", "Aktuell struktur avviker från den versionssatta golden-baselinen.", [expectedStructuralDigest, structuralDigest]));
  }

  const cancellationRequested = expected.expectedOutcome === "cancelled" || actualOutcome === "cancelled";
  const cancellationObserved = actualOutcome === "cancelled" && diagnosticCodes.includes(cancellationDiagnosticCode) && isTerminalWithoutCommit;
  const cancellation = {
    support: "cooperative-runtime-boundary",
    status: cancellationRequested ? cancellationObserved ? "passed" : "failed" : "not-run",
    requested: cancellationRequested,
    observed: cancellationObserved,
    diagnosticCode: cancellationDiagnosticCode,
    limitation: "Avbrytning och valfri deadline kontrolleras vid runtime-/checkpointgränser; synkrona CPU-loopar och aldrig settlande Promises preempteras inte och externa sidoeffekter kan inte rullas tillbaka.",
  };
  if (cancellation.status === "failed") caseRequirements.push(conformanceRequirement("CANCELLATION-ATOMIC", "failed", "Cancellation nådde inte en atomisk cancelled-terminalstatus.", [resultRef]));

  const profileBlockers = profiles.flatMap((profile) => profile.requirements.filter((requirement) => requirement.status === "failed").map((requirement) => requirement.requirementId));
  const caseBlockers = caseRequirements.filter((requirement) => requirement.status === "failed").map((requirement) => requirement.requirementId);
  const stageBlockers = stages.filter((stage) => stage.status === "failed").map((stage) => `STAGE-${stage.stage.toUpperCase()}`);
  const blockingRequirementIds = uniqueStrings([...caseBlockers, ...profileBlockers, ...stageBlockers]);
  const counts = profiles.reduce((summary, profile) => ({ ...summary, [profile.status]: summary[profile.status] + 1 }), { passed: 0, failed: 0, "not-run": 0 });
  const reportSeed = {
    suite: "textabana.playground/interop-0.7",
    suiteVersion: "1.4.0-lab.1",
    fixtureId,
    caseId: expected.caseId,
    sourceResultRef: resultRef,
    structuralDigest,
    profiles: profiles.map((profile) => ({ profile: profile.profile, status: profile.status, derivedSupport: profile.derivedSupport, claimable: profile.claimable })),
    gate: blockingRequirementIds,
  };
  return {
    schema: "textabana.conformance-report/lab-v1",
    reportId: `conformance:${sourceHash(canonicalJson(reportSeed))}`,
    sourceResultRef: resultRef,
    suite: { suiteId: "textabana.playground/interop-0.7", version: "1.4.0-lab.1" },
    case: {
      caseId: expected.caseId,
      fixtureId,
      expectedOutcome: expected.expectedOutcome,
      actualOutcome,
      ...(expected.expectedDiagnosticCode ? { expectedDiagnosticCode: expected.expectedDiagnosticCode } : {}),
      registered: Boolean(knownCase || fixtureId === "ad-hoc"),
      requirements: caseRequirements,
    },
    selectedProfiles: conformanceProfileOrder,
    profiles,
    stages,
    normalization: structuralSnapshot.normalization,
    structuralSnapshot,
    structuralDigest,
    golden: {
      baselineId: expectedStructuralDigest ? `${fixtureId}@1.5.0-lab.1` : null,
      expectedStructuralDigest,
      actualStructuralDigest: structuralDigest,
      status: goldenStatus,
    },
    negativeFixtures: negativeConformanceFixtures,
    cancellation,
    summary: {
      passed: counts.passed,
      failed: counts.failed,
      notRun: counts["not-run"],
      claimableProfiles: profiles.filter((profile) => profile.claimable).map((profile) => profile.profile),
    },
    gate: { status: blockingRequirementIds.length ? "failed" : "passed", blockingRequirementIds },
    extensions: {
      "textabana.playground": {
        canonical: false,
        fullConformance: false,
        digestAlgorithm: "fnv1a-lab-non-cryptographic",
        note: "Rapporten verifierar endast aktiv fixture och deklarerade playground-subsets; den känner inte CI-status och utgör inte full profilkonformitet.",
      },
    },
  };
}

export { buildCapabilities, buildConformanceReport };

