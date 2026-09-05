# Textabana adapterisering — implementationsplan

| Fält | Värde |
|---|---|
| Plan-ID | `TA-ADAPTER-PLAN` |
| Planversion | `1.0.4` |
| Status | Aktiv |
| Fastställd | 2026-09-05 |
| Baseline | Textabana Language & Interop draft 0.4, playground `lab-v1` |
| Mål | Textabana Language & Interop draft 0.5 med en gemensam adaptergräns |

## Versionspolicy

- **Patch** ändrar förklaringar, acceptansevidens eller sprintstatus utan att ändra mål eller ordning.
- **Minor** ändrar sprintomfattning, acceptanskriterier eller ordning men behåller planens semantiska mål.
- **Major** ändrar adaptermodellens grundläggande invariants eller planens slutmål.

Varje genomförd sprint ska lämna ett separat Git-commit och uppdatera ändringsloggen. En sprint är inte klar förrän dess körbara implementation, dokumentation och automatiska acceptanstest beskriver samma semantik.

## Målbild

En adapter är en explicit, versionssatt projektion av ett redan atomiskt committat `TextabanaResult`. Alla adaptrar läser samma immutable resultat. De kan producera värdspecifika representationer, men de får inte mutera källan, ändra kärnresultatet eller skapa implicit adapter-till-adapter-ordning.

```text
Source → Compile → Run → immutable TextabanaResult
                              ├─ Data projection
                              ├─ Notebook projection
                              └─ Annotation projection
```

## Planövergripande invariants

1. Kärnans `TextabanaResult` är immutable före, under och efter adapterkörning.
2. Adapterversioner är oberoende av språk-, IR- och resultatschemaversioner.
3. Adapterordning i UI eller registreringslista har ingen semantisk betydelse.
4. Adapter-till-adapter-dataflöde kräver en framtida explicit, acyklisk dependency edge.
5. Event-, Anchor-, SourceMap-, artifact- och provenanceidentitet bevaras genom referens eller redovisas uttryckligen som förlust.
6. Samma deterministiska resultat, adaptermanifest och konfiguration ger samma `projectionId`.
7. Ett adapterfel ändrar aldrig en lyckad core run till failed.
8. En adapter får bevara eller skärpa sensitivity, aldrig tyst sänka den.
9. Stora eller binära outputs transporteras med `ArtifactRef`, inte inbäddad base64 i kontrollplanet.
10. `contract-only` eller generisk JSON räcker aldrig för att hävda profilkonformitet.

## Sprintar

### Sprint 1 — Gemensamt adapterkontrakt

**Status:** genomförd 2026-09-05

**Mål:** Bevisa att ett committat resultat kan projiceras deterministiskt och säkert utan att ny domänsemantik byggs in i kärnan.

**Leveranser:**

- `AdapterManifest`, `AdapterProjection` och `AdapterRun` som maskinläsbara kontrakt.
- Ett register med supportnivåerna `playground-subset`, `contract-only` och `unsupported`.
- Capability negotiation före adapterkörning.
- Oberoende post-commit fan-out, explicit fidelity/loss report och adapterdiagnostik.
- En körbar, selektiv `result-summary`-referensadapter.
- Contract-only-deskriptorer för Data, Notebook och Annotation utan simulerad output vid Sprint 1-baslinjen.
- Playgroundinspektion av manifest, projektion, referenser och informationsförlust.
- Runtime-härdning för stabila content IDs, unika invocation/activity IDs och verkligt fresh modulstate.

**Acceptans:**

- Identisk semantik över olika `runId` ger samma `projectionId`.
- Referensadaptern lämnar kärnresultatet byte-ekvivalent före och efter körning.
- Alla event-, anchor-, SourceMap- och activity-referenser kan lösas i källresultatet.
- Saknad capability eller contract-only-adapter ger adapterdiagnostik utan fabricerad output.
- Failed core run skippar adapterkörning.
- Dokumentation och UI skiljer canonical result från adapterprojektion.

**Utanför sprinten:** Arrow/Parquet, riktig notebook-kernel, annotationsexport, sinks och full profilkonformitet.

**Acceptansevidens:**

- Referensadaptern körs efter commit och publiceras utanför canonical `TextabanaResult`.
- Data, Notebook och Annotation registrerades vid Sprint 1-grinden som `contract-only` utan domänoutput.
- Projektionens event-, anchor-, SourceMap- och activity-referenser valideras mot källresultatet.
- Before/after-digest verifierar att adapter fan-out inte muterar källresultatet.
- Resultat- och projektionidentitet är stabil över olika transport-`runId`.
- Unika invocation/activity-ID:n, dokumentbundna row anchors och isolerat fresh-state är regressionstestade.
- 36 automatiska kontrakts-, runtime-, dokumentations-, renderings- och UI-test passerar.

### Sprint 2 — Data & Lineage Lab

**Status:** genomförd 2026-09-05

**Mål:** Projicera typade records och verklig multi-input-lineage från text till tabell utan att förlora kopplingen till källan.

**Leveranser:** stabila `recordId`, dataset/schema-events, JSON-tabell, deterministisk inner join, record-/cell-lineage, many-to-many SourceMaps och ArtifactRef-gräns. Arrow IPC och Parquet aktiveras först när riktiga bytes och digest produceras.

**Acceptans:** record identity överlever infogning, sortering och filtrering; join förenar båda inputankarna; aggregation är `derived`; adapterfel påverkar inte canonical result.

**Acceptansevidens:**

- Fixturen `data-join` läser två vanliga GFM-tabeller och emitterar tre dataset/schema-events, fyra inputrecords och två outputrecords.
- Record-ID:n härleds från dataset och typed natural key. Testerna verifierar att identiteten och dess row-anchor överlever infogade rader, omsortering och filtrering.
- Inner join bevarar vänstertabellens ordning, stoppar tomma eller duplicerade keys före commit och typinfererar heltal utan att göra fysisk row index till identitet.
- Varje joinrecord har en `derived` SourceMap med båda inputankarna och en record-level `DataSelector`.
- Varje outputcell har ett separat lineage-event och en kolumnbunden `DataSelector`; källans positionella anchor är fortsatt row-bred i denna subset.
- Count-aggregation över join-output är en egen `data.aggregates`-event med `derived` mapping till de records som räknades.
- `org.textabana.data-table` producerar en deterministisk, source-bound JSON-projektion med schema, records, record-/cell-lineage och tom `artifactRefs`-lista.
- Arrow IPC, Parquet, DuckDB, artifact store och OpenLineage-export är explicit unsupported; inga profiler hävdas utifrån generisk JSON.
- Adapterinput klonas före exekvering och before/after-digest verifierar att fel eller mutation inte kan ändra canonical Result.
- 45 automatiska kontrakts-, runtime-, data-, dokumentations-, renderings- och UI-test utgör sprintens regressionsgrind.

### Sprint 3 — Notebook Interop Lab

**Status:** genomförd 2026-09-05

**Mål:** Göra Textabana användbart i notebookvärdar utan att cellordning eller kernelstate blir dold språksemantik.

**Leveranser:** stabila cell-ID:n, whole-snapshot-regel, MIME bundles, stale-output-detektion och profilerna `fresh`, `session` och `attached`. Riktig Jupyter Messaging blir ett separat verifierat transportsteg.

**Acceptans:** samma snapshot ger stabil cellprojektion; stateprofil är explicit; celloutput binds till source och run; ingen celladapter får skriva om canonical source.

**Acceptansevidens:**

- Fixturen `notebook-snapshot` behandlar ett helt block som en versionerad snapshot och producerar tre celler med explicita, unika cell-id:n.
- Cellidentitet och cellankare överlever infogade rader och omordning; projektionen behåller den aktuella författade presentationsordningen utan att göra den till kernelstate.
- Identisk snapshot ger samma `snapshotId`, semantiska `resultId` och `projectionId` över olika transport-`runId`.
- Varje cell och output binds via `CellSelector`, Anchor, SourceMap och provenanceaktivitet. Notebookadaptern verifierar alla referenser före publicering.
- Varje celloutput innehåller verkliga representationer för `text/plain`, `text/markdown` och `application/vnd.textabana.result+json` samt matchande source/output digest.
- Revisionsjämförelsen klassificerar en äldre output som stale exakt när dess source digest skiljer sig från den aktuella cellens, utan att presentera den som aktuell output.
- `fresh`, `session` och `attached` är explicita. Endast `fresh` är en körbar strukturell subset; övriga profiler deklarerar `contract-only` execution och `external-unverified` kernelstate.
- Saknade eller duplicerade cell-id:n och ogiltig profil stoppar körningen atomiskt. Malformerad adapterinput ger adapterfel utan att ändra ett committat canonical Result.
- Jupyter Messaging, nbformat-roundtrip, session/attached kernelkörning samt Comms/widgets är explicit unsupported.
- 54 automatiska kontrakts-, runtime-, data-, notebook-, dokumentations-, renderings- och UI-test utgör sprintens regressionsgrind.

### Sprint 4 — Annotation & AI Review Lab

**Status:** genomförd 2026-09-05

**Mål:** Stödja granskbar AI- och mänsklig annotering som revisionskedja.

**Leveranser:** kandidatannotationer med modell-/prompt-/inputdigests, confidence method, accept/reject/supersede samt projektioner mot W3C Web Annotation och ett annoteringsverktygsformat.

**Acceptans:** review skapar en ny revision; modellens ursprungliga event muteras aldrig; exporterade targets kan lösas tillbaka till Textabana Anchor.

**Acceptansevidens:**

- Fixturen `annotation-review` producerar ett whole annotation set, tre AI-kandidater, tre separata review-event och fyra materialiserade revisioner.
- Kandidatpayloaden stannar på revision 0 och innehåller aldrig `decision`, `reviewer` eller `supersededBy`; ett ändrat reviewbeslut förändrar därför inte modellfaktan.
- Varje accept/reject/supersede skapar ett append-only review-event och revision 1. Supersede kräver dessutom en existerande mänsklig ersättare med ömsesidiga länkar och acyklisk kedja.
- Modell-id/version/digest, prompt-id/digest, inputdigest, confidence score och confidence method är obligatoriska och adaptervaliderade. Alla digests är ärligt märkta `fnv1a-lab`.
- Stabil `annotationId` och annotation-anchor överlever infogade rader och omordning, medan den fysiska line-projektionen följer aktuell källa.
- Candidate, review och revision binds till `AnnotationSelector`, Anchor, SourceMap och provenanceaktivitet. Derived review-mapping refererar kandidatankaret och, vid supersede, ersättarens ankare.
- `org.textabana.annotation-review` producerar en deterministisk bundle med W3C Web Annotation `AnnotationPage` och en testad Label Studio task/import-subset. Exporttargets återanvänder exakt källankarets TextPosition-/TextQuote-selectors och `anchorRef`.
- Verklig modellkörning, persistent review store, W3C PROV, full Label Studio API-/projektroundtrip, OpenLineage, MLflow och OpenTelemetry är fortsatt contract-only eller unsupported.
- Adapterfel påverkar inte canonical Result och before/after-digest verifierar immutability.
- 63 automatiska kontrakts-, runtime-, data-, notebook-, annotation-, dokumentations-, renderings- och UI-test utgör sprintens regressionsgrind.

### Sprint 5 — Conformance Lab

**Status:** planerad

**Mål:** Göra profilanspråk verifierbara över hela kedjan source → IR → plan → result → projection.

**Leveranser:** profilval, capabilities, golden fixtures, strukturell diff, negativa fixtures, cancellation och maskinläsbar rapport.

**Acceptans:** varje stödstatus kan härledas till passerade krav; contract-only visas aldrig som implementerat; regressioner blockerar profilanspråk.

## Beroenden och ordning

| Sprint | Kräver | Låser upp |
|---|---|---|
| 1 · Adapterkontrakt | Befintligt atomiskt resultat | Alla domänadaptrar |
| 2 · Data & Lineage | Sprint 1 | Datapipelines, analytics och ML-lineage |
| 3 · Notebook | Sprint 1 | Jupyter/Python/R/Julia-värdar |
| 4 · Annotation & Review | Sprint 1, Anchor/SourceMap | Human-in-the-loop och AI-granskning |
| 5 · Conformance | Sprint 1–4 | Verifierbara profilanspråk |

## Ändringslogg

### 1.0.4 — 2026-09-05

- Sprint 4 markerad som genomförd med körbart Annotation & AI Review Lab och acceptansevidens.
- `annotation/1` flyttad från contract-only till en explicit append-only playground-subset med resolverbara W3C- och Label Studio-projektioner.
- `ml-lineage/1` separerades som fortsatt contract-only för att undvika påståenden om modellkörning eller observability som inte finns.
- Nästa aktiva leverans är Sprint 5 — Conformance Lab.

### 1.0.3 — 2026-09-05

- Sprint 3 markerad som genomförd med körbart Notebook Interop Lab och acceptansevidens.
- `notebook/1` flyttad från contract-only till en explicit host-neutral JSON-baserad playground-subset.
- Nästa aktiva leverans är Sprint 4 — Annotation & AI Review Lab.

### 1.0.2 — 2026-09-05

- Sprint 2 markerad som genomförd med körbart Data & Lineage Lab och acceptansevidens.
- `data/1` flyttad från contract-only till en explicit JSON-baserad playground-subset.
- Nästa aktiva leverans är Sprint 3 — Notebook Interop Lab.

### 1.0.1 — 2026-09-05

- Sprint 1 markerad som genomförd med acceptansevidens.
- Nästa aktiva leverans är Sprint 2 — Data & Lineage Lab.

### 1.0.0 — 2026-09-05

- Första fastställda planen.
- Fem sprintar definierade med gemensamma invariants, leveranser och acceptansgrindar.
- Sprint 1 avgränsad till adapterkontrakt och referensadapter; domänadaptrar förblir contract-only.
