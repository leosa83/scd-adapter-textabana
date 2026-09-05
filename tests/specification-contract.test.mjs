import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/specification.tsx", import.meta.url), "utf8");

test("every documentation navigation target has a matching section", () => {
  const navIds = [...source.matchAll(/\{ id: "([^"]+)", label:/g)].map((match) => match[1]);
  const sectionIds = new Set(
    [...source.matchAll(/<section[^>]+id="([^"]+)"/g)].map((match) => match[1]),
  );

  assert.ok(navIds.length >= 20, "expected the grouped 0.4 documentation index");
  assert.equal(new Set(navIds).size, navIds.length, "navigation ids must be unique");

  for (const id of navIds) {
    assert.ok(sectionIds.has(id), "missing documentation section #" + id);
  }
});

test("the Interop 0.6 specification preserves its foundational contracts", () => {
  const requiredContracts = [
    "STATUS-003",
    "HTML-ADAPTER-002",
    "INHERIT-001",
    "SOURCEMAP-001",
    "RESULT-002",
    "CHANNEL-002",
    "SYSTEM-OUT-001",
    "MANIFEST-001",
    "EDITOR-KERNEL-001",
    "EDITOR-KERNEL-002",
    "EDITOR-KERNEL-003",
    "DOCUMENT-003",
    "CHANGE-001",
    "CHANGE-002",
    "CHANGE-003",
    "SUBSCRIPTION-001",
    "DELTA-001",
    "DELTA-002",
    "DELTA-003",
    "DELTA-004",
    "REANCHOR-001",
    "JUPYTER-001",
    "DATA-001",
    "ANNOTATION-002",
    "ANNOTATION-004",
    "ANNOTATION-006",
    "ADAPTER-001",
    "ADAPTER-006",
    "CONF-004",
    "CONF-005",
    "CONF-006",
    "CONF-007",
    "CONF-008",
    "PLAYGROUND-003",
  ];

  for (const requirementId of requiredContracts) {
    assert.match(source, new RegExp('id="' + requirementId + '"'));
  }

  assert.match(source, /render.*resultatfält, inte en emitterbar kanal/s);
  assert.match(source, /row och line är projektioner/);
  assert.match(source, /HTML beskriver ett dokumentträd.*Textabana beskriver vilka semantiska processer/s);
  assert.match(source, /Nuvarande Playground implementerar åtta avgränsade vyer/);
  assert.match(source, /Language & Scope Lab/);
  assert.match(source, /Editor Kernel Lab/);
  assert.match(source, /Editor Metadata Lab/);
  assert.match(source, /Channel & Result Lab/);
  assert.match(source, /Data & Lineage Lab/);
  assert.match(source, /Notebook Interop Lab/);
  assert.match(source, /Annotation & AI Review Lab/);
  assert.match(source, /Conformance Lab/);
  assert.match(source, /textabana\.adapter-manifest\/lab-v1/);
  assert.match(source, /textabana\.adapter-projection\/lab-v1/);
  assert.match(source, /adapter-contract\/1/);
  assert.match(source, /data-, notebook- och annotationadaptrarna körs efter commit.*ml-lineage.*contract-only/s);
  assert.match(source, /notebook\.snapshot.*notebook\.cells.*notebook\.outputs.*notebook\.state/s);
  assert.match(source, /fresh.*session.*attached/s);
  assert.match(source, /whole-snapshot.*stabila cell-id:n.*MIME.*stale detection/s);
  assert.match(source, /Jupyter Messaging, nbformat-roundtrip, session\/attached kernelkörning.*Comms\/widgets.*unsupported/s);
  assert.match(source, /annotation\.set.*annotation\.candidates.*annotation\.reviews.*annotation\.revisions/s);
  assert.match(source, /Modellkandidatens ursprungliga fakta får inte muteras.*supersededBy.*supersedes/s);
  assert.match(source, /modell-id\/version\/digest.*prompt-id\/digest.*inputdigest.*confidence score och metod/s);
  assert.match(source, /W3C Web Annotation.*Label Studio.*adapterprojektion/s);
  assert.match(source, /Label Studio.*task\/import-subset.*ingen API-\/projektroundtrip/s);
  assert.match(source, /ml-lineage\/1.*contract-only/s);
  assert.match(source, /stabila.*recordId.*deterministisk inner join.*multi-input-lineage/s);
  assert.match(source, /Arrow IPC, Parquet, DuckDB, beständiga ArtifactRefs, OpenLineage-export.*unsupported/s);
  assert.match(source, /Ingen interaktiv subset.*kontraktsregistrering är full profilkonformitet/);
  assert.match(source, /textabana\.conformance-report\/lab-v1/);
  assert.match(source, /deklarerad support från observerat testutfall/);
  assert.match(source, /Contract-only.*aldrig claimable/s);
  assert.match(source, /normaliseringspolicy.*actual digest.*expected digest/s);
  assert.match(source, /Negativa fixtures.*exakt diagnostikkod.*atomiskt tom durable commit/s);
  assert.match(source, /kooperativ vid async- och stage-gränser.*synkron preemption/s);
  assert.match(source, /textabana\.editor-kernel\/lab-v1/);
  assert.match(source, /korrelerade.*open.*change.*Optimistiskt antagen revision\/version/s);
  assert.match(source, /inkrementell input.*Implementerat.*inkrementell beräkning.*Ej implementerat.*inkrementell leverans.*Implementerat/is);
  assert.match(source, /run-lokala.*eventId.*sequence/s);
  assert.match(source, /Flera giltiga kandidater.*ambiguous.*ingen giltig kandidat.*orphaned/s);
  assert.match(source, /full dokumentparse.*fresh full exekvering/s);
});
