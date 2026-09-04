import {
  AlertTriangle,
  ArrowDown,
  Blocks,
  Box,
  Braces,
  CheckCircle2,
  CircleDashed,
  GitBranch,
  Layers3,
  Route,
  ShieldCheck,
  Tags,
  Zap,
} from "lucide-react";

type FunctionMeta = {
  name: string;
  modulePath: string;
  description: string;
  args: Record<string, { type?: string; default?: unknown; description?: string }>;
  accepts: string;
  returns: string;
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
        <div className="spec-version"><span>Textabana</span><strong>Language draft 0.2</strong></div>
        <nav aria-label="Specifikationens innehåll">
          <a href="#model">1. Grundmodell</a>
          <a href="#grammar">2. Markörer</a>
          <a href="#blocks">3. Block</a>
          <a href="#intervals">4. Intervall</a>
          <a href="#inheritance">5. Inheritance</a>
          <a href="#overlap">6. Överlappning</a>
          <a href="#properties">7. Properties</a>
          <a href="#modules">8. Moduler</a>
          <a href="#execution">9. Exekvering</a>
          <a href="#reference">10. Referens</a>
        </nav>
        <div className="spec-legend">
          <span><i className="implemented" /> Implementerat</span>
          <span><i className="defined" /> Normativt definierat</span>
        </div>
      </aside>

      <main className="docs-content spec-content">
        <section className="spec-hero" id="model">
          <div className="spec-kicker"><ShieldCheck /> Normativ kärnspecifikation</div>
          <h1>Struktur, intervall och semantisk kontroll i samma text.</h1>
          <p>Textabana utökar Markdown med tre ortogonala mekanismer. Block skapar struktur. Intervall skapar kontinuerliga funktionsfält. Properties beskriver innehållets semantik.</p>
          <div className="model-cards">
            <article><Blocks /><span>Struktur</span><strong>Block</strong><p>Tar ett avgränsat innehåll och producerar ett värde.</p></article>
            <article><Route /><span>Kontinuitet</span><strong>Intervall</strong><p>Förblir aktiva genom textflödet tills de stängs.</p></article>
            <article><Tags /><span>Semantik</span><strong>Properties</strong><p>Fäster lättviktig metadata på Markdown-enheter.</p></article>
          </div>
          <div className="normative-note"><strong>Defaultregel</strong><span>När ett block befinner sig i aktiva intervall körs blocket först. Blockets output blir därefter input till de intervall som blocket ärver.</span></div>
        </section>

        <section className="docs-section spec-section" id="grammar">
          <div className="spec-heading"><span>01</span><div><p>Lexikal yta</p><h2>Fyra markörfamiljer</h2></div></div>
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
          <div className="spec-heading"><span>02</span><div><p>Strukturell modalitet</p><h2>Block bildar ett träd</h2></div></div>
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
          <div className="spec-heading"><span>03</span><div><p>Kontinuerlig modalitet</p><h2>Intervall bildar aktiva funktionsmängder</h2></div></div>
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
          <div className="spec-heading"><span>04</span><div><p>Block × intervall</p><h2>Inheritance är en explicit exekveringsgräns</h2></div></div>
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

        <section className="docs-section spec-section" id="overlap">
          <div className="spec-heading"><span>05</span><div><p>Topologiska relationer</p><h2>Containment är entydigt. Korsning kräver policy.</h2></div></div>
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
          <div className="spec-heading"><span>06</span><div><p>Semantisk metadata</p><h2>Properties följer Markdown-enheter</h2></div></div>
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
        </section>

        <section className="docs-section spec-section" id="modules">
          <div className="spec-heading"><span>07</span><div><p>Återanvändbar kod</p><h2>Moduler laddas exakt en gång</h2></div></div>
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
          <div className="spec-heading"><span>08</span><div><p>Deterministisk körning</p><h2>Från text till exekveringsplan</h2></div></div>
          <ol className="execution-list spec-execution">
            <li><span>1</span><div><strong>Lös direktiv</strong><p>Normalisera includes, bygg modulgraf och kontrollera cykler.</p></div></li>
            <li><span>2</span><div><strong>Segmentera dokumentet</strong><p>Dela vid block-, intervall- och property-gränser.</p></div></li>
            <li><span>3</span><div><strong>Bygg blockträdet</strong><p>Kontrollera strikt strukturell balans.</p></div></li>
            <li><span>4</span><div><strong>Beräkna aktiva intervall</strong><p>Tilldela varje segment en ordnad mängd funktionsinstanser.</p></div></li>
            <li><span>5</span><div><strong>Lös inheritance</strong><p>Injicera eller placera <code>@intervals</code> enligt blockets policy.</p></div></li>
            <li><span>6</span><div><strong>Validera korsningar</strong><p>Stoppa varje relation som saknar uttrycklig och stödd policy.</p></div></li>
            <li><span>7</span><div><strong>Exekvera och rendera</strong><p>Kör planen deterministiskt och ta bort all kontrollsyntax.</p></div></li>
          </ol>
          <div className="conformance-grid">
            <article><CheckCircle2 /><strong>Implementerat nu</strong><p>Direktiv, moduler, block, pipelines, öppna intervall, deklarationsordning, <code>@order</code>, default inheritance, none, only, except, explicit och <code>@cross=error</code>.</p></article>
            <article><CircleDashed /><strong>Nästa konformitetsnivå</strong><p>Property-drivna samlingar och de transformativa korsningspolicyerna split, promote, truncate och preserve.</p></article>
          </div>
        </section>

        <section className="docs-section spec-section" id="reference">
          <div className="spec-heading"><span>09</span><div><p>Aktuellt projekt</p><h2>Inlästa funktioner</h2></div></div>
          <p className="lead">Referensen genereras från de moduler som playground-dokumentet faktiskt inkluderar.</p>
          <div className="function-grid">
            {functions.length ? functions.map((fn) => (
              <article key={`${fn.modulePath}:${fn.name}`} className="function-card">
                <div className="function-card-head"><code>{fn.name}</code><span>{fn.modulePath}</span></div>
                <p>{fn.description}</p>
                <div className="signature">{signature(fn.args)}</div>
              </article>
            )) : <p className="muted-copy">Öppna Playground och kör ett giltigt dokument för att läsa in referensen.</p>}
          </div>
          <div className="security-note"><Box /><p>Moduler körs i en separat Web Worker men ska fortfarande betraktas som betrodd kod. En kapabilitetssandbox krävs innan externa moduler kan distribueras som säkra paket.</p></div>
        </section>
      </main>
    </div>
  );
}
