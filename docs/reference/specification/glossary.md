# Glossary

### Glossary

| Begrepp | Definition |
| --- | --- |
| `SourceDocument` | Immutable, versionerad textkälla med logical identity och base URI. |
| `CST` | Förlustfri konkret syntaxrepresentation från Lezer; bevarar lexem och radslut utan att bestämma domänexekvering. |
| `AST` | Normaliserat blockträd med typed stages, literalnoder och recovery; intervallhändelser förblir separat modellerade. |
| `SourceSpan` | Nollbaserat, halvöppet Unicode-code-point-intervall med 1-baserade line- och 0-baserade column-projektioner. |
| `RecoveryNode` | Lokal representation av malformed eller saknad syntax. Den är alltid non-executable men gör partial editorstruktur möjlig. |
| `Block` | Strikt nästlad funktionsregion vars kompletta pipeline kör före ambient inheritance. |
| `Intervall` | Öppet, identifierbart scope som är aktivt över ett eller flera textsegment. |
| `Property` | Icke-exekverande metadata på en Markdown-AST-enhet. |
| `TextabanaIR` | Host-neutral semantisk representation av source snapshot. |
| `ExecutionPlan` | Körbar, typad och capability-validerad stagegraf för en host. |
| `ExecutionGraph` | Pre-transform DAG med source-, stage-, merge- och rendernoder samt explicita, typade beroenden. |
| `Typed edge` | Riktat värde- eller kontrollberoende med namngivna portar, edge-kind och deterministisk order key. |
| `ExecutionTrace` | Observerad följd av stage-resolutioner i execution-step/lab-v2; functionInvoked skiljer fresh invocation från cachematerialisering och varje post binds till grafen med planNodeRef. |
| `Invalidation preview` | Rådgivande, historikberoende jämförelse mellan en baslinjegraf och en målgraf; inte en cacheträff eller körning. |
| `Cache eligibility / hit / reuse` | Skilda tillstånd för statisk säkerhetsbedömning, faktisk lookup-träff och verkligt återanvänd stageoutput. |
| `Scheduler wave` | Ett deterministiskt ready set av oberoende stages; settlement kan överlappa men trace, cachejournal och value commit följer alltid planordning. |
| `Resource report` | Run-bunden redovisning av requested/effective gränser och faktisk stage-, event-, render-, deadline- och concurrencyanvändning. |
| `TextabanaValue` | Portabelt typed value envelope i pipelines och runtimeprotokoll. |
| `DocumentSnapshot` | Immutable textinnehåll för ett documentId vid en monoton documentRevision och content-bunden documentVersion. |
| `ChangeSet` | Atomisk, versionsguardad mängd sorterade och icke-överlappande textpatchar. |
| `Anchor` | Immutable, versionsbunden target record med selectors; cross-revision continuity är en separat, explicit resolution. |
| `MetadataDelta` | Post-commit-jämförelse mellan två immutable metadatasnapshots, filtrerad för en editor subscription. |
| `SourceMap` | Många-till-många-relation mellan outputselectors och inputanchors. |
| `render` | Primärt resultatvärde från returpipelinen; inte en vanlig channel. |
| `Channel` | Namngiven, typed append-only eventström inom en run. |
| `system.out` | Reserverad channel för editor- och positionsbunden metadata. |
| `ArtifactRef` | Content-addressed referens till stor eller binär payload. |
| `Run` | En versionerad compilation/execution med explicit profil och livscykel. |
| `Adapter` | Versionssatt post-commit-projektion mellan ett immutable TextabanaResult och en extern host, standard eller tjänst. |
| `Candidate` | Immutable modell- eller verktygsförslag på revision 0, utan mänskligt decision state. |
| `Review revision` | Append-only mänsklig handling och ny revision som accepterar, avvisar eller ersätter en kandidat. |
| `Current view` | Härledd lista över nu accepterade annotationer; den raderar aldrig historiska kandidater eller revisioner. |
| `ConformanceReport` | Maskinläsbar, source-result-bunden evidens för ett versionssatt suite-case; separat från canonical Result och CI-status. |
| `Golden fixture` | Incheckad input och expected structural digest som inte beräknas från samma aktuella run. |
| `Declared vs claimable` | Declared support beskriver katalogen; claimable kräver att alla tillämpliga krav passerar. Contract-only är aldrig claimable. |
| `Conformance gate` | Härledd blockeringslista för failed requirements, stagefel och golden-regressioner i det aktuella caset. |

**Specifikationens riktning**

Textabana återanvänder etablerade format där de redan löser problemet: Markdown för läsbar text, JSON Schema för kontrakt, Arrow/Parquet för data, MIME för notebookpresentation, W3C-modeller för annotation/proveniens och LSP/OTel/OpenLineage/MLflow som adaptrar. Det nya är den sammanhängande semantiken mellan dem.

Detta är inriktningen. [Standardmatrisen](./direction.md) visar vad som är implementerat, avgränsat eller planerat och varför kanalernas JSON Schema-validering är en prioriterad avvikelse.
