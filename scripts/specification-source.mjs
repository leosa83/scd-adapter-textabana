import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
export const specificationDirectory = "docs/reference/specification/";

// The authoring convention uses ordinary Markdown: one H1 per document and a
// blockquote beginning with a bold requirement ID. Fenced examples are opaque;
// a requirement-looking line inside an example must never become a real claim.
export function parseSpecificationMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  if (!/^# [^#]/.test(lines[0])) throw new Error("Specification documents need one initial H1");
  const title = lines.shift().slice(2).trim();
  const blocks = [], requirements = [], codeExamples = [];
  let prose = [], fence = null, example = [], anchor = null;
  const flush = () => {
    const value = prose.join("\n").trim();
    if (value) blocks.push({ type: "markdown", markdown: value });
    prose = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      prose.push(line);
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        codeExamples.push(example.join("\n")); fence = null; example = [];
      } else example.push(line);
      continue;
    }
    if (marker) { fence = marker[1]; prose.push(line); continue; }
    const anchorMatch = line.match(/^<a id="([A-Z][A-Z0-9-]+)"><\/a>$/);
    if (anchorMatch) {
      if (anchor) throw new Error(`Unpaired requirement anchor: ${anchor}`);
      anchor = anchorMatch[1]; continue;
    }
    const requirement = line.match(/^> \*\*([A-Z][A-Z0-9-]+)\*\* (.+)$/);
    if (requirement) {
      const [, id, first] = requirement;
      if (anchor !== id) throw new Error(`Requirement ${id} needs its matching Markdown anchor`);
      anchor = null; flush();
      const body = [first];
      while (/^> ?/.test(lines[index + 1] || "")) body.push(lines[++index].replace(/^> ?/, ""));
      const content = body.join("\n").trim();
      if (!content) throw new Error(`Empty requirement ${id}`);
      requirements.push({ id, markdown: content });
      blocks.push({ type: "requirement", id, markdown: content });
    } else {
      if (anchor && line.trim()) throw new Error(`Unpaired requirement anchor: ${anchor}`);
      prose.push(line);
    }
  }
  if (fence || anchor) throw new Error("Unclosed code fence or requirement anchor");
  flush();
  return { title, blocks, requirements, codeExamples };
}

export async function loadSpecification() {
  const catalog = JSON.parse(await readFile(new URL(`${specificationDirectory}catalog.json`, root), "utf8"));
  const ids = new Set(), requirements = new Set();
  const sections = [];
  for (const entry of catalog.sections) {
    if (!/^[a-z][a-z0-9-]*$/.test(entry.id) || ids.has(entry.id) || entry.file !== `${entry.id}.md`) throw new Error(`Invalid specification section: ${entry.id}`);
    if (!["en", "sv"].includes(entry.language)) throw new Error(`Missing source language: ${entry.id}`);
    ids.add(entry.id);
    const source = `${specificationDirectory}${entry.file}`;
    const markdown = await readFile(new URL(source, root), "utf8");
    const parsed = parseSpecificationMarkdown(markdown);
    for (const requirement of parsed.requirements) {
      if (requirements.has(requirement.id)) throw new Error(`Duplicate requirement: ${requirement.id}`);
      requirements.add(requirement.id);
    }
    sections.push({ ...entry, source, markdown, ...parsed });
  }
  const navigation = catalog.groups.flatMap((group) => group.ids);
  if (navigation.length !== ids.size || new Set(navigation).size !== ids.size || navigation.some((id) => !ids.has(id))) throw new Error("Specification navigation must cover every section exactly once");
  return { catalog, sections };
}
