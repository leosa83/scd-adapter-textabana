# Processing model

### Sammanhängande referensdokument

Planerad golden fixture · textabana

```textabana
>>>>! include "pkg:textabana/core@1" as core
>>>>! include "pkg:textabana/claims@2" as claims

>>>>+ core.normalize @id=clean @order=10
>>>>+ claims.annotate @id=review @order=30

## Observation {.evidence source=PARES}

>>>> claims.extract @inherit=explicit
  | @intervals only=[clean]
  | claims.rank
  | @intervals only=[review]

Fartyget avgick från Göteborg den 4 maj.
<<<< claims.extract

<<<<+ @id=clean
<<<<+ @id=review
```

1. 1**Fånga immutable snapshot**Bind documentId, revision, source version och exakta source coordinates.
2. 2**Bygg lossless CST**Lezer bevarar varje lexem och radslut; fenced code och escapes klassificeras före kontrollsyntax.
3. 3**Sänk till AST**Bygg blockträdet, typed stages, literalnoder, properties, directives och lokala recovery nodes.
4. 4**Beräkna intervallgraf**Behåll open/close-events separat från blockträdet och härled maximala scope-segment.
5. 5**Publicera typed IR**Ge varje node/stage ett verifierbart Unicode code-point-span och varje fel en stabil kod.
6. 6**Stäng compile gate**Recovery förblir synlig för editorn, men error-level diagnostics stoppar all modulinitiering och exekvering.
7. 7**Lös, initiera och bind moduler**Alla säkra transporterade paket måste ha passerat metadata-, digest-, lock- och grantkontroll. Includes och config läses ur samma IR. Efter modulstart jämförs faktiska exports med manifestet, före första transform.
8. 8**Kompilera plan och graf**Bygg en komplett, typad DAG efter modulinitiering men före första `transform`. Source-, stage-, merge- och rendernoder får deterministisk ordning och explicita beroenden.
9. 9**Resolvera deterministiska ready sets**Varje stage får antingen ett fresh transformanrop eller en verifierad cachematerialisering. Oberoende effects-free kandidater kan överlappa asynkront; effectful/unknown är seriella barriärer. Startade batcher dräneras och values, trace samt cachejournal publiceras i planordning.
10. 10**Commit atomiskt**Publicera immutable render, kanalsnapshots, proveniens och diagnostik som ett resultat.

Listan visar de semantiska stegen. I den aktuella Workern görs paketförhandskontrollen före dokumentparsningen; båda grindarna måste passera före någon modulstart. Ett paketfel kan därför rapporteras före ett syntaxfel. Legacy-moduler utan säker paketsignal följer den äldre loadergränsen. Se [exakt paketkontroll och felordning](https://github.com/leosa83/scd-adapter-textabana/blob/main/MODULE_ADMISSION_PROFILE.md).

<a id="PROCESS-001"></a>

> **PROCESS-001** Samtidig exekvering FÅR endast användas när beroenden, eligibility, deterministic merge och publik event-/traceordning är fullt definierade. Completion timing får inte bli semantisk ordning.

<a id="PROCESS-002"></a>

> **PROCESS-002** Ett kompileringsfel MÅSTE stoppa all domänexekvering. Ett run-fel MÅSTE hindra durable commit.

<a id="PROCESS-003"></a>

> **PROCESS-003** Modulinitiering är en effekt och FÅR INTE ske innan hela dokumentet har passerat parserns compile gate.

<a id="PROCESS-004"></a>

> **PROCESS-004** ExecutionPlan och ExecutionGraph MÅSTE vara kompletta före första stage-resolution. ExecutionTrace `textabana.execution-step/lab-v2` MÅSTE vara en separat observation där varje post refererar en planerad nod och skiljer fresh invocation från cachematerialisering. Vid fel behålls hela grafen och samtliga faktiskt startade, dränerade stageutfall publiceras i planordning; oschemalagda noder saknar tracepost.
