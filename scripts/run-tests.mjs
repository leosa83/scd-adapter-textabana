import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// New test files join the headless suite automatically. Only tests that need
// the built web application or its UI components belong in this explicit set.
const appTests = new Set(["rendered-html.test.mjs", "ui-components.test.mjs"]);
const scope = process.argv[2] || "headless";
if (!["headless", "app"].includes(scope)) throw new Error("Usage: node scripts/run-tests.mjs [headless|app]");
const root = fileURLToPath(new URL("../", import.meta.url));
const files = (await readdir(new URL("../tests/", import.meta.url))).filter((name) => name.endsWith(".test.mjs")).sort();
for (const name of appTests) if (!files.includes(name)) throw new Error(`Missing application test: ${name}`);
const selected = files.filter((name) => appTests.has(name) === (scope === "app"));
if (!selected.length) throw new Error(`No tests selected for ${scope}`);
console.log(`Running ${selected.length} ${scope} test files with concurrency 2.`);
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=2", ...selected.map((name) => `tests/${name}`)], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
