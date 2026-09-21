import Ajv2020 from "ajv/dist/2020.js";
import { canonicalize } from "./canonical-json.js";

export const CHANNEL_SCHEMA_POLICY = "textabana.channel-schema/2020-12-v1";
const dialect = "https://json-schema.org/draft/2020-12/schema";
const maps = new Set(["$defs", "properties", "patternProperties", "dependentSchemas"]);
const lists = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);
const singles = new Set(["not", "if", "then", "else", "items", "contains", "additionalProperties", "unevaluatedProperties", "unevaluatedItems", "propertyNames"]);
const keywords = new Set([
  "$schema", "$id", "$ref", "$anchor", "$dynamicRef", "$dynamicAnchor", "$comment",
  "type", "enum", "const", "multipleOf", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
  "minLength", "maxLength", "pattern", "minItems", "maxItems", "uniqueItems", "minContains", "maxContains",
  "minProperties", "maxProperties", "required", "dependentRequired",
  "title", "description", "default", "deprecated", "readOnly", "writeOnly", "examples",
  ...maps, ...lists, ...singles,
]);

export function channelError(message, code = "TBA-TYPE-CHANNEL-LAB") {
  const error = new Error(message);
  error.code = code;
  return error;
}

// This is an admission policy, not a second payload validator. Walk schema
// positions only: a payload literal in const/enum may contain any property name.
function admitSchema(schema, depth = 0) {
  if (depth > 32) throw new Error("Schema nesting exceeds 32 levels.");
  if (typeof schema === "boolean") return;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error("A schema must be an object or boolean.");
  for (const [key, value] of Object.entries(schema)) {
    if (!keywords.has(key)) throw new Error(`Unsupported schema keyword “${key}”.`);
    if (key === "$schema" && value !== dialect) throw new Error(`Only ${dialect} is supported.`);
    if ((key === "$ref" || key === "$dynamicRef") && (typeof value !== "string" || !value.startsWith("#"))) throw new Error("Schema references must be local fragments; external resolution is disabled.");
    if (maps.has(key) && value && typeof value === "object" && !Array.isArray(value)) {
      for (const child of Object.values(value)) admitSchema(child, depth + 1);
    } else if (lists.has(key) && Array.isArray(value)) {
      for (const child of value) admitSchema(child, depth + 1);
    } else if (singles.has(key)) admitSchema(value, depth + 1);
  }
}

export function compileChannelSchema(channel, rawSchema) {
  try {
    const encoded = canonicalize(rawSchema);
    if (new TextEncoder().encode(encoded).length > 65536) throw new Error("Schema exceeds 65,536 UTF-8 bytes.");
    const schema = JSON.parse(encoded);
    admitSchema(schema);
    // A private registry prevents one descriptor's $id from resolving another's
    // references, leaking between runs, or making admission depend on order.
    const ajv = new Ajv2020({ strict: true, strictTypes: false, strictRequired: false, strictTuples: false, ownProperties: true, logger: false });
    const validate = ajv.compile(schema);
    return { schema, validate };
  } catch (error) {
    throw channelError(`Channel “${channel}”: invalid schema under ${CHANNEL_SCHEMA_POLICY}: ${error.message}`, "TBA-CHANNEL-SCHEMA-LAB");
  }
}

export function validateChannelPayload(channel, validate, value) {
  let payload;
  try {
    // Validate and publish the same detached JSON value, without coercion,
    // defaults, dropped properties, custom serializers or prototype effects.
    canonicalize(value);
    const copy = (item) => Array.isArray(item) ? item.map(copy)
      : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).map(([key, child]) => [key, copy(child)]))
      : item;
    payload = copy(value);
  } catch (error) {
    throw channelError(`Channel “${channel}”: payload is not lossless JSON: ${error.message}`);
  }
  if (!validate(payload)) {
    const issue = validate.errors[0];
    throw channelError(`Channel “${channel}”: payload${issue.instancePath} ${issue.message} (${issue.keyword}).`);
  }
  return payload;
}
