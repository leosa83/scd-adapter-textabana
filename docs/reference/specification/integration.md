# Integrate the kernel

Ett komplett modulpaket och två körbara värdar visar dokumentets hela livscykel. Exemplen använder repots TypeScript- och Python-klienter mot samma JavaScript-kärna.

### Kör integrationsmaterialet från repots rot

Automatiskt verifierade exempel · bash

```bash
npm run runtime:build
node examples/integration/editor-loop.mjs
python3 examples/integration/python-host.py
node --test tests/documentation.test.mjs
```

Node-exemplet öppnar, analyserar, prenumererar, kör, ger credit, ändrar och kör igen. Det kontrollerar resultatet `HALLÅ 🌊` på revision 2, stale revision, saknad grant och artefaktintegritet. Python-exemplet kör via JSONL och skapar tre MIME-alternativ.

### Värdens ansvar

| Gräns | Aktuellt beteende |
| --- | --- |
| Revisioner och positioner | Vänta på accepterad revision före nästa change/run. Ranges är halvöppna Unicode-code-point-offsets; editorbindningar konverterar UTF-16. |
| Fel och avbrott | Hantera protokollfel och run-diagnostik. Avbrott är kooperativa; värden ansvarar för timeout och återhämtning. |
| Prenumeration och credit | Metadata levereras efter commit. Credit räknar fragment och begränsar leveranstakten; producentens kö saknar generell minneskvot. |
| Livscykel | dispose avregistrerar klienten. Värden stänger transporten separat. Unsubscribe och close-document finns ännu inte. |

[Läs hela integrationsguiden](https://github.com/leosa83/scd-adapter-textabana/blob/main/docs/INTEGRATION_GUIDE.md) för metoder, komplett modul/manifest/låsfil, CLI, CodeMirror, Monaco, Python och felhantering. [Öppna det körbara editorexemplet](https://github.com/leosa83/scd-adapter-textabana/blob/main/examples/integration/editor-loop.mjs). Sidans övriga schemafragment beskriver form och mål; fragment med `...` är inte kompletta körbara paket.
