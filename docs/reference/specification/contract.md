# Semantic contract

Följande invariants är ryggraden i språket. En optimering, adapter eller framtida syntax får inte bryta dem.

1. 01Källsnapshoten är immutable och versionerad.
2. 02Kontrollsyntax syns inte i renderingen, utom när den uttryckligen escapats som literal text.
3. 03Block är balanserade träd; intervall är ordnade aktiva scope-mängder och inte ett falskt träd.
4. 04Samma deterministiska inputs och plan ger samma värde, eventinnehåll och eventordning.
5. 05Default är `block output → ambient interval input`, exakt en gång vid blockgränsen.
6. 06Ett explicit `@intervals`-steg innebär att ingen implicit intervallinjektion sker.
7. 07`return` påverkar primär pipeline; `emit` påverkar endast en sidokanal.
8. 08Inheritance omfattar hela funktionsanropet: både returvärde och emissioner.
9. 09Kanaler är append-only inom en run och läses aldrig implicit av samma pipeline.
10. 10Global `sequence` är unik, monoton och härledd ur planen — aldrig ur väggklockan.
11. 11Commit är atomisk. `tentative` är inte samma sak som durable output.
12. 12Beständiga positioner binds till dokumentversion och Anchor; row och line är projektioner.
13. 13`mapping=exact` kräver verifierbar output–input-relation.
14. 14Manifest, digest och kapabiliteter löses före modulkod exekveras.
15. 15Stora eller binära resultat refereras som artifacts i stället för att bäddas in i kontrollplanet.
16. 16Hemligheter serialiseras aldrig i source, IR, events, resultat eller loggar.
17. 17Hela source snapshot parsas före modulinitiering. Recovery är synlig för editorn men aldrig körbar.
