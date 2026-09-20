# Status and norms

Detta dokument skiljer på språkets målkontrakt och den implementerade labbdelmängden. Semantik får inte härledas ur en enskild UI-implementation. Öppna Underlag vid ett krav för dess implementationsgräns och källor. Normativt betyder en regel för det angivna kontraktet, inte att hela regeln är implementerad eller verifierad.

Interop draft 0.7, Language 0.4, labbschemana och implementationsplanens version är olika versionsaxlar. Denna dokumentationsrevision harmoniserar beskrivningen till sprint 5.9 och inför inga nya runtimeförmågor. Se [kontraktskällor och kravregister](./documentation-sources.md).

### Dokumentets två statusdimensioner

| Dimension | Värden | Betydelse |
| --- | --- | --- |
| `Kravstatus` | Normativt · Informativt | Anger om texten definierar konformt beteende eller beskriver en adapter/rekommendation. |
| `Implementation` | Körbar language 0.4-subset · Interaktiv subset · Definierat i draft 0.7 · Contract-only | Anger vad webbplaygrounden faktiskt kör, vad den endast visualiserar delvis och vad som fortfarande är ett kontrakt för kommande implementation. |

**MÅSTE**

Absolut krav för den profil som gör anspråk på konformitet.

**BÖR**

Rekommenderat krav som endast får frångås av dokumenterat skäl.

**FÅR**

Tillåtet val som inte får ändra övrig normativ semantik.

<a id="STATUS-001"></a>

> **STATUS-001** En implementation MÅSTE ange exakt språkversion, IR-version, resultatschemaversion och varje adapterprofil den stödjer.

<a id="STATUS-002"></a>

> **STATUS-002** Stöd för godtycklig JSON eller en liknande funktion är inte tillräckligt för att hävda stöd för en namngiven konformitetsprofil.

<a id="STATUS-003"></a>

> **STATUS-003** Nuvarande Playground implementerar åtta avgränsade vyer: Language & Scope med separata Parser-, Graf- och Körspår-flikar, Editor Kernel, Editor Metadata, Channel & Result, Data & Lineage, Notebook Interop, Annotation & Review och Conformance. Grafvyn visar en pre-transform `textabana.execution-plan/lab-v2`, en typad `textabana.execution-graph/lab-v1`, rådgivande invalidation och en faktisk `textabana.execution-report/lab-v1` med scheduler- och resursrapport. Editor-sessioner kan återanvända en verifierad pure/deterministic/effects-free stageoutput efter två lika observationer i skilda committed revisioner. Oberoende, snapshotbara stages med samma betrodda kontrakt kan överlappa asynkront i en Worker; completionordning påverkar aldrig planordnad trace, cachejournal eller merge. Resultatvyerna läser samma valda run; Editor Kernel visar dessutom revisionskedjan runt den. Conformance Lab producerar en maskinläsbar, run-bunden rapport med härledda subset-anspråk, versionssatt golden snapshot, negativa cases och kooperativ cancellation. `editor-kernel/1` och `annotation/1` är playground-subsets; verklig modellkörning och `ml-lineage/1` är fortsatt contract-only. Ingen interaktiv subset, passerad negativ fixture eller kontraktsregistrering är full profilkonformitet.
