import { Worker } from "node:worker_threads";

export class NodeKernelTransport {
  #listeners = new Set();
  #closed = false;
  worker = new Worker(new URL("./worker-bridge.mjs", import.meta.url), { stdout: true, stderr: true });
  constructor() {
    // Keep JSONL stdout free from module logging.
    this.worker.stdout.pipe(process.stderr, { end: false });
    this.worker.stderr.pipe(process.stderr, { end: false });
    this.worker.on("message", (data) => this.#emit(data));
    this.worker.on("error", (error) => this.#emit({ type: "transport-error", ok: false, error: { message: error.message } }));
    this.worker.on("exit", () => { if (!this.#closed) this.#emit({ type: "transport-error", ok: false, error: { message: "Kernel worker exited." } }); });
  }
  #emit(data) { for (const listener of this.#listeners) listener({ data }); }
  postMessage(message) { if (this.#closed) throw new Error("Transport closed."); this.worker.postMessage(message); }
  addEventListener(_type, listener) { this.#listeners.add(listener); }
  removeEventListener(_type, listener) { this.#listeners.delete(listener); }
  async close() { this.#closed = true; await this.worker.terminate(); this.#listeners.clear(); }
}
