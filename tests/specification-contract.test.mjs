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

test("the Interop 0.5 specification preserves its foundational contracts", () => {
  const requiredContracts = [
    "STATUS-003",
    "HTML-ADAPTER-002",
    "INHERIT-001",
    "SOURCEMAP-001",
    "RESULT-002",
    "CHANNEL-002",
    "SYSTEM-OUT-001",
    "MANIFEST-001",
    "JUPYTER-001",
    "DATA-001",
    "ADAPTER-001",
    "ADAPTER-006",
    "PLAYGROUND-003",
  ];

  for (const requirementId of requiredContracts) {
    assert.match(source, new RegExp('id="' + requirementId + '"'));
  }

  assert.match(source, /render.*resultatfält, inte en emitterbar kanal/s);
  assert.match(source, /row och line är projektioner/);
  assert.match(source, /HTML beskriver ett dokumentträd.*Textabana beskriver vilka semantiska processer/s);
  assert.match(source, /Nuvarande Playground implementerar fem avgränsade vyer/);
  assert.match(source, /Language & Scope Lab/);
  assert.match(source, /Editor Metadata Lab/);
  assert.match(source, /Channel & Result Lab/);
  assert.match(source, /Data & Lineage Lab/);
  assert.match(source, /Notebook Interop Lab/);
  assert.match(source, /textabana\.adapter-manifest\/lab-v1/);
  assert.match(source, /textabana\.adapter-projection\/lab-v1/);
  assert.match(source, /adapter-contract\/1/);
  assert.match(source, /Data- och notebookadaptrarna är körbara.*Annotation är contract-only/s);
  assert.match(source, /notebook\.snapshot.*notebook\.cells.*notebook\.outputs.*notebook\.state/s);
  assert.match(source, /fresh.*session.*attached/s);
  assert.match(source, /whole-snapshot.*stabila cell-id:n.*MIME.*stale detection/s);
  assert.match(source, /Jupyter Messaging, nbformat-roundtrip, session\/attached kernelkörning.*Comms\/widgets.*unsupported/s);
  assert.match(source, /stabila.*recordId.*deterministisk inner join.*multi-input-lineage/s);
  assert.match(source, /Arrow IPC, Parquet, DuckDB, beständiga ArtifactRefs, OpenLineage-export.*unsupported/s);
  assert.match(source, /Ingen interaktiv subset eller kontraktsregistrering är full profilkonformitet/);
});
