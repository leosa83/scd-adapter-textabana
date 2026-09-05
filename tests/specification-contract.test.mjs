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

test("the Interop 0.4 specification preserves its foundational contracts", () => {
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
    "PLAYGROUND-003",
  ];

  for (const requirementId of requiredContracts) {
    assert.match(source, new RegExp('id="' + requirementId + '"'));
  }

  assert.match(source, /render.*resultatfält, inte en emitterbar kanal/s);
  assert.match(source, /row och line är projektioner/);
  assert.match(source, /HTML beskriver ett dokumentträd.*Textabana beskriver vilka semantiska processer/s);
  assert.match(source, /Nuvarande Playground implementerar uttryckligen avgränsade 0\.4-subsets/);
  assert.match(source, /Language & Scope Lab/);
  assert.match(source, /Editor Metadata Lab/);
  assert.match(source, /Channel & Result Lab/);
  assert.match(source, /En interaktiv subset är inte full profilkonformitet/);
});
