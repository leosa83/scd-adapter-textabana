import type { KernelCommand, KernelTransport, ModuleLock, ModulePackage, TextChange } from "./protocol";

type Pending = { resolve(value: unknown): void; reject(reason: Error): void };

export class TextabanaKernelClient {
  readonly transport: KernelTransport;
  readonly pending = new Map<string, Pending>();
  readonly streams = new Map<string, Set<(chunk: unknown) => void>>();
  #sequence = 0;

  constructor(transport: KernelTransport) {
    this.transport = transport;
    this.transport.addEventListener("message", this.#onMessage);
  }

  dispose() {
    this.transport.removeEventListener("message", this.#onMessage);
    for (const request of this.pending.values()) request.reject(new Error("Textabana client disposed."));
    this.pending.clear();
    this.streams.clear();
  }

  #onMessage = (event: MessageEvent) => {
    const message = event.data as Record<string, unknown>;
    if (message?.type === "metadata-chunk" && typeof message.subscriptionId === "string") {
      this.streams.get(message.subscriptionId)?.forEach((listener) => listener(message));
      return;
    }
    const requestId = typeof message?.requestId === "string" ? message.requestId : null;
    if (!requestId) return;
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    if (message.ok === false) pending.reject(new Error(String((message.error as { message?: string })?.message || "Kernel command failed.")));
    else pending.resolve(message);
  };

  command<T = unknown>(command: KernelCommand, payload: Record<string, unknown> = {}): Promise<T> {
    const requestId = String(payload.requestId || `sdk:${command}:${++this.#sequence}`);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
      this.transport.postMessage({ ...payload, type: command, requestId });
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
