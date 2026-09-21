# Textabana host SDKs

These source clients embed the repository's JavaScript kernel in browser, editor, Node and Python hosts. They are not yet separately published packages.

- [API reference](../docs/reference/sdk.md): signatures, responses, lifecycle and failures.
- [Integration guide](../docs/INTEGRATION_GUIDE.md): complete editor and notebook-host examples.
- [TypeScript exports](typescript/index.ts): client, transport types and CodeMirror/Monaco bindings.
- [Node transport](node/transport.mjs): generated kernel in a worker thread.
- [Python exports](python/__init__.py): callback client and committed-result MIME projection.

Run `npm run runtime:build` before using the Node transport or JSONL host. The host owns the transport and accepted revision; clients correlate messages. Dispose the client before closing the transport. Public response types and package distribution remain part of the [consolidation plan](../CONSOLIDATION_PLAN.md).
