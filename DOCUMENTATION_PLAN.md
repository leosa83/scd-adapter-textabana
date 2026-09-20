# Specification — dokumentationssprint 5.10

| Fält | Värde |
|---|---|
| Plan-ID | `TA-SPEC-DOCS-001` |
| Version | `1.0.0` |
| Status | Aktiv |
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
