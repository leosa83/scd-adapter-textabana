import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { sections, overrides } from "../docs/requirement-bindings.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const check = process.argv.includes("--check");
const specification = await read("app/specification.tsx");
const sectionIds = new Set([...specification.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
const navigation = specification.slice(specification.indexOf("const navGroups"), specification.indexOf("const code ="));
for (const match of navigation.matchAll(/\bid: "([^"]+)"/g)) if (!sectionIds.has(match[1])) throw new Error(`Broken section navigation: ${match[1]}`);
const requirements = [];
for (const section of specification.matchAll(/<section\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)) {
  for (const match of section[2].matchAll(/<Requirement id="([^"]+)">([\s\S]*?)<\/Requirement>/g)) {
    const [id, text] = [match[1], match[2]];
    if (!sections[section[1]]) throw new Error(`Missing section binding: ${section[1]}`);
    const binding = { ...sections[section[1]], ...overrides[id] };
    const contract = [`app/specification.tsx#${id}`, ...binding.contract];
    requirements.push({ id, section: section[1], text: text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(), requirementDigest: `sha256:${createHash("sha256").update(text).digest("hex")}`, ...binding, contract,
      verificationStatus: "source-links-only", verificationGap: binding.verification.length ? "Relevant testkälla är länkad; full kravuppfyllelse härleds inte av detta register." : "Ingen direkt verifiering länkad; kravet är inte verifierat av dokumentationsregistret." });
  }
}
const ids = new Set(requirements.map((r) => r.id));
if (ids.size !== requirements.length || !requirements.length) throw new Error("Duplicate or missing requirements");
for (const id of Object.keys(overrides)) if (!ids.has(id)) throw new Error(`Stale binding: ${id}`);
for (const r of requirements) for (const ref of [...r.contract, ...r.implementation, ...r.verification]) await access(new URL(ref.split("#")[0], root));

const standards = JSON.parse(await read("docs/standards-status.json"));
for (const entry of standards.entries) for (const ref of [...entry.sources, ...entry.evidence]) await access(new URL(ref, root));
const table = ["| Standard | Status | Faktisk användning | Begränsning |", "|---|---|---|---|", ...standards.entries.map((r) => `| [${r.name}](${r.upstream}) | ${r.status} | ${r.implemented} | ${r.boundary} |`)].join("\n");
const direction = (await read("docs/STANDARDS_DIRECTION.md")).replace(/<!-- standards:start -->[\s\S]*?<!-- standards:end -->/, `<!-- standards:start -->\n${table}\n<!-- standards:end -->`);
const outputs = new Map([
  ["docs/STANDARDS_DIRECTION.md", direction],
  ["public/docs/requirements.json", `${JSON.stringify({ schema: "textabana.documentation-index/v1", reviewedAt: "2026-09-20", profileConformance: false, interpretation: "Källkoppling och avgränsning per krav; ingen automatisk test- eller standardkonformitet.", requirements }, null, 2)}\n`],
]);
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
process.stdout.write(`${check ? "Verified" : "Generated"} ${requirements.length} requirement bindings and ${standards.entries.length} standard assessments. Full conformance: not claimed.\n`);
