# Integrate the kernel

A complete module package and two executable hosts demonstrate the document's full lifecycle. The examples use the repository's TypeScript and Python clients against the same JavaScript kernel.

### Run the integration examples from the repository root

Automatically verified examples · bash

```bash
npm run runtime:build
node examples/integration/editor-loop.mjs
python3 examples/integration/python-host.py
node --test tests/documentation.test.mjs
```

The Node example opens, analyzes, subscribes, runs, grants credit, changes and runs again. It checks the result `HALLÅ 🌊` at revision 2, stale revision, missing grant and artifact integrity. The Python example runs through JSONL and creates three MIME alternatives.

### Host responsibilities

| Boundary | Current behavior |
| --- | --- |
| Revisions and positions | Wait for the accepted revision before the next change/run. Ranges are half-open Unicode code point offsets; editor bindings convert UTF-16. |
| Errors and cancellation | Handle protocol errors and run diagnostics. Cancellation is cooperative; the host owns timeouts and recovery. |
| Subscription and credit | Metadata is delivered after commit. Credit counts chunks and limits delivery rate; the producer queue has no general memory quota. |
| Lifecycle | dispose unregisters the client. The host closes the transport separately. Unsubscribe and close-document do not yet exist. |

Read the [complete integration guide](https://github.com/leosa83/scd-adapter-textabana/blob/main/docs/INTEGRATION_GUIDE.md) for methods, a complete module/manifest/lockfile, CLI, CodeMirror, Monaco, Python and error handling. Open the [executable editor example](https://github.com/leosa83/scd-adapter-textabana/blob/main/examples/integration/editor-loop.mjs). Other schema fragments on this page describe structure and targets; fragments containing `...` are not complete executable packages.
