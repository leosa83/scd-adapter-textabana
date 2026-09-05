import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDown,
  Blocks,
  Bot,
  Box,
  Braces,
  CheckCircle2,
  CircleDashed,
  Code2,
  Database,
  FileJson,
  GitBranch,
  Layers3,
  Link2,
  MapPinned,
  Network,
  PanelRight,
  RadioTower,
  Route,
  Rows3,
  Search,
  ShieldCheck,
  Workflow,
} from "lucide-react";

type StatusTone = "normative" | "informative" | "implemented" | "defined" | "partial" | "planned";

type NavGroup = {
  label: string;
  items: Array<{ id: string; label: string }>;
};

const navGroups: NavGroup[] = [
  {
    label: "Översikt",
    items: [
      { id: "definition", label: "Definition" },
      { id: "status", label: "Status & normer" },
      { id: "html", label: "Textabana vs HTML" },
      { id: "architecture", label: "Arkitektur" },
      { id: "contract", label: "Semantiskt kontrakt" },
    ],
  },
  {
    label: "Språket",
    items: [
      { id: "source-value", label: "Källa & värden" },
      { id: "syntax", label: "Syntax & argument" },
      { id: "blocks-intervals", label: "Block & intervall" },
      { id: "inheritance", label: "Inheritance" },
      { id: "properties-modules", label: "Properties & includes" },
      { id: "processing", label: "Processing model" },
    ],
  },
  {
    label: "Kanoniska kontrakt",
    items: [
      { id: "ir-plan", label: "IR & ExecutionPlan" },
      { id: "anchors", label: "Anchor & SourceMap" },
      { id: "result", label: "TextabanaResult" },
      { id: "channels", label: "Typade kanaler" },
      { id: "system-out", label: "system.out" },
      { id: "artifacts", label: "Artifacts & sinks" },
    ],
  },
  {
    label: "Runtime",
    items: [
      { id: "module-manifest", label: "Manifest & funktioner" },
      { id: "runtime-protocol", label: "Runtime-protokoll" },
      { id: "runs", label: "Runs & transaktioner" },
      { id: "security", label: "Säkerhet" },
    ],
  },
  {
    label: "Interop-profiler",
    items: [
      { id: "adapter-contract", label: "Adapterkontrakt" },
      { id: "notebooks", label: "Jupyter & notebooks" },
      { id: "data-ai", label: "Data, AI & ML" },
      { id: "annotation-observability", label: "Annotation & observability" },
    ],
  },
  {
    label: "Konformitet",
    items: [
      { id: "use-cases", label: "Verkliga problem" },
      { id: "conformance", label: "Profiler & versioner" },
      { id: "errors", label: "Felmodell" },
      { id: "playgrounds", label: "Playground Labs" },
      { id: "glossary", label: "Begrepp" },
    ],
  },
];

const code = (...lines: string[]) => lines.join("\n");

function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={["spec-status", tone].join(" ")}>{children}</span>;
}

function SpecNav({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav className={mobile ? "spec-nav mobile" : "spec-nav"} aria-label="Specifikationens innehåll">
      {navGroups.map((group) => (
        <div className="spec-nav-group" key={group.label}>
          <p>{group.label}</p>
          {group.items.map((item) => (
            <a href={"#" + item.id} key={item.id}>{item.label}</a>
          ))}
        </div>
      ))}
    </nav>
  );
}

function SectionHeading({
  number,
  layer,
  title,
  normative = true,
  implementation = "defined",
}: {
  number: string;
  layer: string;
  title: ReactNode;
  normative?: boolean;
  implementation?: "implemented" | "defined" | "partial" | "planned";
}) {
  const implementationLabel = {
    implemented: "Körbar language 0.4-subset",
    defined: "Definierat i draft 0.5",
    partial: "Interaktiv subset",
    planned: "Contract-only / planerad",
  }[implementation];

  return (
    <header className="spec-heading">
      <span className="spec-number">{number}</span>
      <div>
        <p>{layer}</p>
        <h2>{title}</h2>
        <div className="section-status">
          <StatusBadge tone={normative ? "normative" : "informative"}>
            {normative ? "Normativt" : "Informativt"}
          </StatusBadge>
          <StatusBadge tone={implementation}>{implementationLabel}</StatusBadge>
        </div>
      </div>
    </header>
  );
}

function Requirement({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className="requirement">
      <code>{id}</code>
      <p>{children}</p>
    </div>
  );
}

function CodeExample({
  title,
  language,
  status = "Illustrativt",
  code: source,
}: {
  title: string;
  language: string;
  status?: string;
  code: string;
}) {
  return (
    <figure className="code-example">
      <figcaption>
        <span>{title}</span>
        <small>{status} · {language}</small>
      </figcaption>
      <pre className="spec-code" tabIndex={0}><code>{source}</code></pre>
    </figure>
  );
}

function SpecTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="spec-table-wrap" tabIndex={0}>
      <table className="spec-table">
        <caption>{caption}</caption>
        <thead>
          <tr>{headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => cellIndex === 0
                ? <th scope="row" key={cellIndex}>{cell}</th>
                : <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Callout({
  title,
  icon,
  tone = "info",
  children,
}: {
  title: string;
  icon: ReactNode;
  tone?: "info" | "warning" | "success";
  children: ReactNode;
}) {
  return (
    <aside className={["spec-callout", tone].join(" ")}>
      <span aria-hidden="true">{icon}</span>
      <div><strong>{title}</strong><p>{children}</p></div>
    </aside>
  );
}

export function Specification() {
  return (
    <div className="docs-layout spec-layout">
      <a className="spec-skip" href="#spec-main">Hoppa till specifikationen</a>

      <aside className="docs-index spec-index">
        <div className="spec-version">
          <span>Textabana</span>
          <strong>Language & Interop draft 0.5</strong>
          <small>Language 0.4 · Adapter + Data + Notebook + Annotation + Conformance lab-v1</small>
        </div>
        <SpecNav />
        <div className="spec-legend" aria-label="Statusförklaring">
          <span><i className="implemented" /> Körbart i playgroundens deklarerade subset</span>
          <span><i className="defined" /> Normativt definierat i draft 0.5</span>
          <span><i className="planned" /> Definierat men ännu inte körbart här</span>
        </div>
      </aside>

      <main className="docs-content spec-content" id="spec-main" tabIndex={-1}>
        <details className="mobile-spec-index">
          <summary>Innehåll · Interop 0.5</summary>
          <SpecNav mobile />
        </details>

        <section className="spec-hero" id="definition" aria-labelledby="definition-title">
          <div className="spec-kicker"><ShieldCheck aria-hidden="true" /> Language & Interop Specification</div>
          <div className="hero-status">
            <StatusBadge tone="normative">Interop draft 0.5</StatusBadge>
            <StatusBadge tone="implemented">Språkkärna 0.4-subset</StatusBadge>
            <StatusBadge tone="partial">Sju labs · conformance gate live</StatusBadge>
          </div>
          <h1 id="definition-title">Läsbar text som körbar, positionsmedveten och flerkanalig semantisk källa.</h1>
          <p className="hero-definition">Textabana gör läsbar text till en körbar, positionsmedveten och flerkanalig semantisk källa — oberoende av hur resultatet senare presenteras. Det är ett <em>source-first</em>, host-neutralt lager som kompilerar texten till en explicit plan och producerar en primär render samt valfritt många typade outputs.</p>
          <div className="definition-grid">
            <article><FileJson aria-hidden="true" /><strong>Kanonisk källa</strong><p>Människan arbetar i läsbar text. Syntaxen är styrdata och försvinner ur renderingen.</p></article>
            <article><Braces aria-hidden="true" /><strong>Explicit plan</strong><p>Block, öppna intervall, properties och includes blir host-neutral IR och en deterministisk körplan.</p></article>
            <article><RadioTower aria-hidden="true" /><strong>Flera outputs</strong><p><code>return</code> bygger render. <code>emit</code> producerar typade kanalevents utan dolt återflöde.</p></article>
            <article><Link2 aria-hidden="true" /><strong>Spårbar identitet</strong><p>Anchors och SourceMaps binder resultat, annotationer och data tillbaka till en versionerad källa.</p></article>
          </div>
          <Callout title="Avgränsning" icon={<CircleDashed />} tone="info">
            Textabana är inte ett notebookformat, en Python-kernel, ett DataFrame-format, en annotationsontologi eller en experimenttracker. Jupyter, Arrow, W3C Annotation, MLflow och liknande system är värdar, format eller adaptrar kring kärnan.
          </Callout>
        </section>

        <section className="docs-section spec-section" id="status">
          <SectionHeading number="00" layer="Översikt" title="Status, normativa ord och kompatibilitet" implementation="partial" />
          <p className="lead">Detta dokument skiljer strikt på vad språket betyder och vad webbplaygroundens nuvarande runtime råkar implementera. Semantik får inte härledas ur en enskild UI-implementation.</p>
          <SpecTable
            caption="Dokumentets två statusdimensioner"
            headers={["Dimension", "Värden", "Betydelse"]}
            rows={[
              [<code key="n">Kravstatus</code>, "Normativt · Informativt", "Anger om texten definierar konformt beteende eller beskriver en adapter/rekommendation."],
              [<code key="i">Implementation</code>, "Körbar language 0.4-subset · Interaktiv subset · Definierat i draft 0.5 · Contract-only", "Anger vad webbplaygrounden faktiskt kör, vad den endast visualiserar delvis och vad som fortfarande är ett kontrakt för kommande implementation."],
            ]}
          />
          <div className="norm-terms">
            <article><strong>MÅSTE</strong><p>Absolut krav för den profil som gör anspråk på konformitet.</p></article>
            <article><strong>BÖR</strong><p>Rekommenderat krav som endast får frångås av dokumenterat skäl.</p></article>
            <article><strong>FÅR</strong><p>Tillåtet val som inte får ändra övrig normativ semantik.</p></article>
          </div>
          <Requirement id="STATUS-001">En implementation MÅSTE ange exakt språkversion, IR-version, resultatschemaversion och varje adapterprofil den stödjer.</Requirement>
          <Requirement id="STATUS-002">Stöd för godtycklig JSON eller en liknande funktion är inte tillräckligt för att hävda stöd för en namngiven konformitetsprofil.</Requirement>
          <Requirement id="STATUS-003">Nuvarande Playground implementerar sju avgränsade vyer: Language & Scope, Editor Metadata, Channel & Result, Data & Lineage, Notebook Interop, Annotation & Review och Conformance. Alla läser samma run. Conformance Lab producerar en maskinläsbar, run-bunden rapport med härledda subset-anspråk, versionssatt golden snapshot, negativa cases och kooperativ cancellation. <code>annotation/1</code> är en playground-subset; verklig modellkörning och <code>ml-lineage/1</code> är fortsatt contract-only. Ingen interaktiv subset, passerad negativ fixture eller kontraktsregistrering är full profilkonformitet.</Requirement>
        </section>

        <section className="docs-section spec-section" id="html">
          <SectionHeading number="01" layer="Core boundary" title="Textabana och HTML löser olika problem" implementation="defined" />
          <p className="lead">HTML kan tillsammans med JavaScript bygga avancerade metadataapplikationer. Skillnaden är inte vad som över huvud taget går att programmera, utan vilken semantik som standardiseras och vilken artefakt som förblir den kanoniska källan.</p>
          <Callout title="Den avgörande skillnaden" icon={<Braces />} tone="success">
            HTML beskriver ett dokumentträd som en webbläsare kan presentera. Textabana beskriver vilka semantiska processer som gäller över vilka delar av en text, i vilken ordning, och vilka spårbara resultat de producerar.
          </Callout>
          <SpecTable
            caption="HTML jämfört med Textabana"
            headers={["Dimension", "HTML", "Textabana"]}
            rows={[
              ["Primär artefakt", "Ett märkt elementträd för webben.", "Läsbar, versionerad text som kan leva utanför webben."],
              ["Grundstruktur", "En strikt nästlad DOM.", "Ett blockträd plus öppna intervall som får överlappa och korsa."],
              ["Beteende", "Definieras normalt av separat, applikationsspecifik JavaScript.", "Deklarerade funktioner, pipelines, scope-ordning och inheritance ingår i språkmodellen."],
              ["Primär output", "DOM och browserrendering.", "TextabanaResult med render, typade channels, artifacts, diagnostics och provenance."],
              ["Metadata", "Attribut och data-* på element; betydelsen bestäms av applikationen.", "Schema-kontrollerade events som binds till källan via Anchor och SourceMap."],
              ["Position", "DOM-noder, selectors och offsets i den renderade strukturen.", "Versionerad källidentitet; row, line och DOM-position är utbytbara projektioner."],
              ["Ordning", "Bestäms av den aktuella applikationens event- och JavaScriptkod.", "Är normativ genom pipeline, @order, aktiva scopes och inheritance-policy."],
              ["Host", "Webbläsar- och DOM-orienterad.", "Host-neutral: editor, notebook, Python/R/Julia, server, datapipeline eller webb."],
              ["Korsande intervall", "Kan inte uttryckas som ett enda giltigt nästlat elementträd utan fragmentering.", "Är ett förstaklassbegrepp med explicit cross-policy och bevarade scope-id:n."],
            ]}
          />
          <div className="two-column-copy html-examples">
            <div>
              <h3>HTML lagrar ett färdigt påstående</h3>
              <CodeExample
                title="Metadata i ett DOM-element"
                language="html"
                code={code(
                  '<p data-kind="claim" data-confidence="0.94">',
                  "  Textabana kan användas för metadataeditorer.",
                  "</p>"
                )}
              />
              <p>Elementet bär metadata, men HTML definierar inte vilken process som skapade den, hur den validerades eller hur den ska följa med tillbaka till en redigerad källtext.</p>
            </div>
            <div>
              <h3>Textabana deklarerar processen</h3>
              <CodeExample
                title="Semantiska funktioner över källtext"
                language="textabana"
                code={code(
                  ">>>>+ normalize @id=clean @order=10",
                  ">>>>+ claims.extract @id=claims @order=20",
                  "",
                  "Textabana kan användas för metadataeditorer.",
                  "",
                  "<<<<+ @id=clean",
                  "<<<<+ @id=claims"
                )}
              />
              <p>Samma run kan producera en ren render, ett typat claim-event, en editorannotation, ett Anchor och proveniens utan att bädda in allt i den synliga texten.</p>
            </div>
          </div>
          <div className="architecture-flow html-flow" aria-label="HTML som Textabana-adapter">
            <div><FileJson aria-hidden="true" /><strong>Textabana source</strong><span>kanonisk semantik</span></div>
            <ArrowDown aria-hidden="true" />
            <div className="architecture-primary"><RadioTower aria-hidden="true" /><strong>TextabanaResult</strong><span>render · channels · anchors</span></div>
            <ArrowDown aria-hidden="true" />
            <div><Code2 aria-hidden="true" /><strong>HTML-adapter</strong><span>projection policy</span></div>
            <ArrowDown aria-hidden="true" />
            <div><PanelRight aria-hidden="true" /><strong>DOM</strong><span>en möjlig presentation</span></div>
          </div>
          <Requirement id="HTML-ADAPTER-001">HTML FÅR vara renderformat och editorhost, men DOM-noder eller DOM-offsets får inte ersätta Textabanas kanoniska Anchor-identitet.</Requirement>
          <Requirement id="HTML-ADAPTER-002">När korsande intervall projiceras till HTML MÅSTE adaptern fragmentera presentationen utan att förlora scope-id, SourceMap eller exekveringssemantik.</Requirement>
          <Requirement id="HTML-ADAPTER-003">En HTML-adapter får presentera eller sanera resultatet men får inte göra browserordning, DOM-nästling eller eventtiming till ny språksemantik.</Requirement>
        </section>

        <section className="docs-section spec-section" id="architecture">
          <SectionHeading number="02" layer="Översikt" title="En kärna, flera värdar" normative={false} implementation="defined" />
          <p className="lead">Textabana placerar integrationsgränsen efter en tydlig, portabel resultatmodell. Värdar får presentera och transportera semantiken, men inte skriva om den.</p>
          <div className="architecture-flow" aria-label="Textabanas arkitektur">
            <div><FileJson aria-hidden="true" /><strong>Source</strong><span>.tba · .md · notebook · API</span></div>
            <ArrowDown aria-hidden="true" />
            <div><Braces aria-hidden="true" /><strong>Compiler</strong><span>IR · SourceMap · Plan</span></div>
            <ArrowDown aria-hidden="true" />
            <div><Code2 aria-hidden="true" /><strong>Runtime</strong><span>block · intervall · pipeline</span></div>
            <ArrowDown aria-hidden="true" />
            <div className="architecture-primary"><RadioTower aria-hidden="true" /><strong>Result</strong><span>render · channels · provenance</span></div>
            <ArrowDown aria-hidden="true" />
            <div><Network aria-hidden="true" /><strong>Adapters</strong><span>Jupyter · Arrow · LSP · MLflow</span></div>
          </div>
          <CodeExample
            title="Abstrakt maskin"
            language="contract"
            status="Normativ modell"
            code={code(
              "Compile(SourceDocument, ModuleLock, HostCapabilities)",
              "  -> { IR, SourceMap, ExecutionPlan, Diagnostics }",
              "",
              "Execute(ExecutionPlan, Inputs, RunProfile)",
              "  -> TextabanaResult",
              "",
              "TextabanaResult",
              "  = Render + ChannelSnapshots + Artifacts + Provenance + Diagnostics"
            )}
          />
          <Requirement id="ARCH-001">En host-adapter FÅR projicera ett resultat till sin egen UI- eller transportmodell men FÅR INTE ändra eventets mening, identitet, anchor eller proveniens.</Requirement>
          <Requirement id="ARCH-002">Kompilering och exekvering MÅSTE kunna beskrivas utan beroende till JavaScript, Python, Jupyter eller en specifik editor.</Requirement>
        </section>

        <section className="docs-section spec-section contract-section" id="contract">
          <SectionHeading number="03" layer="Översikt" title="Det semantiska kontraktet" implementation="defined" />
          <p className="lead">Följande invariants är ryggraden i språket. En optimering, adapter eller framtida syntax får inte bryta dem.</p>
          <ol className="invariant-list">
            <li><span>01</span><p>Källsnapshoten är immutable och versionerad.</p></li>
            <li><span>02</span><p>Kontrollsyntax syns inte i renderingen, utom när den uttryckligen escapats som literal text.</p></li>
            <li><span>03</span><p>Block är balanserade träd; intervall är ordnade aktiva scope-mängder och inte ett falskt träd.</p></li>
            <li><span>04</span><p>Samma deterministiska inputs och plan ger samma värde, eventinnehåll och eventordning.</p></li>
            <li><span>05</span><p>Default är <code>block output → ambient interval input</code>, exakt en gång vid blockgränsen.</p></li>
            <li><span>06</span><p>Ett explicit <code>@intervals</code>-steg innebär att ingen implicit intervallinjektion sker.</p></li>
            <li><span>07</span><p><code>return</code> påverkar primär pipeline; <code>emit</code> påverkar endast en sidokanal.</p></li>
            <li><span>08</span><p>Inheritance omfattar hela funktionsanropet: både returvärde och emissioner.</p></li>
            <li><span>09</span><p>Kanaler är append-only inom en run och läses aldrig implicit av samma pipeline.</p></li>
            <li><span>10</span><p>Global <code>sequence</code> är unik, monoton och härledd ur planen — aldrig ur väggklockan.</p></li>
            <li><span>11</span><p>Commit är atomisk. <code>tentative</code> är inte samma sak som durable output.</p></li>
            <li><span>12</span><p>Beständiga positioner binds till dokumentversion och Anchor; row och line är projektioner.</p></li>
            <li><span>13</span><p><code>mapping=exact</code> kräver verifierbar output–input-relation.</p></li>
            <li><span>14</span><p>Manifest, digest och kapabiliteter löses före modulkod exekveras.</p></li>
            <li><span>15</span><p>Stora eller binära resultat refereras som artifacts i stället för att bäddas in i kontrollplanet.</p></li>
            <li><span>16</span><p>Hemligheter serialiseras aldrig i source, IR, events, resultat eller loggar.</p></li>
          </ol>
        </section>

        <section className="docs-section spec-section" id="source-value">
          <SectionHeading number="04" layer="Language" title="SourceDocument och TextabanaValue" implementation="defined" />
          <p className="lead">Källan är textorienterad, men runtimevärdet är inte begränsat till en sträng. Ett explicit värdekuvert gör pipelines typbara över språkgränser.</p>
          <SpecTable
            caption="SourceDocument — minsta kanoniska fält"
            headers={["Fält", "Typ", "Semantik"]}
            rows={[
              [<code key="documentId">documentId</code>, "URI eller logiskt ID", "Stabil identitet över revisioner."],
              [<code key="documentVersion">documentVersion</code>, "SHA-256", "Digest av normaliserad UTF-8-källa. CRLF och CR blir LF; ingen Unicode-normalisering görs."],
              [<code key="baseUri">baseUri</code>, "URI", "Bas för include-resolution och relativa artifactreferenser."],
              [<code key="source">source</code>, "UTF-8 text", "Den exakta immutable snapshot som kompileringen är bunden till."],
            ]}
          />
          <SpecTable
            caption="TextabanaValue — core kinds"
            headers={["kind", "Avsikt", "Dataplan"]}
            rows={[
              [<code key="text">text</code>, "Text med mediaType, normalt text/plain eller text/markdown.", "Inline"],
              [<code key="document">document</code>, "Strukturerat dokumentvärde.", "Inline eller ArtifactRef"],
              [<code key="scalar">scalar</code>, "Boolean, tal, sträng eller null.", "Inline JSON"],
              [<code key="object">object</code>, "Schema-kontrollerat objekt.", "Inline JSON"],
              [<code key="table">table</code>, "Tabell med schema och record identity.", "Arrow eller ArtifactRef"],
              [<code key="tensor">tensor</code>, "N-dimensionellt värde med dtype och shape.", "DLPack, Arrow eller ArtifactRef"],
              [<code key="graph">graph</code>, "Noder och relationer.", "Schema-kontrollerat objekt/artifact"],
              [<code key="mime">mime-bundle</code>, "Flera representationer av samma logiska värde.", "MIME-map"],
              [<code key="artifact">artifact-ref</code>, "Referens till stor eller binär data.", "Opaque handle + digest"],
            ]}
          />
          <Requirement id="VALUE-001">Kanoniska offsets MÅSTE vara nollbaserade Unicode-code-point-offsets och använda halvöppna intervall <code>[start, end)</code>.</Requirement>
          <Requirement id="VALUE-002">En sträng FÅR vara shorthand för <code>kind=text</code>. Ingen annan tyst typkonvertering är tillåten.</Requirement>
          <Requirement id="VALUE-003">Pipelinekanter MÅSTE typkontrolleras mot funktionens <code>accepts</code> och <code>returns</code> när schema är känt.</Requirement>
        </section>

        <section className="docs-section spec-section" id="syntax">
          <SectionHeading number="05" layer="Language" title="Lexikal syntax, argument och pipelines" implementation="partial" />
          <p className="lead">Modaliteten är synlig direkt i texten. Parsern behöver aldrig gissa om en rad öppnar struktur, aktiverar ett kontinuerligt scope eller deklarerar en kompilatorinställning.</p>
          <SpecTable
            caption="Markörfamiljer"
            headers={["Markör", "Roll", "Krav"]}
            rows={[
              [<code key="directive">&gt;&gt;&gt;&gt;!</code>, "Direktiv", "Påverkar compilation; producerar inget värde."],
              [<code key="open-block">&gt;&gt;&gt;&gt;</code>, "Öppna block", "MÅSTE stängas strukturellt."],
              [<code key="close-block">&lt;&lt;&lt;&lt;</code>, "Stäng block", "MÅSTE matcha öppningens första funktionsnamn."],
              [<code key="open-interval">&gt;&gt;&gt;&gt;+</code>, "Aktivera intervall", "Lägger till en identifierbar scope-instans."],
              [<code key="close-interval">&lt;&lt;&lt;&lt;+</code>, "Avaktivera intervall", "Stänger exakt @id eller senast öppnade aktiva instans med namnet."],
              [<code key="pipe">|</code>, "Pipeline", "Kör steg vänster till höger."],
              [<code key="properties">{"{ ... }"}</code>, "Properties", "Fäster metadata på en Markdown-AST-enhet."],
            ]}
          />
          <CodeExample
            title="Alla syntaktiska ytor"
            language="textabana"
            status="Normativ syntax"
            code={code(
              '>>>>! include "./modules/core.js"',
              '>>>>! config scope-order="declaration:asc"',
              "",
              ">>>>+ normalize @id=clean @order=10",
              "",
              '>>>> summarize sentences=2',
              '  | tag class="abstract"',
              "",
              "Text {.claim priority=10}",
              "<<<< summarize",
              "",
              "<<<<+ @id=clean"
            )}
          />
          <div className="rule-grid compact">
            <article><strong>Funktionsargument</strong><p><code>sentences=2</code> och andra vanliga argument valideras mot funktionens JSON Schema och skickas till funktionen.</p></article>
            <article><strong>Engine controls</strong><p><code>@id</code>, <code>@order</code>, <code>@inherit</code> och <code>@cross</code> styr motorn och skickas inte som funktionsargument.</p></article>
            <article><strong>Literal syntax</strong><p>Markörer känns endast igen vid logisk radstart utanför fenced code. En U+005C-prefix gör markörraden literal i 0.4.</p></article>
            <article><strong>Kommentarer</strong><p>Språket definierar ingen fristående <code>{"//"}</code>-kommentar. Prosa eller en framtida explicit directive ska användas.</p></article>
          </div>
          <Requirement id="SYNTAX-001">Kontrollrader, stängningsrader och fristående propertyrader MÅSTE avlägsnas från primär render.</Requirement>
          <Requirement id="SYNTAX-002">Okända engine controls MÅSTE ge kompileringsdiagnostik; de får inte tyst skickas vidare till funktionen.</Requirement>
        </section>

        <section className="docs-section spec-section" id="blocks-intervals">
          <SectionHeading number="06" layer="Language" title="Block är träd. Intervall är öppna scope-fält." implementation="implemented" />
          <div className="modality-grid">
            <article><Blocks aria-hidden="true" /><strong>Block</strong><p>Strikt balanserade. Ett inre block ersätts av sitt resultat innan omgivande block körs.</p><code>outer(inner(text))</code></article>
            <article><Route aria-hidden="true" /><strong>Intervall</strong><p>Behöver inte stängas LIFO. Varje maximalt segment med samma aktiva scope-set körs som en enhet.</p><code>ordered(activeScopes)</code></article>
          </div>
          <CodeExample
            title="Nästad intervallinvers"
            language="textabana"
            status="Konformitetsfixture"
            code={code(
              ">>>>+ base64encode @id=encoder",
              "",
              ">>>>+ base64decode @id=decoder",
              "",
              "<base64decode><base64encode> Textabana kan transformera den här texten </base64encode></base64decode>",
              "",
              "<<<<+ @id=encoder",
              "<<<<+ @id=decoder"
            )}
          />
          <p>Med deklarationsordning stigande körs <code>base64encode</code> före <code>base64decode</code>. Resultatet blir därför ursprungstexten. Exemplet visar att exekveringsordningen bestäms av scope-ordningen — inte av stängningsordningen.</p>
          <h3>Sortering av samtidiga intervall</h3>
          <SpecTable
            caption="Total ordning för aktiva intervall"
            headers={["Del", "Regel", "Tie-break"]}
            rows={[
              [<code key="order">explicit @order</code>, "Ett ändligt numeriskt värde har företräde.", "Declaration sequence."],
              [<code key="implicit">utan @order</code>, "Declaration sequence används som ordervärde.", "Declaration sequence."],
              [<code key="direction">riktning</code>, "Stigande är default; fallande måste anges i config.", "Dokumentomfattande konfiguration."],
            ]}
          />
          <Requirement id="SCOPE-001">Ett intervall FÅR anropas flera gånger under sin livstid när förändringar i andra aktiva scopes skapar flera maximala segment.</Requirement>
          <Requirement id="SCOPE-002">Ett explicit <code>@id</code> BÖR användas för beständig adressering. Ett genererat id är endast stabilt inom samma dokumentversion.</Requirement>
          <Requirement id="SCOPE-003">Block MÅSTE vara strikt nästlade. Intervall FÅR överlappa och korsa varandra eftersom de representeras separat från blockträdet.</Requirement>
        </section>

        <section className="docs-section spec-section" id="inheritance">
          <SectionHeading number="07" layer="Language" title="Block har full kontroll över intervallarv" implementation="implemented" />
          <p className="lead">När ett block ligger i aktiva intervall körs dess kompletta blockpipeline först. Blockets output blir därefter input till de ambienta intervallen i scope-ordning. Det är språkets naturliga default.</p>
          <div className="default-flow">
            <span>Källtext</span><ArrowDown aria-hidden="true" /><span>Blockpipeline</span><ArrowDown aria-hidden="true" /><span>Ambient intervals</span><ArrowDown aria-hidden="true" /><span>Output</span>
          </div>
          <SpecTable
            caption="Inheritance policies"
            headers={["Policy", "Urval", "Placering"]}
            rows={[
              [<code key="default">@inherit=default</code>, "Alla ambienta intervall.", "Implicit efter hela blockpipelinen."],
              [<code key="none">@inherit=none</code>, "Inga intervall.", "Blocket är en isolerad ö."],
              [<code key="only">@inherit=only</code>, "Endast angivna namn eller id:n.", "Implicit efter blockpipelinen."],
              [<code key="except">@inherit=except</code>, "Alla utom angivna namn eller id:n.", "Implicit efter blockpipelinen."],
              [<code key="explicit">@inherit=explicit</code>, "Endast explicit valda intervall.", "Där varje virtuellt @intervals-steg står."],
            ]}
          />
          <CodeExample
            title="Explicit intervallplacering"
            language="textabana"
            status="Normativ syntax"
            code={code(
              ">>>> extract @inherit=explicit",
              "  | @intervals only=[clean,redaction]",
              "  | summarize sentences=3",
              "  | @intervals only=[translation,provenance]",
              "  | bullet",
              "",
              "Text",
              "<<<< extract"
            )}
          />
          <Requirement id="INHERIT-001">Förekomsten av minst ett <code>@intervals</code>-steg MÅSTE stänga av all implicit intervallinjektion för blocket.</Requirement>
          <Requirement id="INHERIT-002">Urval med funktionsnamn matchar alla aktiva instanser med namnet; urval med <code>@id</code> matchar exakt en instans.</Requirement>
          <Requirement id="INHERIT-003">Inheritance styr hela intervallanropet, inklusive dess returvärde och emissioner. Redan emitterade events får aldrig pipas vidare som text.</Requirement>
          <h3>Korsning mellan block och intervall</h3>
          <SpecTable
            caption="Cross policies"
            headers={["Policy", "Algoritm", "Status"]}
            rows={[
              [<code key="error">error</code>, "Avvisa partiell korsning före exekvering.", <StatusBadge key="s1" tone="implemented">Default 0.3</StatusBadge>],
              [<code key="split">split</code>, "Partitionera blocket vid scopegränser och kör blocket per segment.", <StatusBadge key="s2" tone="defined">Definierat 0.4</StatusBadge>],
              [<code key="promote">promote</code>, "Applicera korsande intervall på hela blockresultatet.", <StatusBadge key="s3" tone="defined">Definierat 0.4</StatusBadge>],
              [<code key="truncate">truncate</code>, "Avsluta intervallets effekt vid blockgränsen.", <StatusBadge key="s4" tone="defined">Definierat 0.4</StatusBadge>],
              [<code key="preserve">preserve</code>, "Kör blocket en gång och applicera scope endast på motsvarande outputsegment via verifierad segmentmap.", <StatusBadge key="s5" tone="defined">Definierat 0.4</StatusBadge>],
            ]}
          />
          <Callout title="Säker mapping" icon={<AlertTriangle />} tone="warning">
            <code>preserve</code> MÅSTE nekas för reducerande eller aggregerande funktioner som inte levererar ett verifierbart mapping proof.
          </Callout>
        </section>

        <section className="docs-section spec-section" id="properties-modules">
          <SectionHeading number="08" layer="Language" title="Properties beskriver; includes levererar beteende" implementation="partial" />
          <div className="two-column-copy">
            <div>
              <h3>Properties</h3>
              <p>Attributlistor fästs på Markdown-AST-enheter, lagras i IR och försvinner ur renderingen. De exekverar ingenting av sig själva.</p>
              <CodeExample
                title="Lättviktig semantik"
                language="markdown + textabana"
                code={code(
                  "Den centrala slutsatsen.",
                  "",
                  "{.claim .verified priority=10 confidence=0.94}",
                  "",
                  '## Evidens {.evidence source="PARES"}'
                )}
              />
            </div>
            <div>
              <h3>Includes</h3>
              <p>Skriptning är include-baserad. Compiler löser först en modulgraf och initierar därefter varje unik modul enligt vald run-profil.</p>
              <CodeExample
                title="Modulimport med alias"
                language="textabana"
                status="0.4-defined"
                code={code(
                  '>>>>! include "pkg:textabana/claims@2" as claims',
                  '>>>>! include "./modules/redaction.py" as privacy',
                  "",
                  ">>>> claims.extract",
                  "Text",
                  "<<<< claims.extract"
                )}
              />
            </div>
          </div>
          <Requirement id="PROPERTY-001"><code>@order</code> ordnar funktioner. En property som <code>priority</code> påverkar endast ordning om en uttrycklig funktion läser den.</Requirement>
          <Requirement id="MODULE-001">Compiler MÅSTE normalisera URI:er, bygga en DAG, upptäcka cykler och exportkollisioner samt pinna resolved URI, version och SHA-256 innan modulkod körs.</Requirement>
          <Requirement id="MODULE-002">Samma normaliserade URI och digest identifierar samma modulinstans. Modulen initieras en gång per fresh run, eller en gång per namngiven session i sessionprofilen.</Requirement>
          <Requirement id="MODULE-003">Cache FÅR inte ändra semantik. Återanvänd sessionstate, modulbyte eller nondeterministisk replay MÅSTE framgå av proveniens.</Requirement>
        </section>

        <section className="docs-section spec-section" id="processing">
          <SectionHeading number="09" layer="Language" title="Processing model — från källa till commit" implementation="partial" />
          <CodeExample
            title="Sammanhängande referensdokument"
            language="textabana"
            status="Planerad golden fixture"
            code={code(
              '>>>>! include "pkg:textabana/core@1" as core',
              '>>>>! include "pkg:textabana/claims@2" as claims',
              "",
              ">>>>+ core.normalize @id=clean @order=10",
              ">>>>+ claims.annotate @id=review @order=30",
              "",
              "## Observation {.evidence source=PARES}",
              "",
              ">>>> claims.extract @inherit=explicit",
              "  | @intervals only=[clean]",
              "  | claims.rank",
              "  | @intervals only=[review]",
              "",
              "Fartyget avgick från Göteborg den 4 maj.",
              "<<<< claims.extract",
              "",
              "<<<<+ @id=clean",
              "<<<<+ @id=review"
            )}
          />
          <ol className="execution-list spec-execution">
            <li><span>1</span><div><strong>Normalisera snapshot</strong><p>Skapa documentVersion och kanoniska source coordinates.</p></div></li>
            <li><span>2</span><div><strong>Lös directives</strong><p>Bygg låst modulgraf och kontrollera host capabilities utan att exekvera modul.</p></div></li>
            <li><span>3</span><div><strong>Tokenisera och segmentera</strong><p>Respektera radstart, fenced code, escapes, block-, intervall- och propertygränser.</p></div></li>
            <li><span>4</span><div><strong>Bygg blockträd</strong><p>Validera strukturell balans och ersätt descendants innifrån ut.</p></div></li>
            <li><span>5</span><div><strong>Beräkna scope-set</strong><p>Tilldela varje maximalt segment en totalt ordnad mängd aktiva intervallinstanser.</p></div></li>
            <li><span>6</span><div><strong>Bygg IR och SourceMap</strong><p>Bevara block, scopes, properties, anchors och extensions utan hostberoenden.</p></div></li>
            <li><span>7</span><div><strong>Planera typer och inheritance</strong><p>Skapa stage instances, typade kanter, explicita <code>@intervals</code> och cachegränser.</p></div></li>
            <li><span>8</span><div><strong>Validera policies</strong><p>Stoppa otillåtna korsningar, saknade schema, capabilities och mapping guarantees.</p></div></li>
            <li><span>9</span><div><strong>Exekvera</strong><p>Kör planen, samla returvärden, artifacts och tentative emissions med deterministic order keys.</p></div></li>
            <li><span>10</span><div><strong>Commit atomiskt</strong><p>Publicera immutable render, kanalsnapshots, proveniens och diagnostik som ett resultat.</p></div></li>
          </ol>
          <Requirement id="PROCESS-001">Parallell exekvering FÅR endast användas när deterministic merge och eventordning är fullt definierade.</Requirement>
          <Requirement id="PROCESS-002">Ett kompileringsfel MÅSTE stoppa all domänexekvering. Ett run-fel MÅSTE hindra durable commit.</Requirement>
        </section>

        <section className="docs-section spec-section" id="ir-plan">
          <SectionHeading number="10" layer="Canonical contracts" title="TextabanaIR och ExecutionPlan är separata" implementation="partial" />
          <p className="lead">IR beskriver dokumentets semantik. ExecutionPlan beskriver hur just denna host ska köra den. Separationen gör samma dokument portabelt mellan webb, kernel, server och pipeline.</p>
          <div className="contract-grid">
            <article><Braces aria-hidden="true" /><strong>TextabanaIR</strong><p>Immutable, JSON-serialiserbar, versionssatt och host-neutral. Representerar både blockträdet och intervallens segmentmedlemskap.</p></article>
            <article><Workflow aria-hidden="true" /><strong>ExecutionPlan</strong><p>Stage instances, typade edges, order keys, capabilitykrav, cache boundaries och runtime bindings.</p></article>
            <article><Link2 aria-hidden="true" /><strong>SourceMap</strong><p>Många-till-många-relationer mellan genererade selectors och versionerade inputanchors.</p></article>
          </div>
          <CodeExample
            title="Minimalt IR-fragment"
            language="json"
            status="Normativt schemafragment"
            code={code(
              "{",
              '  "schema": "textabana.ir/v1",',
              '  "languageVersion": "0.4",',
              '  "sourceRef": { "documentId": "doc:claims", "version": "sha256:..." },',
              '  "moduleRefs": [{ "id": "claims", "digest": "sha256:..." }],',
              '  "nodes": [{',
              '    "nodeId": "claim-block",',
              '    "kind": "block",',
              '    "sourceSpan": { "start": 128, "end": 304 },',
              '    "pipeline": ["claims.extract", "review.rank"],',
              '    "activeScopeIds": ["clean", "provenance"]',
              "  }],",
              '  "scopes": [],',
              '  "properties": [],',
              '  "extensions": {}',
              "}"
            )}
          />
          <Requirement id="IR-001">Intervall MÅSTE representeras som scopes och segmentmedlemskap; de får inte pressas in i ett AST-träd som förlorar korsningar.</Requirement>
          <Requirement id="IR-002">Authored ids FÅR vara stabila mellan revisioner. Genererade node ids MÅSTE dokumenteras som revision-local.</Requirement>
          <Requirement id="PLAN-001">ExecutionPlan MÅSTE bära varje stages exakta funktionsversion, typkontrakt, granted capabilities och deterministiska order key.</Requirement>
          <Callout title="Playgroundens projektion" icon={<Workflow />} tone="info">
            Language & Scope Lab visar verkliga syntaxnoder, scope-segment och instrumenterade stage-invocations från samma worker som producerar resultatet. Scheman med suffixet <code>/lab-v1</code> är avsiktligt icke-kanoniska tills typed edges, capability grants, SHA-256-identitet och full Plan-validering är implementerade.
          </Callout>
        </section>

        <section className="docs-section spec-section" id="anchors">
          <SectionHeading number="11" layer="Canonical contracts" title="Anchor är identitet; row och line är projektioner" implementation="partial" />
          <p className="lead">Rader flyttar sig när text redigeras. En hållbar metadataapplikation behöver därför versionerad target, flera selectors och en ärlig re-anchor-algoritm.</p>
          <CodeExample
            title="Kanoniskt Anchor"
            language="json"
            status="Normativt schemafragment"
            code={code(
              "{",
              '  "anchorId": "anchor:claim-42",',
              '  "target": {',
              '    "resourceId": "doc:claims",',
              '    "version": "sha256:...",',
              '    "view": "source",',
              '    "cellId": null',
              "  },",
              '  "selectors": [',
              '    { "type": "TextPositionSelector", "start": 128, "end": 171, "unit": "unicode-code-point" },',
              '    { "type": "TextQuoteSelector", "exact": "Den centrala slutsatsen.", "prefix": "...", "suffix": "..." },',
              '    { "type": "NodeSelector", "nodeId": "claim-block" }',
              "  ]",
              "}"
            )}
          />
          <SpecTable
            caption="Kanoniska selectors"
            headers={["Selector", "Identifierar", "När den används"]}
            rows={[
              [<code key="position">TextPositionSelector</code>, "Halvöppet code-point-spann.", "Exakt snapshot och snabb lookup."],
              [<code key="quote">TextQuoteSelector</code>, "Exakt text med valfri prefix/suffix-context.", "Re-anchor efter textredigering."],
              [<code key="node">NodeSelector</code>, "Semantisk IR-node.", "Strukturell stabilitet över mindre ändringar."],
              [<code key="cell">CellSelector</code>, "Stabilt notebook cell.id.", "Notebookprofil."],
              [<code key="data">DataSelector</code>, "datasetId, recordId och valfri kolumn.", "Tabell- och analyticsprofil."],
              [<code key="time">Time/FragmentSelector</code>, "Tid, bildregion eller annan coordinate space.", "Namespaced extension."],
            ]}
          />
          <SpecTable
            caption="Coordinate spaces"
            headers={["view", "Koordinat", "Typiskt mål"]}
            rows={[
              [<code key="source">source</code>, "Unicode code points", "Kanonisk textkälla."],
              [<code key="generated">generated</code>, "Outputselector + SourceMap", "Transformerat mellanvärde."],
              [<code key="rendered">rendered</code>, "Rendererspecifik selector", "Visuell Markdown/HTML-projektion."],
              [<code key="notebook">notebook</code>, "cellId + source selector", "Notebookcell."],
              [<code key="table">table</code>, "datasetId + recordId + column", "Tabellrecord."],
              [<code key="media">image / time</code>, "Fragment eller time selector", "Bild-, ljud- och videoregion."],
            ]}
          />
          <h3>Re-anchor i bestämd ordning</h3>
          <div className="reanchor-flow">
            <span>1 · Samma version → position</span>
            <span>2 · Stabil node/cell/record identity</span>
            <span>3 · Unik quote + context</span>
            <span>4 · Ambiguous/orphan + diagnostic</span>
          </div>
          <Requirement id="ANCHOR-001">En durable annotation MÅSTE binda till en versionerad target och minst en selector. Position och quote BÖR lagras tillsammans.</Requirement>
          <Requirement id="ANCHOR-002">En runtime får aldrig tyst välja en av flera re-anchor-kandidater. Ambiguity eller misslyckande MÅSTE ge orphan state och diagnostik.</Requirement>
          <Requirement id="ANCHOR-003">Human-facing line och column är ettbaserade. LSP-adaptern MÅSTE konvertera till nollbaserade UTF-16-positioner.</Requirement>
          <Requirement id="SOURCEMAP-001">Varje mapping record MÅSTE ange <code>exact</code>, <code>derived</code> eller <code>synthetic</code> samt generating activity. Aggregat är aldrig <code>exact</code> utan verifierat mapping proof.</Requirement>
          <Callout title="Editor Metadata Lab" icon={<PanelRight />} tone="info">
            Labbet producerar Anchor med position- och quote-selector, visar SourceMap-records och jämför stabila row-id:n mellan två lokala runs. Jämförelsen är en pedagogisk re-anchor-projektion; canonical persistence, ambiguous/orphan-algoritm och LSP-coordinate conversion återstår.
          </Callout>
        </section>

        <section className="docs-section spec-section" id="result">
          <SectionHeading number="12" layer="Canonical contracts" title="TextabanaResult är den atomiska leveransen" implementation="partial" />
          <CodeExample
            title="Resultatkuvert"
            language="json"
            status="Normativt schemafragment"
            code={code(
              "{",
              '  "schema": "textabana.result/v1",',
              '  "resultId": "sha256:...",',
              '  "run": { "runId": "run:...", "profile": "fresh", "status": "succeeded" },',
              '  "source": { "documentId": "doc:claims", "version": "sha256:..." },',
              '  "render": { "kind": "text", "mediaType": "text/markdown", "data": "..." },',
              '  "channelSnapshots": {',
              '    "system.out": { "descriptor": {}, "events": [] },',
              '    "claims": { "descriptor": {}, "events": [] }',
              "  },",
              '  "artifacts": [],',
              '  "provenance": { "entities": [], "activities": [], "agents": [] },',
              '  "diagnostics": [],',
              '  "hashes": { "ir": "sha256:...", "environment": "sha256:..." }',
              "}"
            )}
          />
          <SpecTable
            caption="Resultatets delar"
            headers={["Del", "Ansvar", "Regel"]}
            rows={[
              [<code key="render">render</code>, "Primär projektion av returpipelinen.", "Är ett resultatfält, inte en emitterbar kanal."],
              [<code key="snapshots">channelSnapshots</code>, "Noll eller fler namngivna, typade eventlistor.", "Publiceras atomiskt vid success."],
              [<code key="artifacts">artifacts</code>, "Content-addressed stora/binära outputs.", "Bär inga durable credentials."],
              [<code key="prov">provenance</code>, "Entity–Activity–Agent-relationer.", "Binder varje durable output till hur den skapades."],
              [<code key="diagnostics">diagnostics</code>, "Compile- och run-diagnostik.", "Top-level är enda kanoniska sanningskällan för körfel."],
            ]}
          />
          <Requirement id="RESULT-001">Ett lyckat resultat MÅSTE vara immutable. <code>resultId</code> BÖR vara content-addressed.</Requirement>
          <Requirement id="RESULT-002">Ett failed eller cancelled resultat MÅSTE ha tom committed render och tomma committed domain channels, men FÅR bära control-plane diagnostics.</Requirement>
          <Requirement id="RESULT-003">Timestamps är transportmetadata och får inte styra semantisk hash eller eventordning.</Requirement>
          <Callout title="Resultatet som playgrounden visar" icon={<FileJson />} tone="info">
            <code>textabana.result/lab-v1</code> samlar render, channel snapshots, anchors, SourceMaps, provenanceprojektion och diagnostics i en och samma run. Success committas atomiskt; failed och cancelled visar tom committed render och tomma domänkanaler. Playgrounden stödjer kooperativ cancellation vid stage-gränser. SHA-256-identitet, synkron preemption, deadline/backpressure, extern rollback och artifacts återstår före full <code>runtime-json/1</code>-konformitet.
          </Callout>
        </section>

        <section className="docs-section spec-section" id="channels">
          <SectionHeading number="13" layer="Canonical contracts" title="Obegränsade kanaler — men alltid med ett kontrakt" implementation="partial" />
          <p className="lead">Kanaler följer logger-mönstrets öppna namnrymd, men ett kanalnamn måste lösa till en descriptor. JSON är kontrollplan; Arrow och ArtifactRef är dataplan.</p>
          <CodeExample
            title="ChannelDescriptor och event envelope"
            language="json"
            status="Normativt schemafragment"
            code={code(
              "{",
              '  "descriptor": {',
              '    "name": "claims",',
              '    "payloadKind": "object",',
              '    "mediaType": "application/json",',
              '    "schemaRef": "schema:claim/v2",',
              '    "delivery": "snapshot",',
              '    "persistence": "durable",',
              '    "ordering": "global-sequence",',
              '    "key": ["payload.claimId"],',
              '    "required": false,',
              '    "sensitivity": "internal"',
              "  },",
              '  "event": {',
              '    "schema": "textabana.event/v1",',
              '    "eventId": "run:42:17",',
              '    "runId": "run:42",',
              '    "sequence": 17,',
              '    "channel": "claims",',
              '    "kind": "candidate",',
              '    "phase": "run",',
              '    "target": { "anchorRef": "anchor:claim-42" },',
              '    "origin": { "stageId": "extract:1" },',
              '    "correlation": { "traceId": "trace:...", "spanId": "span:..." },',
              '    "provenanceRef": "activity:extract-claims",',
              '    "state": "committed",',
              '    "payload": { "label": "Textabana" },',
              '    "extensions": {}',
              "  }",
              "}"
            )}
          />
          <SpecTable
            caption="ChannelDescriptor — portabelt kontrakt"
            headers={["Fält", "Tillåtna värden", "Regel"]}
            rows={[
              [<code key="name">name</code>, "Öppet, namespaced namn", "Måste vara unikt i resultatet; system.* är reserverat."],
              [<code key="payload">payloadKind / mediaType / schemaRef</code>, "TextabanaValue + mediatyp + JSON Schema", "Bestämmer validering och adapterval."],
              [<code key="delivery">delivery</code>, "snapshot · stream", "Beskriver konsumtionssätt, inte commitstatus."],
              [<code key="persistence">persistence</code>, "durable · transient", "Transient events ingår inte i committed snapshot."],
              [<code key="ordering">ordering</code>, "global-sequence eller deklarerad key", "Måste ge reproducerbar iteration."],
              [<code key="key">key</code>, "Ett eller flera payloadfält", "Valfri stabil domänidentitet/idempotency."],
              [<code key="required">required</code>, "boolean", "Om avsaknad av event gör run invalid."],
              [<code key="sensitivity">sensitivity</code>, "Hostdefinierad klassificering", "Får endast skärpas av en adapter, aldrig tyst sänkas."],
            ]}
          />
          <div className="return-emit-grid">
            <article><code>return value</code><strong>Primärt värde</strong><p>Blir input till nästa steg och slutligen resultatets <code>render</code>.</p></article>
            <article><code>context.emit(name, event)</code><strong>Sidoflöde</strong><p>Appenderar ett validerat event utan att ändra pipelinevärdet.</p></article>
            <article><code>result.channel(name)</code><strong>Explicit läsning</strong><p>Sker efter run eller via en uttrycklig Plan-edge — aldrig som dold feedback.</p></article>
          </div>
          <Requirement id="CHANNEL-001">Kanalnamn är obegränsade utom den reserverade namnrymden <code>system.*</code>. <code>render</code> är reserverat som resultatfält.</Requirement>
          <Requirement id="CHANNEL-002">I strict profile MÅSTE descriptor och payloadschema deklareras före emit. En permissive legacyprofil FÅR syntetisera generisk JSON-descriptor vid första emit men får inte hävda typed-channel conformance.</Requirement>
          <Requirement id="CHANNEL-003">Events är append-only inom en run. Ett schemafel, en cyklisk payload eller ett oserialiserbart värde MÅSTE avvisas — inte förlustkonverteras till text.</Requirement>
          <Requirement id="CHANNEL-004">Varje accepted emit får en order key <code>(planStep, invocationOrder, localEmitIndex)</code>. <code>sequence</code> tilldelas vid deterministic merge/commit.</Requirement>
          <Requirement id="CHANNEL-005">En funktionsmodul körs inte en gång per kanal. Ett enda funktionsanrop FÅR emittera till valfritt många kanaler.</Requirement>
          <Callout title="Strict channels i playgrounden" icon={<RadioTower />} tone="info">
            Strict mode kräver en deklarerad descriptor, avvisar odeklarerade kanaler, reserverade namn, cykliska eller icke-serialiserbara payloads och validerar den JSON Schema-subset som fixturemodulerna använder. Full JSON Schema 2020-12 och stream/backpressure är ännu unsupported.
          </Callout>
        </section>

        <section className="docs-section spec-section" id="system-out">
          <SectionHeading number="14" layer="Canonical contracts" title={<><code>system.out</code> är kärnans editorprotokoll</>} implementation="partial" />
          <p className="lead"><code>system.out</code> är inte Python-, process- eller Jupyter-stdout. Det är en reserverad, typad kanal för positionsbunden metadata och editorupplevelser.</p>
          <SpecTable
            caption="Kanoniska system.out kinds"
            headers={["kind", "Avsikt", "Vanlig presentation"]}
            rows={[
              [<code key="annotation">annotation</code>, "Domänmetadata, relation eller review candidate.", "Gutter, highlight, sidopanel."],
              [<code key="diagnostic">diagnostic</code>, "Positionsbunden varning eller information efter lyckad körning.", "Squiggle, Problems-panel."],
              [<code key="metric">metric</code>, "Mätvärde kopplat till dokument, span eller record.", "Badge, chart, status."],
              [<code key="progress">progress</code>, "Transient run-status.", "Progressrad; aldrig durable domänoutput."],
              [<code key="artifact-link">artifact-link</code>, "Länk mellan position och ArtifactRef.", "Preview, nedladdning, detaljpanel."],
            ]}
          />
          <CodeExample
            title="Positionsbundet editorevent"
            language="json"
            status="Normativt 0.4-format"
            code={code(
              "{",
              '  "channel": "system.out",',
              '  "kind": "annotation",',
              '  "target": {',
              '    "mode": "row",',
              '    "anchorRef": "anchor:claim-42",',
              '    "rowSet": "claims",',
              '    "rowId": "claim:42",',
              '    "row": 2,',
              '    "line": 43',
              "  },",
              '  "payload": { "label": "Verifiera källa", "status": "candidate" },',
              '  "origin": { "module": "claims", "function": "extract", "scopeId": "review" }',
              "}"
            )}
          />
          <div className="coordinate-grid">
            <article><Rows3 aria-hidden="true" /><strong>rowId</strong><p>Durable domänidentitet inom deklarerad <code>rowSet</code> eller dataset.</p></article>
            <article><FileJson aria-hidden="true" /><strong>row / line</strong><p>Ettbaserade, lättanvända projektioner för presentation — aldrig primär identitet.</p></article>
            <article><Link2 aria-hidden="true" /><strong>anchorRef</strong><p>Kanonisk länk till versionerad källa och selectors.</p></article>
            <article><Workflow aria-hidden="true" /><strong>origin</strong><p>Stage, modul, funktion, modalitet, scope och proveniensrelation.</p></article>
          </div>
          <Requirement id="SYSTEM-OUT-001">Semantisk <code>kind</code> och positioneringssätt <code>target.mode</code> MÅSTE vara separata. <code>row</code> och <code>line</code> är target modes, inte eventtyper.</Requirement>
          <Requirement id="SYSTEM-OUT-002"><code>context.system.out.row(...)</code> och <code>.line(...)</code> FÅR finnas som SDK-helpers men MÅSTE normalisera till samma portabla event envelope och Anchor.</Requirement>
          <Requirement id="SYSTEM-OUT-003">Compile- och run-fel lagras i top-level diagnostics. En lyckad positionsbunden varning FÅR dessutom projiceras i <code>system.out</code> med samma diagnostic-id.</Requirement>
          <Callout title="Kompatibilitet" icon={<GitBranch />} tone="info">
            Playgrounden normaliserar nu <code>context.system.out.row(...)</code> och <code>.line(...)</code> till separata <code>kind</code>, <code>target.mode</code> och <code>anchorRef</code>, och visar Anchor samt SourceMap i Editor Metadata Lab. Legacyfälten <code>type</code>, <code>row</code> och <code>line</code> finns kvar som kompatibilitetsprojektioner. Durable re-anchor och LSP-adaptern är fortfarande unsupported.
          </Callout>
        </section>

        <section className="docs-section spec-section" id="artifacts">
          <SectionHeading number="15" layer="Canonical contracts" title="Artifacts bär data; sinks levererar den" implementation="defined" />
          <p className="lead">Textabana skiljer payloadens semantik från vart den skickas. Fil, panel, databas, Kafka och nätverk är host-bindings — inte separata språkoutputs.</p>
          <CodeExample
            title="ArtifactRef"
            language="json"
            status="Normativt schemafragment"
            code={code(
              "{",
              '  "artifactId": "artifact:claims-table",',
              '  "uri": "textabana-artifact://run:42/claims.arrow",',
              '  "mediaType": "application/vnd.apache.arrow.file",',
              '  "schemaRef": "schema:claims-table/v2",',
              '  "size": 48192,',
              '  "sha256": "sha256:...",',
              '  "createdBy": "activity:extract-claims",',
              '  "retention": "project",',
              '  "classification": "internal"',
              "}"
            )}
          />
          <SpecTable
            caption="Payloadstrategi"
            headers={["Data", "Rekommenderad representation", "Motiv"]}
            rows={[
              ["Små kontrollobjekt", "JSON / JSONL", "Portabel validering och enkel inspektion."],
              ["Rich notebook display", "MIME bundle", "Flera presentationer av samma värde."],
              ["Tabeller i minne/transport", "Apache Arrow / Arrow IPC", "Schema, kolumner och effektivt språkbyte."],
              ["Beständiga analytics-snapshots", "Parquet", "Kolumnär lagring och bred verktygskompatibilitet."],
              ["Tensorer/embeddings", "DLPack eller standardiserad Arrow-representation", "Device- och zero-copy-aware överföring."],
              ["Modeller, bilder och stora filer", "ArtifactRef", "Ingen stor base64 i JSON eller notebook."],
            ]}
          />
          <Requirement id="ARTIFACT-001">Artifact digest MÅSTE verifieras. Signed URLs och credentials får inte serialiseras som durable URI; använd opaque handle och en host-resolver.</Requirement>
          <Requirement id="SINK-001">En icke-transaktionell sink MÅSTE buffra durable leverans till commit. Extern leverans BÖR använda <code>(runId, sequence)</code> som idempotency key.</Requirement>
          <Requirement id="SINK-002">Textabana får inte lova exactly-once över godtyckliga externa system. Adapterprofilen ska deklarera leveransgaranti, normalt at-least-once.</Requirement>
        </section>

        <section className="docs-section spec-section" id="module-manifest">
          <SectionHeading number="16" layer="Runtime" title="Manifestet gör moduler polyglotta och förutsägbara" implementation="defined" />
          <CodeExample
            title="Module Manifest"
            language="json"
            status="Normativt schemafragment"
            code={code(
              "{",
              '  "schema": "textabana.module/v1",',
              '  "id": "org.example.claims",',
              '  "version": "2.1.0",',
              '  "digest": "sha256:...",',
              '  "runtime": { "kind": "python", "protocol": "textabana-runtime/1", "entrypoint": "claims:module" },',
              '  "functions": {',
              '    "extract": {',
              '      "args": { "$ref": "schema:extract-args/v1" },',
              '      "accepts": ["text/markdown"],',
              '      "returns": { "kind": "text", "mediaType": "text/markdown" },',
              '      "channels": [{ "name": "claims", "schemaRef": "schema:claim/v2" }],',
              '      "behavior": "segment-preserving",',
              '      "mapping": ["exact"],',
              '      "determinism": "seeded",',
              '      "state": "run"',
              "    }",
              "  },",
              '  "permissions": ["model:claims-v2"]',
              "}"
            )}
          />
          <SpecTable
            caption="Funktionskontrakt"
            headers={["Fält", "Exempel", "Konsekvens"]}
            rows={[
              [<code key="args">args</code>, "JSON Schema", "Validering före invocation."],
              [<code key="accepts-returns">accepts / returns</code>, "TextabanaValue constraints", "Typed Plan edges."],
              [<code key="channels">channels</code>, "Descriptors eller namnpattern", "Validerade emissions."],
              [<code key="behavior">behavior</code>, "segment-preserving · reordering · expanding · reducing · aggregating · generative", "Mapping- och cachebedömning."],
              [<code key="determinism">determinism</code>, "deterministic · seeded · nondeterministic · external", "Replay och cachepolicy."],
              [<code key="state">state</code>, "pure · run · session · external", "Livslängd och reproducerbarhet."],
              [<code key="permissions">permissions</code>, "network · filesystem · process · model · secrets", "Host grant före init."],
            ]}
          />
          <Requirement id="MANIFEST-001">Compiler MÅSTE kunna läsa och validera manifestet utan att exekvera modulens entrypoint.</Requirement>
          <Requirement id="MANIFEST-002">Dubbla exports utan namespace eller alias MÅSTE vara compile error.</Requirement>
          <Requirement id="MANIFEST-003">State och determinism är separata dimensioner. En stateful funktion kan vara deterministisk, och en stateless funktion kan vara nondeterministisk.</Requirement>
        </section>

        <section className="docs-section spec-section" id="runtime-protocol">
          <SectionHeading number="17" layer="Runtime" title="Runtime-protokollet är transportneutralt" implementation="defined" />
          <SpecTable
            caption="Runtime-metoder"
            headers={["Metod", "Krav", "Ansvar"]}
            rows={[
              [<code key="initialize">initialize</code>, "MÅSTE", "Förhandla version, miljö och granted capabilities."],
              [<code key="capabilities">capabilities</code>, "MÅSTE", "Deklarera värdets runtimes, value kinds, limits och adapterprofiler."],
              [<code key="execute">execute</code>, "MÅSTE", "Kör en stage med typed input, args, anchors och run context."],
              [<code key="cancel">cancel</code>, "MÅSTE", "Propagera avbrott till pågående invocation."],
              [<code key="inspect">inspect</code>, "BÖR", "Beskriv symbol, schema eller runtimevärde för editor."],
              [<code key="complete">complete</code>, "FÅR", "Ge completions för funktioner, args och channels."],
              [<code key="shutdown">shutdown</code>, "BÖR", "Frigör session och externa resurser."],
            ]}
          />
          <CodeExample
            title="ExecuteRequest — logisk form"
            language="json"
            status="Normativt schemafragment"
            code={code(
              "{",
              '  "runId": "run:42",',
              '  "stageId": "extract:1",',
              '  "functionRef": "org.example.claims/extract@2.1.0",',
              '  "input": { "kind": "text", "mediaType": "text/markdown", "data": "..." },',
              '  "args": { "model": "claims-v2" },',
              '  "sourceAnchors": ["anchor:claim-input"],',
              '  "grantedCapabilities": ["model:claims-v2"],',
              '  "deadline": "host-monotonic-deadline",',
              '  "cancelToken": "cancel:42:1"',
              "}"
            )}
          />
          <div className="context-grid">
            <span>source snapshot</span><span>anchor builder</span><span>run / stage / profile</span><span>emit</span><span>system.out</span><span>artifacts.put</span><span>cancellation</span><span>granted capabilities</span><span>diagnostics</span>
          </div>
          <Requirement id="RUNTIME-001"><code>emit</code> är logiskt acknowledged. Modulens completion MÅSTE flush:a alla accepted events innan stage avslutas.</Requirement>
          <Requirement id="RUNTIME-002">Funktioner får inte implicit läsa channels. En kanal som input kräver en explicit Plan-edge eller adapterstage.</Requirement>
          <Requirement id="RUNTIME-003">JavaScript, TypeScript, Python, R, Julia, SQL, WASM och externa tjänster FÅR implementera samma protokoll utan språksemantisk särbehandling.</Requirement>
        </section>

        <section className="docs-section spec-section" id="runs">
          <SectionHeading number="18" layer="Runtime" title="Run-profiler gör state explicit" implementation="defined" />
          <SpecTable
            caption="Execution profiles"
            headers={["Profil", "State", "Reproducerbarhet"]}
            rows={[
              [<code key="fresh">fresh</code>, "Ny isolerad modulinstans per run.", "Default och högst reproducerbarhet."],
              [<code key="session">session</code>, "Namngivet state återanvänds; före/efter-digest registreras.", "Kontrollerad interaktivitet."],
              [<code key="attached">attached</code>, "Kör i befintlig kernel/process; host identity och state registreras.", "Lägst reproducerbarhet, hög integration."],
            ]}
          />
          <div className="lifecycle" aria-label="Run lifecycle">
            <span>queued</span><i>→</i><span>compiling</span><i>→</i><span>ready</span><i>→</i><span>running</span><i>→</i><span>committing</span><i>→</i><strong>succeeded</strong>
            <small>Terminaler: failed · cancelled</small>
          </div>
          <div className="transaction-grid">
            <article><CircleDashed aria-hidden="true" /><strong>tentative</strong><p>Progress, logg och livepreview får streamas medan run pågår. Konsumenter måste kunna dra tillbaka dem.</p></article>
            <article><CheckCircle2 aria-hidden="true" /><strong>committed</strong><p>Endast en lyckad commit gör render och durable channel snapshots till aktuell revision.</p></article>
          </div>
          <Requirement id="RUN-001">Failed eller cancelled MÅSTE revokera tentative domänoutput. En extern side effect som inte kan rullas tillbaka måste deklareras och redovisas ärligt i proveniens.</Requirement>
          <Requirement id="RUN-002">Semantic cache key MÅSTE inkludera source-, IR-, module-, input-, config-, profile- och environment-digests.</Requirement>
          <Requirement id="RUN-003">Nondeterministiska och externa funktioner får inte cacheas utan explicit replay artifact eller dokumenterad policy.</Requirement>
          <Requirement id="RUN-004">Backpressure, timeout och cancellation MÅSTE propageras genom runtime och sinks; tyst eventförlust är inte tillåten.</Requirement>
        </section>

        <section className="docs-section spec-section" id="security">
          <SectionHeading number="19" layer="Runtime" title="Kod är betrodd först efter en capability grant" implementation="defined" />
          <p className="lead">Att en modul kör i Worker, kernel eller container gör den inte automatiskt säker. Textabana skiljer deklarerat behov från värdens uttryckliga grant.</p>
          <div className="security-grid">
            <article><ShieldCheck aria-hidden="true" /><strong>Före init</strong><p>Verifiera digest/signatur, lock, runtime, capability subset, quotas och URI-policy.</p></article>
            <article><Code2 aria-hidden="true" /><strong>Under run</strong><p>Isolera otillförlitlig kod, begränsa CPU/minne/output, propagera cancel och kontrollera nätverk/filsystem.</p></article>
            <article><Database aria-hidden="true" /><strong>Efter run</strong><p>Sanera aktiv MIME, klassificera kanaler/artifacts och tillämpa retention innan leverans.</p></article>
          </div>
          <Requirement id="SECURITY-001">Ingen modul har implicit rätt till filesystem, network, process, model eller secrets. Host får endast ge en deklarerad subset.</Requirement>
          <Requirement id="SECURITY-002">Secrets MÅSTE injiceras som opaque handles och får aldrig förekomma i source, metadata, IR, Result, event, artifact-URI eller logg.</Requirement>
          <Requirement id="SECURITY-003">HTML, SVG, widgets och annan aktiv MIME MÅSTE följa hostens sanitization- och trustmodell.</Requirement>
          <Requirement id="SECURITY-004">Kanal- och artifactdescriptors BÖR ange classification, retention och åtkomstpolicy. Adaptrar får inte sänka skyddsnivån tyst.</Requirement>
        </section>

        <section className="docs-section spec-section" id="adapter-contract">
          <SectionHeading number="20" layer="Adapter contract" title="Adaptrar projicerar ett resultat — de skriver inte om kärnan" implementation="partial" />
          <p className="lead">En adapter är en explicit, versionssatt post-commit-projektion av ett redan producerat <code>TextabanaResult</code>. Den får välja representation för en värd eller standard, men den får inte mutera källan, kärnresultatet eller dess semantiska identiteter.</p>
          <div className="architecture-flow" aria-label="Adapter fan-out efter atomisk commit">
            <div><FileJson aria-hidden="true" /><strong>Immutable Result</strong><span>exakt committad input</span></div>
            <ArrowDown aria-hidden="true" />
            <div className="architecture-primary"><Network aria-hidden="true" /><strong>Adapter fan-out</strong><span>manifest · negotiation · pure projection</span></div>
            <ArrowDown aria-hidden="true" />
            <div><Route aria-hidden="true" /><strong>Projection envelopes</strong><span>separata · versionssatta · source-bound</span></div>
          </div>
          <SpecTable
            caption="AdapterManifest — kontrakt före körning"
            headers={["Fält", "Semantik", "Sprint 1"]}
            rows={[
              [<code key="adapter-id">adapterId / version / profile</code>, "Oberoende adapteridentitet och profilanspråk.", "Obligatoriskt och digestbundet."],
              [<code key="accepts">accepts</code>, "Tillåtna Result-scheman, profiler, channels och artifact kinds.", "Förhandlas före projektion."],
              [<code key="produces">produces</code>, "Projection kind, value kind, mediaType och schemaRef.", "Exakt en output för referensadaptern."],
              [<code key="capabilities">capabilities</code>, "Required och optional host-/runtimeförmågor.", "Saknad required capability ger unsupported."],
              [<code key="support">support</code>, "playground-subset · contract-only · unsupported.", "Contract-only får aldrig producera låtsasoutput."],
              [<code key="fidelity">fidelity</code>, "lossless · selective · lossy samt omittedPaths.", "Selektiv output måste behålla sourceResultRef."],
            ]}
          />
          <CodeExample
            title="AdapterManifest"
            language="json"
            status="Körbar lab-envelope"
            code={code(
              "{",
              '  "schema": "textabana.adapter-manifest/lab-v1",',
              '  "adapterId": "org.textabana.result-summary",',
              '  "version": "1.0.0-lab.1",',
              '  "contract": "adapter-contract/1",',
              '  "profile": "adapter-contract/1",',
              '  "support": "playground-subset",',
              '  "phase": "post-commit",',
              '  "execution": "pure",',
              '  "accepts": { "resultSchemas": ["textabana.result/lab-v1"], "profiles": ["runtime-json/1"], "channels": [], "artifactKinds": [] },',
              '  "produces": [{ "projectionKind": "result-summary", "valueKind": "object", "mediaType": "application/json", "schemaRef": "textabana.result-summary/lab-v1" }],',
              '  "capabilities": { "required": ["atomic-success-result"], "optional": ["anchors"] },',
              '  "deterministic": true,',
              '  "fidelity": { "mode": "selective", "requiresSourceResult": true, "omittedPaths": ["render.data"] }',
              "}"
            )}
          />
          <CodeExample
            title="AdapterProjection"
            language="json"
            status="Körbar lab-envelope"
            code={code(
              "{",
              '  "schema": "textabana.adapter-projection/lab-v1",',
              '  "projectionId": "projection:...",',
              '  "adapterRef": { "adapterId": "org.textabana.result-summary", "version": "1.0.0-lab.1", "manifestDigest": "fnv1a:..." },',
              '  "sourceResultRef": { "resultId": "lab:...", "resultSchema": "textabana.result/lab-v1", "sourceVersion": "fnv1a:..." },',
              '  "status": "succeeded",',
              '  "output": { "projectionKind": "result-summary", "mediaType": "application/json", "schemaRef": "textabana.result-summary/lab-v1", "data": {} },',
              '  "mapping": "derived",',
              '  "fidelity": { "mode": "selective", "requiresSourceResult": true, "omittedPaths": ["render.data"] },',
              '  "references": { "eventRefs": [], "anchorRefs": [], "sourceMapRefs": [], "provenanceRefs": [] },',
              '  "diagnostics": []',
              "}"
            )}
          />
          <Requirement id="ADAPTER-001">En adapter MÅSTE deklarera id, version, profil, accepterade resultatscheman, producerade representationer, kapabilitetsbehov och fidelity-policy innan den körs.</Requirement>
          <Requirement id="ADAPTER-002">Varje projektion MÅSTE referera till exakt <code>source resultId</code> och manifestdigest. Samma deterministiska input, manifestversion och konfiguration MÅSTE ge samma <code>projectionId</code>.</Requirement>
          <Requirement id="ADAPTER-003">Adaptrar läser samma immutable Result som oberoende fan-out. Adapter-till-adapter-dataflöde kräver en explicit, acyklisk dependency edge; list- eller UI-ordning är aldrig semantik.</Requirement>
          <Requirement id="ADAPTER-004">Event identity, Anchor, SourceMap, artifact och provenance MÅSTE bevaras genom referens eller redovisas individuellt som förlust. Ett tomt loss-fält är ett verifierbart påstående.</Requirement>
          <Requirement id="ADAPTER-005">Ett adapterfel FÅR inte ändra core run status eller mutera ett committat Result. Felet returneras som adapterdiagnostik i adapterkörningen.</Requirement>
          <Requirement id="ADAPTER-006">En contract-only-deskriptor får förhandlas och inspekteras men får inte producera simulerad output eller användas som stöd för profilkonformitet.</Requirement>
          <Callout title="Adaptergrunden i playgrounden" icon={<Network />} tone="success">
            <code>org.textabana.result-summary</code>, data-, notebook- och annotationadaptrarna körs efter commit som oberoende, rena projektioner. Adapterfliken visar manifest, source-result-bindning, stabil projektionidentitet, fidelity och resolverbara referenser. <code>org.textabana.ml-lineage</code> är fortsatt contract-only och producerar ingen simulerad modell- eller observabilityoutput.
          </Callout>
        </section>

        <section className="docs-section spec-section" id="notebooks">
          <SectionHeading number="21" layer="Adapter profile" title="Notebook är en positionsmedveten projektion — inte dold exekveringsordning" implementation="partial" />
          <p className="lead">Textabana modellerar notebookinteroperabilitet som en komplett, versionerad snapshot med stabila cellidentiteter. Kärnan producerar kanoniska events; en ren post-commit-adapter skapar en host-neutral JSON-vy. Jupyter, nbformat och kernels är separata transport- och hostlager.</p>
          <Callout title="Körbar Notebook Interop-subset" icon={<CheckCircle2 />} tone="success"><code>notebook/1</code> kör whole-snapshot, explicita cell-id:n, tre verkliga MIME-representationer, source digests, stale-jämförelse samt profilerna <code>fresh</code>, <code>session</code> och <code>attached</code>. Endast <code>fresh</code> har körbar strukturell projektion. Jupyter Messaging, nbformat-roundtrip, session/attached kernelkörning och Comms/widgets är uttryckligen unsupported.</Callout>
          <SpecTable
            caption="Exakt exekverad notebookmodell i playgrounden"
            headers={["Kanal", "Payload", "Semantik"]}
            rows={[
              [<code key="snapshot">notebook.snapshot</code>, "notebookId, snapshotId, profile, wholeSnapshot, cellIds", "Exakt en komplett snapshot; cellistan följer författad presentationsordning."],
              [<code key="cells">notebook.cells</code>, "cellId, title, source, sourceDigest, metadata", "En post per stabil cell med CellSelector, Anchor och bevarad författad metadata."],
              [<code key="outputs">notebook.outputs</code>, "outputDigest, sourceDigest, status, mimeBundle", "Output binds till samma cells källa och provenanceaktivitet; aktuell output är fresh."],
              [<code key="state">notebook.state</code>, "requestedProfile, executionSupport, kernelState, limitations", "Gör profil och faktisk support explicit utan att fabricera kernelstate."],
            ]}
          />
          <CodeExample
            title="Whole snapshot med lätta cellmarkörer"
            language="textabana"
            status="Körbar fixture · notebook-snapshot"
            code={code(
              '>>>>! include "./modules/notebook.js"',
              "",
              '>>>> notebook_snapshot profile="fresh" notebook_id="voyage-analysis"',
              '## Cell: Source overview {#cell-source owner="research"}',
              "Aurora lämnade Göteborg den 4 maj.",
              "",
              '## Cell: Route summary {#cell-route audience="operations"}',
              "**Sista kända rutt:** Göteborg → Guayaquil.",
              "",
              '## Cell: Confidence {#cell-confidence kind="metric"}',
              '{"confidence": 0.82, "status": "candidate"}',
              "<<<< notebook_snapshot"
            )}
          />
          <CodeExample
            title="Host-neutral notebookprojektion"
            language="json"
            status="Körbar lab-envelope · application/json"
            code={code(
              "{",
              '  "schema": "textabana.notebook-projection/lab-v1",',
              '  "notebook": { "notebookId": "voyage-analysis", "snapshotId": "snapshot:...", "stateProfile": "fresh", "wholeSnapshot": true },',
              '  "cells": [{',
              '    "cellId": "cell-source",',
              '    "sourceDigest": "fnv1a:...",',
              '    "mimeBundle": { "text/plain": "...", "text/markdown": "...", "application/vnd.textabana.result+json": {} },',
              '    "output": { "outputSourceDigest": "fnv1a:...", "stale": false, "sourceMapRef": "mapping:..." }',
              "  }]",
              "}"
            )}
          />
          <div className="profile-cards">
            <article><strong>fresh</strong><p>Ny strukturell snapshot och projektion utan dold eller beständig kernelstate.</p></article>
            <article><strong>session</strong><p>Profilnamnet kan förhandlas, men exekvering mot en extern session är contract-only.</p></article>
            <article><strong>attached</strong><p>En host får deklarera extern kernel, men playgrounden verifierar eller kör den inte.</p></article>
            <article><strong>Framtida Jupyter-host</strong><p>Messaging, nbformat, Comms och widgets kräver egna verifierade adaptrar.</p></article>
          </div>
          <Requirement id="JUPYTER-001">Standard <code>execute_request</code> innehåller kod men inte cell-id eller hela notebooken. Cross-cell-semantik kräver därför att hosten skickar en hel, versionerad notebook snapshot med stabila <code>cell.id</code>. Playgrounden avvisar partial snapshots.</Requirement>
          <Requirement id="JUPYTER-002">MIME-alternativen <code>text/plain</code>, <code>text/markdown</code> och <code>application/vnd.textabana.result+json</code> representerar samma logiska cellvärde. Separata Textabanakanaler får inte modelleras som MIME-alternativ.</Requirement>
          <Requirement id="JUPYTER-003">Jupyter streams och displays ska mappas till namespaced adapterkanaler som <code>host.jupyter.stdout</code>, <code>host.jupyter.stderr</code> och <code>host.jupyter.display</code> — aldrig till <code>system.out</code> som process-stdout.</Requirement>
          <Requirement id="JUPYTER-004">En notebookadapter MÅSTE bevara okänd författad metadata, reservera <code>metadata.textabana</code> för adapterfält och märka varje output med cells source digest.</Requirement>
          <Requirement id="JUPYTER-005">Cellordning är presentationsordning och FÅR inte bli implicit exekverings- eller kernelstate. Notebookens begärda stateprofil är skild från kärnans <code>Result.run.profile</code>.</Requirement>
          <Requirement id="JUPYTER-006">En äldre output är stale exakt när <code>previousOutput.sourceDigest !== currentCell.sourceDigest</code>. En stale output FÅR visas som revisionsmetadata men aldrig som aktuell output.</Requirement>
          <Requirement id="JUPYTER-007">Varje cell MÅSTE ha explicit, unik identitet. Saknat eller duplicerat cell-id stoppar körningen atomiskt före channel commit.</Requirement>
        </section>

        <section className="docs-section spec-section" id="data-ai">
          <SectionHeading number="22" layer="Adapter profile" title="Data, analytics, AI och ML delar samma kontrakt" normative={false} implementation="partial" />
          <p className="lead">Bindings ska vara externa och typed. DataFrames, modeller och dataset serialiseras inte in i källtexten; de binds som inputs eller ArtifactRefs och spåras i run-proveniens.</p>
          <Callout title="Körbar Data & Lineage-subset" icon={<Database />} tone="success"><code>data/1</code> körs som en avgränsad playground-subset: typade JSON-records, dataset/schema-events, stabila <code>recordId</code>, deterministisk inner join, kolumnbundna <code>DataSelector</code>, derived aggregation och multi-input-lineage via SourceMaps som förenar båda inputankarna. Arrow IPC, Parquet, DuckDB, beständiga ArtifactRefs, OpenLineage-export och full <code>data/1</code>-konformitet är fortfarande unsupported.</Callout>
          <SpecTable
            caption="Exakt exekverad datamodell i playgrounden"
            headers={["Lager", "Körbar representation", "Identitet och mapping"]}
            rows={[
              ["Författad input", "Två vanliga GFM Markdown-tabeller i ett relational_join-block.", "Deklarerade datasetnamn och join key; ingen dold tabellsyntax."],
              ["Canonical Result", "data.datasets, data.input.records, data.output.records, data.lineage och data.aggregates.", "Dataset-ID, naturlig key och innehållsbaserat recordId; aldrig fysisk radposition."],
              ["Join", "Deterministisk inner equijoin med vänster inputordning och explicit fel för tomma eller duplicerade keys.", "Varje outputrecord har en derived SourceMap med vänster och höger inputanchor."],
              ["Cell-lineage", "Ett lineage-event per outputcell med DataSelector för output- och inputkolumn.", "Join key pekar på båda key-cellerna; övriga celler pekar på sin vänster- eller högerkälla."],
              ["Aggregation", "Count över join-output i data.aggregates.", "Alltid derived och kopplad till de records som räknades."],
              ["Adapterprojektion", "application/json med schema, rows, record-/cell-lineage och explicit fidelity report.", "Source-bound post-commit-projektion; artifactRefs är tom tills verkliga bytes finns."],
            ]}
          />
          <CodeExample
            title="Derived SourceMap för en join-record"
            language="json"
            status="Körbar lab-envelope"
            code={code(
              "{",
              '  "outputRef": "event:...",',
              '  "outputSelector": { "type": "DataSelector", "datasetId": "voyage_cargo", "recordId": "record:..." },',
              '  "inputAnchorRefs": ["anchor:row:ships:...", "anchor:row:manifests:..."],',
              '  "inputSelectors": [',
              '    { "type": "DataSelector", "datasetId": "ships", "recordId": "record:ships:..." },',
              '    { "type": "DataSelector", "datasetId": "manifests", "recordId": "record:manifests:..." }',
              "  ],",
              '  "mapping": "derived",',
              '  "generatingActivity": "activity:invocation:..."',
              "}"
            )}
          />
          <Callout title="Cell betyder semantisk kolumn i denna subset" icon={<MapPinned />} tone="info">Cell-lineage använder en kolumnbunden <code>DataSelector</code> ovanpå ett stabilt row-anchor. Playgrounden räknar inte ut exakta teckenpositioner för varje Markdown-cell; sådan textpositionsprecision kräver separata cellankare och är ännu unsupported.</Callout>
          <SpecTable
            caption="Data- och analyticsprofil"
            headers={["Behov", "Primär standard", "Textabanaregel"]}
            rows={[
              ["Tabeller mellan processer", "Apache Arrow / Arrow IPC", "Schema + stabil record identity + anchor refs."],
              ["Beständig tabell", "Parquet", "Proveniens måste överleva export som fysiska kolumner/relationer."],
              ["Pandas / Polars", "Arrow PyCapsule, Arrow IPC, därefter dataframe interchange", "Adapterkonvertering; inte nytt core-value."],
              ["Lokal SQL", "DuckDB över Arrow", "SQL-stage i ExecutionPlan med typed in/out."],
              ["Tensor/embedding", "DLPack eller Arrow FixedSizeList/standard extension", "Shape, dtype, device och mapping deklareras."],
              ["Experiment tracking", "MLflow adapter", "Run params, metrics, models och artifacts projiceras från TextabanaResult."],
            ]}
          />
          <CodeExample
            title="Provenienskolumner som överlever pipelines"
            language="arrow schema"
            status="Informativ adapterprofil"
            code={code(
              "claim_id: utf8 not null",
              "claim_text: utf8 not null",
              "confidence: float32",
              "_textabana_record_id: utf8 not null",
              "_textabana_anchor_refs: list<utf8> not null",
              "_textabana_activity_id: utf8 not null"
            )}
          />
          <div className="ai-provenance">
            <Bot aria-hidden="true" />
            <div>
              <strong>AI invocation provenance</strong>
              <p>Provider, model-id/revision, prompt-template digest eller skyddad artifactref, input/output-digests, samplingparametrar, seed när relevant, tool/retrieval refs, tokenanvändning/kostnad, schema, timing och reviewer state.</p>
            </div>
          </div>
          <Requirement id="DATA-001">Dataset row identity MÅSTE använda stabilt <code>recordId</code> eller deklarerad key — aldrig fysisk row index efter filter, join eller sortering.</Requirement>
          <Requirement id="DATA-002">Filter bevarar lineage; join förenar inputanchors; aggregation producerar <code>derived</code> mapping och en explicit provenance relation.</Requirement>
          <Requirement id="DATA-003">Kritisk proveniens får inte endast ligga i Arrow- eller Parquet-schema metadata om den ska överleva tredjepartsverktyg.</Requirement>
          <Requirement id="DATA-004">Arrow IPC Stream delar ett schema. En inkompatibel schemaändring MÅSTE skapa en ny stream eller schemaversion.</Requirement>
          <Requirement id="DATA-005">In-process Arrow- eller DLPack-handles får aldrig serialiseras i TextabanaResult; resultatet använder transportformat eller ArtifactRef.</Requirement>
          <Requirement id="AI-001">Confidence är ett modellmått, inte sanning. Candidate, accepted, rejected och superseded är separata review states.</Requirement>
          <Requirement id="AI-002">MCP FÅR exponera manifestfunktioner som tools och docs/resultat som resources, men är en adapter och får inte bli kärnans runtime- eller proveniensmodell.</Requirement>
        </section>

        <section className="docs-section spec-section" id="annotation-observability">
          <SectionHeading number="23" layer="Annotation profile" title="Immutable kandidater, append-only review och resolverbara exporter" implementation="partial" />
          <p className="lead">Textabana skiljer modellens förslag från människans beslut. Kärnan lagrar kandidat, review och revision som separata events med samma stabila annotation-identitet. En post-commit-adapter projicerar kedjan till externa standarder utan att göra deras format till ny kärnsemantik.</p>
          <Callout title="Körbar Annotation & AI Review-subset" icon={<CheckCircle2 />} tone="success"><code>annotation/1</code> kör whole snapshots, stabila annotation-id:n, modell-/prompt-/inputdigests, explicit confidence method, accept/reject/supersede och resolverbara W3C- samt Label Studio-projektioner. Digests är märkta <code>fnv1a-lab</code>; verklig modellkörning, persistent review store och <code>ml-lineage/1</code> är inte simulerade.</Callout>
          <SpecTable
            caption="Exakt exekverad annotationsmodell i playgrounden"
            headers={["Kanal", "Payload", "Semantik"]}
            rows={[
              [<code key="set">annotation.set</code>, "setId, wholeSnapshot, authoredOrder, candidateIds, currentIds, counts, setDigest", "Exakt en komplett snapshot som låser eventmängd, ordning och current view."],
              [<code key="candidates">annotation.candidates</code>, "annotationId, revision 0, body, model, prompt, inputDigest, confidence", "Immutable modellfakta. Payloaden innehåller aldrig decision, reviewer eller supersededBy."],
              [<code key="reviews">annotation.reviews</code>, "reviewId, candidateEventRef, revision 1, decision, reviewer, reviewDigest", "Append-only mänsklig handling. accept, reject och supersede är de enda besluten i lab-subseten."],
              [<code key="revisions">annotation.revisions</code>, "revisionId, state, basedOnEventRef, reviewEventRef, supersedes/supersededBy", "Materialiserat reviewutfall plus eventuell explicit mänsklig ersättare."],
            ]}
          />
          <CodeExample
            title="Lättviktig reviewkälla"
            language="textabana"
            status="Körbar fixture · annotation-review"
            code={code(
              '>>>>! include "./modules/annotation.js"',
              '',
              '>>>> annotation_review set_id="voyage-review" reviewer="leo"',
              '## Annotation: Route {#ann-route origin="ai" model="extractor" model_version="1.0" prompt_id="route-v1" confidence=0.82 confidence_method="model-reported" decision="accept"}',
              'Aurora lämnade Göteborg den 4 maj.',
              '',
              '## Annotation: Status candidate {#ann-status origin="ai" model="extractor" model_version="1.0" prompt_id="status-v1" confidence=0.73 confidence_method="model-reported" decision="supersede" superseded_by="ann-status-reviewed"}',
              'Positionen är en granskningskandidat.',
              '',
              '## Annotation: Status reviewed {#ann-status-reviewed origin="human" supersedes="ann-status"}',
              'Positionen kräver extern verifiering.',
              '<<<< annotation_review'
            )}
          />
          <Callout title="Review är källstyrd i denna fresh-runtime" icon={<Bot />} tone="info">Playgrounden visar inga knappar som låtsas spara beslut. Ändra <code>decision</code> i källan och kör igen: kandidatens fakta förblir separata, medan ett nytt review-event och revision 1 materialiserar beslutet i den nya snapshoten.</Callout>
          <SpecTable
            caption="Interopmappning"
            headers={["Teknik", "Roll", "Textabana mapping"]}
            rows={[
              ["W3C Web Annotation", "Portabel annotationsexport", "Körbar AnnotationPage; target kopierar versionerad Anchor med position/quote selectors och anchorRef."],
              ["W3C PROV", "Semantisk proveniens", "Source/result/event/artifact = Entity; stage/run = Activity; människa/runtime/modul/model = Agent."],
              ["LSP", "Transient editorprojection", "Diagnostics, semantic tokens, inlay hints och code actions; aldrig canonical storage."],
              ["OpenLineage", "Data pipeline lineage", "Job, Run och Dataset från Plan, Run och Artifact/Data outputs."],
              ["OpenTelemetry", "Operativ observability", "Trace, logs och metrics med traceId/spanId; inte semantisk sanning."],
              ["CloudEvents", "Distribuerad eventtransport", "Export av event envelope med idempotent event identity."],
              ["MLflow", "Experiment och modellartifacts", "Parametrar, metrics, models och artifacts från run/proveniens."],
              ["Label Studio", "Annoteringsverktyg", "Körbar task/import-subset med choices-resultat och Textabana-referenser i meta; ingen API-/projektroundtrip."],
              ["doccano / Prodigy / brat", "Ytterligare annoteringsverktyg", "Planerade adapterprofiler via Anchor + Annotation + review relations."],
            ]}
          />
          <CodeExample
            title="Immutable modellkandidat"
            language="json"
            status="Kanoniskt eventpayload · annotation.candidates"
            code={code(
              "{",
              '  "annotationId": "ann-route",',
              '  "revision": 0,',
              '  "status": "candidate",',
              '  "body": "Aurora lämnade Göteborg den 4 maj.",',
              '  "model": { "id": "extractor", "version": "1.0", "digest": "fnv1a:..." },',
              '  "prompt": { "id": "route-v1", "digest": "fnv1a:..." },',
              '  "inputDigest": "fnv1a:...",',
              '  "confidence": { "score": 0.82, "method": "model-reported" }',
              "}"
            )}
          />
          <div className="two-column-copy">
            <CodeExample
              title="W3C target återanvänder Anchor"
              language="json"
              status="Körbar adapterprojektion"
              code={code(
                '"target": {',
                '  "source": "doc:document.md",',
                '  "selector": [',
                '    { "type": "TextPositionSelector", "start": 184, "end": 223 },',
                '    { "type": "TextQuoteSelector", "exact": "Aurora lämnade Göteborg den 4 maj." }',
                '  ],',
                '  "textabana:anchorRef": "anchor:annotation:..."',
                '}'
              )}
            />
            <CodeExample
              title="Label Studio task/import-subset"
              language="json"
              status="Körbar adapterprojektion"
              code={code(
                '{ "id": "ann-route",',
                '  "data": { "text": "Aurora lämnade Göteborg den 4 maj." },',
                '  "annotations": [{ "id": "review:ann-route:1", "result": [{',
                '    "type": "choices", "value": { "choices": ["accept"] }',
                '  }] }],',
                '  "meta": { "textabana": { "anchorRef": "anchor:annotation:..." } } }'
              )}
            />
          </div>
          <Requirement id="ANNOTATION-001">Intern annotation MÅSTE stödja span, document classification, relation och review state. W3C Web Annotation är en import/exportprofil, inte hela kärnmodellen.</Requirement>
          <Requirement id="ANNOTATION-002">Human-in-the-loop MÅSTE skapa ett separat review-event och en ny reviewed revision. Modellkandidatens ursprungliga fakta får inte muteras. Endast <code>supersede</code> kräver en explicit ersättare med ömsesidiga <code>supersededBy</code>/<code>supersedes</code>-relationer.</Requirement>
          <Requirement id="ANNOTATION-003">En AI-kandidat MÅSTE ange stabilt annotationId, modell-id/version/digest, prompt-id/digest, inputdigest samt confidence score och metod. Confidence är evidensmetadata, inte sanningssannolikhet.</Requirement>
          <Requirement id="ANNOTATION-004">Varje durable candidate, review och revision MÅSTE lösas genom Event, AnnotationSelector, Anchor, SourceMap och generating Activity. En exporterad target får inte uppfinna fristående offsets.</Requirement>
          <Requirement id="ANNOTATION-005">W3C Web Annotation och annoteringsverktygsformat är adapterprojektioner. De får inte skriva tillbaka extern formatsemantik till kandidat- eller revieweventen utan en explicit importerad ny revision.</Requirement>
          <Requirement id="ANNOTATION-006">En whole annotation snapshot MÅSTE validera unika id:n, counts, länkar, beslut, current view och acyklisk supersede-kedja före commit. Den aktuella lab-subseten begränsar varje target till en icke-tom textrad.</Requirement>
          <Requirement id="PROV-001">Varje durable output MÅSTE länka till generating Activity och använda inputanchors/entities. Operativa traces FÅR länkas men ersätter inte semantic provenance.</Requirement>
          <Requirement id="EXT-001">Okända namespaced extensionfält MÅSTE round-trippas av adaptrar som inte förstår dem.</Requirement>

          <h3>Standardreferenser</h3>
          <div className="standard-links">
            <a href="https://json-schema.org/draft/2020-12" target="_blank" rel="noreferrer"><strong>JSON Schema 2020-12</strong><span>Validering av portabla JSON-kontrakt</span></a>
            <a href="https://www.w3.org/TR/2017/REC-annotation-model-20170223/" target="_blank" rel="noreferrer"><strong>W3C Web Annotation</strong><span>Annotationsexport</span></a>
            <a href="https://www.w3.org/TR/2013/REC-prov-o-20130430/" target="_blank" rel="noreferrer"><strong>W3C PROV-O</strong><span>Proveniensexport</span></a>
            <a href="https://jupyter-client.readthedocs.io/en/stable/messaging.html" target="_blank" rel="noreferrer"><strong>Jupyter Messaging</strong><span>Kerneltransport</span></a>
            <a href="https://nbformat.readthedocs.io/en/latest/format_description.html" target="_blank" rel="noreferrer"><strong>nbformat</strong><span>Notebookprojection och cell ids</span></a>
            <a href="https://arrow.apache.org/docs/format/Columnar.html" target="_blank" rel="noreferrer"><strong>Apache Arrow</strong><span>Tabulärt dataplan</span></a>
            <a href="https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md" target="_blank" rel="noreferrer"><strong>CloudEvents</strong><span>Distribuerad eventexport</span></a>
          </div>
        </section>

        <section className="docs-section spec-section use-cases-section" id="use-cases">
          <SectionHeading number="24" layer="Value" title="Verkliga problem Textabana kan lösa" normative={false} implementation="defined" />
          <p className="lead">Kärnans första mål är att göra editorprogram för metadata betydligt enklare. Samma mekanik skalar sedan till data- och AI-arbetsflöden.</p>
          <div className="use-case-grid">
            <article><PanelRight aria-hidden="true" /><div><strong>Metadataeditorer utan ny parser</strong><p>Återanvänd syntaxanalys, source mapping, modulkörning, eventmodell och synk mellan text och sidopanel.</p></div></article>
            <article><Link2 aria-hidden="true" /><div><strong>Text och metadata driver inte isär</strong><p>Annotationer, claims och diagnostik skapas från samma versionerade källa och pekar tillbaka via Anchor.</p></div></article>
            <article><Search aria-hidden="true" /><div><strong>Diagnostik där felet finns</strong><p>Squiggles, badges, hoverinfo och fixes visas på rätt span utan att hamna i renderingen.</p></div></article>
            <article><Database aria-hidden="true" /><div><strong>Ett dokument ger flera produkter</strong><p>Samma run kan ge Markdown, sökindex, Arrow-tabell, graf, GIS, validering och audit.</p></div></article>
            <article><Bot aria-hidden="true" /><div><strong>Granskbar AI-extraktion</strong><p>Modellkandidaten bevaras immutable med inputankare, modellversion, promptdigest och confidence method; människans beslut blir en separat revisionskedja.</p></div></article>
            <article><Workflow aria-hidden="true" /><div><strong>Notebook utan notebook-lock-in</strong><p>Analytikern använder Python, R eller Julia medan .tba-källan och resultatkontraktet förblir portabla.</p></div></article>
            <article><Layers3 aria-hidden="true" /><div><strong>Reproducerbara datapipelines</strong><p>Dataset, schema, run, artifacts och lineage binds samman utan att gömma semantiken i cellordning.</p></div></article>
            <article><Network aria-hidden="true" /><div><strong>Billiga domänspecifika verktyg</strong><p>Juridik, forskning, krav, publicering och arkiv delar kärna men får egna moduler, channels och vyer.</p></div></article>
            <article className="featured-use-case"><MapPinned aria-hidden="true" /><div><strong>PARES/RWMT: dokument → GIS och graf</strong><p>Arkivtext kan samtidigt producera skepp, resor, platser, sannolikhetsrutter, evidens och grafrelationer med spårbarhet till originalkällan.</p></div></article>
          </div>
        </section>

        <section className="docs-section spec-section" id="conformance">
          <SectionHeading number="25" layer="Conformance" title="Implementationsanspråk härleds ur evidens" implementation="partial" />
          <p className="lead">Conformance Lab utvärderar ett valt, versionssatt case efter core run och adapter fan-out. Rapporten skiljer deklarerad support från observerat testutfall: endast en tillämplig playground-subset vars samtliga krav passerar blir <code>claimable</code> för den aktuella körningen.</p>
          <SpecTable
            caption="Konformitetsprofiler"
            headers={["Profil", "Måste täcka", "Web runtime idag"]}
            rows={[
              [<code key="lang">language-core/0.4</code>, "Source, syntax, block, intervall, property, pipeline, inheritance och cross=error.", <StatusBadge key="c1" tone="partial">Playground subset</StatusBadge>],
              [<code key="runtime">runtime-json/1</code>, "IR, Plan, Run, Result, JSON channels och atomisk commit.", <StatusBadge key="c2" tone="partial">Playground subset</StatusBadge>],
              [<code key="editor">editor/1</code>, "Anchor, SourceMap, system.out och LSP-projektion.", <StatusBadge key="c3" tone="partial">Playground subset</StatusBadge>],
              [<code key="adapter">adapter-contract/1</code>, "Manifest, negotiation, immutable fan-out, fidelity, referenser och failure isolation.", <StatusBadge key="c7" tone="partial">Playground subset</StatusBadge>],
              [<code key="notebook">notebook/1</code>, "Whole snapshot, stabila cell-id:n, MIME bundle, stateprofiler, stale detection och host-neutral JSON-projektion; full profil omfattar även verifierad Jupytertransport.", <StatusBadge key="c4" tone="partial">Playground subset</StatusBadge>],
              [<code key="data">data/1</code>, "Dataset/schema-events, record identity, JSON table projection och multi-input lineage; full profil omfattar även dataplan och artifacts.", <StatusBadge key="c5" tone="partial">Playground subset</StatusBadge>],
              [<code key="annotation">annotation/1</code>, "Immutable kandidater, review-revisioner, supersede-kedjor, resolverbara targets samt W3C- och Label Studio-projektion.", <StatusBadge key="c8" tone="partial">Playground subset</StatusBadge>],
              [<code key="ml">ml-lineage/1</code>, "AI invocation, PROV, OpenLineage, MLflow och OTel correlation.", <StatusBadge key="c6" tone="planned">Contract-only · ej claimable</StatusBadge>],
            ]}
          />
          <SpecTable
            caption="Maskinläsbar ConformanceReport"
            headers={["Fält", "Betydelse", "Nuvarande lab-semantik"]}
            rows={[
              [<code key="report">schema / reportId</code>, "Versionssatt rapporttyp och deterministisk rapportidentitet.", <code key="report-v">textabana.conformance-report/lab-v1</code>],
              [<code key="subject">sourceResultRef</code>, "Binder evidensen till exakt semantiskt Result.", "Transport-run-id ingår inte i strukturdigesten."],
              [<code key="suite">suite / case</code>, "Suiteversion, fixture, förväntat och faktiskt terminalutfall.", "Negativa cases kräver både exakt status och diagnostikkod."],
              [<code key="profiles">profiles</code>, "Deklarerad support, tillämplighet, kravutfall, härledd support och claimable.", "Ej emitterade domänprofiler blir not-run; contract-only blir aldrig claimable."],
              [<code key="stages">stages</code>, "Source → IR → Plan → Result → Projection med evidensreferenser.", "Ett negativt case gör inget positivt plan- eller projektionsanspråk."],
              [<code key="snapshot">structuralSnapshot</code>, "Normaliserad labbsnapshot och incheckad golden digest.", "FNV-1a-lab är icke-kryptografisk och canonical=false."],
              [<code key="gate">gate</code>, "Samlad blockeringslista härledd ur misslyckade krav och stages.", "Regression eller golden-diff tar bort runnens subset-anspråk."],
            ]}
          />
          <CodeExample
            title="Conformance report · förkortat exempel"
            language="json"
            status="Körbar playground-subset"
            code={code(
              "{",
              '  "schema": "textabana.conformance-report/lab-v1",',
              '  "suite": { "suiteId": "textabana.playground/interop-0.5", "version": "1.0.0-lab.1" },',
              '  "case": { "caseId": "golden-core-chain", "expectedOutcome": "succeeded", "actualOutcome": "succeeded" },',
              '  "profiles": [{',
              '    "profile": "runtime-json/1", "declaredSupport": "playground-subset",',
              '    "status": "passed", "derivedSupport": "playground-subset", "claimable": true,',
              '    "requirements": [{ "requirementId": "RUNTIME-ATOMIC-TERMINAL", "status": "passed", "evidenceRefs": ["lab:…"] }]',
              "  }],",
              '  "normalization": { "policy": "textabana.structural-snapshot/lab-v1", "ignoredPaths": ["/transport/runId", "/plan/steps/*/duration"] },',
              '  "golden": { "status": "passed", "expectedStructuralDigest": "fnv1a-lab:…", "actualStructuralDigest": "fnv1a-lab:…" },',
              '  "gate": { "status": "passed", "blockingRequirementIds": [] },',
              '  "extensions": { "textabana.playground": { "canonical": false, "fullConformance": false } }',
              "}"
            )}
          />
          <div className="conformance-grid">
            <article><CheckCircle2 aria-hidden="true" /><strong>Verifierat i aktuella labs</strong><p>Includes, JS-moduler, block, pipelines, öppna intervall, order, inheritance, cross=error, deklarerade JSON-kanaler, atomiskt Result, Anchors/SourceMaps, adapterisolering, typade data med lineage, notebook-snapshots, immutable annotationskandidater, run-bundna konformitetskrav, normalized golden snapshots, exakta negativa cases samt kooperativ cancellation vid stage-gränser.</p></article>
            <article><CircleDashed aria-hidden="true" /><strong>Återstår för full konformitet</strong><p>Kanonisk SHA-256-baserad IR/Plan/Result, full JSON Schema, durable re-anchor, LSP, preemption av synkrona CPU-loopar, timeout/backpressure och extern side-effect rollback, full Data-dataplan med beständiga artifacts, polyglotta runtimes, resterande cross-policies, Jupyter Messaging, nbformat-roundtrip, session/attached kernel, Comms/widgets, verklig modellkörning, persistent review store, full annotationsontologi/tool-roundtrip samt W3C PROV, OpenLineage, MLflow och OTel.</p></article>
          </div>
          <Requirement id="CONF-001">En implementation MÅSTE publicera en machine-readable capability response med exakta profilversioner, limits, value kinds, runtimes och extensions.</Requirement>
          <Requirement id="CONF-002">Ett profilanspråk MÅSTE bindas till en versionssatt suite och verifiera source → IR → plan → result → projection. Profiler utan relevant input MÅSTE vara <code>not-run</code>, inte passerade.</Requirement>
          <Requirement id="CONF-003">En adapter får inte förändra Language Core-semantik för att passa hostens exekveringsmodell.</Requirement>
          <Requirement id="CONF-004">Deklarerad support och verifieringsutfall MÅSTE vara separata. Ett saknat eller misslyckat obligatoriskt krav blockerar <code>claimable</code> även när capability-katalogen säger playground-subset.</Requirement>
          <Requirement id="CONF-005"><code>contract-only</code> och <code>unsupported</code> får aldrig härledas till ett lyckat implementeringsanspråk. Ett passerat no-fabrication-krav verifierar endast kontraktsgränsen.</Requirement>
          <Requirement id="CONF-006">En structural snapshot MÅSTE publicera normaliseringspolicy, ignorerade transportfält, digestalgoritm, actual digest och versionssatt expected digest när en golden baseline finns.</Requirement>
          <Requirement id="CONF-007">Negativa fixtures MÅSTE köras isolerat och kräva förväntad terminalstatus, exakt diagnostikkod och atomiskt tom durable commit. Ett negativt pass får aldrig skriva om core-resultatet till succeeded.</Requirement>
          <Requirement id="CONF-008">Cancellation MÅSTE ha eget terminaltillstånd. Den aktuella subseten är kooperativ vid async- och stage-gränser; den hävdar inte synkron preemption, deadline/backpressure eller rollback av externa sidoeffekter.</Requirement>
        </section>

        <section className="docs-section spec-section" id="errors">
          <SectionHeading number="26" layer="Conformance" title="Fel är strukturerade, positionsbundna och versionssatta" implementation="defined" />
          <SpecTable
            caption="Felkodsfamiljer"
            headers={["Prefix", "Fas", "Exempel"]}
            rows={[
              [<code key="parse">TBA-PARSE</code>, "Lexing / parsing", "Obalanserat block eller ogiltig marker."],
              [<code key="resolve">TBA-RESOLVE</code>, "Include / manifest", "Cykel, digest mismatch eller exportkollision."],
              [<code key="type">TBA-TYPE</code>, "Planering", "Inkompatibel TextabanaValue eller channel payload."],
              [<code key="run">TBA-RUN</code>, "Exekvering", "Funktionsfel, timeout, cancellation eller backpressure."],
              [<code key="anchor">TBA-ANCHOR</code>, "Positionering", "Ambiguous, orphan eller falskt exact mapping claim."],
              [<code key="security">TBA-SECURITY</code>, "Capabilities", "Saknad grant, otillåten URI eller secret leak."],
              [<code key="adapter">TBA-ADAPTER</code>, "Interop", "Förlust av metadata, schema eller coordinate conversion."],
            ]}
          />
          <CodeExample
            title="Diagnostic"
            language="json"
            status="Normativt schemafragment"
            code={code(
              "{",
              '  "diagnosticId": "diag:run-42:3",',
              '  "code": "TBA-TYPE-CHANNEL-PAYLOAD",',
              '  "severity": "error",',
              '  "message": "claims event matchar inte schema:claim/v2",',
              '  "anchorRef": "anchor:emit-call",',
              '  "related": [{ "anchorRef": "anchor:manifest-channel" }],',
              '  "phase": "planning",',
              '  "cause": { "schemaPath": "/required/label" }',
              "}"
            )}
          />
          <Requirement id="ERROR-001">Diagnostik MÅSTE ha stabil kod, severity, message, fas och position när position är känd. Hostspecifika stacktraces FÅR bifogas som skyddad extension.</Requirement>
          <Requirement id="VERSION-001">Language, IR, Result och adapterprofiler versioneras oberoende. Breaking semantik kräver ny major/schemaidentifierare.</Requirement>
          <Requirement id="VERSION-002">Extensions MÅSTE vara namespaced. Okända optional extensions round-trippas; okända required extensions stoppar körningen med capabilitydiagnostik.</Requirement>
        </section>

        <section className="docs-section spec-section playground-contract-section" id="playgrounds">
          <SectionHeading number="27" layer="Interactive implementation" title="Sju playgrounds visar samma valda run från olika håll" normative={false} implementation="partial" />
          <p className="lead">Language & Scope, Editor Metadata, Channel & Result, Data & Lineage, Notebook Interop, Annotation & Review och Conformance använder samma valda källa, fixture, run-id och result envelope. Adaptergrunden registrerar, förhandlar och kör oberoende projektioner efter commit utan att mutera resultatet. Conformance läser samma körning efter fan-out och härleder sina claims från kravutfall. Ett labbyte startar ingen ny exekvering eller byter fixture.</p>
          <div className="playground-grid">
            <article><span>01</span><Code2 aria-hidden="true" /><strong>Language & Scope Lab</strong><p>Scope-segment, blockträd, inheritance, faktisk stageordning, IR-projektion och render.</p><small>Live · scope-torture + base64-inverse</small></article>
            <article><span>02</span><PanelRight aria-hidden="true" /><strong>Editor Metadata Lab</strong><p>system.out, metadatagutter, row/line, Anchor, SourceMap och jämförelse med föregående run.</p><small>Live · editor-revision</small></article>
            <article><span>03</span><RadioTower aria-hidden="true" /><strong>Channel & Result Lab</strong><p>ChannelDescriptors, strict mode, global eventtimeline, snapshots och atomiskt Result JSON.</p><small>Live · channel-fanout + failed-run</small></article>
            <article><span>04</span><Database aria-hidden="true" /><strong>Data & Lineage Lab</strong><p>JSON-tabell, schema-events, stabila recordId, deterministisk inner join, derived aggregation och cell-/record-lineage.</p><small>Live · data-join · data/1 playground-subset</small></article>
            <article><span>05</span><Blocks aria-hidden="true" /><strong>Notebook Interop Lab</strong><p>Whole-snapshot, stabila cell-id:n, tre MIME-representationer, explicit state och digest-baserad stale detection.</p><small>Live · notebook-snapshot · notebook/1 playground-subset</small></article>
            <article><span>06</span><Bot aria-hidden="true" /><strong>Annotation & AI Review Lab</strong><p>Immutable AI-kandidater, confidence method, append-only human review, revisionskedja, Anchor-targets samt W3C- och Label Studio-export.</p><small>Live · annotation-review · annotation/1 playground-subset</small></article>
            <article><span>07</span><ShieldCheck aria-hidden="true" /><strong>Conformance Lab</strong><p>Profilval, capability response, stage gates, normalized golden snapshot, strukturell diff, exakta negativa cases och kooperativ cancellation.</p><small>Live · conformance-golden · report/lab-v1</small></article>
          </div>
          <h3>Gemensamt playgroundkontrakt</h3>
          <Requirement id="PLAYGROUND-001">Alla labs BÖR använda samma lilla dokument, modulmanifest, inputdata och förväntade resultatsnapshot så att relationen mellan vyerna är verifierbar.</Requirement>
          <Requirement id="PLAYGROUND-002">Varje lab MÅSTE skilja författad källa, kompilerad semantik, runtimeevents och adapterprojektion visuellt.</Requirement>
          <Requirement id="PLAYGROUND-003">En funktion som UI:t ännu inte implementerar MÅSTE visas som planned/unsupported och får inte simuleras som konformt resultat.</Requirement>
          <Requirement id="PLAYGROUND-004">Golden fixtures ska kunna exporteras och köras headless i samma conformance suite som UI:t visualiserar.</Requirement>
        </section>

        <section className="docs-section spec-section" id="glossary">
          <SectionHeading number="28" layer="Referens" title="Kärnbegrepp" normative={false} implementation="defined" />
          <SpecTable
            caption="Glossary"
            headers={["Begrepp", "Definition"]}
            rows={[
              [<code key="source-doc">SourceDocument</code>, "Immutable, versionerad textkälla med logical identity och base URI."],
              [<code key="block">Block</code>, "Strikt nästlad funktionsregion vars kompletta pipeline kör före ambient inheritance."],
              [<code key="interval">Intervall</code>, "Öppet, identifierbart scope som är aktivt över ett eller flera textsegment."],
              [<code key="property">Property</code>, "Icke-exekverande metadata på en Markdown-AST-enhet."],
              [<code key="ir">TextabanaIR</code>, "Host-neutral semantisk representation av source snapshot."],
              [<code key="plan">ExecutionPlan</code>, "Körbar, typad och capability-validerad stagegraf för en host."],
              [<code key="value">TextabanaValue</code>, "Portabelt typed value envelope i pipelines och runtimeprotokoll."],
              [<code key="anchor">Anchor</code>, "Durable länk till en versionerad target via en eller flera selectors."],
              [<code key="source-map">SourceMap</code>, "Många-till-många-relation mellan outputselectors och inputanchors."],
              [<code key="render-result">render</code>, "Primärt resultatvärde från returpipelinen; inte en vanlig channel."],
              [<code key="channel">Channel</code>, "Namngiven, typed append-only eventström inom en run."],
              [<code key="system">system.out</code>, "Reserverad channel för editor- och positionsbunden metadata."],
              [<code key="artifact-ref">ArtifactRef</code>, "Content-addressed referens till stor eller binär payload."],
              [<code key="run">Run</code>, "En versionerad compilation/execution med explicit profil och livscykel."],
              [<code key="adapter">Adapter</code>, "Versionssatt post-commit-projektion mellan ett immutable TextabanaResult och en extern host, standard eller tjänst."],
              [<code key="candidate">Candidate</code>, "Immutable modell- eller verktygsförslag på revision 0, utan mänskligt decision state."],
              [<code key="review">Review revision</code>, "Append-only mänsklig handling och ny revision som accepterar, avvisar eller ersätter en kandidat."],
              [<code key="current">Current view</code>, "Härledd lista över nu accepterade annotationer; den raderar aldrig historiska kandidater eller revisioner."],
              [<code key="conf-report">ConformanceReport</code>, "Maskinläsbar, source-result-bunden evidens för ett versionssatt suite-case; separat från canonical Result och CI-status."],
              [<code key="golden">Golden fixture</code>, "Incheckad input och expected structural digest som inte beräknas från samma aktuella run."],
              [<code key="claim">Declared vs claimable</code>, "Declared support beskriver katalogen; claimable kräver att alla tillämpliga krav passerar. Contract-only är aldrig claimable."],
              [<code key="gate">Conformance gate</code>, "Härledd blockeringslista för failed requirements, stagefel och golden-regressioner i det aktuella caset."],
            ]}
          />
          <Callout title="Specifikationens riktning" icon={<Box />} tone="success">
            Textabana återanvänder etablerade format där de redan löser problemet: Markdown för läsbar text, JSON Schema för kontrakt, Arrow/Parquet för data, MIME för notebookpresentation, W3C-modeller för annotation/proveniens och LSP/OTel/OpenLineage/MLflow som adaptrar. Det nya är den sammanhängande semantiken mellan dem.
          </Callout>
        </section>
      </main>
    </div>
  );
}
