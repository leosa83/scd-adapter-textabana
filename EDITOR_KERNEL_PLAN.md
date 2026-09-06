# Textabana Editor Kernel — implementationsplan

| Fält | Värde |
|---|---|
| Plan-ID | `TA-EDITOR-KERNEL-PLAN` |
| Planversion | `1.6.0` |
| Status | Våg 5 aktiv · sprint 5.1 genomförd |
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

**Status:** genomförd · sprint 3.1–3.4 levererade som dokumenterade labbdelmängder

**Mål:** Göra ändringsmängder beräkningsmässigt värdefulla genom att ogiltigförklara och köra om endast beroende delgraf.

**Leveranser:** typed edges, cache keys, invalidation, pure/effect-gräns, deterministisk merge, streaming/backpressure, timeout och resursbudget.

**Acceptans:** oförändrade pure stages återanvänds med bevisad input-/module-digest; effectful stages cachas aldrig implicit; cancellation och atomisk commit gäller även parallella grenar.

#### Sprint 3.1 — Pre-execution graph och konservativ invalidation

**Status:** genomförd 2026-09-05

**Leverans:** ersätt den post-execution-projicerade planen med `textabana.execution-plan/lab-v2`, bygg en deterministisk DAG efter modulinitiering men före första stage-anropet och ge varje source-, stage-, merge- och rendernod stabil typ, order key och explicit beroende. Funktionskontraktet skiljer `behavior` från `state`, `determinism` och deklarerade observable effects. Varje stage får ett cache-key-recept med stage-lokala source- och IR-beroendedigests samt resolved module identity, module-, input-, args-, config-, profile- och environment-digest, men cacheläsning, cacheskrivning och reuse förblir avstängda tills receptet kan verifieras över två revisioner.

**Acceptans:** planen existerar före första transform, typed edges formar en acyklisk graf, faktisk trace binds tillbaka till planerade stage-noder och avvikelse stoppar körningen. Legacyfunktioner utan fullständigt kontrakt klassas konservativt som `unknown` och aldrig cachebara. En första run rapporterar `cold/no-baseline`; med en lyckad editorbaslinje skiljer previewn `directlyAffected`, `transitivelyAffected`, `unchanged`, `added` och `removed`. Alla stages körs ändå fresh, och `cacheReads`, `cacheWrites` samt `reused` är noll. Render, kanaler, atomisk commit och stageordning är oförändrade.

**Avgränsning:** sprinten återanvänder ännu varken parserträd eller stageoutput, kör inget parallellt och inför inte streaming, backpressure, timeout eller resursbudget. Dessa förmågor förblir explicit unsupported tills senare sprintar i Våg 3.

**Acceptansevidens:**

- Workern bygger `textabana.execution-plan/lab-v2` och `textabana.execution-graph/lab-v1` efter modulinitiering men före första transform. Samma operationstape är auktoritet för både grafen och den fresh, sekventiella exekveringen.
- Grafen validerar unika nod- och edge-id:n, kända edge-typer, existerande och namngivna portar, inputkardinalitet, stigande topologisk ordning, korrekta entrynoder, full väg till exakt en renderterminal samt plan/trace-bindning med `planNodeRef`.
- Ett stagefel behåller hela den förkompilerade grafen och endast den observerade trace-prefixen. Durable render och channels förblir atomiskt tomma.
- Funktionskontrakt skiljer behavior, state, determinism och observerbara effekter. Saknade deklarationer blir `unknown`; även en explicit pure/deterministic/effects-free kandidat är endast en betrodd manifestuppgift och ger ingen reuse i denna sprint.
- Cache-receptet täcker stage-lokala source-/IR-beroenden, resolved module identity och content digest, exakt typad input, args, config, profile och environment. Whitespace, värdetyp, funktionsnamn, include-path och ändrad edge-topologi täcks av regressionstest.
- `textabana.invalidation-preview/lab-v1` skiljer cold/no-baseline från editorbaserad diff och redovisar direct, transitive, unchanged, added, removed samt forced-effect. Previewn ligger utanför semantisk Result-identitet; planerad fresh-körning skiljs från observerad trace.
- Language & Scope Lab har separata Graf- och Körspår-flikar. Specifikationen, README och parserkontraktet anger att cache reads, writes, hits och reuse är noll och att full parse, fresh scheduler samt sekventiell körning består.
- Releasegrind: 126 automatiska test, ESLint och Sites produktionsbygge passerar. En befintlig chunkstorleksvarning är fortsatt icke-blockerande.

#### Sprint 3.2 — Verifierad stage-cache och selektiv återanvändning

**Status:** genomförd 2026-09-06

**Leverans:** aktivera en begränsad, sessionslokal och minnesbaserad cache för stageoutput i Editor Kernel. Endast stages med kontraktet `pure + deterministic + effects=[]`, utan kanaler eller icke-render-output, kan bli kandidater. Samma fullständiga semantic key måste exekveras fresh i två skilda, lyckade och publicerade dokumentrevisioner med exakt samma typade output innan posten verifieras; första möjliga återanvändning sker därför vid en tredje kvalificerad förekomst. En omkörning av samma revision kan använda en redan verifierad post men får aldrig räknas som en ny observation. Varje run använder en immutable cachebaslinje och ett pending journal som committas atomiskt tillsammans med aktuell editor-head. En faktisk `textabana.execution-report/lab-v1` skiljer exekverade stages från cachematerialisering och hålls separat från rådgivande invalidation.

**Acceptans:** cacheläsning kräver samma editorsession, stabil plan-node-identitet, exakt full key witness, ett verifierat tvåobservationsunderlag och en nod som invalidation klassar som retained candidate. Effectful, unknown, direkt eller transitivt invaliderade stages körs alltid fresh. Failed, cancelled, stale och ersatta sessioner får varken främja observationer eller skriva cache. Cachevärden begränsas till en förlustfri, typad JSON-domän, klonas vid skrivning och varje läsning samt jämförs på både bytes och digest. Återanvändning skapar nya run-lokala activity-/traceposter och påverkar inte render, kanaler, semantiskt Result-ID eller conformance-golden.

**Avgränsning:** varje run gör fortsatt full dokumentparse, modulinitiering och grafbyggnad och använder den sekventiella schedulern. Cachen gäller endast Editor Kernel-sessioner och överlever vanliga `change`, men inte sessionsbyte, Worker-omstart eller hostreset. Persistent eller delad cache, parserträdsåteranvändning, cached event replay, parallellism, streaming, backpressure, timeout och generell resursbudget ligger kvar i senare sprintar. Två lika observationer verifierar endast denna lab-cache under en betrodd moduldeklaration; de bevisar inte att godtycklig JavaScript är ren.

**Acceptansevidens:**

- Editor Kernel håller en sessionslokal `textabana.stage-cache/lab-v1`. Två fresh observationer i skilda committade revisioner krävs; samma revision främjar aldrig evidensen och första reuse kan ske först vid en tredje kvalificerad förekomst.
- Den exakta key witnessen binder authored args inklusive egenskapsordning, rekursiv edge-/mergeidentitet och hela den faktiskt initierade modulclosure i initieringsordning. Compact FNV-bucket jämförs alltid tillsammans med full witness, och kollisioner kan varken kombinera evidens eller lämna quarantine.
- Cachevärden begränsas till `null`, sträng, boolesk, ändligt tal, tät standardarray och extensible plain/null-prototype object med standarddeskriptorer. Delade/cykliska referenser, getters, symboler, custom prototypes, sparse arrays, non-enumerable/readonly/frozen värden, proxies och för stora värden bypassas fresh.
- Varje cachetransaktion använder immutable baseline och pending journal. Endast poster som faktiskt finns kvar efter commit/eviction räknas som `observations` eller `writes`; attempts redovisas separat. Failed, cancelled, stale head, post-commit-gate, sessionsbyte och cache-CAS-konflikt återställer committad evidens i rapporten.
- `textabana.execution-report/lab-v1` redovisar varje planerad stages faktiska resolution. `textabana.execution-step/lab-v2` skiljer fresh invocation från cachematerialisering, och semantisk Result-/projektionidentitet förblir transportoberoende.
- Varje run, adapter-run, stage, invocation, activity och event får ny run-lokal instansidentitet. En cachematerialisering pekar på en cachepost och två unika, exakt kvalificerade observationsentiteter; conformance-grinden verifierar att plan-node och output-digest matchar.
- Duplicerade samtidiga `runId` avvisas i både Editor Kernel- och raw-run-gränsen, så cancellation kan aldrig träffa två körningar. Den avsedda playgroundsekvensen `open → run → edit höger gren → auto-run → manual run` återanvänder endast den oförändrade vänstergrenen.
- Releasegrind: 153 automatiska test, ESLint och Sites produktionsbygge passerar. Golden-baselinen är omfryst efter två identiska körningar. Den befintliga chunkstorleksvarningen är fortsatt icke-blockerande.

#### Sprint 3.3 — Bounded concurrent scheduler & run budgets

**Status:** genomförd 2026-09-06

**Leverans:** ersätt den sekventiella operationstape-loopen med en deterministisk ready-set-scheduler som får överlappa oberoende stages med ett separat parallellkontrakt: `pure + deterministic + effects=[]`, inga deklarerade kanaler och inga icke-render-outputs. Överlappningen sker asynkront i en enda Web Worker och är inte flertrådad CPU-parallellism. `unknown`-, stateful- och effectful-stages är globala seriella barriärer; även en pending barriär fence:ar senare ready branches. Outputs från faktiskt samtidiga fresh-invocations detacheras vid settlement genom en förlustfri snapshot av den portabla TextabanaValue-domänen. Samtliga execution-ID:n reserveras och values, trace, cachejournal samt merge publiceras i planordning efter att en startad batch har dränerats. Samma sprint inför en kooperativ run-deadline och explicita hosttak för stage-resolutioner, kanalhändelser, renderbytes och samtidiga invocationer.

**Acceptans:** ready sets härleds från den validerade DAG:en och endast noder utan inbördes beroende får starta tillsammans. Omvänd settlementordning eller efterföljande mutation av ett returnerat branchobjekt får aldrig ändra render, execution trace, provenance, cache-resolutioner eller normalized conformance-resultat. En osäker stage kör ensam och blockerar även planmässigt senare ready branches tills den har avslutats. Ett branchfel stoppar ny scheduling och dränerar redan startade syskon. En aktiv cancel/deadline-signal efter drain har företräde; bland övriga fel väljs tidigaste planordnade fel som terminalorsak. User cancellation förblir `cancelled`; deadline- och budgetbrott blir `failed`. Alla terminalfel revokerar durable channels, render, SourceMaps, anchors, metadata-delta och pending cacheevidens atomiskt. Rapporten skiljer strikt typade begärda och effektiva gränser, faktisk peak concurrency och planordnad commit från completion timing.

**Avgränsning:** schedulern ger endast async-överlappning i en Worker. Den kan inte preemptera synkrona CPU-loopar eller en Promise som aldrig settles, ger ingen multicore-exekvering och är ingen generell CPU-/minnessandbox. Purity- och effektdeklarationer är fortsatt en betrodd modulgräns; godtyckliga writes via globalt JavaScript kan inte bevisas rena. Parser-/compilerträdsreuse, persistent/delad cache, cached event replay, streaming, backpressure och extern side-effect-rollback ligger kvar i senare arbete.

**Acceptansevidens:**

- Den validerade operationstapen driver en bounded ready-set-scheduler. `parallelEligibility` är skild från cache eligibility; endast oberoende `pure + deterministic + effects=[]`-stages utan deklarerade kanaler eller icke-render-outputs får ingå i samma wave.
- Execution-, invocation- och activity-ID:n reserveras i planordning. Cachelookup sker före dispatch, startade Promises dräneras med `allSettled`, och values, trace samt cacheobservationer publiceras därefter i global planordning även när branches avslutas i omvänd ordning.
- Stateful, effectful och `unknown`-stages är seriella barriärer. Pipelineberoenden startar aldrig före sin föregångare, och en branch som bryter no-effects-kontraktet får terminalt, atomiskt fel.
- En pending seriell barriär fence:ar senare ready branches. Outputs från två eller fler faktiskt samtidiga fresh-invocations snapshotas och klonas omedelbart inom den portabla TextabanaValue-domänen; specialprototyper, specialdeskriptorer, shared memory, alias och cykler avvisas atomiskt. Cachetypning och cachevärdets 64 KiB-tak utvärderas separat och påverkar inte safe-single-semantik.
- `textabana.scheduler-report/lab-v1` redovisar waves, peak concurrency, barriärer och commitordning. `textabana.resource-report/lab-v1` skiljer begärda, effektiva och fasta hosttak samt faktisk användning.
- Deadlinen börjar när en köad run verkligen tas upp för exekvering och kontrolleras kooperativt vid runtimegränser. Explicit cancellation har företräde och förblir `cancelled`; deadline, stage-, event- och renderbudgetbrott blir `failed` med stabila diagnostikkoder.
- Branchfel och cancellation dränerar redan startade syskon men stoppar ny dispatch. Cancel/deadline har efter drain företräde framför ett vanligt branchfel; övriga fel väljs i planordning. Durable render, channels, SourceMaps, anchors, metadata-delta och cachejournal rollbackas tillsammans.
- Language & Scope Lab visar faktisk scheduler- och resursrapport utan en ny top-level-playground. Specifikation, README och parserkontrakt markerar single-worker async overlap, ingen CPU-parallellism, ingen synkron preemption och ingen streaming/backpressure.
- Releasegrind: 166 automatiska test passerar, inklusive omvänd settlementordning, pending effektbarriär, eftersettlement-mutation, portabel outputdomän, `maxParallelism=1`, cache hit + fresh sibling, branchfel, terminalprioritet, editor-cancellation, köad deadline och samtliga budgetfel. ESLint och Sites produktionsbygge passerar; normalized golden är stabil över upprepade körningar. Den befintliga chunkstorleksvarningen är fortsatt icke-blockerande.

#### Sprint 3.4 — Closure: incremental reuse, cache checkpoints & flow control

**Status:** genomförd 2026-09-06

**Leverans:** stäng Våg 3 med inkrementell återanvändning av Lezer-träd efter revisionguardade ChangeSets, återbruk av en redan analyserad och kompilerad revisionssnapshot, hostmedierad export/import av cachecheckpoint samt post-commit metadata-streaming med explicit credit-baserad backpressure.

**Acceptans:** en oförändrad revision återanvänder exakt samma kompilerade parseprodukt; en efterföljande edit återanvänder giltiga Lezer-fragment utan att ändra AST/IR-semantiken. Cachecheckpoint binds till hela payloaden med digest, valideras för typdomän, evidens och hostbudget före import och kan explicit flyttas till en ny session. En stream-subscription levererar aldrig tentative output, sänder högst beviljad credit och återupptas endast genom ett explicit `credit`-kommando.

**Avgränsning:** cachepersistens och delning ägs av hosten genom explicit checkpointtransport; kärnan innehåller ingen databas eller implicit global cache. Streaming gäller committade metadata-deltan, inte kontinuerlig stageoutput, och ger därför ingen rollback av externa sidoeffekter eller preemption av synkron kod. Dessa större distributions- och transportfrågor hör till Host-SDK-vågen.

**Acceptansevidens:**

- `analyze` rapporterar `fresh`, därefter `compiled-snapshot` för samma revision och `incremental-tree` efter en revisionguardad ändring; parser-IR redovisar antal återanvända fragment.
- Cachecheckpoint har ett versionssatt schema, full-payload-digest, storleksgränser och lossless validering av varje output. Manipulerad payload avvisas atomiskt och import rebinds explicit till mål-sessionen.
- `stream`-subscriptions startar med hostvald credit. Varje `metadata-chunk` skapas först efter lyckad core commit och köas när credit är slut; `credit` återupptar leveransen deterministiskt till `done`.
- Closure-regressionerna ingår i en full releasegrind med 169 passerade test, ESLint och Sites produktionsbygge tillsammans med befintliga parser-, editor-, cache-, scheduler- och conformance-test.

### Våg 4 — Host-SDK:er och säkra modulpaket

**Status:** genomförd 2026-09-06

**Mål:** Göra kärnan lätt att bädda in och moduler möjliga att distribuera utan dold behörighet.

**Leveranser:** framework-neutral TypeScript-SDK, CodeMirror- och Monaco-bindningar, Python/Jupyter-klient, modulmanifest, namespaces, lockfile, kryptografiska digests och capability grants.

**Acceptans:** samma protokoll-fixtures passerar i Worker-, editor- och Python-host; moduler deklarerar pure/deterministic/effectful samt resurs- och kanalkapabiliteter före körning.

**Acceptansevidens:**

- `sdk/typescript` publicerar en transportneutral `TextabanaKernelClient` för samtliga kernelkommandon, korrelerade svar och credit-bundna streamchunks.
- CodeMirror- och Monaco-bindningarna översätter värdarnas UTF-16-offsets till Textabanas Unicode-code-point-ranges och skickar revisionguardade ChangeSets.
- `sdk/python` implementerar samma JSON-meddelandekontrakt samt en Jupyter MIME-projektion som vägrar presentera failed eller icke-committade runs som aktuell output.
- Säkra modulpaket verifieras före entrypoint mot namespace, semver, entrypoint, SHA-256, exakt lockfile och explicita required/channel/resource-grants. Efter laddning måste varje faktisk funktions `state`, `determinism` och `effects` matcha manifestet före transform.
- Negativa tester stoppar saknad grant, manipulerade bytes och kontraktsdrift atomiskt. TypeScript-SDK:n typecheckas och Pythonpaketet byte-kompileras i releasegrinden.
- Releasegrinden omfattar 173 automatiska test, TypeScript-typecheck, Python byte-compilation, ESLint och Sites produktionsbygge.

### Våg 5 — Produktionskonformitet och ekosystem

**Status:** aktiv · sprint 5.1 genomförd 2026-09-06

**Mål:** Göra kompatibilitetsanspråk portabla mellan oberoende implementationer.

**Leveranser:** CLI, canonical JSON + SHA-256, profil-fixtures, property/fuzz testing, cross-runtime-suite, signerade rapporter och adapter-/modulpaketregister.

**Acceptans:** ett profilanspråk kan reproduceras utanför Playground; lab-hash eller generisk JSON kan aldrig uppgraderas till canonical claim utan passerad extern suite.

#### Sprint 5.1 — Reproducerbar värdsuite och verifieringsverktyg

**Status:** genomförd 2026-09-06

**Leveranser och evidens:**

- CLI för run, analyze, JSONL-transport, strikt kanonisering, SHA-256, extern konformitetsrapport, Ed25519-signering/verifiering och lokalt paketregister.
- Åtta versionssatta protokollfall körs genom fem faktiska värdvägar (40 utfall): direkt Worker, TypeScript, CodeMirror, Monaco och Python. Unicode, två revisioner, stale guards, atomiskt run-resultat och cancel-ack jämförs med explicita förväntningar. Python kontrollerar också Jupyter MIME-projektion.
- Verklig värdkörning kompletterar Våg 4:s tidigare kompileringstester. Monaco använder händelsernas UTF-16-offsets; CodeMirror köar snabba ändringar; SDK bevarar feldata och avvisar duplicerade requestId:n och anrop efter dispose.
- 250 seedade JSON-värden och 160 på varandra följande parserändringar kontrollerar stabil kanonisering respektive fresh/inkrementell semantisk paritet. Ogiltig JSON, förfalskade rapporter och ändrade paketmanifest avvisas.
- Rapporten binder kanoniskt serialiserad suite och exakta kernelbytes med SHA-256. Signaturverifiering kräver verifierarens betrodda Ed25519-nyckel och skiljer autenticitet från testutfall. Ingen release-signeringsidentitet antas.

**Avgränsning:** profilen `textabana.host-protocol/lab-v1` verifierar värdar runt samma JavaScript-kärna, inte oberoende språkimplementationer. RFC 8785 gäller JSON-serialisering; semantiska IR/Plan/Result-identiteter förblir labb-FNV. Paketregistret är en lokal integritetskontrollerad katalog. Publicerad rapport är osignerad tills en release-signeringsidentitet finns.

**Återstår innan Våg 5 kan stängas:** produktionsprofilernas fullständiga fixtures, kanonisk semantisk IR/Plan/Result-identitet, jämförelse med en oberoende runtime, konfigurerad release-signering samt publicerad registertjänst. Tidigare labbdelmängders begränsningar kvarstår; denna sprint uppgraderar inga sådana anspråk.

## Beroenden och ordning

| Våg | Kräver | Låser upp |
|---|---|---|
| 1 · Document protocol | Befintligt atomiskt Result, channels och anchors | Kontinuerlig editorloop |
| 2 · Parser & typed IR | Våg 1:s revisionsmodell | Lokal recovery och strukturella deltan |
| 3 · Execution graph | Våg 2:s stabila IR-spans och noder | Selektiv omkörning och cache |
| 4 · Host-SDK/paket | Våg 1-protokoll, Våg 2–3 kärngränser | Verkliga editor-, notebook- och pipelineintegrationer |
| 5 · Produktionskonformitet | Våg 1–4 | Oberoende implementationer och verifierbara claims |

## Ändringslogg

### 1.6.0 — 2026-09-06

- Våg 5 aktiverad; sprint 5.1 levererad med extern CLI-värdsuite, JCS/SHA-256, reproducerbara genererade testfall, rapportsignering och lokalt paketregister.
- Våg 4:s editorbindningar och request-livscykel rättade och verifierade genom körning. Lockfil kan inte kringgås genom att strippa modulmanifest; duplicerade lockposter avvisas.
- Full produktionskonformitet, oberoende runtimes, release-signeringsidentitet och registertjänst kvarstår uttryckligen.

### 1.5.0 — 2026-09-06

- Våg 4 genomförd med framework-neutral TypeScript-klient, CodeMirror-/Monaco-bindningar samt Python-/Jupyter-klient.
- `textabana.module-manifest/lab-v1`, `textabana.module-lock/lab-v1`, SHA-256-verifiering och explicita capability grants införda före modulentrypoint.
- Faktiska funktionskontrakt verifieras mot manifestet före transform; JavaScript-loadern är fortsatt uttryckligen ingen generell sandbox.
- Nästa aktiva leverans är Våg 5 — Produktionskonformitet och ekosystem.

### 1.4.0 — 2026-09-06

- Sprint 3.4 genomförd och Våg 3 stängd med inkrementell Lezer-reuse, kompilerad revisionsreuse, portabla host-checkpoints och credit-bunden post-commit metadata-streaming.
- Capability- och begränsningsspråket skiljer uttryckligen dessa verifierade subsets från transparent distribuerad cache, kontinuerlig stage-streaming och extern side-effect-rollback.
- Nästa aktiva leverans är Våg 4 — Host-SDK:er och säkra modulpaket.

### 1.3.1 — 2026-09-06

- Sprint 3.3 markerad som genomförd med bounded ready-set-scheduling, separat parallell eligibility, effektbarriärer och deterministisk planordnad commit.
- Kooperativ deadline och explicita stage-, event-, render- och concurrencytak publiceras i maskinläsbara scheduler-/resursrapporter med atomisk rollback.
- Releaseevidens uppdaterad till 166 passerade test, ESLint och Sites produktionsbygge. Våg 3 förblir aktiv för parser-/compilerträdsreuse, persistent/delad cache, streaming och backpressure.

### 1.3.0 — 2026-09-06

- Sprint 3.3 aktiverad för deterministisk, begränsad async branch-concurrency i en Web Worker.
- Parallell eligibility skiljs från cache eligibility; effectful och okända stages förblir seriella barriärer och all publik commit sker i planordning.
- Kooperativ deadline samt explicita tak för stage-resolutioner, kanalhändelser, renderbytes och samtidighet ingår; hård synkron preemption, multicore, generell CPU-/minnesbudget, streaming och backpressure gör det inte.

### 1.2.1 — 2026-09-06

- Sprint 3.2 markerad som genomförd med sessionslokal tvåobservationscache, sekventiell selective reuse, faktisk execution report och `execution-step/lab-v2`.
- Cacheidentitet, typad värdedomän, outputkloning, modulclosure, argsordning, kollision/quarantine, eviction, CAS och atomisk rollback verifierade med negativa regressioner.
- Run-lokal provenance använder unika instans-ID:n och exakt kvalificerad cacheevidens; conformance-grinden verifierar varje materialiserings två resolverbara observationer.
- Releaseevidens uppdaterad till 153 passerade test, ESLint och Sites produktionsbygge. Våg 3 förblir aktiv för parser/compiler-reuse, parallell scheduling, streaming, backpressure, timeout och resursbudget.

### 1.2.0 — 2026-09-06

- Sprint 3.2 aktiverad för sessionslokal, atomiskt committad stage-output-cache och sekventiell selektiv återanvändning.
- Två skilda lyckade editorrevisioner krävs som verifiering innan en tredje kvalificerad förekomst får återanvända output; samma revision får inte främja observationsunderlaget.
- Faktisk cachetelemetri separeras från rådgivande invalidation; full parse, modulinitiering och sekventiell scheduler består.

### 1.1.1 — 2026-09-05

- Sprint 3.1 markerad som genomförd med pre-transform plan/DAG, separat observerad trace och rådgivande invalidation preview.
- Cacheidentiteten härdad för exakt typade värden, funktionsnamn, resolved module identity och ändrad edge-topologi; cache/reuse förblir avstängt.
- Releaseevidens uppdaterad till 126 passerade test, ESLint och produktionsbygge.

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
