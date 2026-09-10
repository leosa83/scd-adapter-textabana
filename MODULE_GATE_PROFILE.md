# Textabana module gate — lab profile v1

Profile `textabana.module-gate/lab-v1`, version `1.0.0`, verifies the existing JavaScript kernel's secure-package gate. It is a reproducible external suite, **not an independent module evaluator, a security sandbox or full production conformance**. It complements the independent text, interval, channel and source-position profiles without expanding their claims.

```sh
node cli/textabana.mjs conformance-module-gate > module-gate-report.json
```

## What is checked

The 54 frozen cases transport a fixed trusted module and a fixed document through the actual built Worker. Module start code increments an observable counter before declaring its function. A paired throwing module demonstrates that valid metadata reaches start code while a duplicated declaration is rejected before that code runs. Each case pins the complete input and expected output, exact error code, commit status, start-code count and transform invocation count.

The runner creates a fresh VM context for each case. This is an observation harness around the actual Worker, not a second runtime or protection against untrusted JavaScript. Only manifest-pinned fixture code is executed by the CLI. Do not expose the low-level case runner to untrusted inputs.

## Secure-package order

1. A supplied module lock, manifest or transport digest activates secure-package verification. The legacy path with none of those inputs is unchanged and is not certified by this profile.
2. Require `textabana.module-lock/lab-v1` and a packages array. Every lock entry must be an object with nonblank string namespace, version, entrypoint and digest. Reject duplicate package identities before examining module start code.
3. For every transported package, require an object manifest with schema `textabana.module-manifest/lab-v1`. Namespace and version must be strings matching the existing lab patterns. Namespace is lowercase dotted segments; version is digits.digits.digits with an optional alphanumeric/dot/hyphen prerelease. This is **not strict SemVer**: for example `01.0.0` remains accepted. Transported package identities must be unique.
4. Manifest entrypoint must be a nonblank string matching the normalized transport path. SHA-256 of the exact UTF-8 module content must match both transport and manifest digests. Its lock entry must match identity, digest and normalized entrypoint. Relative path normalization remains the kernel's existing behavior.
5. Capabilities must contain `required`, `channels` and `resources` arrays of nonblank strings. Every required capability must have an explicit grant; channel/resource requirements use the respective `channel:` and `resource:` prefixes. No new grants are created by validation.
6. Functions must be an array of objects. Each name is a nonblank string and must be unique by exact, case-sensitive value. State must be `pure`, `run` or `session`; determinism must be `deterministic` or `nondeterministic`; effects must be an array of nonblank strings. Empty function/effect lists are structurally permitted. Duplicated names, including contradictory duplicate declarations, are rejected before start code.
7. Reject lock entries for packages absent from the transport. Only after package verification does normal parsing and module loading proceed.
8. After loading, check the actual export set and every function's state, determinism and ordered effects against its manifest before any transform. A structurally valid but incorrect export contract therefore has one observed start-code execution but zero transform invocations in this suite.

Blank means empty after JavaScript trimming; accepted strings are not otherwise trimmed or renamed. Namespaces identify packages, not qualified function registries. Duplicate effect/capability strings are not prohibited by this change. An unused transported package is still verified; general include dependency graphs and multi-package runtime interoperability are outside this fixed suite.

## Failures and observable state

Expected package diagnostics are `TBA-MODULE-LOCK-LAB`, `TBA-MODULE-MANIFEST-LAB`, `TBA-MODULE-IDENTITY-LAB`, `TBA-MODULE-DUPLICATE-LAB`, `TBA-MODULE-ENTRYPOINT-LAB`, `TBA-MODULE-DIGEST-LAB`, `TBA-MODULE-CAPABILITIES-LAB`, `TBA-MODULE-GRANT-LAB` and `TBA-MODULE-FUNCTION-CONTRACT-LAB`. The intentional start-code exception yields `TBA-RUN-LAB`. The fixture's exact diagnostic and observed counters must match; an unrelated exception cannot satisfy a negative case.

Failed runs must have no commit, render, channel snapshots, channel descriptors, anchors, source maps or committed provenance activities. The runner checks the actual host and Result fields before projection. Successful controls render `HELLO` followed by LF and invoke the fixed transform once. Start-code and transform counts distinguish pre-load rejection, post-load contract rejection and successful execution.

Atomic Result rollback does **not** undo arbitrary external effects of module start code. The post-load mismatch cases intentionally record that start code ran. Capability grants are a package admission mechanism, not an enforceable JavaScript sandbox. This suite neither authenticates a publisher nor proves arbitrary module code safe. The fixed synchronous fixtures do not test asynchronous module side effects, cancellation or nonterminating code.

## Reproducibility and scope

The manifest pins all 54 inputs and expectations and this specification. The report fingerprints the runner, source and generated Worker, parser, execution graph, canonical serializer and dependency lockfile, and verifies that those bytes remain stable during the suite. Node's reported version is included as environment information; fingerprints do not cryptographically attest the operating system or VM. Tampering with only the expected start-code count invalidates the suite manifest before any module executes.

Only a fully passing suite may set `claimable` for this lab profile. `independentImplementations`, `canonicalRuntime`, `semanticArtifactEquivalence`, `fullProfileConformance` and `javascriptSandbox` always remain false. A published report represents its recorded source snapshot, not a live check of the edited Playground document. Reports remain unsigned until a release-signing identity is configured.

Further work includes independent package/loader semantics, broader dependency and module-ABI coverage, production schemas/policies, full provenance and editor/cache interoperability, release signing and a published registry service. Wave 5 remains active.
