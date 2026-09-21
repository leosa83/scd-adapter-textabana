import type { TextChange } from "./protocol";
import { TextabanaKernelClient } from "./client";

/** Readable snapshot of the model before the reported changes. */
export interface MonacoModelLike { getValue(): string }
/** UTF-16 offset and length in that pre-edit snapshot. */
export interface MonacoChangeLike { rangeOffset: number; rangeLength: number; text: string }

function codeUnitsToCodePoints(source: string, offset: number) { return Array.from(source.slice(0, offset)).length; }

/** Convert and sort edits, then return the kernel's change response.
 * The host must supply the pre-edit source, serialize calls and advance revisions
 * only after successful responses. This helper owns no model or request queue.
 */
export async function applyMonacoChanges(client: TextabanaKernelClient, documentId: string, revision: number, modelBefore: MonacoModelLike, changes: MonacoChangeLike[]) {
  const source = modelBefore.getValue();
  const patches: TextChange[] = changes.map((change) => ({
    range: {
      from: codeUnitsToCodePoints(source, change.rangeOffset),
      to: codeUnitsToCodePoints(source, change.rangeOffset + change.rangeLength),
    },
    insert: change.text,
  })).sort((a, b) => a.range.from - b.range.from);
  return client.change(documentId, revision, patches);
}
