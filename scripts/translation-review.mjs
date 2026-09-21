import { createHash } from "node:crypto";

export const textDigest = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;
export const plainRequirement = (text) => text.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ").trim();
export const protectedTokens = (text) => [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);

// Match capitalized normative operators only; preserve a lowercase Swedish
// prohibition after FÅR as well. Ordinary prose still requires author review.
export function normativeOperators(text, language) {
  if (language === "en") return text.match(/\b(?:MUST NOT|MUST|SHOULD NOT|SHOULD|MAY)\b/g) || [];
  const mapping = { "MÅSTE": "MUST", "MÅSTE INTE": "MUST NOT", "FÅR": "MAY", "FÅR INTE": "MUST NOT", "BÖR": "SHOULD", "BÖR INTE": "SHOULD NOT" };
  return (text.match(/(?:MÅSTE|FÅR|BÖR)(?:\s+(?:INTE|inte))?/g) || []).map((word) => mapping[word.toUpperCase().replace(/\s+/g, " ")]);
}

export function verifyTranslation(entry, original, current) {
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const fail = (reason) => { throw new Error(`${entry.id}: ${reason}`); };
  if (entry.id !== original.id || entry.id !== current.id || entry.section !== original.section || entry.section !== current.section) fail("requirement identity changed");
  if (plainRequirement(entry.source) !== original.text) fail("source does not match the frozen Swedish baseline");
  if (textDigest(entry.source) !== entry.sourceDigest || textDigest(entry.target) !== entry.targetDigest) fail("translation digest mismatch");
  if (current.markdown !== entry.target) fail("English wording changed without a translation review update");
  if (!equal(normativeOperators(entry.source, "sv"), normativeOperators(entry.target, "en"))) fail("normative force changed");
  if (!equal(protectedTokens(entry.source), protectedTokens(entry.target))) fail("protected inline tokens changed");
  if (entry.review !== "author-reviewed") fail("missing author review record");
}
