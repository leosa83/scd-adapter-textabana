# IR, graph, plan and trace

CST bevarar källformen, AST normaliserar syntaxen och typed IR beskriver dokumentets host-neutrala semantik. ExecutionPlan och dess graf bestämmer därefter vad hosten avser att resolvera. ExecutionTrace beskriver vad som faktiskt hann få ett fresh transformanrop eller en cachematerialisering; invalidation preview jämför två planer utan att påstå cacheträff eller reuse.

**CST → AST → TextabanaIR**

Lossless source, normaliserat blockträd och därefter en JSON-serialiserbar discriminated node-union med separat intervallgraf.

**ExecutionPlan + Graph**

Stage-instanser, `syntaxStageRef`, typade edges, order keys, runtimepolicy och statiska cache-recept före transform.

**ExecutionTrace + preview**

Observerade stage-resolutioner binds med `planNodeRef`; `functionInvoked` skiljer invocation från materialisering. Historikberoende invalidation är separat, rådgivande metadata.

**SourceMap**

Många-till-många-relationer mellan genererade selectors och versionerade inputanchors.

### Minimalt IR-fragment

Normativt schemafragment · json

```json
{
  "schema": "textabana.ir/lab-v2",
  "languageVersion": "0.4-playground-subset",
  "parser": { "schema": "textabana.parser/lab-v1", "engine": "lezer-lr", "parseMode": "full-document" },
  "sourceRef": { "documentId": "doc:claims", "version": "fnv1a:..." },
  "validity": { "status": "valid", "executable": true, "recoveryCount": 0 },
  "nodes": [{
    "nodeId": "claim-block",
    "kind": "Block",
    "sourceSpan": { "start": 128, "end": 304, "unit": "unicode-code-point", "startLine": 8, "startColumn": 0, "endLine": 15, "endColumn": 19 },
    "pipeline": [{ "stageId": "stage:syntax:004", "name": "claims.extract", "sourceSpan": { "start": 133, "end": 147 } }],
    "activeScopeIds": ["clean", "provenance"]
  }],
  "scopes": [],
  "directives": [],
  "diagnostics": [],
  "extensions": {}
}
```

### Pre-transform plan och typad graf · förkortat

Körbar plan + sessionslokal cache-subset · json

```json
{
  "schema": "textabana.execution-plan/lab-v2",
  "constructionPhase": "post-module-init-pre-transform",
  "graph": {
    "schema": "textabana.execution-graph/lab-v1",
    "nodes": [{ "nodeId": "plan:stage:…", "kind": "stage", "orderKey": [2, 0, 0], "cache": { "mode": "session-verified", "eligibility": "candidate" } }],
    "edges": [{ "kind": "pipeline", "from": { "nodeId": "plan:source:…", "port": "value" }, "to": { "nodeId": "plan:stage:…", "port": "input" } }],
    "terminalNodeId": "plan:render:…"
  },
  "runtimePolicy": { "scheduler": "bounded-deterministic-ready-set", "execution": "selective-concurrent-safe-branches", "cache": "session-verified-two-observations", "parallelMode": "single-worker-async-overlap", "commitOrder": "plan-order" }
}
```

<a id="IR-001"></a>

> **IR-001** Intervall MÅSTE representeras som scopes och segmentmedlemskap; de får inte pressas in i ett AST-träd som förlorar korsningar.

<a id="IR-002"></a>

> **IR-002** Authored ids FÅR vara stabila mellan revisioner. Genererade node ids MÅSTE dokumenteras som revision-local.

<a id="IR-003"></a>

> **IR-003** Varje IR-node, stage och recovery MÅSTE ha ett halvöppet Unicode-code-point-span inom exakt source snapshot. Syntetiska missing tokens MÅSTE vara markerade och ha zero-width-span. En source-backed Blank-node FÅR vara zero-width utan att vara syntetisk; radslutet ägs då av CST:ns separata Newline-terminal.

<a id="IR-004"></a>

> **IR-004** En `Recovery`-node MÅSTE ha `executable=false` och får aldrig refereras som en körbar stage i ExecutionPlan.

<a id="PLAN-001"></a>

> **PLAN-001** ExecutionPlan MÅSTE bära varje stages exakta funktionsversion, typkontrakt, granted capabilities och deterministiska order key.

<a id="PLAN-002"></a>

> **PLAN-002** ExecutionGraph MÅSTE ha unika node- och edge-id:n, typade endpoints, acyklisk topologisk ordning och exakt en renderterminal. Edge-typerna `pipeline`, `interval`, `interval-injection`, `inheritance`, `merge` och `render` MÅSTE vara explicita. Samma operationstape MÅSTE vara auktoritet för både planering och exekvering.

<a id="PLAN-003"></a>

> **PLAN-003** Statisk cache eligibility, cache candidate, cache lookup, cache hit och faktisk reuse är skilda tillstånd. Ett ofullständigt state-, determinism- eller effektkontrakt MÅSTE göra funktionen icke-cachebar. En deklarerad kandidat är en betrodd manifestuppgift, inte i sig ett verifierat puritybevis.

<a id="PLAN-004"></a>

> **PLAN-004** Invalidation preview MÅSTE vara rådgivande och separat från grafens och Resultatets semantiska identitet. Den MÅSTE ange basis, target och maskinläsbara orsaker samt får aldrig redovisas som cache hit eller reuse.

<a id="PLAN-005"></a>

> **PLAN-005** Parallell eligibility och cache eligibility MÅSTE vara separata fält även när kriterierna sammanfaller. Endast oberoende `pure + deterministic + effects=[]`-stages utan kanaler eller icke-render-output FÅR överlappa i den aktuella subseten. En pending unknown, stateful eller effectful stage MÅSTE fence:a planmässigt senare ready branches tills barriären har avslutats; merge/render är seriella. Outputs från faktiskt samtidiga fresh-invocations MÅSTE snapshotas och klonas förlustfritt inom den portabla TextabanaValue-domänen vid settlement; andra typer avvisas atomiskt före planordnad publicering. Execution-ID:n, trace, values och cachejournal MÅSTE publiceras i planordning.

**Playgroundens Våg 3-addendum**

Language & Scope Lab visar verklig `textabana.cst/lab-v1`, `textabana.ast/lab-v1`, `textabana.ir/lab-v2`, en komplett pre-transform-graf, rådgivande invalidation, faktisk execution report med waves/run-budget och ett separat planordnat körspår från samma Worker. Planen byggs efter modulinitiering men före första transform. Editor Kernel återanvänder en exakt compiler-snapshot eller giltiga Lezer-fragment när revisionskedjan tillåter det. Schedulern får endast överlappa betrodda effects-free grenar asynkront; den ger ingen multicore-CPU-parallellism och kan inte preemptera synkrona loopar. Cachecheckpoint och credit-bunden metadata-streaming är hostmedierade lab-subsets, inte transparent distribuerad cache eller kontinuerlig stage-streaming.
