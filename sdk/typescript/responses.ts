/** Current lab wire responses. Static types do not validate an untrusted transport. */
import type { KernelCommand } from "./protocol";
import type { EditorKernelRun, EditorMetadataDelta, RuntimeDiagnostic, RuntimeInspection, RuntimeResult, ResultEnvelope } from "./runtime-types";

export type EditorCapabilities = EditorKernelRun["capabilities"];

export interface DocumentSnapshot {
  schema: "textabana.document-snapshot/lab-v1";
  sessionId: string;
  documentId: string;
  path: string;
  documentRevision: number;
  documentVersion: string;
  publishedRevision: number | null;
  characters: number;
}

export interface ChangeSetResult {
  schema: "textabana.change-set-result/lab-v1";
  changeSetId: string;
  status: "accepted";
  documentId: string;
  coordinateUnit: "unicode-code-point";
  baseRevision: number;
  documentRevision: number;
  baseDocumentVersion: string;
  documentVersion: string;
  changes: Array<{ range: { from: number; to: number }; insertedCharacters: number; removedCharacters: number; insertDigest: string; removedDigest: string }>;
  parserChanges: Array<{ fromA: number; toA: number; fromB: number; toB: number }>;
}

export interface Subscription {
  schema: "textabana.editor-subscription/lab-v1";
  subscriptionId: string;
  sessionId: string;
  documentId: string;
  channels: string[];
  delivery: "snapshot-then-delta" | "stream";
  credit: number;
  cursor: number;
}

export interface CacheObservation {
  documentRevision: number;
  documentVersion: string;
  outputDigest: string;
  runRef: string;
  evidenceId: string;
}
export interface CacheEntry {
  schema: "textabana.stage-cache-entry/lab-v1";
  nodeId: string;
  semanticKey: string;
  witness: string;
  cacheEntryId: string;
  output: { ok: true; wire: string; bytes: number; digest: string } | null;
  observations: CacheObservation[];
  verified: boolean;
  lastRunId?: number;
}
/** Portable cache only; does not contain persistent document history. */
export interface StageCacheCheckpoint {
  schema: "textabana.stage-cache-checkpoint/lab-v1";
  sourceSessionId: string;
  sourceVersion: number;
  entries: Array<[string, CacheEntry]>;
  quarantined: Array<[string, { nodeId: string; semanticKey: string; witness: string; reason: string; runId?: number }]>;
  digest: string;
  bytes: number;
}

export interface ProtocolSuccess<C extends KernelCommand> {
  type: "kernel-response";
  schema: "textabana.editor-kernel-response/lab-v1";
  protocol: "textabana.editor-kernel/lab-v1";
  requestId: string | null;
  command: C;
  ok: true;
  capabilities: EditorCapabilities;
}
export type OpenResponse = ProtocolSuccess<"open"> & { status: "opened" | "replaced" | "unchanged"; document: DocumentSnapshot };
export type ChangeResponse = ProtocolSuccess<"change"> & { document: DocumentSnapshot } & (
  { status: "accepted"; change: ChangeSetResult } | { status: "unchanged"; change: null }
);
export type AnalyzeResponse = ProtocolSuccess<"analyze"> & {
  status: "valid" | "recovered";
  document: DocumentSnapshot;
  analysis: {
    schema: "textabana.editor-analysis/lab-v1";
    documentRevision: number;
    documentVersion: string;
    executable: boolean;
    inspection: RuntimeInspection;
    diagnostics: RuntimeDiagnostic[];
    reuse: "fresh" | "compiled-snapshot" | "incremental-tree";
  };
};
export type SubscribeResponse = ProtocolSuccess<"subscribe"> & { status: "subscribed"; subscription: Subscription; document: DocumentSnapshot };
export type CreditResponse = ProtocolSuccess<"credit"> & { status: "credited"; delivered: number; pending: number; subscription: Subscription };
export type CacheExportResponse = ProtocolSuccess<"cache-export"> & { status: "exported"; document: DocumentSnapshot; checkpoint: StageCacheCheckpoint };
export type CacheImportResponse = ProtocolSuccess<"cache-import"> & { status: "imported"; document: DocumentSnapshot; cacheVersion: number };
export type CancelResponse = ProtocolSuccess<"cancel"> & { runId: number; accepted: boolean };
export type RunResponse = RuntimeResult & { type: "run-result"; requestId: string | null; runId: number; ok: true; resultEnvelope: ResultEnvelope; editorKernel: EditorKernelRun };

/** Successful resolutions only: ok:false messages reject the TypeScript promise. */
export interface CommandResponses {
  open: OpenResponse;
  change: ChangeResponse;
  analyze: AnalyzeResponse;
  subscribe: SubscribeResponse;
  credit: CreditResponse;
  "cache-export": CacheExportResponse;
  "cache-import": CacheImportResponse;
  run: RunResponse;
  cancel: CancelResponse;
}
export type CommandResponse = CommandResponses[keyof CommandResponses];
export interface ProtocolFailure {
  type: "kernel-response";
  schema: "textabana.editor-kernel-response/lab-v1";
  protocol: "textabana.editor-kernel/lab-v1";
  requestId: string | null;
  command: KernelCommand;
  ok: false;
  error: { code: string; message: string; details: Record<string, unknown> };
  capabilities: EditorCapabilities;
}
export type RunFailure = RuntimeResult & { type: "run-result"; requestId: string | null; runId: number; ok: false; error: string; editorKernel: EditorKernelRun };
export interface TransportFailure {
  type: "transport-error";
  ok: false;
  requestId?: string | null;
  error: { message: string; code?: string };
}
export type KernelFailure = ProtocolFailure | RunFailure | TransportFailure;

type DeltaCollections = EditorMetadataDelta["collections"];
/** Collection and value stay correlated when narrowing by collection. */
export type MetadataChunk = {
  [K in keyof DeltaCollections]: {
    type: "metadata-chunk";
    schema: "textabana.metadata-stream/lab-v1";
    subscriptionId: string;
    cursor: string;
    collection: K;
    value: DeltaCollections[K][number];
    sequence: number;
    total: number;
    done: boolean;
  }
}[keyof DeltaCollections];
export type KernelMessage = CommandResponse | KernelFailure | MetadataChunk;
