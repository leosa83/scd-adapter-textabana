# Profiles and versions

Conformance Lab utvärderar ett valt, versionssatt case efter core run och adapter fan-out. Rapporten skiljer deklarerad support från observerat testutfall: endast en tillämplig playground-subset vars samtliga krav passerar blir `claimable` för den aktuella körningen.

### Konformitetsprofiler

| Profil | Måste täcka | Web runtime idag |
| --- | --- | --- |
| `language-core/0.4` | Formell parser, lossless CST, typed IR, recovery, block, intervall, property, pipeline, inheritance och cross=error. | Playground subset |
| `runtime-json/1` | IR, Plan, Run, Result, JSON channels och atomisk commit. | Playground subset |
| `editor/1` | Anchor, SourceMap, system.out och LSP-projektion. | Playground subset |
| `editor-kernel/1` | Document lifecycle, revision fencing, channel subscriptions, metadata-delta och anchor continuity. | Interaktiv subset · separat evidens |
| `adapter-contract/1` | Manifest, negotiation, immutable fan-out, fidelity, referenser och failure isolation. | Playground subset |
| `notebook/1` | Whole snapshot, stabila cell-id:n, MIME bundle, stateprofiler, stale detection och host-neutral JSON-projektion; full profil omfattar även verifierad Jupytertransport. | Playground subset |
| `data/1` | Dataset/schema-events, record identity, JSON table projection och multi-input lineage; full profil omfattar även dataplan och artifacts. | Playground subset |
| `annotation/1` | Immutable kandidater, review-revisioner, supersede-kedjor, resolverbara targets samt W3C- och Label Studio-projektion. | Playground subset |
| `ml-lineage/1` | AI invocation, PROV, OpenLineage, MLflow och OTel correlation. | Contract-only · ej claimable |

### Maskinläsbar ConformanceReport

| Fält | Betydelse | Nuvarande lab-semantik |
| --- | --- | --- |
| `schema / reportId` | Versionssatt rapporttyp och deterministisk rapportidentitet. | `textabana.conformance-report/lab-v1` |
| `sourceResultRef` | Binder evidensen till exakt semantiskt Result. | Transport-run-id ingår inte i strukturdigesten. |
| `suite / case` | Suiteversion, fixture, förväntat och faktiskt terminalutfall. | Negativa cases kräver både exakt status och diagnostikkod. |
| `profiles` | Deklarerad support, tillämplighet, kravutfall, härledd support och claimable. | Ej emitterade domänprofiler blir not-run; contract-only blir aldrig claimable. |
| `stages` | Source → IR → Plan → Result → Projection med evidensreferenser. | Ett negativt case gör inget positivt plan- eller projektionsanspråk. |
| `structuralSnapshot` | Normaliserad labbsnapshot och incheckad golden digest. | FNV-1a-lab är icke-kryptografisk och canonical=false. |
| `gate` | Samlad blockeringslista härledd ur misslyckade krav och stages. | Regression eller golden-diff tar bort runnens subset-anspråk. |

### Conformance report · förkortat exempel

Körbar playground-subset · json

```json
{
  "schema": "textabana.conformance-report/lab-v1",
  "suite": { "suiteId": "textabana.playground/interop-0.7", "version": "1.4.0-lab.1" },
  "case": { "caseId": "golden-core-chain", "expectedOutcome": "succeeded", "actualOutcome": "succeeded" },
  "profiles": [{
    "profile": "runtime-json/1", "declaredSupport": "playground-subset",
    "status": "passed", "derivedSupport": "playground-subset", "claimable": true,
    "requirements": [{ "requirementId": "RUNTIME-ATOMIC-TERMINAL", "status": "passed", "evidenceRefs": ["lab:…"] }]
  }],
  "normalization": { "policy": "textabana.structural-snapshot/lab-v1", "ignoredPaths": ["/transport/runId", "/executionTrace/*/duration"] },
  "golden": { "status": "passed", "expectedStructuralDigest": "fnv1a-lab:…", "actualStructuralDigest": "fnv1a-lab:…" },
  "gate": { "status": "passed", "blockingRequirementIds": [] },
  "extensions": { "textabana.playground": { "canonical": false, "fullConformance": false } }
}
```

**Våg 5 · extern värdsuite**

CLI:n kör åtta gemensamma protokollfall genom Worker, TypeScript, CodeMirror, Monaco och Python. Rapporten visar 40 utfall och binder suite och kernel till SHA-256. Samma JavaScript-kärna används i alla värdar.

[Hämta verifieringsrapporten (JSON)](../../../public/conformance/host-report.json)

**Verifierat i aktuella labs**

Lossless CST, typed IR, inkrementell Lezer-/compilerreuse, typad DAG, verifierad cache, bounded concurrency, budgetar, atomiskt Result, Anchors/SourceMaps, credit-bunden metadata-streaming, host-cachecheckpoints, adapterisolering, TypeScript-/Python-hostklienter, CodeMirror-/Monaco-bindningar samt SHA-256-låsta modulpaket med explicita capability grants.

**Återstår för full konformitet**

Fulla produktionsprofiler för IR/Plan/Result, full JSON Schema, transparent distribuerad cache, cached event replay, multicore stage-exekvering, effectful branch-concurrency, kontinuerlig stage-streaming, persistent dokumenthistorik, strukturell/fuzzy re-anchor, LSP-adapter, preemption, hårda CPU-/minneskvoter, extern side-effect rollback, beständiga artifacts, fulla polyglotta runtimes, Jupyter Messaging och nbformat-roundtrip samt externa observability-profiler.

### Extern verifiering · sprint 5.1

Körbar värdsuite · bash

```bash
npm run conformance:external
node cli/textabana.mjs conformance > report.json
node cli/textabana.mjs digest report.json
node cli/textabana.mjs registry-check PACKAGE_REGISTRY.json
```

CLI:n kan även signera rapporter med en egen Ed25519-nyckel och verifiera dem mot en separat betrodd publik nyckel. De nedladdningsbara rapporterna är osignerade. Befintliga labb-ID:n behålls; sprint 5.2 lägger till separata källbundna SHA-256-identiteter för IR, Plan och committat Result.

### Semantiska identiteter · sprint 5.2

Körbar artefaktprofil · bash

```bash
node cli/textabana.mjs identify examples/document.md > identity.json
node cli/textabana.mjs verify-identity identity.json
node cli/textabana.mjs conformance-semantic > semantic-report.json
```

Aktivera SHA-256-identiteter i Playground och öppna Conformance → Identiteter för att se artefakterna. Den externa profilen verifierar 28 utfall mot fasta identiteter, inklusive inkrementell parsning och verklig cacheåteranvändning. [Hämta den semantiska profilrapporten (JSON)](../../../public/conformance/semantic-report.json). Integritetsverifiering bevisar paketets interna konsistens; fullständiga produktionsprofiler, bredare runtimejämförelse, release-signering och registertjänst återstår.

### Exekverbart artefaktkontrakt · sprint 5.3

80 kontraktfall · bash

```bash
node cli/textabana.mjs verify-identity identity.json
node cli/textabana.mjs conformance-contract > contract-report.json
```

Verifieraren kontrollerar nu JSON-struktur, kontrollsummor, identitetskedja, tillgängliga källbytes samt interna referenser mellan IR, plan, events, ankare och source maps. Klicka på Verifiera paket i identitetsvyn, eller ladda ner paketet för samma kontroll i CLI. [JSON Schema](../../../public/contracts/semantic-bundle-v1.schema.json) och [kontraktrapporten](../../../public/conformance/contract-report.json) kan hämtas separat. De 80 frysta fallen omfattar 14 giltiga paket och 66 förväntade avvisningar. En omhashad ändring av render kan fortfarande vara ett giltigt paket: verifieraren kör inte om modulerna och intygar inte exekveringens riktighet.

### Oberoende textprofil · sprint 5.4

70 jämförelsefall · bash

```bash
python3 reference/text_core.py run examples/text-core.md
node cli/textabana.mjs conformance-text-core > text-core-report.json
```

En fristående Python-parser och evaluator kör nu samma avgränsade textprofil som JavaScript-kärnan. Python-versionen behöver varken Node eller projektets JavaScript-kod. De 70 fasta testfallen jämför exakt renderad text, felutfall och commit-status för bland annat nästlade block, pipelines, Unicode och resursgränser. [Hämta rapporten](../../../public/conformance/text-core-report.json). Anspråket gäller endast textabana.text-core/v1; full språksemantik, moduler, kanaler, cache och identiska IR/Plan/Result-artefakter ingår inte.

### Oberoende intervallprofil · sprint 5.5

80 jämförelsefall · bash

```bash
python3 reference/scoped_text.py run examples/scoped-text.md
node cli/textabana.mjs conformance-scoped-text > scoped-text-report.json
```

Profilen textabana.scoped-text/v1 utökar jämförelsen till öppna intervall, namngivna avslut, numerisk ordning och block som ärver eller stänger av yttre intervall. 80 fasta fall jämför både render och hela ordningen på committade funktionsanrop. Gränsen för antalet anrop kontrolleras före exekvering; felaktiga scope-/blockgränser lämnar inget committat resultat. [Hämta intervallrapporten](../../../public/conformance/scoped-text-report.json). Godtyckliga moduler, alternativa korsningspolicyer, cache och full produktionskonformitet återstår.

### Oberoende kanalprofil · sprint 5.6

80 jämförelsefall · bash

```bash
python3 reference/channel_core.py run examples/channel-core.md
node cli/textabana.mjs conformance-channel-core > channel-core-report.json
```

Profilen textabana.channel-core/v1 jämför även exakta payloads, global händelseordning och sparade kanalresultat. Tillfälliga händelser behåller sina platsnummer men ingår inte i durable snapshots. 80 fasta fall verifierar bland annat payloadkopiering, obligatoriska tomma kanaler, blockarv och återställning av hela resultatet vid kanal- eller budgetfel. [Hämta kanalrapporten](../../../public/conformance/channel-core-report.json). Källpositioner och full proveniensekvivalens ingår inte i jämförelsen mellan runtimes.

### Oberoende positionsprofil · sprint 5.7

70 jämförelsefall · bash

```bash
python3 reference/source_map_core.py run examples/source-map-core.md
node cli/textabana.mjs conformance-source-map-core > source-map-core-report.json
```

Profilen textabana.source-map-core/v1 jämför var varje händelse hör hemma i den författade texten: deklarationsrader, källintervall, Unicode-positioner, citat och länkar till ankare och funktionsanrop. 70 fasta fall täcker bland annat tomma block, intervall, återanvända radankare och emoji vid citatgränser. Olika rad-id:n med samma interna ankarnyckel avvisas atomiskt. [Hämta positionsrapporten](../../../public/conformance/source-map-core-report.json). Full proveniensgraf, editorhistorik och semantisk artefaktekvivalens återstår.

### Modulkontrakt · sprint 5.8

54 verifieringsfall · bash

```bash
node cli/textabana.mjs conformance-module-gate > module-gate-report.json
```

Modulgrinden verifierar digest, låsning, grants och entydiga funktionsdeklarationer. Rapportens räknare visar om modulens startkod hann köras: felaktiga deklarationer stoppas före laddning, medan faktiska exportkontrakt kontrolleras efter laddning men före transform. [Hämta modulrapporten](../../../public/conformance/module-gate-report.json). Detta är en labbgrind runt samma JavaScript-kärna, inte oberoende modulexekvering eller en JavaScript-sandbox.

### Oberoende paketkontroll · sprint 5.9

72 jämförelsefall · bash

```bash
node cli/textabana.mjs conformance-module-admission > module-admission-report.json
```

Python och JavaScript jämför nu 72 beslut om manifest, låsning, digests och grants. Python kör ingen modulkod. Godkänd förhandskontroll redovisas separat från senare export- och körningsfel; ett ogiltigt senare paket ska stoppa all startkod. [Hämta paketjämförelsen](../../../public/conformance/module-admission-report.json). Oberoendet gäller paketkontrollen och omfattar inte modulexekvering eller sandbox-säkerhet.

<a id="CONF-001"></a>

> **CONF-001** En implementation MÅSTE publicera en machine-readable capability response med exakta profilversioner, limits, value kinds, runtimes och extensions.

<a id="CONF-002"></a>

> **CONF-002** Ett profilanspråk MÅSTE bindas till en versionssatt suite och verifiera source → IR → plan → result → projection. Profiler utan relevant input MÅSTE vara `not-run`, inte passerade.

<a id="CONF-003"></a>

> **CONF-003** En adapter får inte förändra Language Core-semantik för att passa hostens exekveringsmodell.

<a id="CONF-004"></a>

> **CONF-004** Deklarerad support och verifieringsutfall MÅSTE vara separata. Ett saknat eller misslyckat obligatoriskt krav blockerar `claimable` även när capability-katalogen säger playground-subset.

<a id="CONF-005"></a>

> **CONF-005** `contract-only` och `unsupported` får aldrig härledas till ett lyckat implementeringsanspråk. Ett passerat no-fabrication-krav verifierar endast kontraktsgränsen.

<a id="CONF-006"></a>

> **CONF-006** En structural snapshot MÅSTE publicera normaliseringspolicy, ignorerade transportfält, digestalgoritm, actual digest och versionssatt expected digest när en golden baseline finns.

<a id="CONF-007"></a>

> **CONF-007** Negativa fixtures MÅSTE köras isolerat och kräva förväntad terminalstatus, exakt diagnostikkod och atomiskt tom durable commit. Ett negativt pass får aldrig skriva om core-resultatet till succeeded.

<a id="CONF-008"></a>

> **CONF-008** Cancellation MÅSTE ha eget terminaltillstånd. Den aktuella subseten implementerar kooperativ cancellation och kooperativ deadline vid runtimegränser samt rapporterade stage-, event- och rendergränser. Credit-styrd metadata-streaming efter commit stöds. Den hävdar inte synkron preemption, multicore-exekvering, kontinuerlig stage-streaming, generell sink-backpressure eller kökvot, hård CPU-/minnessandbox eller rollback av externa sidoeffekter.
