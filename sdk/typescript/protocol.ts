/** Commands accepted by the current editor-kernel transport. */
export type KernelCommand = "open" | "change" | "analyze" | "subscribe" | "credit" | "cache-export" | "cache-import" | "run" | "cancel";

/** Host-owned message transport; the client does not terminate or close it. */
export interface KernelTransport {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

/** Replacement in a half-open Unicode-code-point range of the base revision. */
export interface TextChange {
  range: { from: number; to: number };
  insert: string;
}

/** Declared function contract, checked against exports during module admission. */
export interface ModuleFunctionManifest {
  name: string;
  state: "pure" | "run" | "session";
  determinism: "deterministic" | "nondeterministic";
  effects: string[];
}

/** Lab module manifest. Declarations and grants do not provide a JS sandbox. */
export interface ModuleManifest {
  schema: "textabana.module-manifest/lab-v1";
  namespace: string;
  version: string;
  entrypoint: string;
  digest: `sha256:${string}`;
  functions: ModuleFunctionManifest[];
  capabilities: { required: string[]; channels: string[]; resources: string[] };
}

/** Source bytes and their SHA-256 identity, with the associated lab manifest. */
export interface ModulePackage {
  path: string;
  content: string;
  digest: `sha256:${string}`;
  manifest: ModuleManifest;
}

/** Exact package identities supplied to the kernel through run options. */
export interface ModuleLock {
  schema: "textabana.module-lock/lab-v1";
  packages: Array<{ namespace: string; version: string; entrypoint: string; digest: `sha256:${string}` }>;
}
