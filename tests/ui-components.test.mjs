import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { NodeKernelTransport } from "../sdk/node/transport.mjs";

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
