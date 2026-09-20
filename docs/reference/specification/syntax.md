# Parser, syntax and recovery

Modaliteten är synlig direkt i texten. En versionssatt Lezer-parser producerar först en förlustfri CST; Textabana sänker den därefter till AST och typed IR. Samma parseprodukt styr include-resolution, inspektion och exekvering.

### Markörfamiljer

| Markör | Roll | Krav |
| --- | --- | --- |
| `>>>>!` | Direktiv | Påverkar compilation; producerar inget värde. |
| `>>>>` | Öppna block | MÅSTE stängas strukturellt. |
| `<<<<` | Stäng block | MÅSTE matcha öppningens första funktionsnamn. |
| `>>>>+` | Aktivera intervall | Lägger till en identifierbar scope-instans. |
| `<<<<+` | Avaktivera intervall | Stänger exakt @id eller senast öppnade aktiva instans med namnet. |
| `\|` | Pipeline | Kör steg vänster till höger. |
| `{ ... }` | Properties | Fäster metadata på en Markdown-AST-enhet. |
| `\>>>>` | Escapad markör | Blir literal text; exakt escape-backslash tas bort. |
| ``````` / ~~~```` | Literal fence | Kontrollmarkörer inuti Markdown-fence tolkas aldrig. |

### Alla syntaktiska ytor

Normativ syntax · textabana

```textabana
>>>>! include "./modules/core.js"
>>>>! config scope-order="declaration:asc"

>>>>+ normalize @id=clean @order=10

>>>> summarize sentences=2
  | tag class="abstract"

Text {.claim priority=10}
<<<< summarize

<<<<+ @id=clean
```

### Körbar EBNF · förenklat kärnfragment

Parser lab-v1 · ebnf

```ebnf
Document      ::= Item*
Item          ::= Fence | EscapedMarker | Directive | Block | IntervalOpen | IntervalClose | Property | Text
Block         ::= BlockHeader Item* BlockClose
BlockHeader   ::= '>>>>' Pipeline Continuation*
IntervalOpen  ::= '>>>>+' Stage
IntervalClose ::= '<<<<+' ('@id=' Identifier | Name)
Pipeline      ::= Stage ('|' Stage)*
Continuation  ::= Indent '|' Stage ('|' Stage)*
Stage         ::= Name Argument*
Argument      ::= ArgName ('=' Value)?
```

**Funktionsargument**

`sentences=2` och andra vanliga argument typas av parsern och skickas till funktionen. Validering mot funktionens fulla JSON Schema är definierad men ännu inte körbar i labbet.

**Engine controls**

`@id`, `@order`, `@inherit` och `@cross` styr motorn och skickas inte som funktionsargument. Parsern kräver identifierarsträng, ändligt tal respektive uttryckliga policysträngar utan JavaScript-koercion.

**Literal syntax**

Markörer känns endast igen vid logisk radstart utanför fenced code. U+005C före markören gör raden literal; genererad output parsas aldrig om.

**Kommentarer**

Språket definierar ingen fristående `//`-kommentar. Prosa eller en framtida explicit directive ska användas.

**Recovery är editorstruktur, inte tolererad exekvering**

Ofullständig syntax ger lokala `Recovery`-noder med stabil kod och exakt span. Giltiga syskon finns kvar i CST/AST/IR, men varje error-level recovery blockerar modulinitiering, Plan och domänexekvering för hela snapshoten.

**Varför Lezer — och varför ingen Worker-migrering**

Lezer är JavaScript-native, editororienterat och byggt för syntaxträd under pågående fel. Tree-sitters webbväg hade krävt separat runtime-Wasm, grammar-Wasm och asynkron assetladdning. Parsern genereras därför offline och buntas i samma klassiska `/runtime-worker.js`; Lezer-trädet förblir intern CST och blir aldrig publikt IR-schema.

<a id="SYNTAX-001"></a>

> **SYNTAX-001** Kontrollrader, stängningsrader och fristående propertyrader MÅSTE avlägsnas från primär render.

<a id="SYNTAX-002"></a>

> **SYNTAX-002** Okända engine controls MÅSTE ge kompileringsdiagnostik; de får inte tyst skickas vidare till funktionen.

<a id="PARSE-001"></a>

> **PARSE-001** Samma source snapshot och grammar version MÅSTE deterministiskt ge samma CST, diagnostikkoder och recovery kinds.

<a id="PARSE-002"></a>

> **PARSE-002** Recovery MÅSTE behålla exakt authored span eller en explicit zero-width missing-token-position. Den får aldrig fabricera en körbar opener, close eller stage.

<a id="PARSE-003"></a>

> **PARSE-003** Varje error-level recovery MÅSTE blockera modulinitiering och domänexekvering men partial CST, AST, IR och diagnostik MÅSTE fortfarande kunna levereras till editorn.
