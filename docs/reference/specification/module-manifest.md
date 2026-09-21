# Manifests and functions

### Module Manifest

Normative schema fragment · json

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

### Function contract · target model

| Field | Example | Consequence |
| --- | --- | --- |
| `args` | JSON Schema | Validation before invocation. |
| `accepts / returns` | TextabanaValue constraints | Typed Plan edges. |
| `channels` | Descriptors or name patterns | Validated emissions. |
| `behavior` | segment-preserving · reordering · expanding · reducing · aggregating · generative | Mapping and value flow; never a purity signal. |
| `determinism` | deterministic · seeded · nondeterministic · external | Replay and cache policy. |
| `state` | pure · run · session · external | Lifetime and reproducibility. |
| `effects` | channel:* · artifact:* · network · filesystem · model · external | Observable effects and cache boundary. |
| `permissions` | network · filesystem · process · model · secrets | Host grant before initialization. |

Secure lab manifests accept `state` as `pure | run | session` and `determinism` as `deterministic | nondeterministic`. The table's other options and general argument schema validation are target contracts. Follow the package profile for today's exact fields and types.

<a id="MANIFEST-001"></a>

> **MANIFEST-001** The compiler MUST be able to read and validate the manifest without executing the module's entrypoint.

<a id="MANIFEST-002"></a>

> **MANIFEST-002** Duplicate exports without a namespace or alias MUST be a compile error.

<a id="MANIFEST-003"></a>

> **MANIFEST-003** State and determinism are separate dimensions. A stateful function can be deterministic, and a stateless function can be nondeterministic.

<a id="MANIFEST-004"></a>

> **MANIFEST-004** `behavior` describes the transformation's shape and MUST NOT be interpreted as purity. State, determinism and observable effects MUST be declared separately; a missing declaration means `unknown` and non-cacheable.

<a id="MANIFEST-005"></a>

> **MANIFEST-005** A declaration such as `state=pure`, `determinism=deterministic` and `effects=[]` only makes the function a cache candidate. A host that actually reuses output MUST also enforce the effect boundary or treat the contract as trusted and disclose that trust boundary.

**Current loader boundary**

The JavaScript lab verifies the namespace, the lab's version grammar, entrypoint, SHA-256, exact lockfile, explicit capability grants and unambiguous function declarations for every securely transported package before any entrypoint runs. The version grammar is not full SemVer. After `define(...)`, actual functions' state, determinism and effects are compared with the manifest before transform. The gate limits package authority but does not sandbox arbitrary JavaScript. A complete package example and exact types are available in the [integration guide](https://github.com/leosa83/scd-adapter-textabana/blob/main/docs/INTEGRATION_GUIDE.md) and [package profile](https://github.com/leosa83/scd-adapter-textabana/blob/main/MODULE_ADMISSION_PROFILE.md).
