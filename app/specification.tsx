import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ShieldCheck } from "lucide-react";
import specification from "../public/docs/specification.json";
import requirementIndex from "../public/docs/requirements.json";

const sections = new Map(specification.sections.map((section) => [section.id, section]));
const requirements = new Map(requirementIndex.requirements.map((entry) => [entry.id, entry]));
const repoRoot = "https://github.com/leosa83/scd-adapter-textabana/blob/main/";
const statusLabels: Record<string, string> = {
  implemented: "Executable subset", defined: "Defined in draft 0.7",
  partial: "Partial implementation", planned: "Planned contract",
  "lab-subset": "Lab subset", "target-contract": "Target contract",
  "development-policy": "Development principle",
};

function documentLink(href: string | undefined, sectionId: string) {
  if (!href) return "";
  const localSection = href.match(/^\.\/([a-z0-9-]+)\.md(?:#(.+))?$/);
  if (localSection && sections.has(localSection[1])) return `#${localSection[2] || localSection[1]}`;
  if (href.startsWith("../../../public/")) return href.replace("../../../public", "");
  if (/^(?:https?:|mailto:|#|\/)/.test(href)) return href;
  return new URL(href, `${repoRoot}docs/reference/specification/${sectionId}.md`).href;
}

function Markdown({ children, sectionId }: { children: string; sectionId: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children }) => <a href={documentLink(href, sectionId)}>{children}</a>,
    table: ({ children }) => <div className="spec-table-wrap" tabIndex={0}><table className="spec-table">{children}</table></div>,
    pre: ({ children }) => <figure className="code-example"><pre className="spec-code" tabIndex={0}>{children}</pre></figure>,
  }}>{children}</ReactMarkdown>;
}

function SourceLinks({ paths }: { paths: string[] }) {
  return paths.map((path, index) => <span key={path}>
    {index > 0 && " · "}
    <a href={`${repoRoot}${path}`}>{path}</a>
  </span>);
}

function Requirement({ id, children }: { id: string; children: ReactNode }) {
  const binding = requirements.get(id);
  return <div className="requirement" id={id}>
    <code>{id}</code>
    <div>
      {children}
      {binding && <details className="spec-evidence">
        <summary lang="en">Evidence and scope · {statusLabels[binding.status] || binding.status}</summary>
        <p>{binding.scope}</p>
        <p lang="en">Contract: <SourceLinks paths={binding.contract} /></p>
        <p lang="en">Implementation: {binding.implementation.length ? <SourceLinks paths={binding.implementation} /> : "No implementation linked."}</p>
        <p lang="en">Verification sources: {binding.verification.length ? <SourceLinks paths={binding.verification} /> : "No direct verification linked."}</p>
        <p lang="en">{binding.verificationGap}</p>
      </details>}
    </div>
  </div>;
}

function SpecNav({ mobile = false }: { mobile?: boolean }) {
  return <nav className={mobile ? "spec-nav mobile" : "spec-nav"} aria-label="Specification contents">
    {specification.groups.map((group) => <div className="spec-nav-group" key={group.label}>
      <p>{group.label}</p>
      {group.ids.map((id) => <a href={`#${id}`} key={id}>{sections.get(id)?.label}</a>)}
    </div>)}
  </nav>;
}

export function Specification() {
  return <div className="docs-layout spec-layout">
    <a className="spec-skip" href="#spec-main">Skip to specification</a>
    <aside className="docs-index spec-index">
      <div className="spec-version">
        <span>Textabana</span>
        <strong>Language &amp; Interop draft 0.7</strong>
        <small>Language 0.4 · typed IR lab-v2 · Editor Kernel and adapters lab-v1</small>
        <small>Documentation revision {specification.revision}</small>
      </div>
      <SpecNav />
      <div className="spec-legend" aria-label="Implementation status">
        <span><i className="implemented" /> Executable within a declared subset</span>
        <span><i className="defined" /> Defined normative contract</span>
        <span><i className="planned" /> Planned implementation</span>
      </div>
    </aside>
    <main className="docs-content spec-content" id="spec-main" tabIndex={-1}>
      <details className="mobile-spec-index"><summary>Contents · Interop 0.7</summary><SpecNav mobile /></details>
      <p className="spec-language-note">English translation is in progress. Sections marked Swedish preserve the existing wording. <a href={`${repoRoot}docs/english-migration.md`}>Translation status</a> · <a href={`${repoRoot}docs/README.md`}>Documentation index</a></p>
      {specification.sections.map((section) => <section className={section.id === "definition" ? "spec-hero" : "docs-section spec-section"} id={section.id} lang={section.language} key={section.id}>
        {section.id === "definition" ? <>
          <div className="spec-kicker" lang="en"><ShieldCheck aria-hidden="true" /> Language &amp; Interop Specification</div>
          <h1>{section.title}</h1>
        </> : <header className="spec-heading" lang="en">
          <span className="spec-number">{section.number}</span>
          <div>
            <p>{section.layer}</p><h2>{section.title}</h2>
            <div className="section-status">
              <span className={`spec-status ${section.normative ? "normative" : "informative"}`}>{section.normative ? "Normative" : "Informative"}</span>
              <span className={`spec-status ${section.implementation}`}>{statusLabels[section.implementation]}</span>
              {section.language === "sv" && <span className="spec-status informative">Swedish</span>}
            </div>
          </div>
        </header>}
        <p className="spec-source-link" lang="en"><a href={`${repoRoot}${section.source}`}>Read this section in the repository</a></p>
        {section.blocks.map((block, index) => block.type === "requirement" && "id" in block
          ? <Requirement id={block.id as string} key={block.id}><Markdown sectionId={section.id}>{block.markdown}</Markdown></Requirement>
          : <Markdown sectionId={section.id} key={index}>{block.markdown}</Markdown>)}
      </section>)}
    </main>
  </div>;
}
