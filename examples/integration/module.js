/* global define */
define({
  documented_upper: {
    state: "run",
    determinism: "deterministic",
    effects: ["channel:docs.metrics"],
    outputs: ["render", "docs.metrics"],
    channels: {
      "docs.metrics": {
        payloadKind: "object",
        mediaType: "application/json",
        schemaRef: "schema:docs/metrics/v1",
        delivery: "snapshot",
        persistence: "durable",
        ordering: "global-sequence",
        schema: {
          type: "object",
          required: ["characters"],
          properties: { characters: { type: "integer" } },
        },
      },
    },
    transform(input, _args, context) {
      const text = String(input);
      context.emit("docs.metrics", { characters: Array.from(text).length });
      return text.toUpperCase();
    },
  },
});
