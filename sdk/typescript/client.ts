import type { CommandResponses, MetadataChunk, KernelFailure } from "./responses";
import type { KernelCommand, KernelTransport, ModuleLock, ModulePackage, TextChange } from "./protocol";

type Pending = { resolve(value: unknown): void; reject(reason: Error): void };

/** Failed kernel response; inspect `response` for diagnostics and protocol fields. */
export class KernelCommandError extends Error {
  constructor(readonly response: KernelFailure) {
    super(typeof response.error === "string" ? response.error : String((response.error as { message?: string })?.message || "Kernel command failed."));
  }
}

/** Correlates commands and metadata chunks over a host-owned transport.
 * The host owns accepted revisions, scheduling and transport shutdown.
 * See docs/reference/sdk.md for response and lifecycle boundaries.
 */
export class TextabanaKernelClient {
  readonly transport: KernelTransport;
  readonly pending = new Map<string, Pending>();
  readonly streams = new Map<string, Set<(chunk: MetadataChunk) => void>>();
  #sequence = 0;
  #disposed = false;

  constructor(transport: KernelTransport) {
    this.transport = transport;
    this.transport.addEventListener("message", this.#onMessage);
  }

  /** Detach listeners and reject pending commands; does not close the transport. */
  dispose() {
    this.#disposed = true;
    this.transport.removeEventListener("message", this.#onMessage);
    for (const request of this.pending.values()) request.reject(new Error("Textabana client disposed."));
    this.pending.clear();
    this.streams.clear();
  }

  #onMessage = (event: MessageEvent) => {
    const message = event.data as Record<string, unknown>;
    if (message?.type === "transport-error" && !message.requestId) {
      for (const request of this.pending.values()) request.reject(new KernelCommandError(message as unknown as KernelFailure));
      this.pending.clear();
      this.dispose();
      return;
    }
    if (message?.type === "metadata-chunk" && typeof message.subscriptionId === "string") {
      this.streams.get(message.subscriptionId)?.forEach((listener) => listener(message as MetadataChunk));
      return;
    }
    const requestId = typeof message?.requestId === "string" ? message.requestId : null;
    if (!requestId) return;
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    if (message.ok === false) pending.reject(new KernelCommandError(message as unknown as KernelFailure));
    else pending.resolve(message);
  };

  /** Send one correlated command; reject failed responses or transport errors.
   * Literal commands infer their successful response; an explicit `T` remains
   * a caller-supplied assertion, not runtime response validation.
   * A supplied requestId must be unique among this client's pending requests.
   */
  command<C extends KernelCommand>(command: C, payload?: Record<string, unknown>): Promise<CommandResponses[C]>;
  command<T>(command: KernelCommand, payload?: Record<string, unknown>): Promise<T>;
  command<T = unknown>(command: KernelCommand, payload: Record<string, unknown> = {}): Promise<T> {
    if (this.#disposed) return Promise.reject(new Error("Textabana client disposed."));
    const requestId = String(payload.requestId || `sdk:${command}:${++this.#sequence}`);
    if (this.pending.has(requestId)) return Promise.reject(new Error("Duplicate in-flight requestId."));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
      try { this.transport.postMessage({ ...payload, type: command, requestId }); }
      catch (error) { this.pending.delete(requestId); reject(error); }
    });
  }

  /** Open a document at revision 1; use the kernel's accepted response as authority. */
  open(documentId: string, path: string, source: string) { return this.command("open", { document: { documentId, path, source, documentRevision: 1 } }); }
  /** Submit sorted, non-overlapping code-point edits against an accepted revision. */
  change(documentId: string, baseRevision: number, changes: TextChange[]) { return this.command("change", { documentId, baseRevision, coordinateUnit: "unicode-code-point", changes }); }
  /** Inspect a document revision without executing its modules. */
  analyze(documentId: string, documentRevision: number) { return this.command("analyze", { documentId, documentRevision }); }
  /** Execute the requested document revision with explicit modules and options. */
  run(documentId: string, documentRevision: number, runId: number, modules: ModulePackage[] | Array<Record<string, unknown>>, options: { moduleLock?: ModuleLock; capabilityGrants?: string[] } & Record<string, unknown> = {}) {
    return this.command("run", { documentId, documentRevision, runId, modules, options });
  }
  /** Select post-commit metadata delivery; does not register a local chunk listener. */
  subscribe(documentId: string, subscriptionId: string, channels = ["*"], initialCredit = 0) { return this.command("subscribe", { documentId, subscriptionId, channels, delivery: "stream", initialCredit }); }
  /** Add delivery credit to an existing subscription. */
  credit(subscriptionId: string, credit: number) { return this.command("credit", { subscriptionId, credit }); }
  /** Request a portable cache checkpoint; this does not persist a document. */
  exportCache(documentId: string) { return this.command("cache-export", { documentId }); }
  /** Submit a checkpoint for kernel validation before reuse. */
  importCache(documentId: string, checkpoint: unknown) { return this.command("cache-import", { documentId, checkpoint }); }
  /** Send an uncorrelated cooperative cancellation request; returns no completion. */
  cancel(runId: number) { this.transport.postMessage({ type: "cancel", runId }); }
  /** Listen locally for a subscription; the returned function removes only this listener. */
  onChunk(subscriptionId: string, listener: (chunk: MetadataChunk) => void) {
    const listeners = this.streams.get(subscriptionId) || new Set(); listeners.add(listener); this.streams.set(subscriptionId, listeners);
    return () => { listeners.delete(listener); if (!listeners.size) this.streams.delete(subscriptionId); };
  }
}
