import { parentPort } from "node:worker_threads";

// Same generated worker bytes as the browser. Module code is trusted, not sandboxed.
globalThis.self = { postMessage: (message) => parentPort.postMessage(message) };
await import("../../public/runtime-worker.js");
parentPort.on("message", (data) => {
  Promise.resolve(self.onmessage({ data })).catch((error) => {
    parentPort.postMessage({ type: "transport-error", requestId: data.requestId, ok: false, error: { message: error.message } });
  });
});
