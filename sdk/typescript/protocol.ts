export type KernelCommand = "open" | "change" | "analyze" | "subscribe" | "credit" | "cache-export" | "cache-import" | "run" | "cancel";

export interface KernelTransport {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

export interface TextChange {
  range: { from: number; to: number };
  insert: string;
}

export interface ModuleFunctionManifest {
  name: string;
  state: "pure" | "run" | "session";
  determinism: "deterministic" | "nondeterministic";
  effects: string[];
}

export interface ModuleManifest {
  schema: "textabana.module-manifest/lab-v1";
  namespace: string;
  version: string;
  entrypoint: string;
  digest: `sha256:${string}`;
  functions: ModuleFunctionManifest[];
  capabilities: { required: string[]; channels: string[]; resources: string[] };
}

export interface ModulePackage {
  path: string;
  content: string;
  digest: `sha256:${string}`;
  manifest: ModuleManifest;
}

export interface ModuleLock {
  schema: "textabana.module-lock/lab-v1";
  packages: Array<{ namespace: string; version: string; entrypoint: string; digest: `sha256:${string}` }>;
}
