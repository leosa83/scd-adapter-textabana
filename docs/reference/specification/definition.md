# Readable text as an executable, position-aware semantic source

Textabana turns readable text into an executable source with multiple output channels, independently of how a host presents the result. It compiles the source into an explicit plan and produces a primary rendered value together with typed outputs.

**Canonical source.** People work in readable text. Control syntax directs execution and is removed from the rendered output.

**Explicit parser chain.** A lossless CST becomes an AST, typed IR and a deterministic execution plan, or locally recovered editor structure that cannot execute.

**Multiple outputs.** `return` builds the primary rendered value. `emit` produces typed channel events without hidden feedback into the pipeline.

**Traceable identity.** Anchors and source maps link results, annotations and data back to versioned source.

Textabana defines the semantic relationships between these parts. Notebook formats, Python kernels, table formats, annotation models and experiment trackers remain external hosts, formats or adapters.

This reference distinguishes target contracts from implemented lab subsets. English translation is in progress; sections marked Swedish preserve their existing normative wording. See the [English migration register](https://github.com/leosa83/scd-adapter-textabana/blob/main/docs/english-migration.md).
