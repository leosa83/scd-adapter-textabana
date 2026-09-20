# Contract sources and requirements

Specification anger målbild och normativa principer. Ett profilanspråk avser bara det versionssatta profilkontraktets uttryckliga delmängd. En körningsrapport visar utfallet för sin bundna källa och sina fixtures.

Vid skillnad mellan en generell formulering här och ett labbkontrakt avgör profilkontraktet vad labbet får hävda. Det sänker inte målkravet. Implementation visar faktiskt beteende; ett testfilnamn eller en länk bevisar inte att hela kravet är uppfyllt.

### Läs kontrakt och rapport tillsammans

| Kontraktskälla | Verifiering |
| --- | --- |
| [TEXTABANA_PARSER.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/TEXTABANA_PARSER.md) | Parser- och kompilatortester i kravunderlaget |
| [conformance/README.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/conformance/README.md) | [Hämta profilrapport](../../../public/conformance/host-report.json) |
| [SEMANTIC_IDENTITY.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/SEMANTIC_IDENTITY.md) | [Hämta profilrapport](../../../public/conformance/semantic-report.json) |
| [SEMANTIC_CONTRACT.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/SEMANTIC_CONTRACT.md) | [Hämta profilrapport](../../../public/conformance/contract-report.json) |
| [TEXT_CORE_PROFILE.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/TEXT_CORE_PROFILE.md) | [Hämta profilrapport](../../../public/conformance/text-core-report.json) |
| [SCOPED_TEXT_PROFILE.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/SCOPED_TEXT_PROFILE.md) | [Hämta profilrapport](../../../public/conformance/scoped-text-report.json) |
| [CHANNEL_CORE_PROFILE.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/CHANNEL_CORE_PROFILE.md) | [Hämta profilrapport](../../../public/conformance/channel-core-report.json) |
| [SOURCE_MAP_CORE_PROFILE.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/SOURCE_MAP_CORE_PROFILE.md) | [Hämta profilrapport](../../../public/conformance/source-map-core-report.json) |
| [MODULE_GATE_PROFILE.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/MODULE_GATE_PROFILE.md) | [Hämta profilrapport](../../../public/conformance/module-gate-report.json) |
| [MODULE_ADMISSION_PROFILE.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/MODULE_ADMISSION_PROFILE.md) | [Hämta profilrapport](../../../public/conformance/module-admission-report.json) |

[Källan till artefaktschemat](https://github.com/leosa83/scd-adapter-textabana/blob/main/contracts/semantic-bundle-v1.js) genererar [JSON Schema 2020-12](../../../public/contracts/semantic-bundle-v1.schema.json). [Verifieringsguiden](https://github.com/leosa83/scd-adapter-textabana/blob/main/conformance/README.md) anger kommandon och anspråksgränser.

Alla 144 krav har ett expanderbart underlag med kontrakt, implementationskälla, relevanta testkällor och begränsning. [Hämta kravregistret](../../../public/docs/requirements.json). Registret kontrollerar täckning och källreferenser; det är ingen fullständig konformitetsrapport.

### Kontrollera dokumentationens spårbarhet

Dokumentationskontroll · bash

```bash
node scripts/build-specification-docs.mjs --check
node --test tests/documentation.test.mjs
```

[Standardbedömning och prioriterade luckor](https://github.com/leosa83/scd-adapter-textabana/blob/main/docs/STANDARDS_DIRECTION.md) · [Integrationsguide](https://github.com/leosa83/scd-adapter-textabana/blob/main/docs/INTEGRATION_GUIDE.md) · [Dokumentationssprintens acceptans](https://github.com/leosa83/scd-adapter-textabana/blob/main/DOCUMENTATION_PLAN.md).
