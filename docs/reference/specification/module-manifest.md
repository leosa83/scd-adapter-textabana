# Manifests and functions

### Module Manifest

Normativt schemafragment · json

```json
{
  "schema": "textabana.module-manifest/lab-v1",
  "namespace": "org.example.claims",
  "version": "2.1.0",
  "digest": "sha256:...",
  "entrypoint": "modules/claims.js",
  "functions": [{
      "name": "extract",
      "determinism": "deterministic",
      "state": "run",
      "effects": ["channel:claims"]
  }],
  "capabilities": { "required": ["model:claims-v2"], "channels": ["claims"], "resources": [] }
}
```

### Funktionskontrakt · målmodell

| Fält | Exempel | Konsekvens |
| --- | --- | --- |
| `args` | JSON Schema | Validering före invocation. |
| `accepts / returns` | TextabanaValue constraints | Typed Plan edges. |
| `channels` | Descriptors eller namnpattern | Validerade emissions. |
| `behavior` | segment-preserving · reordering · expanding · reducing · aggregating · generative | Mapping och värdeflöde; aldrig purity-signal. |
| `determinism` | deterministic · seeded · nondeterministic · external | Replay och cachepolicy. |
| `state` | pure · run · session · external | Livslängd och reproducerbarhet. |
| `effects` | channel:* · artifact:* · network · filesystem · model · external | Observerbara effekter och cachegräns. |
| `permissions` | network · filesystem · process · model · secrets | Host grant före init. |

Säkra labbmanifest accepterar `state` som `pure | run | session` och `determinism` som `deterministic | nondeterministic`. Tabellens övriga alternativ och generella args-schemavalidering är målkontrakt. Följ paketprofilen för dagens exakta fält och typer.

<a id="MANIFEST-001"></a>

> **MANIFEST-001** Compiler MÅSTE kunna läsa och validera manifestet utan att exekvera modulens entrypoint.

<a id="MANIFEST-002"></a>

> **MANIFEST-002** Dubbla exports utan namespace eller alias MÅSTE vara compile error.

<a id="MANIFEST-003"></a>

> **MANIFEST-003** State och determinism är separata dimensioner. En stateful funktion kan vara deterministisk, och en stateless funktion kan vara nondeterministisk.

<a id="MANIFEST-004"></a>

> **MANIFEST-004** `behavior` beskriver transformationens form och FÅR INTE tolkas som purity. State, determinism och observerbara effekter MÅSTE deklareras separat; saknad deklaration betyder `unknown` och icke-cachebar.

<a id="MANIFEST-005"></a>

> **MANIFEST-005** En deklaration som `state=pure`, `determinism=deterministic` och `effects=[]` gör endast funktionen till cachekandidat. En host som faktiskt återanvänder output MÅSTE dessutom upprätthålla effektgränsen eller behandla kontraktet som betrott och redovisa den trust boundaryn.

**Nuvarande loadergräns**

JavaScript-labbet verifierar namespace, labbets versionsgrammatik, entrypoint, SHA-256, exakt lockfile, explicita capability grants och entydiga funktionsdeklarationer för alla säkra transporterade paket innan någon entrypoint körs. Versionsgrammatiken är inte full SemVer. Efter `define(...)` jämförs faktiska funktioners state, determinism och effects med manifestet före transform. Grinden begränsar paketauktoritet men gör inte godtycklig JavaScript till en sandbox. Fullt paketexempel och exakta typer finns i [integrationsguiden](https://github.com/leosa83/scd-adapter-textabana/blob/main/docs/INTEGRATION_GUIDE.md) och [paketprofilen](https://github.com/leosa83/scd-adapter-textabana/blob/main/MODULE_ADMISSION_PROFILE.md).
