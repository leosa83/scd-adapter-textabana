# Textabana adapterisering — implementationsplan

| Fält | Värde |
|---|---|
| Plan-ID | `TA-ADAPTER-PLAN` |
| Planversion | `1.0.1` |
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
- Contract-only-deskriptorer för Data, Notebook och Annotation utan simulerad output.
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
- Data, Notebook och Annotation registreras som `contract-only` utan domänoutput.
- Projektionens event-, anchor-, SourceMap- och activity-referenser valideras mot källresultatet.
- Before/after-digest verifierar att adapter fan-out inte muterar källresultatet.
- Resultat- och projektionidentitet är stabil över olika transport-`runId`.
- Unika invocation/activity-ID:n, dokumentbundna row anchors och isolerat fresh-state är regressionstestade.
- 36 automatiska kontrakts-, runtime-, dokumentations-, renderings- och UI-test passerar.

### Sprint 2 — Data & Lineage Lab

**Status:** planerad

**Mål:** Projicera typade records och verklig multi-input-lineage från text till tabell utan att förlora kopplingen till källan.

**Leveranser:** stabila `recordId`, dataset/schema-events, JSON-tabell, deterministisk inner join, record-/cell-lineage, many-to-many SourceMaps och ArtifactRef-gräns. Arrow IPC och Parquet aktiveras först när riktiga bytes och digest produceras.

**Acceptans:** record identity överlever infogning, sortering och filtrering; join förenar båda inputankarna; aggregation är `derived`; adapterfel påverkar inte canonical result.

### Sprint 3 — Notebook Interop Lab

**Status:** planerad

**Mål:** Göra Textabana användbart i notebookvärdar utan att cellordning eller kernelstate blir dold språksemantik.

**Leveranser:** stabila cell-ID:n, whole-snapshot-regel, MIME bundles, stale-output-detektion och profilerna `fresh`, `session` och `attached`. Riktig Jupyter Messaging blir ett separat verifierat transportsteg.

**Acceptans:** samma snapshot ger stabil cellprojektion; stateprofil är explicit; celloutput binds till source och run; ingen celladapter får skriva om canonical source.

### Sprint 4 — Annotation & AI Review Lab

**Status:** planerad

**Mål:** Stödja granskbar AI- och mänsklig annotering som revisionskedja.

**Leveranser:** kandidatannotationer med modell-/prompt-/inputdigests, confidence method, accept/reject/supersede samt projektioner mot W3C Web Annotation och ett annoteringsverktygsformat.

**Acceptans:** review skapar en ny revision; modellens ursprungliga event muteras aldrig; exporterade targets kan lösas tillbaka till Textabana Anchor.

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

### 1.0.1 — 2026-09-05

- Sprint 1 markerad som genomförd med acceptansevidens.
- Nästa aktiva leverans är Sprint 2 — Data & Lineage Lab.

### 1.0.0 — 2026-09-05

- Första fastställda planen.
- Fem sprintar definierade med gemensamma invariants, leveranser och acceptansgrindar.
- Sprint 1 avgränsad till adapterkontrakt och referensadapter; domänadaptrar förblir contract-only.
