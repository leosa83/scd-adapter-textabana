import type { IrNode, RuntimeDiagnostic } from "../sdk/typescript/runtime-types";
import { presentParserDiagnostic } from "./parser-diagnostic-presentation";

export function ParserDiagnostic({ diagnostic, recovery, parserSchema }: {
  diagnostic: RuntimeDiagnostic;
  recovery?: Extract<IrNode, { kind: "Recovery" }>;
  parserSchema?: string;
}) {
  const view = presentParserDiagnostic(diagnostic, recovery, parserSchema);
  return (
    <article>
      <div><strong>{diagnostic.code ?? "TBA-PARSE-LAB"}</strong><code>{diagnostic.sourceSpan ? `L${diagnostic.sourceSpan.startLine}:${diagnostic.sourceSpan.startColumn} · [${diagnostic.sourceSpan.start}, ${diagnostic.sourceSpan.end})` : `L${diagnostic.line}`}</code></div>
      <p>{view.message}</p>
      {view.related.map((item, index) => <p key={index}><small>{item.message} <code>L{item.sourceSpan.startLine}:{item.sourceSpan.startColumn} · [{item.sourceSpan.start}, {item.sourceSpan.end})</code></small></p>)}
      {diagnostic.recoveryNodeId ? <small>{diagnostic.recoveryNodeId} · {diagnostic.diagnosticKey}</small> : null}
      <details><summary>Original diagnostic (unchanged artifact data)</summary><pre>{JSON.stringify(diagnostic, null, 2)}</pre></details>
    </article>
  );
}
