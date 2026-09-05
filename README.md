# Textabana

Textabana gör läsbar text till en körbar, positionsmedveten och flerkanalig semantisk källa. Samma dokument kan producera en primär render, valfritt många namngivna kanaler samt metadata som förblir knuten till källans positioner.

Den publicerade specifikationen och playgrounden finns på [textpipe-editor.leo-salmonsson.chatgpt.site](https://textpipe-editor.leo-salmonsson.chatgpt.site).

## Playground Labs

Tre interaktiva labs visar olika projektioner av samma worker-run:

- **Language & Scope** — block, öppna intervall, inheritance, scope-segment och faktisk exekveringsordning.
- **Editor Metadata** — `system.out`, row/line, Anchor, SourceMap och jämförelse mellan revisioner.
- **Channel & Result** — deklarerade kanaldeskriptorer, strict validation, global eventtimeline och atomiskt result envelope.

Channel & Result innehåller även en adapterinspektör. Den visar det körbara kontraktet efter core commit utan att starta en separat run.

Fixturepaketet innehåller `scope-torture`, `editor-revision`, `channel-fanout`, `base64-inverse` och `failed-run`.

## Adaptergrund

Sprint 1 i [implementationsplanen](./IMPLEMENTATION_PLAN.md) implementerar `AdapterManifest`, `AdapterProjection` och `AdapterRun`. Alla adaptrar läser samma immutable `TextabanaResult`; deras output ligger i separata projektioner med explicit source-result-bindning, fidelity report, referenser och diagnostik.

`org.textabana.result-summary` är en körbar, deterministisk referensadapter. Data-, notebook- och annotationsprofilerna är registrerade som `contract-only` och räknas ännu inte som implementerade.

## Status

Dokumentationen är **Textabana Language & Interop draft 0.5**. Webbmotorn implementerar uttryckligen avgränsade playground-subsets av `language-core/0.4`, `runtime-json/1`, `editor/1` och `adapter-contract/1`; den gör ännu inte anspråk på full profilkonformitet. UI:t redovisar funktioner som ännu saknas som `contract-only`, `unsupported` eller `planned`.

## Utveckling

Krav: Node.js `>=22.13.0`.

```bash
npm ci
npm test
```

`npm test` bygger siten och kör headless-kontrakt för runtime, fixtures, dokumentation och renderad output.

Viktiga filer:

- `app/specification.tsx` — språk- och interoperabilitetsspecifikation.
- `app/page.tsx` — delad editor, fixtures och playgroundskal.
- `app/playground-labs.tsx` — de tre resultatprojektionerna.
- `public/runtime-worker.js` — parser, modulruntime, kanaler, trace, resultatmodell och post-commit adapterregister.
- `IMPLEMENTATION_PLAN.md` — versionspolicy, sprintar och acceptansgrindar.
- `tests/` — regressioner och fixturekontrakt.
