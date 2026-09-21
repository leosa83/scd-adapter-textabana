import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadSpecification, parseSpecificationMarkdown } from "../scripts/specification-source.mjs";
import { verifyTranslation, textDigest } from "../scripts/translation-review.mjs";

// Frozen from the pre-migration React presentation and requirement index.
// Do not regenerate this baseline from the Markdown projection under test.
const baseline = JSON.parse(await readFile(new URL("./fixtures/specification-5.10.json", import.meta.url), "utf8"));
const translations = JSON.parse(await readFile(new URL("../docs/translation-ledger.json", import.meta.url), "utf8"));

test("the English reference preserves every requirement identity, modal force and protected token", async () => {
  const { sections } = await loadSpecification();
  assert.deepEqual(sections.map((section) => section.id), baseline.sectionIds);
  assert.ok(sections.every((section) => section.language === "en"));
  const requirements = sections.flatMap((section) => section.requirements.map((r) => ({ ...r, section: section.id })));
  assert.deepEqual(requirements.map((r) => r.id), baseline.requirements.map((r) => r.id));
  assert.deepEqual(translations.requirements.map((r) => r.id), baseline.requirements.map((r) => r.id));
  for (let index = 0; index < requirements.length; index += 1) verifyTranslation(translations.requirements[index], baseline.requirements[index], requirements[index]);
});

test("translation review rejects weakened prohibitions and changed identifiers even after rehashing", () => {
  for (const [id, change, expected] of [
    ["ARCH-001", (text) => text.replace("MUST NOT", "MAY"), /normative force changed/],
    ["VALUE-001", (text) => text.replace("[start, end)", "[start, end]"), /protected inline tokens changed/],
  ]) {
    const entry = structuredClone(translations.requirements.find((r) => r.id === id));
    entry.target = change(entry.target); entry.targetDigest = textDigest(entry.target);
    const original = baseline.requirements.find((r) => r.id === id);
    assert.throws(() => verifyTranslation(entry, original, { id, section: entry.section, markdown: entry.target }), expected);
  }
});

test("the Markdown migration preserves every published code example byte for byte", async () => {
  const { sections } = await loadSpecification();
  for (const section of sections) {
    assert.deepEqual(section.codeExamples.map((source) => createHash("sha256").update(source).digest("hex")), baseline.codeExamples[section.id], `Changed example in ${section.id}`);
  }
});

test("literal examples cannot introduce normative requirements into the document index", () => {
  const literal = '# Example\n\n````md\n```text\n<a id="FALSE-001"></a>\n> **FALSE-001** This is sample input.\n```\n````\n\n<a id="REAL-001"></a>\n> **REAL-001** This is the requirement.\n';
  const parsed = parseSpecificationMarkdown(literal);
  assert.deepEqual(parsed.requirements.map((r) => r.id), ["REAL-001"]);
  assert.equal(parsed.codeExamples.length, 1);
  assert.throws(() => parseSpecificationMarkdown('# Broken\n\n<a id="ONE-001"></a>\n> **TWO-001** Wrong anchor.\n'), /matching Markdown anchor/);
});
