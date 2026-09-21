export type ProjectFile = {
  path: string;
  kind: "document" | "module";
  content: string;
};

export type LabId = "language" | "kernel" | "editor" | "channels" | "data" | "notebook" | "annotation" | "conformance";

// Re-export shared wire data for existing presentation imports.
export type * from "../sdk/typescript/runtime-types";

export type PlaygroundFixture = {
  id: string;
  title: string;
  summary: string;
  document: string;
  conformance?: {
    caseId: string;
    expectedOutcome: "succeeded" | "failed" | "cancelled";
    expectedDiagnosticCode?: string;
    autoCancelAfterMs?: number;
  };
};
