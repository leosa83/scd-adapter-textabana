# Textabana Editor Kernel — implementationsplan

| Fält | Värde |
|---|---|
| Plan-ID | `TA-EDITOR-KERNEL-PLAN` |
| Planversion | `1.1.0` |
| Status | Pågår · Våg 1–2 genomförda · Våg 3 aktiv |
| Fastställd | 2026-09-05 |
| Baseline | Interop draft 0.7 efter Våg 2 · Language 0.4 · parser/CST/AST lab-v1 · typed IR lab-v2 · genomförd `TA-ADAPTER-PLAN` 1.0.5 |
| Mål | En inbäddningsbar, positionsmedveten kärna för editorer, notebooks och pipelinevärdar |

## Versionspolicy

- **Patch** uppdaterar status, acceptansevidens eller förklaringar utan att ändra vågornas mål.
- **Minor** ändrar omfattning, acceptanskriterier eller ordning men behåller planens målbild.
- **Major** ändrar dokument-, exekverings- eller identitetsmodellens grundläggande invariants.

Planen är separat från den avslutade adapterplanen. Varje genomförd våg ska lämna ett eget Git-commit och en uppdaterad planversion. En våg är klar först när protokoll, runtime, UI, dokumentation och automatiska acceptanstest beskriver samma semantik.

## Målbild

Textabana Editor Kernel äger ett versionssatt dokument, tar emot explicita ändringsmängder och publicerar atomiska resultat samt prenumerationsfiltrerade metadata-deltan. Värden äger editorn och transporten; kärnan äger språksemantik, snapshot-gränser, identitet, körning och positionskoppling.

```text
Editor / Notebook / Pipeline host
          │ open · change · analyze · subscribe · run · cancel
          ▼
Textabana Editor Kernel
          │ immutable document snapshot
          ├─ canonical lab Result
          ├─ metadata delta
          └─ anchor continuity
```

## Planövergripande invariants

1. Varje körning binds till exakt `documentId`, revision och source version som fångades när körningen accepterades.
2. En change set tillämpas atomiskt mot deklarerad `baseRevision`; en stale eller överlappande change set ändrar aldrig dokumentet.
3. Textpositioner i kärnprotokollet räknas i Unicode code points och får inte dela ett tecken.
4. Endast en lyckad core run får bli ny baslinje för metadata-deltan och anchor continuity.
5. Failed eller cancelled run publicerar varken durable metadata-baslinje eller partiellt delta.
6. Prenumeration påverkar leveransen av deltan, aldrig vilka core-kanaler som existerar i resultatet.
7. Stabil logisk identitet har företräde framför fysisk radposition; line och column är projektioner för aktuell revision.
8. Re-anchoring måste redovisa metod och utfall. `ambiguous` eller `orphaned` får aldrig presenteras som en säker match.
9. En host får inte anta att accepterade textpatchar innebär inkrementell parsning eller selektiv exekvering.
10. Playgroundens hash-, parser- och conformancebegränsningar ska fortsätta vara explicit märkta som lab-subsets.

## Vågor

### Våg 1 — Embedded document protocol & metadata delta

**Status:** genomförd 2026-09-05

**Mål:** Bevisa editorloopen `open → change → subscribe → run → cancel` och ge värden ett litet, explicit delta efter varje lyckad revision.

**Leveranser:**

- In-memory documentsession med `documentId`, monoton revision och source version.
- Protokollkommandona `open`, `change`, `subscribe`, `run` och befintlig kooperativ `cancel`.
- Atomiska, icke-överlappande change sets med revision guard och Unicode-code-point-offsets.
- Immutable run snapshot så att senare editorändringar inte kan ändra en redan accepterad körning.
- Prenumeration på exakta kanalnamn eller `*`, med metadata-deltan för `added`, `removed`, `changed`, `moved` och `unchanged`.
- Anchor continuity för `retained`, `moved`, `relinked`, `ambiguous`, `orphaned` och `added`, inklusive matchningsmetod.
- Ett Editor Kernel Lab som visar session, change set, prenumeration, delta och ankarkontinuitet från den faktiska workern.
- Uppdaterad specifikation, README och automatiska kontrakts-/regressionstest.

**Acceptans:**

- `change` med korrekt `baseRevision` skapar exakt en ny revision; stale, osorterad, överlappande eller ogiltig range avvisas utan mutation.
- En infogad rad före oförändrade metadata flyttar deras line-projektion men behåller logisk identitet och klassificeras som `moved`.
- En verkligt ny eller borttagen post klassificeras som `added` respektive `removed`; payloadändring med stabil nyckel klassificeras som `changed`.
- Ett line-anchor utan stabilt ID kan relinkas med unik quote + origin; flera kandidater blir `ambiguous` och ingen kandidat blir `orphaned`.
- Channel subscription filtrerar deltaleveransen men core-resultatet förblir komplett.
- Failed och cancelled run lämnar föregående framgångsrika delta-baslinje orörd.
- Äldre run-meddelanden utan `type` fortsätter fungera som tidigare.

**Utanför vågen:** formell parser, inkrementell AST, selektiv omkörning, diskpersistens, flerdokumentstransaktioner, CodeMirror-/Monaco-paket och extern side-effect-rollback.

**Acceptansevidens:**

- Workern implementerar `textabana.editor-kernel/lab-v1` med `open`, `change`, `subscribe`, `run` och `cancel`, inklusive revisions- och versionskontroll.
- Change sets tillämpas atomiskt med Unicode-code-point-offsets; stale, osorterade, överlappande och ogiltiga patchar täcks av regressionstest.
- Varje run använder en fångad dokumentrevision. Senare ändringar, failed runs och cancelled runs kan inte flytta den senast publicerade baslinjen.
- `textabana.metadata-delta/lab-v1` partitionerar leveransen i `added`, `removed`, `changed`, `moved` och `unchanged` efter stabil logisk identitet.
- Anchor continuity redovisar `retained`, `moved`, `relinked`, `ambiguous`, `orphaned` och `added` samt metod och confidence.
- Editor Kernel Lab visar det verkliga workerprotokollet, revisionerna, delta, ankarkontinuitet och de uttryckliga begränsningarna.
- Interop draft 0.6, README, fixturekatalog och conformance-baseline beskriver samma implementerade subset.
- Releasegrind: 91 automatiska test passerar, inklusive 15 dedikerade Editor Kernel-test och ett host-controller-kontrakt för korrelerade acknowledgements. ESLint och produktionsbygget passerar. Chunkstorlek rapporteras som en icke-blockerande optimeringsvarning.
- Slutrevisionen verifierar dessutom att typed `documentId` når IR, Result och Anchor, att deklarerad eller explicit domänidentitet har företräde framför row-projektioner, att target-modality ingår i semantisk förändring samt att främmande coordinate units avvisas före mutation.
- Playground-hosten väntar på korrelerade `open`/`change`-acknowledgements och använder den revision/version som kärnan faktiskt accepterade; den avancerar aldrig dokument-head optimistiskt.

### Våg 2 — Formell parser, typed IR & felåterhämtning

**Status:** genomförd 2026-09-05

**Mål:** Ersätta radregex som grammatisk auktoritet med en versionssatt parser och typed IR som kan behålla partiell struktur under redigering.

**Leveranser:** versionssatt Lezer-grammatik, en auktoritativ `parseDocument`-gräns, lossless CST, normaliserad AST, typed IR lab-v2, Unicode-code-point-spans, escaping/fenced literal-läge, lokal recovery, stabila diagnostiknycklar, read-only `analyze` och parser-fixtures. Den genererade parsern och runtimekoden buntas till den befintliga klassiska `/runtime-worker.js`.

**Acceptans:** samma giltiga källa behåller existerande render-, scope-, inheritance-, channel- och adaptersemantik; ofullständig editsyntax ger partial CST/AST/IR med icke-körbar lokal recovery; alla publika syntaxobjekt har verifierbara spans; parsefel stoppar före modulinitiering och ger noll plan, stage-anrop eller durable commit.

**Genomförandebeslut:** Lezer valdes framför Tree-sitter eftersom parsern kan genereras offline, köras som JavaScript i befintlig Worker och senare återanvändas inkrementellt utan separat Wasm-runtime, grammar-Wasm eller hoststyrd asset-resolution. Lezer står för lossless radklassificering; Textabanas egen lowering äger stage-/value-syntax, blockträd och den separata intervallgrafen bakom samma `parseDocument`-operation.

**Acceptansevidens:**

- Hela snapshotet sänks `source → textabana.cst/lab-v1 → textabana.ast/lab-v1 → textabana.ir/lab-v2` innan include-resolution eller modulinitiering.
- Renderer, config, dokumentincludes, Language Lab och Editor Kernels `analyze` konsumerar samma parserprodukt. De gamla separata document-scanners för render och inspection är borttagna ur authored worker source.
- Typed IR har discriminated nodes/stages, portabel JSON utan `undefined`, funktioner eller icke-finita tal samt halvöppna Unicode-code-point-spans med line/column-projektioner.
- Block är ett träd; intervall är open/close-events med scope-segment. Pipeline-recovery gör ägande block/intervall och stages icke-körbara, och ancestor-close återhämtas med explicit syntetisk zero-width-close.
- Fenced code och escapade markörer förblir literal. Authored properties sänks exakt en gång, medan propertylik funktionsoutput aldrig reparsas eller raderas.
- Stabil diagnostik skiljer snapshotbundet `diagnosticId` från logiskt `diagnosticKey`; upprepade fel får unika nycklar som består vid orelaterad radinfogning.
- `analyze` är revisionsbundet och read-only och returnerar `textabana.editor-analysis/lab-v1` med partial inspection utan modul- eller stage-effekter.
- Releasegrind: 117 automatiska test, ESLint och Sites produktionsbygge passerar. Golden-baselinen är omfryst först efter att parser-, legacysemantik-, kanal-, adapter-, data-, notebook-, annotation- och Editor Kernel-regressionerna passerat.
- Avgränsning: varje `analyze`/`run` gör fortfarande full dokumentparse; lyckad run är fresh och ExecutionPlan projiceras post-execution. Inkrementell trädåteranvändning och pre-execution typed-edge-plan hör till Våg 3.

### Våg 3 — Inkrementell planering och exekveringsgraf

**Status:** aktiv · sprint 3.1 pågår

**Mål:** Göra ändringsmängder beräkningsmässigt värdefulla genom att ogiltigförklara och köra om endast beroende delgraf.

**Leveranser:** typed edges, cache keys, invalidation, pure/effect-gräns, deterministisk merge, streaming/backpressure, timeout och resursbudget.

**Acceptans:** oförändrade pure stages återanvänds med bevisad input-/module-digest; effectful stages cachas aldrig implicit; cancellation och atomisk commit gäller även parallella grenar.

#### Sprint 3.1 — Pre-execution graph och konservativ invalidation

**Status:** aktiv

**Leverans:** ersätt den post-execution-projicerade planen med `textabana.execution-plan/lab-v2`, bygg en deterministisk DAG efter modulinitiering men före första stage-anropet och ge varje source-, stage-, merge- och rendernod stabil typ, order key och explicit beroende. Funktionskontraktet skiljer `behavior` från `state`, `determinism` och deklarerade observable effects. Varje stage får ett cache-key-recept med stage-lokala source- och IR-beroendedigests samt module-, input-, args-, config-, profile- och environment-digest, men cacheläsning, cacheskrivning och reuse förblir avstängda tills receptet kan verifieras över två revisioner.

**Acceptans:** planen existerar före första transform, typed edges formar en acyklisk graf, faktisk trace binds tillbaka till planerade stage-noder och avvikelse stoppar körningen. Legacyfunktioner utan fullständigt kontrakt klassas konservativt som `unknown` och aldrig cachebara. En första run rapporterar `cold/no-baseline`; med en lyckad editorbaslinje skiljer previewn `directlyAffected`, `transitivelyAffected`, `unchanged`, `added` och `removed`. Alla stages körs ändå fresh, och `cacheReads`, `cacheWrites` samt `reused` är noll. Render, kanaler, atomisk commit och stageordning är oförändrade.

**Avgränsning:** sprinten återanvänder ännu varken parserträd eller stageoutput, kör inget parallellt och inför inte streaming, backpressure, timeout eller resursbudget. Dessa förmågor förblir explicit unsupported tills senare sprintar i Våg 3.

### Våg 4 — Host-SDK:er och säkra modulpaket

**Status:** planerad

**Mål:** Göra kärnan lätt att bädda in och moduler möjliga att distribuera utan dold behörighet.

**Leveranser:** framework-neutral TypeScript-SDK, CodeMirror- och Monaco-bindningar, Python/Jupyter-klient, modulmanifest, namespaces, lockfile, kryptografiska digests och capability grants.

**Acceptans:** samma protokoll-fixtures passerar i Worker-, editor- och Python-host; moduler deklarerar pure/deterministic/effectful samt resurs- och kanalkapabiliteter före körning.

### Våg 5 — Produktionskonformitet och ekosystem

**Status:** planerad

**Mål:** Göra kompatibilitetsanspråk portabla mellan oberoende implementationer.

**Leveranser:** CLI, canonical JSON + SHA-256, profil-fixtures, property/fuzz testing, cross-runtime-suite, signerade rapporter och adapter-/modulpaketregister.

**Acceptans:** ett profilanspråk kan reproduceras utanför Playground; lab-hash eller generisk JSON kan aldrig uppgraderas till canonical claim utan passerad extern suite.

## Beroenden och ordning

| Våg | Kräver | Låser upp |
|---|---|---|
| 1 · Document protocol | Befintligt atomiskt Result, channels och anchors | Kontinuerlig editorloop |
| 2 · Parser & typed IR | Våg 1:s revisionsmodell | Lokal recovery och strukturella deltan |
| 3 · Execution graph | Våg 2:s stabila IR-spans och noder | Selektiv omkörning och cache |
| 4 · Host-SDK/paket | Våg 1-protokoll, Våg 2–3 kärngränser | Verkliga editor-, notebook- och pipelineintegrationer |
| 5 · Produktionskonformitet | Våg 1–4 | Oberoende implementationer och verifierbara claims |

## Ändringslogg

### 1.1.0 — 2026-09-05

- Våg 3 aktiverad med en första planning-only-sprint för pre-execution DAG, typed edges, cache-key-recept och konservativ invalidation.
- Pure/effect-gränsen separeras från transformationsbeteende; odokumenterade legacyfunktioner blir aldrig implicit cachebara.
- Faktisk reuse, parallell exekvering och streaming hålls avsiktligt avstängda tills graf- och digestinvarianterna är verifierade.

### 1.0.3 — 2026-09-05

- Våg 2 markerad som genomförd med Lezer, lossless CST, normaliserad AST, typed IR lab-v2 och en parse-before-module compile gate.
- Lokal icke-körbar recovery, exakta Unicode-spans, literal fences/escapes, typed controls och read-only editoranalys verifierade.
- Baseline flyttad till Interop draft 0.7; inkrementell parseråteranvändning och pre-execution planering förblir avgränsade till Våg 3.

### 1.0.2 — 2026-09-05

- Våg 2 aktiverad med en parse-before-run-grind som förhindrar partiell domänexekvering vid sena syntaxfel.
- En gemensam CST → AST → typed IR-kedja fastställd som enda grammatisk auktoritet för både rendering och metadata.
- Recovery nodes avgränsade till editor- och diagnostikprojektion; de är aldrig exekverbara.

### 1.0.1 — 2026-09-05

- Våg 1 markerad som genomförd efter samstämmig leverans i protokoll, runtime, labb, dokumentation och tester.
- Acceptansevidens och faktisk releasegrind tillagda.
- Baseline flyttad till Interop draft 0.6; Waves 2–5 förblir planerade.

### 1.0.0 — 2026-09-05

- Ny femvågsplan fastställd ovanpå den avslutade adapterplanen.
- Våg 1 aktiverad med dokumentprotokoll, metadata-delta och anchor continuity som första leverans.
- Formell parser avgränsad till Våg 2; inkrementell parseråteranvändning och selektiv exekvering avgränsade till Våg 3.
