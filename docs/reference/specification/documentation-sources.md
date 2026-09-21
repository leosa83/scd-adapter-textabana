# Contract sources and requirements

The Specification defines the target model and normative principles. A profile claim covers only the explicit subset of the versioned profile contract. An execution report shows the outcome for its bound source and fixtures.

Where a general statement here differs from a lab contract, the profile contract determines what the lab may claim. This does not weaken the target requirement. Implementation shows actual behavior; a test filename or link does not prove that the whole requirement is satisfied.

### Read the contract and report together

| Contract source | Verification |
| --- | --- |
| [TEXTABANA_PARSER.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/TEXTABANA_PARSER.md) | Parser and compiler tests in the requirement evidence |
| [conformance/README.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/conformance/README.md) | [Download profile report](../../../public/conformance/host-report.json) |
| [SEMANTIC_IDENTITY.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/SEMANTIC_IDENTITY.md) | [Download profile report](../../../public/conformance/semantic-report.json) |
| [SEMANTIC_CONTRACT.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/SEMANTIC_CONTRACT.md) | [Download profile report](../../../public/conformance/contract-report.json) |
| [TEXT_CORE_PROFILE.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/TEXT_CORE_PROFILE.md) | [Download profile report](../../../public/conformance/text-core-report.json) |
| [SCOPED_TEXT_PROFILE.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/SCOPED_TEXT_PROFILE.md) | [Download profile report](../../../public/conformance/scoped-text-report.json) |
| [CHANNEL_CORE_PROFILE.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/CHANNEL_CORE_PROFILE.md) | [Download profile report](../../../public/conformance/channel-core-report.json) |
| [SOURCE_MAP_CORE_PROFILE.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/SOURCE_MAP_CORE_PROFILE.md) | [Download profile report](../../../public/conformance/source-map-core-report.json) |
| [MODULE_GATE_PROFILE.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/MODULE_GATE_PROFILE.md) | [Download profile report](../../../public/conformance/module-gate-report.json) |
| [MODULE_ADMISSION_PROFILE.md](https://github.com/leosa83/scd-adapter-textabana/blob/main/MODULE_ADMISSION_PROFILE.md) | [Download profile report](../../../public/conformance/module-admission-report.json) |

The [artifact schema source](https://github.com/leosa83/scd-adapter-textabana/blob/main/contracts/semantic-bundle-v1.js) generates [JSON Schema 2020-12](../../../public/contracts/semantic-bundle-v1.schema.json). The [verification guide](https://github.com/leosa83/scd-adapter-textabana/blob/main/conformance/README.md) states the commands and claim boundaries.

All 144 requirements have expandable evidence with contracts, implementation sources, relevant test sources and limitations. [Download the requirement index](../../../public/docs/requirements.json). The index checks coverage and source references; it is not a complete conformance report.

### Check documentation traceability

Documentation check · bash

```bash
node scripts/build-specification-docs.mjs --check
node --test tests/documentation.test.mjs
```

[Standards assessment and priority gaps](https://github.com/leosa83/scd-adapter-textabana/blob/main/docs/STANDARDS_DIRECTION.md) · [Integration guide](https://github.com/leosa83/scd-adapter-textabana/blob/main/docs/INTEGRATION_GUIDE.md) · [Documentation sprint acceptance](https://github.com/leosa83/scd-adapter-textabana/blob/main/DOCUMENTATION_PLAN.md).
