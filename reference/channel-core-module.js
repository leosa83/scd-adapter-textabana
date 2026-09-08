// Trusted fixed functions for textabana.channel-core/v1. Concatenated after text-core-module.js.
const channelPayloadSchema = { type: "object", required: ["text", "label", "meta"], properties: { text: { type: "string" }, label: { type: "string" }, meta: { type: "object" } } };
const channelDescriptor = (persistence = "durable", required = false) => ({ payloadKind: "object", mediaType: "application/json", schemaRef: "textabana.channel-core/payload-v1", delivery: "snapshot", persistence, ordering: "global-sequence", key: ["payload.label"], required, sensitivity: "internal", schema: channelPayloadSchema });
const emitChannels = { records: channelDescriptor(), audit: channelDescriptor(), progress: channelDescriptor("transient") };
const eventFunction = (transform, channels = emitChannels) => ({ state: "run", determinism: "deterministic", effects: ["channel:records", "channel:audit", "channel:progress", "channel:system.out"], channels, transform });
const channelInteger = (raw, maximum, zero = false) => {
  if (!/^(0|[1-9][0-9]*)(?![\s\S])/.test(raw) || raw.length > 7 || Number(raw) > maximum || (!zero && Number(raw) === 0)) throw new Error("Invalid channel integer argument");
  return Number(raw);
};
const eventPayload = (input, args) => ({ text: input, label: args.label ?? "", meta: { id: args.id ?? "user-id", runId: args.runId ?? "user-run", duration: args.duration ?? "user-duration", nested: { stageId: args.stageId ?? "user-stage" } } });
const eventLocation = (args, forcedMode) => {
  const mode = forcedMode ?? args.mode ?? "line";
  if (!["line", "row"].includes(mode)) throw new Error("Invalid channel mode");
  return { mode, rowId: args.rowId ?? "row", row: channelInteger(args.row ?? "1", 1000000), rowSet: args.rowSet || "profile", ...(args.kind ? { kind: args.kind } : {}), mapping: "derived" };
};
const publishPayload = (context, channel, payload, location, rowApi = false) => {
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 16384) {
    const error = new Error("channel-core payload limit"); error.code = "TBA-CHANNEL-CORE-LIMIT"; throw error;
  }
  if (rowApi) return context.system.out.row(location.rowId, payload, location);
  if (channel === "system.out" && location.mode === "line") return context.system.out.line(payload, location);
  return context.emit(channel, payload, location);
};
define({
  publish: eventFunction((input, args, ctx) => { publishPayload(ctx, args.channel ?? "records", eventPayload(input, args), eventLocation(args)); return input; }),
  publishRow: eventFunction((input, args, ctx) => { publishPayload(ctx, "system.out", eventPayload(input, args), eventLocation(args, "row"), true); return input; }),
  fanout: eventFunction((input, args, ctx) => {
    const payload = eventPayload(input, args), location = eventLocation(args);
    for (const channel of ["records", "progress", "audit", "system.out"]) publishPayload(ctx, channel, payload, location);
    return input;
  }),
  burst: eventFunction((input, args, ctx) => {
    const count = channelInteger(args.count ?? "1", 128, true), payload = eventPayload(input, args), location = eventLocation(args);
    for (let index = 0; index < count; index++) publishPayload(ctx, args.channel ?? "records", payload, location);
    return input;
  }),
  publishMutable: eventFunction((input, args, ctx) => {
    const payload = eventPayload(input, args), location = eventLocation(args), channel = args.channel ?? "records";
    publishPayload(ctx, channel, payload, location);
    payload.label = "changed"; payload.meta.nested.stageId = "changed-stage";
    publishPayload(ctx, channel, payload, location);
    return input;
  }),
  publishThenFail: eventFunction((input, args, ctx) => {
    publishPayload(ctx, args.channel ?? "records", eventPayload(input, args), eventLocation(args));
    throw new Error("channel-core intentional failure");
  }),
  declareOnly: eventFunction((input) => input, { "required.empty": channelDescriptor("durable", true), "optional.empty": channelDescriptor() }),
  invalidEvent: eventFunction((input, args, ctx) => {
    const location = eventLocation(args);
    let payload;
    switch (args.reason ?? "missing") {
      case "missing": payload = { text: input }; break;
      case "type": payload = { ...eventPayload(input, args), label: 42 }; break;
      case "scalar": payload = "invalid"; break;
      case "undefined": payload = { ...eventPayload(input, args), extra: undefined }; break;
      case "nonfinite": payload = { ...eventPayload(input, args), extra: Infinity }; break;
      case "cycle": payload = eventPayload(input, args); payload.extra = payload; break;
      case "bigint": payload = { ...eventPayload(input, args), extra: 1n }; break;
      default: throw new Error("Unknown invalidEvent reason");
    }
    ctx.emit("records", payload, location);
    return input;
  }),
});
