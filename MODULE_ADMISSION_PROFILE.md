# Textabana module admission — lab profile v1

Profile `textabana.module-admission/lab-v1`, version `1.0.0`, compares **package preflight decisions** between the actual JavaScript Worker and a standalone Python implementation. Python hashes source bytes and checks metadata; it never evaluates module code, invokes Node or imports a JavaScript validator. Independence is limited to this admission contract. Module execution, export verification, dependency loading and sandboxing are outside the independent claim.

```sh
node cli/textabana.mjs conformance-module-admission > module-admission-report.json
python3 -I reference/module_admission.py run package-input.json
```

## Inputs and decision

The frozen suite contains 72 inputs and explicit expectations: 54 reuse the previous module gate scenarios as full copies, and 18 cover path normalization, grant conversion, Unicode, whitespace and later invalid packages. Each input has a `modules` array of records with well-formed Unicode string `path` and `content`, and an `options` object. At least one secure-package signal is present. The document and synchronous JavaScript source are trusted probes pinned by the suite manifest. The JavaScript CLI cannot execute a modified suite without failing that manifest check first.

The common output is exactly `{ "admitted": boolean, "error": string|null }`. Admission means package preflight passed; it does **not** mean exports match, a transform succeeded, the code is safe or the publisher is trusted. Expected diagnostics are compared exactly. No catch-all exception counts as rejection.

Python accepts `run` with one JSON input file (exit 0 for admitted, 1 for rejected), or `batch` with `{ "inputs": [...] }` on stdin (exit 0 after returning all decisions). Malformed/out-of-domain input fails with exit 2, without a conformance decision. Duplicate JSON keys and non-JSON constants are rejected. Non-array grants mean no grants. Array grants in this profile contain strings, null, booleans or safe integers, converted to their ECMAScript string forms (`null`, `true`, `false`, base-ten integer). Fractional numbers, objects and nested arrays as grants are outside this profile; this does not change the legacy Worker's wider coercion behavior.

## Normative admission rules, in order

1. Require an object lock with schema `textabana.module-lock/lab-v1` and `packages` array. Every lock entry is an object with nonblank string namespace, version, entrypoint and digest. The existing lab identity key is literal `namespace + "@" + version`; duplicate keys, including ambiguous malformed components, fail with `TBA-MODULE-LOCK-LAB`.
2. Process **all transported packages in order**, including unused ones. Require an object manifest with schema `textabana.module-manifest/lab-v1` (`TBA-MODULE-MANIFEST-LAB`). Namespace matches `[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+` and version matches `[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?` across the entire string (`TBA-MODULE-IDENTITY-LAB`). This is the existing lab grammar, not strict SemVer. Reject repeated namespace/version identities (`TBA-MODULE-DUPLICATE-LAB`).
3. Require a nonblank manifest entrypoint equal to the normalized transport path (`TBA-MODULE-ENTRYPOINT-LAB`). For local paths, split on `/`, discard empty and `.` segments, and pop one previous segment for `..` when available. Leading slashes and excess root parents contribute no segments. Backslash is an ordinary character. Paths beginning with lowercase `http:`, `https:`, `data:` or `blob:` remain unchanged. This lexical normalization grants no filesystem or network access.
4. Compute SHA-256 over exact UTF-8 content without newline or Unicode normalization. Require the prefixed lowercase `sha256:<hex>` value to equal both transport and manifest digest (`TBA-MODULE-DIGEST-LAB`). Require the lock entry for that identity to match this digest and normalized transport path (`TBA-MODULE-LOCK-LAB`).
5. Require a capabilities object with `required`, `channels` and `resources` arrays of nonblank strings (`TBA-MODULE-CAPABILITIES-LAB`). Required names must occur in the grant set, with channel/resource requirements prefixed `channel:` and `resource:` (`TBA-MODULE-GRANT-LAB`). Duplicated requirements are permitted. No grant is inferred from a declaration.
6. Require a functions array. Each record has a nonblank string name, state `pure`/`run`/`session`, determinism `deterministic`/`nondeterministic`, and an effects array of nonblank strings. Names must be unique by exact case-sensitive comparison (`TBA-MODULE-FUNCTION-CONTRACT-LAB`). Empty function/effect arrays and duplicated effect strings are structurally permitted. This step does not examine actual exports.
7. After all packages, the lock may not contain additional identities (`TBA-MODULE-LOCK-LAB`). Only then is admission successful.

Nonblank uses ECMAScript WhiteSpace and LineTerminator trimming, including U+FEFF and excluding U+0085. Other characters, case and whitespace are preserved. Python implements this set explicitly; its default `strip()` is not equivalent. Package identities are separate from function names. This profile does not qualify exports by namespace or expand accepted runtime behavior.

## Observing the actual Worker

Every potentially loaded probe increments a counter as its first statement. A fresh VM hosts the actual built Worker for each fixture. Zero entries with a recognized package diagnostic and zero transforms proves rejection for these pinned probes. One entry proves admission, even when a subsequent export check or an intentional start-code exception fails the run. All complete Worker observations (output, diagnostic, commit, entries and transforms) also have frozen expectations and are reported separately from the independent decision.

The two later-package cases give the first package valid metadata (including one deliberately throwing entrypoint), then supply a second invalid package. Zero observed entries verifies that all package metadata is checked before the first module starts. This is not a test of an arbitrary dependency graph or a general module loader.

The shared Worker harness validates atomic failed Results before projecting them: no render, channels, descriptors, anchors, source maps, snapshots or committed provenance activities. Result rollback does not undo arbitrary external effects of code that already started. A Node VM is an observation harness, not a security sandbox. Never expose the low-level JavaScript case runner to untrusted inputs.

## Evidence and limits

The manifest binds all 72 inputs, independent decision expectations, complete Worker expectations and this specification. SHA-256 fingerprints bind Python, runners, actual Worker and its relevant source files, parser, serializer and dependency lockfile; they must remain stable during the suite. Both implementations must match all explicit decisions, and all Worker observations must match. Missing Python, changed expectations or partial failed Results fail closed. The standalone test copies the single Python file into an otherwise empty directory and checks the entire corpus with an empty PATH, without Node or repository imports.

Only a fully passing suite may set `claimable` and `independentImplementations` for this narrow profile. `independentModuleExecution`, `canonicalRuntime`, `semanticArtifactEquivalence`, `fullProfileConformance` and `javascriptSandbox` always remain false. The separate module-gate report remains a single-implementation report. Reports describe their recorded source snapshot, not the currently edited Playground document, and remain unsigned without a configured release identity.

Legacy unsecured packages, arbitrary module execution, dependency resolution, export/ABI equivalence, host coercions outside the input domain, asynchronous side effects, cancellation, resource isolation, production policies, release identity and registry hosting remain open. Wave 5 remains active.
