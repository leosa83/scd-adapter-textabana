import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadSpecification } from "./specification-source.mjs";
import { sections, overrides } from "../docs/requirement-bindings.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const check = process.argv.includes("--check");
const standards = JSON.parse(await read("docs/standards-status.json"));
for (const entry of standards.entries) for (const ref of [...entry.sources, ...entry.evidence]) await access(new URL(ref, root));
const table = ["| Standard | Status | Actual use | Boundary |", "|---|---|---|---|", ...standards.entries.map((r) => `| [${r.name}](${r.upstream}) | ${r.status} | ${r.implemented} | ${r.boundary} |`)].join("\n");
const outputs = new Map();
for (const path of ["docs/STANDARDS_DIRECTION.md", "docs/reference/specification/direction.md"]) {
  const source = await read(path);
  const marker = /<!-- standards:start -->[\s\S]*?<!-- standards:end -->/;
  if (!marker.test(source)) throw new Error(`Missing standards table markers: ${path}`);
  const content = source.replace(marker, `<!-- standards:start -->\n${table}\n<!-- standards:end -->`);
  outputs.set(path, content);
  // Load the specification only after its shared table is current.
  if (!check) await writeFile(new URL(path, root), content);
}
const { catalog, sections: documents } = await loadSpecification();
const requirements = [];
for (const document of documents) {
  for (const requirement of document.requirements) {
    const { id, markdown } = requirement;
    if (!sections[document.id]) throw new Error(`Missing section binding: ${document.id}`);
    const binding = { ...sections[document.id], ...overrides[id] };
    const contract = [`${document.source}#${id}`, ...binding.contract];
    requirements.push({ id, section: document.id, language: document.language,
      text: markdown.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ").trim(),
      requirementDigest: `sha256:${createHash("sha256").update(markdown).digest("hex")}`, ...binding, contract,
      verificationStatus: "source-links-only", verificationGap: binding.verification.length ? "Relevant test sources are linked; this index does not establish full requirement conformance." : "No direct verification is linked; this documentation index does not verify the requirement." });
  }
}
const ids = new Set(requirements.map((r) => r.id));
if (ids.size !== requirements.length || !requirements.length) throw new Error("Duplicate or missing requirements");
for (const id of Object.keys(overrides)) if (!ids.has(id)) throw new Error(`Stale binding: ${id}`);
for (const r of requirements) for (const ref of [...r.contract, ...r.implementation, ...r.verification]) await access(new URL(ref.split("#")[0], root));

outputs.set("public/docs/specification.json", `${JSON.stringify({ schema: "textabana.specification-projection/v1", revision: catalog.revision, groups: catalog.groups, sections: documents.map((section) => ({ id: section.id, source: section.source, label: section.label, language: section.language, number: section.number, layer: section.layer, normative: section.normative, implementation: section.implementation, title: section.title, blocks: section.blocks })) }, null, 2)}\n`);
outputs.set("public/docs/requirements.json", `${JSON.stringify({ schema: "textabana.documentation-index/v2", sourceFormat: "markdown", reviewedAt: "2026-09-21", profileConformance: false, interpretation: "Source references and boundaries per requirement; no automatic test or standards conformance.", requirements }, null, 2)}\n`);
const reference = [
  "# Specification reference", "",
  "For implementation APIs, see the [host SDK and transport reference](sdk.md).", "",
  "Language & Interop draft 0.7, Language 0.4. These Markdown documents are the authored source for the application's Specification view. Edit a section here, then run `npm run docs:build`; check generated projections with `npm run docs:check`.", "",
  "All 34 sections and 144 requirements are authored in English. The [translation ledger](../translation-ledger.json) retains each Swedish source and reviewed English target; the [glossary](../translation-glossary.md) defines the terminology. All 43 code examples retain their original bytes, including deliberate multilingual input. See the [language migration register](../english-migration.md) for the rest of the codebase.", "",
  "The target specification, implementation status and versioned conformance profiles have different authority. Read the [architecture guide](../architecture.md#authority) and [conformance tools](../../conformance/README.md) before making a claim.", "",
  "## Sections", "", "| Section | Source language |", "|---|---|",
  ...documents.map((section) => `| [${section.title}](specification/${section.id}.md) | ${section.language === "en" ? "English" : "Swedish; translation pending"} |`), "",
  "## Stable contracts and history", "",
  "The byte-bound profile documents remain at their established repository paths. Their schema/profile versions and manifest digests must be reviewed together when translating. The [contract source index](../../public/docs/sources.json) links those contracts and their reports. Historical plans remain linked from the [documentation index](../README.md).", "",
].join("\n");
outputs.set("docs/reference/README.md", reference);
await mkdir(new URL("public/docs/", root), { recursive: true });
const sources = [
  ["TEXTABANA_PARSER.md", null],
  ["conformance/README.md", "host"],
  ["SEMANTIC_IDENTITY.md", "semantic"],
  ["SEMANTIC_CONTRACT.md", "contract"],
  ["TEXT_CORE_PROFILE.md", "text-core"],
  ["SCOPED_TEXT_PROFILE.md", "scoped-text"],
  ["CHANNEL_CORE_PROFILE.md", "channel-core"],
  ["SOURCE_MAP_CORE_PROFILE.md", "source-map-core"],
  ["MODULE_GATE_PROFILE.md", "module-gate"],
  ["MODULE_ADMISSION_PROFILE.md", "module-admission"],
];
for (const [path, report] of sources) {
  await access(new URL(path, root));
  if (report) await access(new URL(`public/conformance/${report}-report.json`, root));
}
const sourceLinks = sources.map(([path, report]) => ({ path, href: `https://github.com/leosa83/scd-adapter-textabana/blob/main/${path}`, report: report ? `/conformance/${report}-report.json` : null }));
outputs.set("public/docs/sources.json", `${JSON.stringify({ contracts: sourceLinks, guides: ["docs/INTEGRATION_GUIDE.md", "docs/STANDARDS_DIRECTION.md"].map((path) => ({ path, href: `https://github.com/leosa83/scd-adapter-textabana/blob/main/${path}` })) }, null, 2)}\n`);
const mismatches = [];
for (const [path, content] of outputs) {
  if (check) {
    if (await read(path).catch(() => null) !== content) mismatches.push(path);
  } else await writeFile(new URL(path, root), content);
}
if (mismatches.length) throw new Error(`Stale documentation artifacts: ${mismatches.join(", ")}. Run node scripts/build-specification-docs.mjs`);
// Check local document links without treating code examples as live links.
const authoredGuides = ["README.md", "CONTRIBUTING.md", "docs/README.md", "docs/development.md", "docs/architecture.md", "docs/english-migration.md", "docs/compatibility-5.14.md", "docs/INTEGRATION_GUIDE.md", "docs/STANDARDS_DIRECTION.md", "docs/reference/README.md", "docs/reference/sdk.md", "docs/reference/channel-schemas.md", "docs/translation-glossary.md", "sdk/README.md", "runtime/README.md"];
for (const path of [...authoredGuides, ...documents.map((document) => document.source)]) {
  let fence = null;
  for (const line of (await read(path)).split("\n")) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    for (const match of line.matchAll(/\]\(([^\s)]+)\)/g)) {
      const href = match[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) continue;
      await access(new URL(href.split("#")[0], new URL(path, root)));
    }
  }
}
process.stdout.write(`${check ? "Verified" : "Generated"} ${requirements.length} requirement bindings and ${standards.entries.length} standard assessments. Full conformance: not claimed.\n`);
