import type { KernelCommand, KernelTransport, ModuleLock, ModulePackage, TextChange } from "./protocol";

type Pending = { resolve(value: unknown): void; reject(reason: Error): void };

export class KernelCommandError extends Error {
  constructor(readonly response: Record<string, unknown>) {
    super(typeof response.error === "string" ? response.error : String((response.error as { message?: string })?.message || "Kernel command failed."));
  }
}

export class TextabanaKernelClient {
  readonly transport: KernelTransport;
  readonly pending = new Map<string, Pending>();
  readonly streams = new Map<string, Set<(chunk: unknown) => void>>();
  #sequence = 0;
  #disposed = false;

  constructor(transport: KernelTransport) {
    this.transport = transport;
    this.transport.addEventListener("message", this.#onMessage);
  }

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
      for (const request of this.pending.values()) request.reject(new KernelCommandError(message));
      this.pending.clear();
      this.dispose();
      return;
    }
    if (message?.type === "metadata-chunk" && typeof message.subscriptionId === "string") {
      this.streams.get(message.subscriptionId)?.forEach((listener) => listener(message));
      return;
    }
    const requestId = typeof message?.requestId === "string" ? message.requestId : null;
    if (!requestId) return;
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    if (message.ok === false) pending.reject(new KernelCommandError(message));
    else pending.resolve(message);
  };

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

  open(documentId: string, path: string, source: string) { return this.command("open", { document: { documentId, path, source, documentRevision: 1 } }); }
  change(documentId: string, baseRevision: number, changes: TextChange[]) { return this.command("change", { documentId, baseRevision, coordinateUnit: "unicode-code-point", changes }); }
  analyze(documentId: string, documentRevision: number) { return this.command("analyze", { documentId, documentRevision }); }
  run(documentId: string, documentRevision: number, runId: number, modules: ModulePackage[] | Array<Record<string, unknown>>, options: { moduleLock?: ModuleLock; capabilityGrants?: string[] } & Record<string, unknown> = {}) {
    return this.command("run", { documentId, documentRevision, runId, modules, options });
  }
  subscribe(documentId: string, subscriptionId: string, channels = ["*"], initialCredit = 0) { return this.command("subscribe", { documentId, subscriptionId, channels, delivery: "stream", initialCredit }); }
  credit(subscriptionId: string, credit: number) { return this.command("credit", { subscriptionId, credit }); }
  exportCache(documentId: string) { return this.command("cache-export", { documentId }); }
  importCache(documentId: string, checkpoint: unknown) { return this.command("cache-import", { documentId, checkpoint }); }
  cancel(runId: number) { this.transport.postMessage({ type: "cancel", runId }); }
  onChunk(subscriptionId: string, listener: (chunk: unknown) => void) {
    const listeners = this.streams.get(subscriptionId) || new Set(); listeners.add(listener); this.streams.set(subscriptionId, listeners);
    return () => { listeners.delete(listener); if (!listeners.size) this.streams.delete(subscriptionId); };
  }
}
