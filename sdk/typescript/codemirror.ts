import type { TextChange } from "./protocol";
import { TextabanaKernelClient } from "./client";

export interface CodeMirrorUpdateLike {
  docChanged: boolean;
  startState: { doc: { toString(): string } };
  changes: { iterChanges(callback: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString(): string }) => void): void };
}

function codeUnitsToCodePoints(source: string, offset: number) { return Array.from(source.slice(0, offset)).length; }

export function codeMirrorTextabanaBinding(client: TextabanaKernelClient, documentId: string, revision: () => number, accepted: (response: unknown) => void) {
  let queue: Promise<void> = Promise.resolve();
  return (update: CodeMirrorUpdateLike) => {
    if (!update.docChanged) return;
    const source = update.startState.doc.toString();
    const changes: TextChange[] = [];
    update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => changes.push({ range: { from: codeUnitsToCodePoints(source, fromA), to: codeUnitsToCodePoints(source, toA) }, insert: inserted.toString() }));
    // Keep later edits blocked after a rejection: the host must resync and rebind.
    queue = queue.then(async () => { accepted(await client.change(documentId, revision(), changes)); });
    return queue;
  };
}
