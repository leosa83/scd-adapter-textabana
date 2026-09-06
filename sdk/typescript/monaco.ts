import type { TextChange } from "./protocol";
import { TextabanaKernelClient } from "./client";

export interface MonacoModelLike { getValue(): string }
export interface MonacoChangeLike { rangeOffset: number; rangeLength: number; text: string }

function codeUnitsToCodePoints(source: string, offset: number) { return Array.from(source.slice(0, offset)).length; }

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
