# Specification — dokumentationssprint 5.10

| Fält | Värde |
|---|---|
| Plan-ID | `TA-SPEC-DOCS-001` |
| Version | `1.0.1` |
| Status | Genomförd · dokumentation och integrationsmaterial |
| Baslinje | Editor Kernel plan 1.14.0, sprint 5.9, GitHub `76c760cf7a6e0169ef790c10b4dd72295c272d3f` |
| Datum | 2026-09-20 |

## Uppdrag

Gör Specification till en sammanhängande ingång till språkets kontrakt, dagens körbara delmängder och integration. Bedöm den uttryckliga riktningen att återanvända Markdown, JSON Schema, Arrow/Parquet, MIME, W3C-modeller och LSP/OTel/OpenLineage/MLflow. Bedömning, standardstöd och testbevis är skilda saker.

## Acceptanskriterier

1. Processmodellen skiljer paketkontroll före startkod från exportkontroll efter startkod och före transform. Metadata-streaming skiljs konsekvent från kontinuerlig stage-streaming.
2. Specification visar en källbunden standardmatris: faktisk användning, avgränsning, referens och återstående arbete. Egna semantiska kontrakt motiveras; egna ersättningar för standarders befintliga ansvar redovisas som skuld.
3. Samtliga krav på sidan ingår i ett spårbart register med kontraktskälla, implementationsreferenser och relevanta verifieringskällor eller explicit verifieringslucka. Referenser innebär inte att ett helt normativt krav är bevisat.
4. Ett komplett modulpaket och en verklig editorloop kan köras från repot. Guiden beskriver revisioner, fel, prenumerationer/credit, klientlivscykel och SDK-bindningarnas gränser. Exempel på kanalresultat och artefaktverifiering ska gå att reproducera.
5. Sidans normativa kontrakt, labbstatus och profildokument har tydlig auktoritet och versionsgräns. Profilrapporter länkas tillsammans med respektive läsbara kontrakt.
6. Riktade kontroller verifierar kravregister, dokumentlänkar och de publicerade exemplens observerbara resultat. Dokumentationskontroller får inte presenteras som full standard- eller produktionskonformitet.
7. Plan och README uppdateras; verifierad källa publiceras till GitHub och befintlig Site.

## Avgränsning

Sprinten ändrar dokumentation, dess spårbarhet och integrationsmaterial. Den inför inte Arrow, Parquet, PROV-, LSP- eller observability-adaptrar och utökar inte runtime-semantik. Identifierade implementationluckor ska finnas kvar som explicita nästa steg, utan simulerat standardstöd.

## Leveranser

- Samstämmig Specification med riktning, status och integrationsingång.
- `docs/STANDARDS_DIRECTION.md`: bedömning och prioriterade avvikelser.
- `docs/INTEGRATION_GUIDE.md`: reproducerbar användning av aktuell kärna och SDK.
- Maskinläsbart kravregister med reproducerbar generering och kontroll.
- Körbara exempel samt dokumenterad verifiering.

## Leverans och verifieringsprotokoll — 2026-09-20

| Acceptans | Levererad evidens |
|---|---|
| Samstämmig status | Processordning, manifest, labbversioner, resultatidentitet, positioner och streaming är harmoniserade i Specification. |
| Standardriktning | `docs/standards-status.json` är gemensam källa för sidans elva standardbedömningar och den genererade matrisen i `docs/STANDARDS_DIRECTION.md`. Bedömningen är partiell standardåteranvändning, med tydliga implementationsluckor. |
| Kravspårning | 144 unika krav, inklusive tre uttryckliga riktlinjer, har underlag i `public/docs/requirements.json`. Källor finns och kraven stämmer med sidan. Ingen full kravkonformitet härleds. |
| Körbar integration | Node/TypeScript, Python/JSONL och CLI kör det kompletta modulpaketet. Revision 2, render, kanalmetadata, credit, stale revision, saknad grant och artefaktintegritet kontrolleras. |
| Auktoritet | Specification skiljer målkrav, labbkontrakt och källbundna rapporter. Nio rapporter länkas tillsammans med läsbara kontrakt. |
| Riktad verifiering | Fem dokumentations-/specifikationskontroller och fyra befintliga UI-komponenttester passerar. Lint och Sites produktionsbygge passerar. En separat serverrendering visar alla 144 expanderbara kravunderlag och de nya navigationsmålen. |
| Plan och publiceringskälla | README och Editor Kernel plan 1.15.0 beskriver sprint 5.10. Samma Git-träd är avsett för GitHub main och den befintliga Sites-sajten; publiceringsresultat redovisas vid leveransen. |

Kontroller: `node scripts/build-specification-docs.mjs --check`, `node --test tests/documentation.test.mjs tests/specification-contract.test.mjs`, `node --test tests/ui-components.test.mjs`, `npm run lint` samt Sites byggverktyg. Hela runtime-sviten och de nio profilrapporterna har inte körts om i denna dokumentationssprint; runtimekällan är oförändrad från den verifierade sprint 5.9-baslinjen. Byggda kärnartefakter förblir oförändrade.

## Kvarstående arbete

- Kanalernas fulla schemavalidering eller en strikt deklarerad deldialekt som avvisar regler den inte kan verkställa.
- Oberoende extern verifiering av en full adapterkedja; därefter Arrow/Parquet och övriga adaptrar utifrån värdbehov.
- Starkare kravspecifik testbevisning än dokumentationsregistrets källkoppling. En länk till en testfil är inte i sig täckning av hela kravet.

Dokumentationsskulden är minskad; implementationsskulden och Våg 5:s kvarvarande produktionskrav är inte avslutade.
