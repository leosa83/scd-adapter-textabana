# Blocks and intervals

**Block**

Strikt balanserade. Ett inre block ersätts av sitt resultat innan omgivande block körs.

`outer(inner(text))`

**Intervall**

Behöver inte stängas LIFO. Varje maximalt segment med samma aktiva scope-set körs som en enhet.

`ordered(activeScopes)`

### Nästad intervallinvers

Konformitetsfixture · textabana

```textabana
>>>>+ base64encode @id=encoder

>>>>+ base64decode @id=decoder

<base64decode><base64encode> Textabana kan transformera den här texten </base64encode></base64decode>

<<<<+ @id=encoder
<<<<+ @id=decoder
```

Med deklarationsordning stigande körs `base64encode` före `base64decode`. Resultatet blir därför ursprungstexten. Exemplet visar att exekveringsordningen bestäms av scope-ordningen — inte av stängningsordningen.

### Sortering av samtidiga intervall

### Total ordning för aktiva intervall

| Del | Regel | Tie-break |
| --- | --- | --- |
| `explicit @order` | Ett ändligt numeriskt värde har företräde. | Declaration sequence. |
| `utan @order` | Declaration sequence används som ordervärde. | Declaration sequence. |
| `riktning` | Stigande är default; fallande måste anges i config. | Dokumentomfattande konfiguration. |

<a id="SCOPE-001"></a>

> **SCOPE-001** Ett intervall FÅR anropas flera gånger under sin livstid när förändringar i andra aktiva scopes skapar flera maximala segment.

<a id="SCOPE-002"></a>

> **SCOPE-002** Ett explicit `@id` BÖR användas för beständig adressering. Ett genererat id är endast stabilt inom samma dokumentversion.

<a id="SCOPE-003"></a>

> **SCOPE-003** Block MÅSTE vara strikt nästlade. Intervall FÅR överlappa och korsa varandra eftersom de representeras separat från blockträdet.
