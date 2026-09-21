import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { NodeKernelTransport } from "../sdk/node/transport.mjs";
import { parseDocument } from "../runtime/parser.js";
import { canonicalDigest } from "../runtime/canonical-json.js";
import { executeSemanticCase, semanticSuiteUrl } from "../conformance/semantic-runner.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("conformance presentation covers current requirement outcomes without rewriting reports", async () => {
  const view = await vite.ssrLoadModule("/app/conformance-presentation.ts");
  const suite = JSON.parse(await readFile(semanticSuiteUrl, "utf8"));
  const response = await executeSemanticCase(suite.cases.find((c) => c.id === "pure-stage"), "direct");
  const report = response.conformanceReport;
  const before = await canonicalDigest(report);
  const freeze = (value) => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } };
  freeze(report);
  const source = await readFile(new URL("../runtime/lab-conformance.js", import.meta.url), "utf8");
  const checks = [...source.matchAll(/checkedRequirement\("([^"]+)"/g)].flatMap((m) => [[m[1], "passed"], [m[1], "failed"]]);
  checks.push(...[...source.matchAll(/notRunRequirement\("([^"]+)"/g)].map((m) => [m[1], "not-run"]));
  checks.push(["CANCELLATION-ATOMIC", "failed"]);
  for (const id of ["DATA-PROJECTION", "NOTEBOOK-PROJECTION", "ANNOTATION-PROJECTION"]) {
    for (const status of ["passed", "failed", "not-run"]) checks.push([id, status]);
  }
  assert.equal(new Set(checks.map(([id]) => id)).size, 24);
  const diagnosticReport = { ...report, case: { ...report.case, expectedDiagnosticCode: "TBA-TEST-🌊" } };
  for (const [requirementId, status] of checks) {
    const item = { requirementId, status, message: "original prose", evidenceRefs: ["evidence:🌊"] };
    assert.notEqual(view.presentConformanceRequirement(diagnosticReport, item), item.message, `${requirementId}/${status}`);
    assert.deepEqual(item.evidenceRefs, ["evidence:🌊"]);
  }
  for (const profile of report.profiles) {
    for (const item of profile.requirements) assert.notEqual(view.presentConformanceRequirement(report, item), item.message);
  }
  for (const stage of report.stages) assert.notEqual(view.presentConformanceStage(report, stage), stage.message);
  for (const fixture of report.negativeFixtures) assert.notEqual(view.presentNegativeFixture(report, fixture), fixture.purpose);
  assert.match(view.presentCancellationLimit(report), /cannot be preempted/);
  assert.equal(await canonicalDigest(report), before);
});

test("conformance wording fails safely for unknown contracts and never describes failed stages as verified", async () => {
  const view = await vite.ssrLoadModule("/app/conformance-presentation.ts");
  const suite = JSON.parse(await readFile(semanticSuiteUrl, "utf8"));
  const response = await executeSemanticCase(suite.cases.find((c) => c.id === "syntax-failure"), "direct");
  const report = response.conformanceReport;
  for (const stage of report.stages) {
    const message = view.presentConformanceStage(report, stage);
    if (stage.stage === "plan") assert.match(message, /No plan claim/);
    if (stage.stage === "result") assert.match(message, /rolled back/);
  }
  for (const stage of ["plan", "projection"]) {
    const item = { stage, status: "failed", message: "original", evidenceRefs: [] };
    assert.match(view.presentConformanceStage(report, item), /could not be verified/);
  }
  const item = report.profiles[0].requirements[0];
  const future = { ...report, suite: { ...report.suite, version: "future" } };
  assert.equal(view.presentConformanceRequirement(future, item), item.message);
  assert.equal(view.presentConformanceStage(future, report.stages[0]), report.stages[0].message);
  assert.equal(view.presentNegativeFixture(future, report.negativeFixtures[0]), report.negativeFixtures[0].purpose);
  assert.equal(view.presentCancellationLimit(future), report.cancellation.limitation);
  for (const requirementId of ["UNKNOWN", "toString"]) {
    assert.equal(view.presentConformanceRequirement(report, { ...item, requirementId }), item.message);
  }
  assert.equal(view.presentConformanceRequirement(report, { ...item, status: "future" }), item.message);
  const changed = { ...report.negativeFixtures[0], expectedDiagnosticCode: "FUTURE" };
  assert.equal(view.presentNegativeFixture(report, changed), changed.purpose);
});

test("conformance gate and profile render English while retaining raw evidence and contract-only limits", async () => {
  const { PlaygroundOutput, ConformanceProfileDetail } = await vite.ssrLoadModule("/app/playground-labs.tsx");
  const suite = JSON.parse(await readFile(semanticSuiteUrl, "utf8"));
  const result = await executeSemanticCase(suite.cases.find((c) => c.id === "pure-stage"), "direct");
  const before = JSON.stringify(result.conformanceReport);
  const html = renderToStaticMarkup(React.createElement(PlaygroundOutput, { lab: "conformance", result, previousResult: null, running: false, onOpenLab() {}, onSelectFixture() {} }));
  assert.match(html, /A versioned source snapshot is available/);
  assert.match(html, /no full profile conformance/);
  assert.doesNotMatch(html, /Profiler|Strukturell|Negativa|Identiteter|inga blockers|Versionerad source/);
  for (const profile of result.conformanceReport.profiles) {
    const detail = renderToStaticMarkup(React.createElement(ConformanceProfileDetail, { profile, report: result.conformanceReport }));
    for (const requirement of profile.requirements) assert.ok(detail.includes(requirement.requirementId));
    if (profile.derivedSupport === "contract-only") assert.match(detail, /never claimable/);
  }
  assert.equal(JSON.stringify(result.conformanceReport), before);
  assert.ok(before.includes("Versionerad source snapshot finns."));
});

test("English presentation covers every current parser recovery kind without matching prose", async () => {
  const { presentParserDiagnostic } = await vite.ssrLoadModule("/app/parser-diagnostic-presentation.ts");
  const source = await readFile(new URL("../runtime/parser.js", import.meta.url), "utf8");
  const cases = [...source.matchAll(/recover\(\s*"([^"]+)",\s*"([^"]+)"/g)].map((match) => [match[1], match[2]]);
  cases.push(["UnterminatedString", "TBA-PARSE-UNTERMINATED-STRING-LAB"], ["UnbalancedDelimiter", "TBA-PARSE-UNBALANCED-DELIMITER-LAB"]);
  assert.equal(new Set(cases.map(([kind]) => kind)).size, 36);
  for (const [recoveryKind, code] of cases) {
    const diagnostic = { phase: "parsing", code, recoveryNodeId: "r", message: "not a translation key", related: [] };
    const recovery = { nodeId: "r", recoveryKind, actual: "Hej 🌊", expected: "föremål", synthetic: false };
    const view = presentParserDiagnostic(diagnostic, recovery, "textabana.parser/lab-v1");
    assert.equal(view.translated, true, recoveryKind);
    assert.doesNotMatch(view.message, /not a translation key/);
    assert.ok(view.message.includes("Found: Hej 🌊."), recoveryKind);
    assert.ok(view.message.includes("Expected: föremål."), recoveryKind);
  }
});

test("parser presentation preserves raw IR and related Unicode source locations", async () => {
  const { presentParserDiagnostic } = await vite.ssrLoadModule("/app/parser-diagnostic-presentation.ts");
  const sources = [
    ">>>> upper\nHej 🌊", ">>>> outer\n>>>> inner\n🌊\n<<<< outer",
    ">>>> upper\n🌊\n<<<< other", ">>>>+ upper @id=ocean\n🌊",
    ">>>> block\n>>>>+ upper @id=ocean\n🌊\n<<<< block",
    ">>>>+ upper @id=ocean\n>>>> block\n<<<<+ @id=ocean\n<<<< block",
    ">>>> upper text='🌊\n<<<< upper", ">>>> upper n=1 n=2\n<<<< upper",
  ];
  const freeze = (value) => {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  for (const source of sources) {
    const parsed = parseDocument(source);
    const ir = freeze(parsed.ir);
    const before = await canonicalDigest(ir);
    assert.ok(ir.diagnostics.length);
    for (const diagnostic of ir.diagnostics) {
      const recovery = ir.nodes.find((node) => node.nodeId === diagnostic.recoveryNodeId);
      const view = presentParserDiagnostic(diagnostic, recovery, ir.parser.schema);
      assert.equal(view.translated, true, diagnostic.code);
      if (recovery.recoveryKind === "MismatchedBlockClose" && recovery.synthetic) {
        assert.match(view.message, /non-executable synthetic closing marker/);
        assert.deepEqual(view.related.map((r) => r.message), ["The inner block opened here.", "The authored closing marker belongs to the outer block."]);
      }
      assert.deepEqual(view.related.map((r) => r.sourceSpan), diagnostic.related.map((r) => r.sourceSpan));
      for (const [index, item] of view.related.entries()) {
        assert.notEqual(item.sourceSpan, diagnostic.related[index].sourceSpan);
        assert.doesNotMatch(item.message, /öppnades|författade/);
      }
    }
    assert.equal(await canonicalDigest(ir), before);
  }
});

test("parser presentation falls back for unknown or mismatched inputs and renders raw evidence separately", async () => {
  const { presentParserDiagnostic } = await vite.ssrLoadModule("/app/parser-diagnostic-presentation.ts");
  const { ParserDiagnostic } = await vite.ssrLoadModule("/app/parser-diagnostic.tsx");
  const ir = parseDocument(">>>> upper\nHej 🌊").ir;
  const diagnostic = ir.diagnostics[0];
  const recovery = ir.nodes.find((node) => node.nodeId === diagnostic.recoveryNodeId);
  for (const [d, r, schema] of [
    [diagnostic, undefined, ir.parser.schema],
    [diagnostic, recovery, "textabana.parser/future"],
    [{ ...diagnostic, phase: "transform" }, recovery, ir.parser.schema],
    [{ ...diagnostic, code: "TBA-FUTURE" }, recovery, ir.parser.schema],
    [diagnostic, { ...recovery, nodeId: "wrong" }, ir.parser.schema],
    [diagnostic, { ...recovery, recoveryKind: "toString" }, ir.parser.schema],
  ]) {
    const view = presentParserDiagnostic(d, r, schema);
    assert.equal(view.translated, false);
    assert.equal(view.message, d.message);
    assert.deepEqual(view.related, d.related);
  }
  const html = renderToStaticMarkup(React.createElement(ParserDiagnostic, { diagnostic, recovery, parserSchema: ir.parser.schema }));
  assert.match(html, /The block is missing its closing marker/);
  assert.match(html, /The block opened here/);
  assert.match(html, /L1:0/);
  assert.match(html, /<details><summary>Original diagnostic \(unchanged artifact data\)<\/summary>/);
  assert.ok(html.includes("Blocket"));
  assert.match(html, /&lt;&lt;&lt;&lt; upper/);
});

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("renders every migrated specification anchor, example and evidence disclosure", async () => {
  const baseline = JSON.parse(await readFile(path.join(root, "tests/fixtures/specification-5.10.json"), "utf8"));
  const { Specification } = await vite.ssrLoadModule("/app/specification.tsx");
  const html = renderToStaticMarkup(React.createElement(Specification));
  for (const id of [...baseline.sectionIds, ...baseline.requirements.map((requirement) => requirement.id)]) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, `Missing or duplicate anchor: ${id}`);
  }
  for (const id of baseline.sectionIds) assert.ok(html.includes(`href="#${id}"`), `Missing navigation: ${id}`);
  assert.equal((html.match(/<details class="spec-evidence">/g) || []).length, baseline.requirements.length);
  assert.equal((html.match(/<pre\b/g) || []).length, Object.values(baseline.codeExamples).flat().length);
  assert.match(html, /The specification is authored in English/);
  assert.doesNotMatch(html, /lang="sv"/);
  assert.match(html, /<table class="spec-table">/);
  assert.doesNotMatch(html, /href="\.\//);
});

test("all eight English lab panels render real committed and failed kernel results", async () => {
  const { PlaygroundOutput } = await vite.ssrLoadModule("/app/playground-labs.tsx");
  const { TextabanaKernelClient, KernelCommandError } = await vite.ssrLoadModule("/sdk/typescript/client.ts");
  const transport = new NodeKernelTransport();
  const client = new TextabanaKernelClient(transport);
  try {
    await client.open("translated-labs", "example.md", "Hej 🌊\n");
    const committed = await client.run("translated-labs", 1, 1, []);
    assert.equal(committed.resultEnvelope.run.committed, true);
    assert.equal(committed.output, "Hej 🌊\n");
    await client.open("failed-labs", "failure.md", ">>>> missing_function\nHej 🌊\n<<<< missing_function");
    let failed;
    try { await client.run("failed-labs", 1, 2, []); }
    catch (error) {
      assert.ok(error instanceof KernelCommandError);
      failed = error.response;
    }
    assert.equal(failed.ok, false);
    for (const lab of ["language", "kernel", "editor", "channels", "data", "notebook", "annotation", "conformance"]) {
      for (const result of [committed, failed]) {
        const html = renderToStaticMarkup(React.createElement(PlaygroundOutput, {
          lab, result, previousResult: null, running: false,
          onOpenLab() {}, onSelectFixture() {},
        }));
        assert.match(html, /lang="en"/, lab);
        assert.doesNotMatch(html, /lang="sv"/, lab);
        assert.match(html, /role="tablist"/, lab);
        if (result.ok) assert.match(html, /Run 1 · committed/, lab);
        else {
          assert.match(html, /role="alert"/, lab);
          assert.match(html, /The run committed no domain result/, lab);
          // Diagnostic codes remain kernel data, not translated product copy.
          assert.ok(html.includes(result.diagnostics[0].code), lab);
        }
      }
    }
  } finally {
    client.dispose();
    await transport.close();
  }
});
