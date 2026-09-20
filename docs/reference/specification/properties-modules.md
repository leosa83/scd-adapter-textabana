# Properties and includes

### Properties

Attributlistor fästs på Markdown-AST-enheter, lagras i IR och försvinner ur renderingen. De exekverar ingenting av sig själva.

### Lättviktig semantik

Illustrativt · markdown + textabana

```markdown + textabana
Den centrala slutsatsen.

{.claim .verified priority=10 confidence=0.94}

## Evidens {.evidence source="PARES"}
```

**Alias är språksemantik, inte playgroundsemantik**

Draft 0.7 definierar `as alias`, men `textabana.parser/lab-v1` kör endast `>>>>! include "path"`. Exakta legacyraden `>>>> include "path"` stöds utan alias och har företräde framför ett block med namnet `include`.

### Includes

Skriptning är include-baserad. Compiler löser först en modulgraf och initierar därefter varje unik modul enligt vald run-profil.

### Modulimport med alias

0.4-defined · textabana

```textabana
>>>>! include "pkg:textabana/claims@2" as claims
>>>>! include "./modules/redaction.py" as privacy

>>>> claims.extract
Text
<<<< claims.extract
```

<a id="PROPERTY-001"></a>

> **PROPERTY-001** `@order` ordnar funktioner. En property som `priority` påverkar endast ordning om en uttrycklig funktion läser den.

<a id="MODULE-001"></a>

> **MODULE-001** Compiler MÅSTE normalisera URI:er, bygga en DAG, upptäcka cykler och exportkollisioner samt pinna resolved URI, version och SHA-256 innan modulkod körs.

<a id="MODULE-002"></a>

> **MODULE-002** Samma normaliserade URI och digest identifierar samma modulinstans. Modulen initieras en gång per fresh run, eller en gång per namngiven session i sessionprofilen.

<a id="MODULE-003"></a>

> **MODULE-003** Cache FÅR inte ändra semantik. Återanvänd sessionstate, modulbyte eller nondeterministisk replay MÅSTE framgå av proveniens.
