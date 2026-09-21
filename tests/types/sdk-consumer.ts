// Compiled in isolation from the app and Cloudflare declarations by host-sdk.test.
import { TextabanaKernelClient, KernelCommandError, codeMirrorTextabanaBinding, applyMonacoChanges } from "../../sdk/typescript/index";
import type { KernelMessage, OpenResponse, ChangeResponse, RunResponse, CommandResponses } from "../../sdk/typescript/index";

export async function consume(client: TextabanaKernelClient) {
  const opened: OpenResponse = await client.open("doc", "doc.md", "A🌊");
  let revision: number = opened.document.documentRevision;
  const changed = await client.change("doc", revision, [{ range: { from: 0, to: 1 }, insert: "B" }]);
  if (changed.status === "accepted") revision = changed.change.documentRevision;
  else {
    const absent: null = changed.change;
    void absent;
  }
  const analyzed = await client.analyze("doc", revision);
  const executable: boolean = analyzed.analysis.executable;
  const run: RunResponse = await client.run("doc", revision, 1, []);
  const committed: boolean = run.resultEnvelope.run.committed;
  const subscribed = await client.subscribe("doc", "sub");
  const credit = await client.credit(subscribed.subscription.subscriptionId, 1);
  const delivered: number = credit.delivered;
  const cache = await client.exportCache("doc");
  const imported = await client.importCache("doc", cache.checkpoint);
  const version: number = imported.cacheVersion;
  const cancelled = await client.command("cancel", { runId: 1 });
  const accepted: boolean = cancelled.accepted;
  const direct: CommandResponses["analyze"] = await client.command("analyze", { documentId: "doc" });
  // The old explicit generic remains an unchecked escape hatch.
  const custom = await client.command<{ extension: string }>("analyze", {});
  const extension: string = custom.extension;
  client.onChunk("sub", (chunk) => {
    if (chunk.collection === "changed") {
      const positioned: boolean = chunk.value.positionChanged;
      void positioned;
    }
    if (chunk.collection === "added") {
      const identity: string = chunk.value.identity;
      void identity;
      // @ts-expect-error Added items have no before/after pair.
      void chunk.value.before;
    }
  });
  codeMirrorTextabanaBinding(client, "doc", () => revision, (response) => { revision = response.document.documentRevision; });
  const monaco: ChangeResponse = await applyMonacoChanges(client, "doc", revision, { getValue: () => "B🌊" }, []);
  // @ts-expect-error open does not return run output.
  void opened.output;
  // @ts-expect-error analysis is not an arbitrary untyped extension map.
  void analyzed.analysis.notAField;
  // @ts-expect-error Convenience responses are inferred, not any or unknown.
  const wrong: string = credit.delivered;
  void [executable, committed, delivered, version, accepted, direct, extension, monaco, wrong];
}

export function inspect(message: KernelMessage, error: KernelCommandError) {
  if (message.type === "kernel-response" && message.ok && message.command === "open") {
    const characters: number = message.document.characters;
    void characters;
  }
  if (error.response.type === "kernel-response") {
    const code: string = error.response.error.code;
    void code;
  } else if (error.response.type === "run-result") {
    const description: string = error.response.error;
    void description;
  }
}
