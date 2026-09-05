import {
  AlertTriangle,
  ArrowDown,
  Bot,
  Blocks,
  Box,
  Braces,
  CheckCircle2,
  CircleDashed,
  Database,
  FileJson,
  GitBranch,
  Link2,
  MapPinned,
  Network,
  PanelRight,
  RadioTower,
  Route,
  Rows3,
  Search,
  ShieldCheck,
  Tags,
  Workflow,
} from "lucide-react";

type FunctionMeta = {
  name: string;
  modulePath: string;
  description: string;
  args: Record<string, { type?: string; default?: unknown; description?: string }>;
  accepts: string;
  returns: string;
  outputs: string[];
};

function signature(args: FunctionMeta["args"]) {
  const entries = Object.entries(args);
  if (!entries.length) return "inga argument";
  return entries.map(([name, value]) => `${name}${value.default === undefined ? "" : `=${JSON.stringify(value.default)}`}`).join(" · ");
}

function Code({ children }: { children: string }) {
  return <pre className="spec-code"><code>{children}</code></pre>;
}

export function Specification({ functions }: { functions: FunctionMeta[] }) {
  return (
    <div className="docs-layout spec-layout">
      <aside className="docs-index spec-index">
        <div className="spec-version"><span>Textabana</span><strong>Language draft 0.3</strong></div>
        <nav aria-label="Specifikationens innehåll">
          <a href="#model">1. Grundmodell</a>
          <a href="#why">2. Varför Textabana</a>
          <a href="#grammar">3. Markörer</a>
          <a href="#blocks">4. Block</a>
          <a href="#intervals">5. Intervall</a>
          <a href="#inheritance">6. Inheritance</a>
          <a href="#channels">7. Kanaler</a>
          <a href="#system-out">8. system.out</a>
          <a href="#use-cases">9. Användningsfall</a>
          <a href="#overlap">10. Överlappning</a>
          <a href="#properties">11. Properties</a>
          <a href="#modules">12. Moduler</a>
          <a href="#execution">13. Exekvering</a>
          <a href="#reference">14. Referens</a>
        </nav>
        <div className="spec-legend">
          <span><i className="implemented" /> Implementerat</span>
          <span><i className="defined" /> Normativt definierat</span>
        </div>
      </aside>

      <main className="docs-content spec-content">
        <section className="spec-hero" id="model">
          <div className="spec-kicker"><ShieldCheck /> Normativ kärnspecifikation</div>
          <h1>Text som både kan läsas och driva strukturerade applikationer.</h1>
          <p>Textabana utökar Markdown med fyra ortogonala mekanismer. Block skapar struktur. Intervall skapar kontinuerliga funktionsfält. Properties beskriver innehållets semantik. Kanaler publicerar maskinläsbar output utan att störa textflödet.</p>
          <div className="model-cards">
            <article><Blocks /><span>Struktur</span><strong>Block</strong><p>Tar ett avgränsat innehåll och producerar ett värde.</p></article>
            <article><Route /><span>Kontinuitet</span><strong>Intervall</strong><p>Förblir aktiva genom textflödet tills de stängs.</p></article>
            <article><Tags /><span>Semantik</span><strong>Properties</strong><p>Fäster lättviktig metadata på Markdown-enheter.</p></article>
            <article><RadioTower /><span>Output</span><strong>Kanaler</strong><p>Publicerar valfria eventströmmar parallellt med renderingen.</p></article>
          </div>
          <div className="normative-note"><strong>Kärnregel</strong><span><code>return</code> fortsätter textens pipeline. <code>emit</code> skickar ett event till en kanal. Ett block ärver fortfarande aktiva intervall efter sin egen pipeline, så även deras kanalutskick följer inheritance-policyn.</span></div>
        </section>

        <section className="docs-section spec-section value-section" id="why">
          <div className="spec-heading"><span>01</span><div><p>Produktens värde</p><h2>Textabana håller text och metadata i samma verklighet</h2></div></div>
          <p className="value-statement">Textabana gör vanlig text till ett positionsmedvetet gränssnitt för strukturerade applikationer.</p>
          <p className="lead">Vanlig text är snabb att skriva men svår att använda som data. Formulär, JSON och XML är strukturerade men tunga att författa. Textabana låter människan arbeta i lättviktig text medan kärnan samtidigt producerar renderat innehåll, metadata och spårbarhet.</p>
          <div className="value-flow" aria-label="Från en källa till flera outputs">
            <div><FileJson /><span>En läsbar källa</span><code>document.md</code></div>
            <ArrowDown />
            <div className="value-engine"><Braces /><span>Textabana</span><code>en exekvering</code></div>
            <ArrowDown />
            <div className="value-outputs">
              <span>render</span><span>system.out</span><span>entities</span><span>gis.routes</span><span>audit</span>
            </div>
          </div>
          <div className="value-principles">
            <article><Link2 /><strong>Ingen metadata-drift</strong><p>Metadata produceras från samma intervall som texten den beskriver och behåller sin källposition.</p></article>
            <article><PanelRight /><strong>En gemensam editorkärna</strong><p>Parser, positionsmodell, modulkörning och eventformat återanvänds mellan många domäneditorer.</p></article>
            <article><Workflow /><strong>En källa, flera produkter</strong><p>Samma körning kan ge lästext, index, grafdata, GIS, diagnostik och audit utan separata kopior.</p></article>
          </div>
        </section>

        <section className="docs-section spec-section" id="grammar">
          <div className="spec-heading"><span>02</span><div><p>Lexikal yta</p><h2>Fyra markörfamiljer</h2></div></div>
          <p className="lead">Modaliteten ska vara synlig direkt i texten. Parsern får aldrig behöva gissa om en öppning är strukturell, kontinuerlig eller deklarativ.</p>
          <div className="marker-table">
            <div className="marker-row header"><span>Markör</span><span>Roll</span><span>Krav</span></div>
            <div className="marker-row"><code>&gt;&gt;&gt;&gt;!</code><strong>Direktiv</strong><span>Producerar ingen output</span></div>
            <div className="marker-row"><code>&gt;&gt;&gt;&gt;</code><strong>Öppna block</strong><span>MÅSTE stängas strukturellt</span></div>
            <div className="marker-row"><code>&lt;&lt;&lt;&lt;</code><strong>Stäng block</strong><span>MÅSTE matcha öppningsfunktionen</span></div>
            <div className="marker-row"><code>&gt;&gt;&gt;&gt;+</code><strong>Aktivera intervall</strong><span>Lägger till en aktiv funktionsinstans</span></div>
            <div className="marker-row"><code>&lt;&lt;&lt;&lt;+</code><strong>Avaktivera intervall</strong><span>Kan stänga med namn eller <code>@id</code></span></div>
          </div>
          <Code>{`>>>>! include "./modules/core.js"
>>>>! config scope-order="declaration:asc"

>>>>+ normalize @id=clean

>>>> summarize sentences=2
Text
<<<< summarize

<<<<+ @id=clean`}</Code>
          <div className="syntax-rule"><Braces /><p>Vanliga argument skickas till funktionen. Argument som börjar med <code>@</code> styr körmotorn och skickas inte till funktionen.</p></div>
        </section>

        <section className="docs-section spec-section" id="blocks">
          <div className="spec-heading"><span>03</span><div><p>Strukturell modalitet</p><h2>Block bildar ett träd</h2></div></div>
          <p className="lead">Block är strikt balanserade och får inte korsa andra block. Inre block producerar sitt värde före det omgivande blocket.</p>
          <Code>{`>>>> outer
  >>>> inner
  Text
  <<<< inner
<<<< outer`}</Code>
          <div className="execution-equation"><code>outer(inner(&quot;Text&quot;))</code><span>innifrån → ut</span></div>
          <h3>Explicit pipeline</h3>
          <Code>{`>>>> extract type="claims"
  | rank by="confidence"
  | summarize sentences=3
  | bullet

Text
<<<< extract`}</Code>
          <p>Varje steg får föregående stegs output som sin input. Pipeline-steg körs alltid från vänster till höger.</p>
        </section>

        <section className="docs-section spec-section" id="intervals">
          <div className="spec-heading"><span>04</span><div><p>Kontinuerlig modalitet</p><h2>Intervall bildar aktiva funktionsmängder</h2></div></div>
          <p className="lead">Intervall behöver inte stängas i omvänd öppningsordning. Därför kan de överlappa och korsa varandra på ett sätt som ett vanligt syntaxträd inte kan representera.</p>
          <Code>{`>>>>+ summarize @id=summary
Text A

>>>>+ translate language="sv" @id=translation
Text B

<<<<+ @id=summary
Text C

<<<<+ @id=translation`}</Code>
          <div className="interval-map">
            <div><strong>Text A</strong><span className="scope-pill blue">summary</span></div>
            <div><strong>Text B</strong><span className="scope-pill blue">summary</span><span className="scope-pill lime">translation</span></div>
            <div><strong>Text C</strong><span className="scope-pill lime">translation</span></div>
          </div>
          <h3>Sortering av samtidiga intervall</h3>
          <p>Utan explicit prioritet används deklarationsordning. Stigande ordning är standard. <code>@order</code> åsidosätter öppningstid.</p>
          <Code>{`>>>>+ translate language="sv" @id=translation @order=30
>>>>+ normalize @id=clean @order=10
>>>>+ summarize @id=summary @order=20

Text  // normalize → summarize → translate`}</Code>
        </section>

        <section className="docs-section spec-section inheritance-section" id="inheritance">
          <div className="spec-heading"><span>05</span><div><p>Block × intervall</p><h2>Inheritance är en explicit exekveringsgräns</h2></div></div>
          <p className="lead">Ett block ärver de intervall som omsluter blocket. Default innebär att blockets kompletta pipeline körs först och att dess output sedan skickas genom de ärvda intervallen.</p>
          <div className="default-flow">
            <span>Källtext</span><ArrowDown /><span>Blockpipeline</span><ArrowDown /><span>Ärvda intervall</span><ArrowDown /><span>Output</span>
          </div>
          <Code>{`>>>>+ translate language="sv" @id=translation

>>>> summarize sentences=2
Text på engelska.
<<<< summarize

<<<<+ @id=translation

// summarize → translate`}</Code>
          <div className="policy-table">
            <div className="policy-row header"><span>Policy</span><span>Semantik</span></div>
            <div className="policy-row"><code>@inherit=default</code><span>Alla omslutande intervall körs efter blocket</span></div>
            <div className="policy-row"><code>@inherit=none</code><span>Blocket blir en isolerad ö</span></div>
            <div className="policy-row"><code>@inherit=only</code><span>Endast valda intervall ärvs</span></div>
            <div className="policy-row"><code>@inherit=except</code><span>Alla utom valda intervall ärvs</span></div>
            <div className="policy-row"><code>@inherit=explicit</code><span>Endast explicita <code>@intervals</code>-steg körs</span></div>
          </div>
          <h3>Full kontroll i blockets pipeline</h3>
          <p><code>@intervals</code> är ett virtuellt pipeline-steg. När det förekommer läggs inga intervall till implicit.</p>
          <Code>{`>>>> extract @inherit=explicit
  | @intervals only=[clean,redaction]
  | summarize sentences=3
  | @intervals only=[translation,provenance]
  | bullet

Text
<<<< extract`}</Code>
          <div className="pipeline-strip">
            <span>extract</span><i>→</i><span>clean</span><i>→</i><span>redaction</span><i>→</i><span>summarize</span><i>→</i><span>translation</span><i>→</i><span>provenance</span><i>→</i><span>bullet</span>
          </div>
          <div className="syntax-rule"><GitBranch /><p>Urval med funktionsnamn matchar alla aktiva instanser. Urval med ett unikt <code>@id</code> adresserar exakt en intervallinstans.</p></div>
        </section>

        <section className="docs-section spec-section" id="channels">
          <div className="spec-heading"><span>06</span><div><p>Flerkanalig output</p><h2>Kanaler är append-only-händelseströmmar</h2></div></div>
          <p className="lead">En funktion får skapa hur många namngivna kanaler som behövs. Kanalen uppstår vid första <code>emit</code>; ingen central whitelist eller förhandsdeklaration krävs. Fil, panel, databas och nätverk är sinks som kan konsumera eventen – inte olika språksemantiker.</p>
          <Code>{`define({
  extract_entity: {
    outputs: ["render", "entities", "search.index"],
    transform(input, args, context) {
      const entity = { type: args.type, label: String(input).trim() };

      context.emit("entities", entity);
      context.emit("search.index", { text: entity.label.toLowerCase() });

      return input;
    }
  }
});`}</Code>
          <div className="return-emit-grid">
            <article><code>return value</code><strong>Textflöde</strong><p>Ersätter funktionens resultat och blir input till nästa pipe- eller intervallsteg.</p></article>
            <article><code>context.emit(name, payload)</code><strong>Sidoflöde</strong><p>Lägger till ett event utan att förändra textvärdet eller nästa funktions input.</p></article>
            <article><code>context.annotate(payload)</code><strong>Editorflöde</strong><p>Shorthand för en positionsbunden emission till den reserverade kanalen <code>system.out</code>.</p></article>
          </div>
          <h3>Normativa kanalregler</h3>
          <div className="channel-rules">
            <div><strong>Dynamiska namn</strong><span><code>entities</code>, <code>gis.routes</code>, <code>audit</code> och andra kanaler skapas vid behov.</span></div>
            <div><strong>Global sekvens</strong><span>Varje event får ett stigande <code>sequence</code> enligt faktisk, deterministisk exekveringsordning.</span></div>
            <div><strong>Inget dolt återflöde</strong><span>Kanaler är skrivbara men läses inte implicit av samma pipeline. Därmed undviks cykler och dold ordningskoppling.</span></div>
            <div><strong>Atomisk snapshot</strong><span>En lyckad körning ersätter editorns föregående kanalsnapshot. En misslyckad körning publicerar inga partiella sidoevents.</span></div>
            <div><strong>JSON-säker payload</strong><span>Värden normaliseras till serialiserbar data innan de lämnar runtime.</span></div>
            <div><strong>Reserverade namn</strong><span><code>render</code> skrivs endast via return. Namn under <code>system.*</code> ägs av kärnan.</span></div>
          </div>
          <div className="syntax-rule"><RadioTower /><p>Modulen laddas fortfarande exakt en gång. Att samma funktion skickar event till fem kanaler innebär inte fem funktionskörningar.</p></div>
        </section>

        <section className="docs-section spec-section system-out-section" id="system-out">
          <div className="spec-heading"><span>07</span><div><p>Editorns standardprotokoll</p><h2><code>system.out</code> binder metadata till row och line</h2></div></div>
          <p className="lead"><code>system.out</code> är inte processens stdout. Det är Textabanas schema-kontrollerade systemkanal för metadataeditorer. Varje event har en logisk row, en fysisk källrad, ett källspann och full funktionsproveniens.</p>
          <Code>{`const stableDomainKey = (kind, text) =>
  kind + ":" + text.toLowerCase().replace(/[^a-z0-9]+/g, "-");

define({
  collect_rows: {
    outputs: ["render", "system.out", "records"],
    transform(input, args, context) {
      let row = 0;

      String(input).split("\\n").forEach((sourceLine, lineOffset) => {
        const text = sourceLine.trim();
        if (!text) return;
        row += 1;

        const rowId = stableDomainKey("claim", text);
        const location = { row, rowId, lineOffset, type: "row" };

        context.system.out.row(rowId, { kind: "claim", text }, location);
        context.emit(args.channel ?? "records", { kind: "claim", text }, location);
      });

      return input;
    }
  }
});`}</Code>
          <div className="coordinate-grid">
            <article><Rows3 /><strong>row</strong><p>En logisk domänpost inom funktionens input. Den kan spänna över flera fysiska rader och bör få ett explicit, stabilt <code>rowId</code>.</p></article>
            <article><FileJson /><strong>line</strong><p>Den ettbaserade fysiska raden i källdokumentet. <code>lineOffset</code> är nollbaserad relativt funktionens <code>source.startLine</code>.</p></article>
            <article><Link2 /><strong>source</strong><p>Det ursprungliga källspannet med sökväg, start, slut och mapping-status. Flera events kan peka på samma spann.</p></article>
            <article><Workflow /><strong>origin</strong><p>Modul, funktion, block/intervall-modalitet, deklarationsrad och eventuellt scope-id.</p></article>
          </div>
          <h3>Eventformat</h3>
          <Code>{`{
  "schema": "textabana.system.out/v1",
  "id": "<document-version>:system.out:0001",
  "sequence": 1,
  "channel": "system.out",
  "type": "row",
  "row": 2,
  "rowId": "claim:42:2",
  "line": 43,
  "payload": { "kind": "claim", "text": "..." },
  "source": {
    "path": "document.md",
    "startLine": 42,
    "endLine": 44,
    "mapping": "exact"
  },
  "origin": {
    "function": "collect_rows",
    "module": "modules/metadata.js",
    "modality": "interval",
    "scopeId": "metadata"
  }
}`}</Code>
          <div className="mapping-table">
            <div><code>exact</code><span>Eventet kan förankras exakt i det angivna källspannet.</span></div>
            <div><code>derived</code><span>Metadata har härletts genom reducering, aggregering eller omordning.</span></div>
            <div><code>synthetic</code><span>Eventet saknar en enskild direkt motsvarighet i källtexten.</span></div>
          </div>
          <div className="security-note"><AlertTriangle /><p><strong>Ärlig positionsregel:</strong> en modul som reducerar eller aggregerar text måste ange <code>mapping=&quot;derived&quot;</code> eller <code>synthetic</code>. Exakt mapping från slutlig render tillbaka till varje källtecken är ännu inte implementerad.</p></div>
          <h3>Samspel med inheritance</h3>
          <p>När en intervallfunktion ärvs körs både dess texttransformation och dess emissioner. <code>@inherit=none</code>, <code>only</code>, <code>except</code>, <code>explicit</code> och explicita <code>@intervals</code>-steg styr därför även vilka kanalhändelser som uppstår. Redan publicerade events pipas aldrig vidare som text.</p>
        </section>

        <section className="docs-section spec-section use-cases-section" id="use-cases">
          <div className="spec-heading"><span>08</span><div><p>Verkliga problem</p><h2>Varför den flerkanaliga kärnan spelar roll</h2></div></div>
          <p className="lead">Kanalmodellen flyttar återkommande och svår editorteknik till en gemensam runtime. Domänprodukten behöver främst definiera funktioner, metadata och hur eventen visas.</p>
          <div className="use-case-grid">
            <article><PanelRight /><div><strong>Metadataeditorer utan ny parser</strong><p>Återanvänd syntaxanalys, positionsspårning, modulladdning, felmodell och synkronisering mellan text och sidopanel.</p></div></article>
            <article><Link2 /><div><strong>Text och metadata driver inte isär</strong><p>Strukturerad information produceras ur samma källa och pekar tillbaka till rätt row, line och intervall.</p></div></article>
            <article><FileJson /><div><strong>Lätt skrivande istället för tunga formulär</strong><p>Författaren arbetar i Markdown-lik text istället för att direkt redigera JSON, XML eller stora CMS-formulär.</p></div></article>
            <article><Search /><div><strong>Diagnostik exakt där felet finns</strong><p>Varningar, badges, hover-information och korrigeringsförslag kan visas på rätt källrad utan att hamna i renderingen.</p></div></article>
            <article><Database /><div><strong>Ett dokument ger flera produkter</strong><p>Samma körning kan ge Markdown, sökindex, grafdata, GIS-punkter, validering och auditspår.</p></div></article>
            <article><Network /><div><strong>Kunskapsgrafer redigeras som text</strong><p>Entity- och relationsevents kan byggas till en graf, medan varje nod behåller en länk tillbaka till textens källa.</p></div></article>
            <article><Bot /><div><strong>AI-resultat med proveniens</strong><p>Extraktioner kan bära modell, confidence, funktion och källspann så att människor kan granska och korrigera resultatet.</p></div></article>
            <article><Workflow /><div><strong>Billiga domänspecifika editorer</strong><p>Juridik, forskning, krav, publicering och data lineage kan dela kärna men använda egna moduler och presentationer.</p></div></article>
            <article className="featured-use-case"><MapPinned /><div><strong>PARES/RWMT: dokument → GIS och graf</strong><p>En läsbar arkivtext kan samtidigt producera skepp, resor, platser, sannolikhetsrutter, evidens och grafrelationer med spårbarhet till originalraden.</p></div></article>
          </div>
        </section>

        <section className="docs-section spec-section" id="overlap">
          <div className="spec-heading"><span>09</span><div><p>Topologiska relationer</p><h2>Containment är entydigt. Korsning kräver policy.</h2></div></div>
          <div className="geometry-grid">
            <article><span>A omsluter B</span><code>A(B(text))</code><p>Block-output blir intervallets input.</p></article>
            <article><span>B omsluter A</span><code>B(A(text))</code><p>Intervallet bearbetas inne i blocket.</p></article>
            <article className="warning"><span>A korsar B</span><code>partial(A, B)</code><p>Output kan sakna entydig mappning till källsegmenten.</p></article>
          </div>
          <p className="lead">Den säkra standarden är <code>@cross=error</code>. En partiell korsning stoppas därför innan tvetydig output kan produceras.</p>
          <div className="cross-table">
            <div><code>error</code><span>Implementerad default</span><strong className="status-live">Aktiv</strong></div>
            <div><code>split</code><span>Dela blocket per intervallsegment</span><strong className="status-defined">Definierad</strong></div>
            <div><code>promote</code><span>Låt intervallet omfatta hela block-output</span><strong className="status-defined">Definierad</strong></div>
            <div><code>truncate</code><span>Avsluta intervallet vid blockgränsen</span><strong className="status-defined">Definierad</strong></div>
            <div><code>preserve</code><span>Behåll segmentproveniens genom transformationen</span><strong className="status-defined">Definierad</strong></div>
          </div>
          <div className="security-note"><AlertTriangle /><p><strong>Konformitetsregel:</strong> en motor får inte låtsas stödja <code>preserve</code> för en reducerande eller aggregerande funktion utan en verifierbar output–input-mappning.</p></div>
        </section>

        <section className="docs-section spec-section" id="properties">
          <div className="spec-heading"><span>10</span><div><p>Semantisk metadata</p><h2>Properties följer Markdown-enheter</h2></div></div>
          <p className="lead">Attributlistor är inspirerade av etablerade Markdown-varianter och renderas inte som synlig text. En fristående attributrad hör till föregående blockenhet.</p>
          <Code>{`Den centrala slutsatsen.

{.claim .verified priority=10 confidence=0.94}

## Evidens {.evidence priority=20 source="PARES"}`}</Code>
          <div className="property-anatomy">
            <span><code>.claim</code><small>tagg</small></span>
            <span><code>.verified</code><small>tagg</small></span>
            <span><code>priority=10</code><small>tal</small></span>
            <span><code>confidence=0.94</code><small>tal</small></span>
          </div>
          <p>Properties och funktionsordning är skilda dimensioner: <code>@order</code> sorterar funktioner, medan exempelvis <code>priority</code> kan användas av en funktion för att sortera innehållsenheter.</p>
          <div className="syntax-rule"><CircleDashed /><p>Playgrounden tar i dag bort property-syntax ur renderingen. Automatisk property-selektion och property-drivna metadatakollektioner tillhör nästa konformitetsnivå.</p></div>
        </section>

        <section className="docs-section spec-section" id="modules">
          <div className="spec-heading"><span>11</span><div><p>Återanvändbar kod</p><h2>Moduler laddas exakt en gång</h2></div></div>
          <Code>{`>>>>! include "./modules/core.js"`}</Code>
          <Code>{`define({
  normalize: {
    description: "Normaliserar blanksteg.",
    behavior: "segment-preserving",
    args: {},
    transform(input, args, context) {
      return String(input).replace(/[ \\t]+/g, " ");
    }
  }
});`}</Code>
          <p>En modul identifieras av sin normaliserade sökväg och sin innehållshash. Cirkulära includes och dubbla funktionsdefinitioner är kompileringsfel.</p>
          <div className="behavior-list">
            <span>segment-preserving</span><span>reordering</span><span>expanding</span><span>reducing</span><span>aggregating</span>
          </div>
        </section>

        <section className="docs-section spec-section" id="execution">
          <div className="spec-heading"><span>12</span><div><p>Deterministisk körning</p><h2>Från text till exekveringsplan</h2></div></div>
          <ol className="execution-list spec-execution">
            <li><span>1</span><div><strong>Lös direktiv</strong><p>Normalisera includes, bygg modulgraf och kontrollera cykler.</p></div></li>
            <li><span>2</span><div><strong>Segmentera dokumentet</strong><p>Dela vid block-, intervall- och property-gränser.</p></div></li>
            <li><span>3</span><div><strong>Bygg blockträdet</strong><p>Kontrollera strikt strukturell balans.</p></div></li>
            <li><span>4</span><div><strong>Beräkna aktiva intervall</strong><p>Tilldela varje segment en ordnad mängd funktionsinstanser.</p></div></li>
            <li><span>5</span><div><strong>Lös inheritance</strong><p>Injicera eller placera <code>@intervals</code> enligt blockets policy.</p></div></li>
            <li><span>6</span><div><strong>Validera korsningar</strong><p>Stoppa varje relation som saknar uttrycklig och stödd policy.</p></div></li>
            <li><span>7</span><div><strong>Exekvera funktioner</strong><p>Fortsätt return-värden genom textpipelinen och numrera emissioner i faktisk körordning.</p></div></li>
            <li><span>8</span><div><strong>Publicera atomiskt</strong><p>Leverera render, diagnostik och alla namngivna kanaler som en sammanhängande snapshot.</p></div></li>
          </ol>
          <div className="conformance-grid">
            <article><CheckCircle2 /><strong>Implementerat nu</strong><p>Direktiv, moduler, block, pipelines, öppna intervall, ordning, inheritance, <code>@cross=error</code>, dynamiska kanaler, atomiska snapshots och <code>system.out/v1</code> med row, line, source och origin.</p></article>
            <article><CircleDashed /><strong>Nästa konformitetsnivå</strong><p>Property-drivna samlingar, stabil output–source-mapping genom reducerande funktioner, inkrementella körningar samt korsningspolicyerna split, promote, truncate och preserve.</p></article>
          </div>
        </section>

        <section className="docs-section spec-section" id="reference">
          <div className="spec-heading"><span>13</span><div><p>Aktuellt projekt</p><h2>Inlästa funktioner</h2></div></div>
          <p className="lead">Referensen genereras från de moduler som playground-dokumentet faktiskt inkluderar.</p>
          <div className="function-grid">
            {functions.length ? functions.map((fn) => (
              <article key={`${fn.modulePath}:${fn.name}`} className="function-card">
                <div className="function-card-head"><code>{fn.name}</code><span>{fn.modulePath}</span></div>
                <p>{fn.description}</p>
                <div className="signature">{signature(fn.args)}</div>
                <div className="function-outputs"><span>outputs</span>{(fn.outputs ?? ["render"]).map((output) => <code key={output}>{output}</code>)}</div>
              </article>
            )) : <p className="muted-copy">Öppna Playground och kör ett giltigt dokument för att läsa in referensen.</p>}
          </div>
          <div className="security-note"><Box /><p>Moduler körs i en separat Web Worker men ska fortfarande betraktas som betrodd kod. En kapabilitetssandbox krävs innan externa moduler kan distribueras som säkra paket.</p></div>
        </section>
      </main>
    </div>
  );
}
