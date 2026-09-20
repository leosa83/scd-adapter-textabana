# Inheritance

När ett block ligger i aktiva intervall körs dess kompletta blockpipeline först. Blockets output blir därefter input till de ambienta intervallen i scope-ordning. Det är språkets naturliga default.

KälltextBlockpipelineAmbient intervalsOutput

### Inheritance policies

| Policy | Urval | Placering |
| --- | --- | --- |
| `@inherit=default` | Alla ambienta intervall. | Implicit efter hela blockpipelinen. |
| `@inherit=none` | Inga intervall. | Blocket är en isolerad ö. |
| `@inherit=only` | Endast angivna namn eller id:n. | Implicit efter blockpipelinen. |
| `@inherit=except` | Alla utom angivna namn eller id:n. | Implicit efter blockpipelinen. |
| `@inherit=explicit` | Endast explicit valda intervall. | Där varje virtuellt @intervals-steg står. |

### Explicit intervallplacering

Normativ syntax · textabana

```textabana
>>>> extract @inherit=explicit
  | @intervals only=[clean,redaction]
  | summarize sentences=3
  | @intervals only=[translation,provenance]
  | bullet

Text
<<<< extract
```

<a id="INHERIT-001"></a>

> **INHERIT-001** Förekomsten av minst ett `@intervals`-steg MÅSTE stänga av all implicit intervallinjektion för blocket.

<a id="INHERIT-002"></a>

> **INHERIT-002** Urval med funktionsnamn matchar alla aktiva instanser med namnet; urval med `@id` matchar exakt en instans.

<a id="INHERIT-003"></a>

> **INHERIT-003** Inheritance styr hela intervallanropet, inklusive dess returvärde och emissioner. Redan emitterade events får aldrig pipas vidare som text.

### Korsning mellan block och intervall

### Cross policies

| Policy | Algoritm | Status |
| --- | --- | --- |
| `error` | Avvisa partiell korsning före exekvering. | Default 0.3 |
| `split` | Partitionera blocket vid scopegränser och kör blocket per segment. | Definierat 0.4 |
| `promote` | Applicera korsande intervall på hela blockresultatet. | Definierat 0.4 |
| `truncate` | Avsluta intervallets effekt vid blockgränsen. | Definierat 0.4 |
| `preserve` | Kör blocket en gång och applicera scope endast på motsvarande outputsegment via verifierad segmentmap. | Definierat 0.4 |

**Säker mapping**

`preserve` MÅSTE nekas för reducerande eller aggregerande funktioner som inte levererar ett verifierbart mapping proof.
