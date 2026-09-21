import type { ChangeResponse } from "./responses";
import type { TextChange } from "./protocol";
import { TextabanaKernelClient } from "./client";

/** Minimal editor-update shape; offsets refer to the pre-edit UTF-16 document. */
export interface CodeMirrorUpdateLike {
  docChanged: boolean;
  startState: { doc: { toString(): string } };
  changes: { iterChanges(callback: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString(): string }) => void): void };
}

function codeUnitsToCodePoints(source: string, offset: number) { return Array.from(source.slice(0, offset)).length; }

/** Convert editor edits to code points and queue acknowledged kernel changes.
 * `accepted` must update the host's revision before the next queued change.
 * After a rejection, resynchronize the document and create a new binding.
 * Returns a listener yielding Promise<void>, or undefined for non-document updates.
 */
export function codeMirrorTextabanaBinding(client: TextabanaKernelClient, documentId: string, revision: () => number, accepted: (response: ChangeResponse) => void) {
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
