#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const B2_PATTERNS = [
  "backblaze",
  "backblazeb2",
  "b2_",
  "B2_",
  "authorize",
  "authorization",
  "api.backblazeb2.com",
  "download.backblazeb2.com",
  "uploadToB2",
  "b2-proxy",
  "proxyB2",
];

const results = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === "dist" ||
      entry.name === "build"
    ) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
    } else {
      scanFile(fullPath);
    }
  }
}

function scanFile(file) {
  if (!file.match(/\.(js|ts|tsx|mjs|cjs)$/)) return;

  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }

  const hits = B2_PATTERNS.filter(p => text.includes(p));
  if (hits.length === 0) return;

  const lines = text.split("\n");
  const matchedLines = [];

  lines.forEach((line, idx) => {
    if (hits.some(p => line.includes(p))) {
      matchedLines.push({
        line: idx + 1,
        text: line.trim()
      });
    }
  });

  results.push({
    file: path.relative(ROOT, file),
    hits,
    matchedLines
  });
}

walk(ROOT);

console.log("\n===== BACKBLAZE B2 AUDIT REPORT =====\n");

for (const r of results) {
  console.log(`FILE: ${r.file}`);
  console.log(`MATCHES: ${r.hits.join(", ")}`);
  for (const l of r.matchedLines) {
    console.log(`  ${l.line}: ${l.text}`);
  }
  console.log("");
}

console.log(`TOTAL FILES WITH B2 REFERENCES: ${results.length}`);
console.log("\n===== END REPORT =====\n");
