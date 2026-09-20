# Integrera Textabana från den körbara källan

Guide för `textabana.editor-kernel/lab-v1`, modulpaket `lab-v1` och sprint 5.9:s runtime. SDK:erna finns i repot; inget separat publicerat npm-/PyPI-paket förutsätts. Klienterna transporterar meddelanden till samma JavaScript-kärna. De fristående Python-referensruntimerna är andra, smalare konformitetsprofiler.

## Förbered och kör hela exemplet

Från repots rot med installerade låsta dependencies, Node enligt `package.json` och Python 3:

```sh
npm run runtime:build
node examples/integration/editor-loop.mjs
python3 examples/integration/python-host.py
```

Node-exemplet kompilerar den faktiska TypeScript-klienten med projektets befintliga esbuild. Det öppnar ett dokument, analyserar, prenumererar, kör, ger credit, ändrar källan, kör igen och verifierar att en gammal revision och saknad grant avvisas. Det avslutar både klient och transport även vid fel. Förväntat slutresultat är revision 2, `HALLÅ 🌊\n`, ett levererat metadatafragment och ett verifierat artefaktpaket. Python-exemplet använder den faktiska Python-klienten och JSONL-transporten och producerar tre MIME-alternativ för `HEJ 🌊\n`; det startar ingen Jupyter-kernel.

## Komplett modul, manifest och låsning

De körbara källorna är [modulen](../examples/integration/module.js), [dokumentet](../examples/integration/document.md) och [paketbyggaren](../examples/integration/package.mjs). Paketbyggaren beräknar SHA-256 över exakt de UTF-8-bytes som transporteras och producerar en komplett `modules`-array och `options`.

```sh
mkdir -p outputs/docs
node examples/integration/package.mjs > outputs/docs/modules.json
node cli/textabana.mjs run examples/integration/document.md outputs/docs/modules.json > outputs/docs/run.json
node cli/textabana.mjs identify examples/integration/document.md outputs/docs/modules.json > outputs/docs/identity.json
node cli/textabana.mjs verify-identity outputs/docs/identity.json
```

Modulens `documented_upper` returnerar versaler och emitterar en `docs.metrics`-payload med antalet Unicode code points. Samma anrop skapar båda. Funktionens effekt är `channel:docs.metrics`, därför är den inte en ren cachekandidat.

| Del | Bindning |
|---|---|
| Transport | `path`, exakta `content`, `digest`, `manifest` |
| Manifest | `textabana.module-manifest/lab-v1`, namespace, version, entrypoint, digest, functions, capabilities |
| Låsfil | `options.moduleLock.schema = textabana.module-lock/lab-v1`; `packages` låser samma namespace/version, entrypoint och digest |
| Grant | `options.capabilityGrants` innehåller `channel:docs.metrics` |
| Deklaration | `state=run`, `determinism=deterministic`, `effects=["channel:docs.metrics"]` matchar modulens faktiska export |

Alla transporterade säkra paket kontrolleras före någon startkod, även oanvända och senare paket. Syntaxgrinden passerar också före modulstart. Efter laddning jämförs faktiska exports med manifestet före transform. Ett godkänt paketbeslut betyder inte att exportkontroll eller körning lyckas, och ger ingen JavaScript-sandbox. Legacy-paket utan låsning/manifest/digest har en separat äldre väg. Exakta regler och felordning finns i [MODULE_ADMISSION_PROFILE.md](../MODULE_ADMISSION_PROFILE.md) och [MODULE_GATE_PROFILE.md](../MODULE_GATE_PROFILE.md). Versionens labbgrammatik är inte full SemVer.

Includes löses relativt dokumentets protokollsökväg. Därför öppnar alla exempel `examples/integration/document.md` och transporterar modulen som `examples/integration/module.js`; `./module.js` i dokumentet måste lösa till exakt samma sökväg som manifest och låsfil.

## TypeScript och browserhost

[TextabanaKernelClient](../sdk/typescript/client.ts) accepterar en transport med `postMessage`, `addEventListener` och `removeEventListener`. En browser-Worker kan användas direkt när värden serverar den byggda `public/runtime-worker.js`. Paketet nedan avser samma `modules`/`options` som paketbyggaren ovan producerar; värden ansvarar för inläsningen.

```js
import { TextabanaKernelClient } from "./sdk/typescript/client";
const worker = new Worker("/runtime-worker.js");
const client = new TextabanaKernelClient(worker);
// const source = ...; const pkg = ...; läs dokument och paket före open.
try {
  const opened = await client.open("my-doc", "examples/integration/document.md", source);
  let revision = opened.document.documentRevision;
  const analyzed = await client.analyze("my-doc", revision);
  // Kör endast om analyzed.analysis.executable är true.
  const result = await client.run("my-doc", revision, 1, pkg.modules, pkg.options);
  // result.output är text; result.resultEnvelope är det committade kontraktet.
  const changed = await client.change("my-doc", revision, [
    { range: { from: 0, to: 0 }, insert: "Rubrik\n" },
  ]);
  revision = changed.document.documentRevision;
} finally {
  client.dispose();
  worker.terminate();
}
```

Browserfragmentet visar livscykeln och förutsätter värdens paketinläsning och typning av svar. Det fristående Node-exemplet är det kompletta, automatiskt körda exemplet. SDK-svar är `unknown` som standard; ange en egen kontrollerad svarstyp via `command<T>` eller validera svaret vid värdgränsen. Ingen full genererad protokolltypning påstås.

## Metoder, fel och revisioner

| Metod | Observerbart kontrakt |
|---|---|
| `open(id, path, source)` | Vänta på `response.document.documentRevision`; identisk open kan vara idempotent. Reset görs via `command("open", {document: ..., replaceSession: true})`. |
| `change(id, baseRevision, changes)` | Alla ranges avser samma bas, är sorterade, icke-överlappande och räknas i Unicode code points. Uppdatera lokal revision först från svaret. |
| `analyze(id, revision)` | Read-only parserprodukt; partial IR och diagnostik även för ofullständig text. Inga stages körs. |
| `run(id, revision, runId, modules, options)` | Fångar exakt revision. Läs `resultEnvelope.run.committed` och diagnostik, inte bara texten. |
| `subscribe(id, subscriptionId, channels, initialCredit)` | SDK-metoden väljer stream-läge; noll credit betyder ingen fragmentleverans. Registrera `onChunk` före körning. |
| `credit(subscriptionId, n)` | 1–1024 nya leveransenheter. Enheten är ett metadatafragment, inte ett event eller en hel revision. Läs fragmentens cursor/sequence/total/done. |
| `exportCache` / `importCache` | Explicit host-checkpoint. Hosten lagrar det; import kräver att körningar inte är aktiva/köade. |
| `cancel(runId)` | TypeScript-hjälparen skickar utan att invänta kvittens. Vänta på den pågående körningens terminalutfall; avbrott är kooperativt. |
| `dispose()` | Tar bort lyssnare och avvisar väntande klientanrop. Avslutar inte Workern eller kärnans dokument. Hosten måste stänga transporten separat. |

`KernelCommandError.response` innehåller det korrelerade felsvaret. Protokollfel kan finnas i `error.code`, körningsfel i `diagnostics`. Efter stale revision: återläs/resynkronisera dokumentet innan fler ändringar. TypeScript-klienten har ingen inbyggd generell anropstimeout; värden ansvarar för timeout, transportfel och återhämtning.

Streamleverans sker **efter commit**. Credit styr leveranstakten och förhindrar inte i sig att producentens kö växer. Nuvarande implementation har ingen generell kö-/minneskvot, persistent cursor eller unsubscribe-/close-document-kommando. `onChunk` returnerar en lokal avregistrering; den tar inte bort kärnans prenumeration. Kontinuerlig stage-streaming är fortfarande planerad.

## CodeMirror och Monaco

[codeMirrorTextabanaBinding](../sdk/typescript/codemirror.ts) tar klient, dokument-id, en funktion som läser senast accepterad revision och en callback för accepterat svar. Bind den till värdens uppdateringslyssnare, uppdatera revision i callback och hantera den returnerade Promise-rejektionen. En avvisad ändring stoppar dess kö; resynkronisera och skapa en ny bindning. Den bygger ingen editor åt värden.

[applyMonacoChanges](../sdk/typescript/monaco.ts) kräver modellen **före** ändringen samt ändringarnas `rangeOffset`, `rangeLength` och `text`. Skicka inte redan uppdaterad modell som bas. Serialisera förändringar mot accepterade revisioner. Båda bindningarna översätter UTF-16-offsets till code points. De är inte LSP-adaptrar och ger inte OT/CRDT.

## Python, MIME och verifiering

[Python-klienten](../sdk/python/textabana_client.py) är callback-baserad: värden levererar inkommande meddelanden till `receive` och hanterar `ok=false` i callback. Använd `command` för övriga protokollkommandon. [Det kompletta Python-exemplet](../examples/integration/python-host.py) visar transport och stängning med en lokal JSONL-process på POSIX; andra värdar kan använda egen transport. Det gör inget anspråk på ett fristående Python-ekvivalent språk.

`jupyter_mime_bundle` accepterar endast committade resultat. MIME-bundlen kan skickas som `display_data` av en riktig Jupyterhost; hjälparen implementerar inte själv Messaging, kernels eller nbformat.

`verify-identity` verifierar schema, referenser och integritet i det exporterade paketet. Den kör inte om transformationerna. Se [artefaktkontraktet](../SEMANTIC_CONTRACT.md) och [verifieringskommandona](../conformance/README.md). Läs [standardbedömningen](./STANDARDS_DIRECTION.md) före anspråk på full JSON Schema-, notebook-, data- eller provenienskonformitet.
