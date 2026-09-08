import { parseDocument } from "../runtime/parser.js";

const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const configPattern = /^[ \t]*>>>>![ \t]+config[ \t]+scope-order="declaration:(asc|desc)"[ \t]*$/;

// The JS compiler supplies its own admission product; no Python parsing result is consulted.
export function admitScopedText(source) {
  if (typeof source !== "string" || !source.isWellFormed() || /[\r\uFEFF]/.test(source)) return "unsupported";
  if (Buffer.byteLength(source) > 65536) return "limit";
  const parsed = parseDocument(source), points = Array.from(source);
  if (parsed.ir.directives.some((node) => node.kind !== "ConfigDirective")) return "unsupported";
  for (const line of parsed.ir.sourceLines) {
    if (line.activeScopeIds.length > 32) return "limit";
    if (line.kind.startsWith("fence-") || line.detail?.literal || /^[ \t]*\\(?:>>>>|<<<<)/.test(line.text)) continue;
    if (/^[ \t]*>>>>!/.test(line.text) && (!configPattern.test(line.text) || line.activeBlockIds.length)) return "unsupported";
    if (/^[ \t]+\|/.test(line.text)) return "unsupported";
    if (/^[ \t]*>>>>/.test(line.text) && /[^\x20-\x7e\t]/.test(line.text.replace(/"(?:[^"\\]|\\[\s\S])*"/g, '""'))) return "unsupported";
    if (!/^[ \t]*>>>>/.test(line.text) && line.text.includes("{")) return "unsupported";
    if (/^[ \t]*<<<<(?!\+)/.test(line.text)) {
      if (/[.-]/.test(line.text)) return "unsupported";
      if (!/^[ \t]*<<<<[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*$/.test(line.text)) return "syntax";
    }
    if (/^[ \t]*<<<<\+/.test(line.text) && !/^[ \t]*<<<<\+[ \t]*(?:@id=)?@?[A-Za-z_][A-Za-z0-9_.-]*[ \t]*$/.test(line.text)) return "syntax";
  }
  const stages = [];
  for (const block of parsed.ir.blocks) {
    let depth = 1, parent = block.parentBlockId;
    while (parent) { depth++; parent = parsed.ir.blocks.find((item) => item.blockId === parent)?.parentBlockId; }
    if (depth > 32) return "limit";
    stages.push(...block.pipeline.map((stage, index) => ({ stage, allowed: index === 0 ? ["@inherit"] : [] })));
  }
  stages.push(...parsed.ir.nodes.filter((node) => node.kind === "IntervalOpen").map((node) => ({ stage: node.stage, allowed: ["@id", "@order"] })));
  if (stages.length > 128) return "limit";
  for (const { stage, allowed } of stages) {
    if (!namePattern.test(stage.name)) return "unsupported";
    for (const argument of stage.arguments) {
      const key = argument.name, raw = points.slice(argument.sourceSpan.start, argument.sourceSpan.end).join("");
      if (key.startsWith("@") ? !allowed.includes(key) : !namePattern.test(key)) return "unsupported";
      if (!raw.startsWith(`${key}=`)) return "unsupported";
      const serialized = raw.slice(key.length + 1);
      if (key === "@order") {
        if (!/^-?(0|[1-9][0-9]*)$/.test(serialized) || Math.abs(Number(serialized)) > 1000000) return "unsupported";
      } else {
        if (!serialized.startsWith('"')) return "unsupported";
        try {
          const value = JSON.parse(serialized);
          if (typeof value !== "string" || !value.isWellFormed()) return "unsupported";
          if (key === "@inherit" && !["default", "none"].includes(value)) return "unsupported";
        } catch { return "syntax"; }
      }
    }
  }
  return parsed.executable ? null : "syntax";
}

