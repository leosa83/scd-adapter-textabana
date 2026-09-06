// RFC 8785 JSON Canonicalization Scheme. This is byte identity, not a runtime profile claim.
export function canonicalize(value) {
  const ancestors = new Set();
  const string = (value) => {
    if (!value.isWellFormed()) throw new TypeError("JCS rejects lone surrogates.");
    return JSON.stringify(value);
  };
  function visit(value) {
    if (value === null || typeof value === "boolean") return String(value);
    if (typeof value === "string") return string(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError("JCS requires finite numbers.");
      return JSON.stringify(value);
    }
    if (typeof value !== "object") throw new TypeError("JCS requires JSON values.");
    if (ancestors.has(value)) throw new TypeError("JCS rejects cycles.");
    const array = Array.isArray(value);
    if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("JCS requires plain objects.");
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === "symbol")) throw new TypeError("JCS rejects symbol keys.");
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!Object.hasOwn(descriptor, "value") || (!descriptor.enumerable && !(array && key === "length"))) throw new TypeError("JCS rejects accessors and hidden properties.");
    }
    ancestors.add(value);
    let result;
    if (array) {
      if (keys.length !== value.length + 1 || keys.some((key) => key !== "length" && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))) throw new TypeError("JCS rejects sparse or decorated arrays.");
      const elements = [];
      for (let index = 0; index < value.length; index++) elements.push(visit(Object.getOwnPropertyDescriptor(value, String(index)).value));
      result = `[${elements.join(",")}]`;
    } else {
      result = `{${keys.sort().map((key) => `${string(key)}:${visit(value[key])}`).join(",")}}`;
    }
    ancestors.delete(value);
    return result;
  }
  return visit(value);
}

// JSON.parse alone discards duplicate keys. Detect them before canonicalizing.
export function parseStrictJson(source) {
  let offset = 0;
  const whitespace = () => { while (/[\x20\t\r\n]/.test(source[offset] || "x")) offset++; };
  const fail = () => { throw new SyntaxError(`Invalid or duplicate-key JSON at offset ${offset}.`); };
  function string() {
    const start = offset++;
    while (offset < source.length) {
      const character = source[offset++];
      if (character === '"') return JSON.parse(source.slice(start, offset));
      if (character === "\\") offset++;
    }
    fail();
  }
  function value(depth = 0) {
    if (depth > 128) throw new RangeError("JSON nesting limit exceeded.");
    whitespace();
    const character = source[offset];
    if (character === '"') return string();
    if (character === "{" || character === "[") {
      const object = character === "{";
      const result = object ? Object.create(null) : [];
      const end = object ? "}" : "]";
      offset++; whitespace();
      if (source[offset] === end) { offset++; return result; }
      while (offset < source.length) {
        whitespace();
        if (object) {
          if (source[offset] !== '"') fail();
          const key = string(); whitespace();
          if (Object.hasOwn(result, key) || source[offset++] !== ":") fail();
          result[key] = value(depth + 1);
        } else result.push(value(depth + 1));
        whitespace();
        if (source[offset] === end) { offset++; return result; }
        if (source[offset++] !== ",") fail();
      }
      fail();
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(source.slice(offset));
    if (!token) fail();
    offset += token[0].length;
    return JSON.parse(token[0]);
  }
  const result = value(); whitespace();
  if (offset !== source.length) fail();
  canonicalize(result);
  return result;
}

export async function canonicalDigest(value) {
  const bytes = new TextEncoder().encode(canonicalize(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
