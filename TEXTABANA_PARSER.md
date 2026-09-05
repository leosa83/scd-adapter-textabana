# Textabana Parser & typed IR — Våg 2

Detta dokument definierar den körbara parser-subset som införs i Våg 2. Giltig Language Core-semantik ligger kvar på `language-core/0.4`. De publika artefakterna är `textabana.parser/lab-v1`, `textabana.cst/lab-v1`, `textabana.ast/lab-v1` och `textabana.ir/lab-v2`.

## Ett source snapshot, en grammatisk auktoritet

```text
Source snapshot
  → Lezer CST
  → Textabana AST
  → typed IR + diagnostics
  → compile gate
  → module resolution + initialization
  → pre-transform ExecutionPlan + typed graph
  → fresh sequential execution + observed trace
  → atomic Result
```

`parseDocument(source, identity)` kör alltid före modulinitiering. Include-resolution, config, Language Lab och runtime använder samma parseprodukt. Ett dokument med en blockerande parsediagnostik lämnar fortfarande CST, AST och partial IR till editorn, men ger ingen modulinitiering, ingen plan, ingen stage-exekvering och ingen durable commit.

Våg 3-addendumet bygger `textabana.execution-plan/lab-v2` och `textabana.execution-graph/lab-v1` efter att include-moduler har initierats men före första transform. Samma operation tape producerar både den inspekterbara grafen och den faktiska fresh, sekventiella körningen. `executionTrace` förblir separat och binds tillbaka med `planNodeRef`. Cache-key-recept och `textabana.invalidation-preview/lab-v1` är planning-only; parserträdsreuse, cacheläsning/-skrivning och selektiv exekvering är fortfarande senare Våg 3-arbete.

## Två lager, ett parserkontrakt

Lezer-grammatiken i `runtime/textabana.grammar` är en lossless, radankrad klassificerare. `runtime/parser.js` tolkar stage-/value-syntax, håller fence-, block- och intervalltillstånd och sänker samma CST till AST och IR. Båda lagren ligger bakom en enda publik operation, `parseDocument`; ingen renderer eller inspector klassificerar rå dokumenttext på nytt.

```ebnf
Document          ::= Item*
Item              ::= Fence | EscapedMarkerLine | Directive | LegacyInclude
                    | Block | IntervalOpen | IntervalClose | PropertyLine | TextLine

Fence             ::= FenceOpen FenceText* FenceClose?
FenceOpen          ::= Indent? (BacktickFence | TildeFence) FenceInfo?
FenceClose         ::= Indent? MatchingFence Whitespace*
EscapedMarkerLine ::= Indent? "\\" (">>>>" | "<<<<") TextTail

Block              ::= BlockHeader Item* BlockClose
BlockHeader        ::= ">>>>" Pipeline Continuation*
BlockClose         ::= "<<<<" Name
IntervalOpen       ::= ">>>>+" Stage
IntervalClose      ::= "<<<<+" ("@id=" Identifier | Name)
Directive          ::= ">>>>!" (Include | Config)
LegacyInclude      ::= ">>>>" Include
Include            ::= "include" Whitespace QuotedPath
Config             ::= "config" Whitespace "scope-order=" QuotedScopeOrder

Pipeline           ::= Stage ("|" Stage)*
Continuation       ::= Indent "|" Stage ("|" Stage)*
Stage              ::= Name Argument*
Argument           ::= ArgName ("=" Value)?
Value              ::= Boolean | Null | Number | Quoted | Array | Object | Bare
Array              ::= "[" (Value ("," Value)*)? "]"
Object             ::= JsonObject | Bare
PropertyLine       ::= "{" Property+ "}"
Property           ::= "." Identifier | "#" Identifier | ArgName "=" Value

Name               ::= "@"? Identifier ("." Identifier | "-" Identifier)*
ArgName            ::= "@"? Identifier ("-" Identifier)*
Identifier         ::= (Letter | "_") (Letter | Digit | "_" | "-")*
Boolean            ::= "true" | "false"
Null               ::= "null"
Number             ::= FiniteJsonNumber
Quoted             ::= JsonString | SingleQuotedString
Bare               ::= NonWhitespaceText
```

Den lexikala prioriteten är fence/literal, escapad markör, direktiv, intervall, block, property och sist vanlig text. Kontrollsyntax känns bara igen vid logisk radstart. Ett pipeline-`|` delar inte citat, listor, objekt eller parenteser. En indenterad continuation är endast giltig direkt efter ett blockhuvud eller föregående continuation; en oindenterad `| ... |` förblir vanlig Markdown-tabelltext. Intervall tar exakt en stage per öppningsmarkör; interval-piping uttrycks genom flera öppna intervall.

`>>>>! include "path"` är den primära lab-syntaxen. Exakta legacyraden `>>>> include "path"` har företräde framför ett block med namnet `include`. Include-alias med `as` är definierat för ett framtida bredare språkprofil men är inte körbart i `parser/lab-v1`.

## Literal- och propertysemantik

- Inuti Markdown-fences med minst tre backticks eller tildes är alla Textabana-markörer literal text.
- `\>>>>` och `\<<<<` vid logisk radstart producerar literal markörtext och exakt escape-backslash tas bort ur renderingen.
- En giltig fristående propertyrad blir en typad `Property`-nod och lämnar en tom rad i source-renderingen.
- En giltig avslutande propertylista, exempelvis `Text {.claim priority=10}`, binds till textnoden och tas bort ur source-renderingen.
- Funktionsoutput parsas aldrig om som Textabana-source. Texten `{.generated}` som returneras av en funktion måste därför bevaras.

## CST, AST, IR och Plan

| Lager | Kontrakt |
|---|---|
| CST | Förlustfri Lezer-projektion av varje lexem och radslut. Interna Lezer-offsets är UTF-16 och exponeras inte. |
| AST | Normaliserat blockträd med typed stages, literalnoder, properties, directives och recovery. Intervall är sekventiella open/close-händelser, inte falsk AST-nesting. |
| IR | Host-neutral, portabel JSON-semantik med block, scopes, segment, directives, source lines, validity och en flat discriminated node-union. `undefined`, funktioner och icke-finita tal är förbjudna. |
| Plan | I Våg 2: observerade stage-invocations efter lyckad exekvering. Varje invocation bär `syntaxStageRef` och `syntaxSpan` tillbaka till IR. |

| Typ | Obligatorisk semantik |
|---|---|
| `Text`, `Blank` | Authored text, rendertext, radslut, scope-/blockmedlemskap och span. |
| `Literal` | Fence- eller escape-klassificerad text som aldrig exekveras som kontrollsyntax. |
| `Property` | Typade attribut, standalone/owner-relation och authored span; producerar ingen stage. |
| `IncludeDirective` | Originalspecifier, dokumentrelativ normaliserad path och legacy-flagga. |
| `ConfigDirective` | Typade configvärden och syntax-stage. Senaste giltiga deklaration vinner i source-ordning. |
| `IntervalOpen`, `IntervalClose` | Gemensamt `scopeId`, authored stage/target och separata open-/close-spans. `@id` är en unik aktiv identifierarsträng och `@order` ett ändligt tal. |
| `Block` | Block-ID, parent, pipeline, inheritance/cross-policy, children och complete/executable. |
| `Recovery` | Stabil recovery kind, actual/expected, diagnostikrelation och alltid `executable=false`. |
| `FunctionStage` | Funktionsnamn, typade argument, engine controls, stage-ID och span. |
| `IntervalInjectionStage` | Endast `@intervals` i en blockpipeline; `only` och `except` är exklusiva listor av scope-namn/@id-referenser, `order` är `asc` eller `desc`. |

`Property` och directives har normalt `executable=false` eftersom de inte är domänanrop; detta gör inte snapshotet ogiltigt. En parser-recovery eller ogiltig stage sätter däremot `validity.executable=false` för hela snapshotet och stänger compile gate. Ägande block/intervall och deras stages markeras också icke-körbara i partial IR.

Varje publik syntax-/IR-nod har ett `sourceSpan`. `start` och `end` är nollbaserade, halvöppna Unicode-code-point-offsets. `startLine`/`endLine` är 1-baserade och kolumnerna är 0-baserade code-point-kolumner. Syntetiska missing-token-noder har ett zero-width-span med `synthetic=true`. En source-backed `Blank`-nod får också vara zero-width men är aldrig syntetisk; dess radslut ägs förlustfritt av den separata `Newline`-terminalen i CST:n.

## Lokal, icke-körbar recovery

| Konstruktion | Recovery kind | Stabil kod |
|---|---|---|
| Tomt eller avslutande pipelineled | `MissingStage` | `TBA-PARSE-MISSING-STAGE-LAB` |
| Ogiltigt/felplacerat stage eller virtuellt stage | `InvalidStage`, `UnknownVirtualStage` | `TBA-PARSE-INVALID-STAGE-LAB`, `TBA-PARSE-VIRTUAL-STAGE-LAB` |
| Ogiltigt eller duplicerat argument | `InvalidArgument`, `DuplicateArgument` | `TBA-PARSE-INVALID-ARGUMENT-LAB`, `TBA-PARSE-DUPLICATE-ARGUMENT-LAB` |
| Icke-portabelt numeriskt värde | `NonFiniteNumber` | `TBA-PARSE-NUMBER-RANGE-LAB` |
| Oavslutat citat eller obalanserad container | `UnterminatedString`, `UnbalancedDelimiter` | `TBA-PARSE-UNTERMINATED-STRING-LAB`, `TBA-PARSE-UNBALANCED-DELIMITER-LAB` |
| Okänd/ogiltig engine control eller cross-policy | `UnknownEngineControl`, control-recovery | `TBA-PARSE-UNKNOWN-CONTROL-LAB`, `TBA-PARSE-INVALID-CONTROL-LAB`, `TBA-PARSE-UNSUPPORTED-CROSS-LAB` |
| Ogiltigt `@intervals` eller flera stages i interval-open | interval-recovery | `TBA-PARSE-INTERVALS-STAGE-LAB`, `TBA-PARSE-INTERVAL-PIPELINE-LAB` |
| Okänt/ogiltigt direktiv eller configvärde | directive/config-recovery | `TBA-PARSE-DIRECTIVE-LAB`, `TBA-PARSE-UNKNOWN-CONFIG-LAB`, `TBA-PARSE-INVALID-CONFIG-LAB` |
| Mismatchad eller malformerad block-close | `MismatchedBlockClose`, `MalformedBlockClose` | `TBA-PARSE-BLOCK-MISMATCH-LAB`, `TBA-PARSE-BLOCK-CLOSE-LAB` |
| Block öppet vid EOF eller close utan block | `MissingBlockClose`, `OrphanBlockClose` | `TBA-PARSE-BLOCK-UNCLOSED-LAB`, `TBA-PARSE-BLOCK-ORPHAN-CLOSE-LAB` |
| Okänd scope-close eller scope öppet vid gräns/EOF | `UnresolvedScopeClose`, `MissingScopeClose` | `TBA-PARSE-SCOPE-UNRESOLVED-LAB`, `TBA-PARSE-SCOPE-UNCLOSED-LAB` |
| Ogiltigt eller duplicerat aktivt scope-id | `InvalidScopeId`, `DuplicateScopeId` | `TBA-PARSE-SCOPE-ID-LAB` |
| Scope korsar block vid `cross=error` | `CrossingScopeClose` | `TBA-PARSE-SCOPE-CROSSING-LAB` |
| Fristående indenterad pipe | `OrphanPipelineContinuation` | `TBA-PARSE-ORPHAN-PIPE-LAB` |
| Ofullständig/ogiltig markör | `MalformedMarker` | `TBA-PARSE-MARKER-LAB` |

En recovery-node har alltid `executable=false`. `diagnosticKey` består av felkod, feltyp, actual/expected och en deterministisk förekomst inom snapshotet. Därför är nycklar unika och består när orelaterade rader flyttar samma fel. `diagnosticId` och `sourceSpan` är bundna till ett bestämt source snapshot.

## Editorprotokollets `analyze`

`textabana.editor-kernel/lab-v1` har det read-only kommandot `analyze`. Det laddar inga moduler och kör inga stages.

| Yta | Fält |
|---|---|
| Request | `type="analyze"`, `requestId`, `documentId` och valfri `documentRevision`/`revision`. Utelämnad revision betyder aktuell head; en angiven stale revision avvisas. |
| Response | Korrelerat `requestId`, `command="analyze"`, status `valid` eller `recovered`, explicit document snapshot och `analysis`. |
| Analysis | `textabana.editor-analysis/lab-v1`, exakt revision/version, `executable`, partial `inspection` och parserdiagnostik. |

Därmed kan en editor visa struktur och fel medan användaren skriver, även innan `run` är meningsfullt.

## Arkitekturbeslut

Lezer valdes framför Tree-sitter. Lezer kör som JavaScript, passar den befintliga CodeMirror-stacken och är gjort för parserträd som förblir tillgängliga under syntaxfel. Tree-sitters webbväg hade krävt separat runtime-Wasm, grammar-Wasm, asynkron initiering och asset-location i hosten. Den genererade Lezer-parsern och runtimekoden buntas i stället till samma klassiska `/runtime-worker.js`, så UI-, hosting- och VM-testkontrakten förblir oförändrade.

Varje `analyze` eller `run` gör fortfarande en full dokumentparse. Den nya pre-transform-grafen använder typed IR men återanvänder ännu inte Lezerträd eller stageoutput; faktisk selektiv invalidering och partiell exekvering hör till senare sprintar i Våg 3.
