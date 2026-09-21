import { semanticValueDigest } from "./execution-graph.js";

const channelNamePattern = /^[A-Za-z][A-Za-z0-9_.:-]*$/;

function normalizePath(path, from = "") {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
  const raw = path.startsWith("/") ? path.slice(1) : `${base}${path}`;
  const parts = [];
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function sourceHash(source) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function withoutKeys(value, keys) {
  return Object.fromEntries(Object.entries(value || {}).filter(([key]) => !keys.includes(key)));
}

function serializableValue(value, seen = new WeakSet()) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return String(value);
  if (Array.isArray(value)) return value.map((item) => serializableValue(item, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = serializableValue(item, seen);
    seen.delete(value);
    return result;
  }
  return String(value);
}

function valueKind(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function valueSummary(value) {
  let serialized;
  let summaryValue;
  try {
    summaryValue = typeof value === "string" ? value : serializableValue(value);
    serialized = typeof value === "string" ? value : JSON.stringify(summaryValue);
  } catch {
    summaryValue = String(value);
    serialized = String(value);
  }
  const normalized = String(serialized ?? "").replace(/\s+/g, " ").trim();
  return {
    kind: valueKind(value),
    length: normalized.length,
    hash: `fnv1a:${sourceHash(normalized)}`,
    digest: semanticValueDigest(summaryValue),
    preview: normalized.length > 132 ? `${normalized.slice(0, 129)}…` : normalized,
  };
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

export { canonicalJson, canonicalValue, channelNamePattern, normalizePath, serializableValue, sourceHash, uniqueStrings, valueKind, valueSummary, withoutKeys };

