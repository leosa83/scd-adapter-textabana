# Textabana Editor Kernel — implementationsplan

| Fält | Värde |
|---|---|
| Plan-ID | `TA-EDITOR-KERNEL-PLAN` |
| Planversion | `1.0.0` |
| Status | Pågår |
| Fastställd | 2026-09-05 |
| Baseline | Interop draft 0.5, Language 0.4 och genomförd `TA-ADAPTER-PLAN` 1.0.5 |
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
          │ open · change · subscribe · run · cancel
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

**Status:** pågår

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

### Våg 2 — Formell parser, typed IR & felåterhämtning

**Status:** planerad

**Mål:** Ersätta radregex som grammatisk auktoritet med en versionssatt parser och typed IR som kan behålla partiell struktur under redigering.

**Leveranser:** formell grammatik, CST/AST/IR-gränser, source spans, escaping/literal-läge, recovery nodes, diagnosstabilitet och parser-fixtures. Biblioteksval mellan Lezer och Tree-sitter görs först mot host-, storleks- och Worker-krav.

**Acceptans:** samma giltiga källa behåller existerande semantik; ofullständig editsyntax ger lokal recovery i stället för fabricerad körbar struktur; alla IR-noder har verifierbara spans.

### Våg 3 — Inkrementell planering och exekveringsgraf

**Status:** planerad

**Mål:** Göra ändringsmängder beräkningsmässigt värdefulla genom att ogiltigförklara och köra om endast beroende delgraf.

**Leveranser:** typed edges, cache keys, invalidation, pure/effect-gräns, deterministisk merge, streaming/backpressure, timeout och resursbudget.

**Acceptans:** oförändrade pure stages återanvänds med bevisad input-/module-digest; effectful stages cachas aldrig implicit; cancellation och atomisk commit gäller även parallella grenar.

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

### 1.0.0 — 2026-09-05

- Ny femvågsplan fastställd ovanpå den avslutade adapterplanen.
- Våg 1 aktiverad med dokumentprotokoll, metadata-delta och anchor continuity som första leverans.
- Formell inkrementell parser och selektiv exekvering avgränsade till Våg 2 respektive Våg 3.
