# Security

Att en modul kör i Worker, kernel eller container gör den inte automatiskt säker. Textabana skiljer deklarerat behov från värdens uttryckliga grant.

**Före init**

Verifiera digest/signatur, lock, runtime, capability subset, quotas och URI-policy.

**Under run**

Isolera otillförlitlig kod, begränsa CPU/minne/output, propagera cancel och kontrollera nätverk/filsystem.

**Efter run**

Sanera aktiv MIME, klassificera kanaler/artifacts och tillämpa retention innan leverans.

<a id="SECURITY-001"></a>

> **SECURITY-001** Ingen modul har implicit rätt till filesystem, network, process, model eller secrets. Host får endast ge en deklarerad subset.

<a id="SECURITY-002"></a>

> **SECURITY-002** Secrets MÅSTE injiceras som opaque handles och får aldrig förekomma i source, metadata, IR, Result, event, artifact-URI eller logg.

<a id="SECURITY-003"></a>

> **SECURITY-003** HTML, SVG, widgets och annan aktiv MIME MÅSTE följa hostens sanitization- och trustmodell.

<a id="SECURITY-004"></a>

> **SECURITY-004** Kanal- och artifactdescriptors BÖR ange classification, retention och åtkomstpolicy. Adaptrar får inte sänka skyddsnivån tyst.
