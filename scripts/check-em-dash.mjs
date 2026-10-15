#!/usr/bin/env node
// Fails the lint when any source, copy or prompt file contains an em dash (U+2014).
// CLAUDE.md and PRD section 18: no em dashes anywhere.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = ["src", "docs", "scripts", "tests", "README.md", "CLAUDE.md", "KICKOFF_PROMPT.md"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".md", ".json", ".html"]);
// Generated code is not ours to edit.
const SKIP_DIRS = new Set([join("src", "generated")]);
const EM_DASH = String.fromCodePoint(0x2014);

function* walk(path) {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return;
  }
  if (stats.isDirectory()) {
    if (SKIP_DIRS.has(path)) return;
    for (const entry of readdirSync(path)) yield* walk(join(path, entry));
  } else if (EXTENSIONS.has(extname(path))) {
    yield path;
  }
}

const problems = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (line.includes(EM_DASH)) problems.push(`${file}:${i + 1}`);
      });
  }
}

if (problems.length) {
  console.error(`Em dash (U+2014) found. Use a comma, colon, full stop or brackets instead:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("No em dashes found.");
