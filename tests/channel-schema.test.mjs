import test from "node:test";
import assert from "node:assert/strict";
import { createChannelBus } from "../runtime/channels.js";
import { NodeKernelTransport } from "../sdk/node/transport.mjs";
import { rawClient } from "../conformance/host-runner.mjs";

const bus = (strictChannels = true) => createChannelBus({ runId: 1, runInstanceId: "test", documentVersion: "test", documentPath: "fixture.md", documentSource: "x", strictChannels });
const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object", required: ["rows"], additionalProperties: false,
  properties: { rows: { type: "array", minItems: 1, items: { $ref: "#/$defs/row" } } },
  $defs: { row: { type: "object", required: ["kind", "score"], additionalProperties: false,
    properties: { kind: { enum: ["accepted", "review"] }, score: { type: "integer", minimum: 0, maximum: 100 } } } },
};

test("channel schemas enforce nested rules, local references, enums and bounds in both channel modes", () => {
  for (const strict of [true, false]) {
    const channels = bus(strict);
    channels.declare("records", { schema });
    const value = { rows: [{ kind: "accepted", score: 42 }] };
    channels.emit("records", value);
    assert.deepEqual(channels.snapshot().records[0].payload, value);
    for (const invalid of [{ rows: [] }, { rows: [{ kind: "unknown", score: 42 }] }, { rows: [{ kind: "review", score: -1 }] }, { rows: [{ kind: "review", score: 101 }] }, { rows: [{ kind: "review", score: 1.5 }] }, { rows: [{ kind: "review" }] }, { rows: [{ kind: "review", score: 1, extra: true }] }]) {
      assert.throws(() => channels.emit("records", invalid), { code: "TBA-TYPE-CHANNEL-LAB" });
    }
    assert.equal(channels.size, 1);
    assert.equal(channels.anchorSnapshot().length, 1);
    assert.equal(channels.sourceMapSnapshot().length, 1);
  }
});

test("channel schemas reject unsupported or malformed contracts at declaration, even without emission", () => {
  for (const invalid of [null, 42, [], { type: "wat" }, { minimum: "one" }, { type: "string", minLenght: 1 }, { $schema: "http://json-schema.org/draft-07/schema#" }, { $ref: "https://example.invalid/schema" }, { $async: true }, { type: "string", format: "email" }, { $defs: { unused: { minLenght: 2 } } }]) {
    const channels = bus();
    assert.throws(() => channels.declare("invalid", { schema: invalid }), { code: "TBA-CHANNEL-SCHEMA-LAB" });
    assert.equal(Object.hasOwn(channels.descriptorSnapshot(), "invalid"), false);
  }
});

test("boolean schemas, union types, composition and 2020-12 tuples use standard validation", () => {
  const channels = bus();
  channels.declare("any", { schema: true });
  channels.emit("any", null);
  channels.declare("never", { schema: false });
  assert.throws(() => channels.emit("never", {}), { code: "TBA-TYPE-CHANNEL-LAB" });
  channels.declare("tuple", { schema: { type: "array", prefixItems: [{ type: ["string", "null"] }, { type: "integer" }], items: false, minItems: 2, maxItems: 2 } });
  channels.emit("tuple", [null, 2]);
  assert.throws(() => channels.emit("tuple", ["ok", 2, 3]));
  channels.declare("composed", { schema: { type: "object", allOf: [{ properties: { id: { const: "å😀" } }, required: ["id"] }], unevaluatedProperties: false } });
  channels.emit("composed", { id: "å😀" });
  assert.throws(() => channels.emit("composed", { id: "å😀", extra: true }));
});

test("validation neither coerces nor mutates payloads or schemas and first declaration still wins", () => {
  const channels = bus(false);
  const original = { type: "object", properties: { n: { type: "integer", default: 4 } }, additionalProperties: false };
  channels.declare("records", { schema: original });
  original.properties.n.type = "string";
  const value = {};
  channels.emit("records", value);
  assert.deepEqual(value, {});
  assert.deepEqual(channels.snapshot().records[0].payload, {});
  channels.declare("records", { schema: false });
  assert.throws(() => channels.emit("records", { n: "4" }));
  assert.throws(() => channels.emit("records", { extra: 1 }));
  channels.emit("records", { n: 4 });
  assert.deepEqual(channels.snapshot().records[1].payload, { n: 4 });
  for (const invalid of [undefined, NaN, new Date(), { n: undefined }]) assert.throws(() => channels.emit("records", invalid));
});

test("schema registries are isolated by descriptor and run; schemaRef never fetches a schema", () => {
  const channels = bus();
  channels.declare("one", { schema: { $id: "urn:test:shared", const: 1 } });
  channels.declare("two", { schema: { $id: "urn:test:shared", const: 2 } });
  channels.emit("one", 1); channels.emit("two", 2);
  assert.throws(() => channels.declare("external", { schema: { $ref: "urn:test:shared" } }), { code: "TBA-CHANNEL-SCHEMA-LAB" });
  channels.declare("reference.only", { schemaRef: "https://example.invalid/not-fetched" });
  channels.emit("reference.only", { arbitrary: true });
  const other = bus(); other.declare("one", { schema: false });
  assert.throws(() => other.emit("one", 1));
});

test("schema admission and snapshots preserve literal keys, Unicode, key order and signed zero", () => {
  const channels = bus();
  const value = JSON.parse('{"z":-0,"__proto__":{"$async":true},"a":"å😀"}');
  channels.declare("literal", { schema: { const: value } });
  channels.emit("literal", value);
  const payload = channels.snapshot().literal[0].payload;
  assert.deepEqual(payload, value);
  assert.deepEqual(Object.keys(payload), ["z", "__proto__", "a"]);
  assert.equal(Object.hasOwn(payload, "__proto__"), true);
  assert.equal(Object.is(payload.z, -0), true);
  value.__proto__.$async = false;
  assert.equal(payload.__proto__.$async, true);
  let reads = 0;
  assert.throws(() => channels.emit("literal", { get value() { reads++; return 1; } }));
  assert.equal(reads, 0);
  assert.throws(() => channels.declare("large", { schema: { description: "x".repeat(65536) } }), { code: "TBA-CHANNEL-SCHEMA-LAB" });
  let nested = true;
  for (let index = 0; index < 34; index++) nested = { items: nested };
  assert.throws(() => channels.declare("deep", { schema: nested }), { code: "TBA-CHANNEL-SCHEMA-LAB" });
});

test("the real Worker rejects schema failures atomically and validates declarations before transforms", async () => {
  const transport = new NodeKernelTransport(), client = rawClient(transport);
  try {
    for (const [contract, body, code] of [[{ type: "string", enum: ["allowed"] }, 'context.emit("records", "allowed"); context.emit("records", "wrong")', "TBA-TYPE-CHANNEL-LAB"], [{ type: "string", minLenght: 2 }, 'throw new Error("transform must not run")', "TBA-CHANNEL-SCHEMA-LAB"]]) {
      const response = await client.command(undefined, { runId: 1, documentSource: '>>>>! include "./module.js"\n>>>> publish\nx\n<<<< publish', modules: [{ path: "module.js", content: `define({publish:{channels:{records:{schema:${JSON.stringify(contract)}}},transform(input,args,context){${body};return input;}}});` }], options: { strictChannels: true } });
      assert.equal(response.ok, false);
      assert.equal(response.diagnostics.at(-1).code, code);
      assert.equal(response.capabilities.extensions.channelSchemaPolicy, "textabana.channel-schema/2020-12-v1");
      assert.equal(response.resultEnvelope.run.committed, false);
      assert.equal(response.output, "");
      assert.deepEqual(response.channels, {});
      assert.deepEqual(response.channelDescriptors, {});
      assert.deepEqual(response.resultEnvelope.channelSnapshots, {});
      assert.deepEqual(response.resultEnvelope.anchors, []);
      assert.deepEqual(response.resultEnvelope.sourceMaps, []);
      assert.deepEqual(response.resultEnvelope.provenance.activities, []);
      assert.doesNotMatch(response.error, /transform must not run/);
    }
  } finally { client.dispose(); await transport.close(); }
});
