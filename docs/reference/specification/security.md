# Security

Running a module in a Worker, kernel or container does not automatically make it safe. Textabana separates declared needs from the host's explicit grant.

**Before initialization**

Verify digest/signature, lock, runtime, capability subset, quotas and URI policy.

**During the run**

Isolate untrusted code, limit CPU/memory/output, propagate cancellation and control network/filesystem access.

**After the run**

Sanitize active MIME, classify channels/artifacts and apply retention before delivery.

<a id="SECURITY-001"></a>

> **SECURITY-001** No module has an implicit right to filesystem, network, process, model or secrets. The host may grant only a declared subset.

<a id="SECURITY-002"></a>

> **SECURITY-002** Secrets MUST be injected as opaque handles and can never appear in source, metadata, IR, Result, an event, artifact URI or log.

<a id="SECURITY-003"></a>

> **SECURITY-003** HTML, SVG, widgets and other active MIME MUST follow the host's sanitization and trust model.

<a id="SECURITY-004"></a>

> **SECURITY-004** Channel and artifact descriptors SHOULD state classification, retention and access policy. Adapters cannot silently lower the protection level.
