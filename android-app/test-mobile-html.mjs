import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const htmlPath = resolve("app/src/main/assets/index.html");
const html = readFileSync(htmlPath, "utf8");
const scripts = [...html.matchAll(/<script>([\\s\\S]*?)<\\/script>/gi)];
if (scripts.length !== 1) throw new Error("Expected exactly one inline application script.");
new Function(scripts[0][1]);

const ids = [...html.matchAll(/\\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const idSet = new Set(ids);
if (idSet.size !== ids.length) throw new Error("Duplicate static HTML IDs found.");

const references = [...scripts[0][1].matchAll(/getElementById\\(["']([^"']+)["']\\)/g)].map((match) => match[1]);
const missing = [...new Set(references.filter((id) => !idSet.has(id)))];
if (missing.length) throw new Error("Missing static element IDs: " + missing.join(", "));

for (const feature of ["Prompt Studio", "Notes & Tasks", "Backup & restore", "Custom shortcut"]) {
  if (!html.includes(feature)) throw new Error("Missing expected feature label: " + feature);
}
console.log("Android mobile HTML smoke test passed: script syntax, static IDs and feature sections.");
