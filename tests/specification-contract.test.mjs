import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadSpecification, parseSpecificationMarkdown } from "../scripts/specification-source.mjs";

// Frozen from the pre-migration React presentation and requirement index.
// Do not regenerate this baseline from the Markdown projection under test.
const baseline = JSON.parse(await readFile(new URL("./fixtures/specification-5.10.json", import.meta.url), "utf8"));

test("the Markdown migration preserves every normative requirement and stable section anchor", async () => {
  const { sections } = await loadSpecification();
  assert.deepEqual(sections.map((section) => section.id), baseline.sectionIds);
  const requirements = sections.flatMap((section) => section.requirements.map((r) => ({ id: r.id, section: section.id, text: r.markdown.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ").trim() })));
  assert.deepEqual(requirements, baseline.requirements);
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
