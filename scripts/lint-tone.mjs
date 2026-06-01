#!/usr/bin/env node
// Scans data.js for bias tell-words and motive-imputation phrasings that
// SKILL.md's "Failure modes" forbids. Reports findings as
//   data.js:<line>:<col>  [rule-id]  "<context>"
// Exits 1 on any finding so it can drop into a pre-commit hook.
//
// Per-line allow-list comment: `// lint-tone:allow <rule-id>` exempts that
// rule on that line (for legitimate uses in quoted statements, named events).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, "..", "data.js");

const RULES = [
  { id: "motive-political",      re: /\bpolitically\s+motivated\b/i,           reason: "Don't infer motives." },
  { id: "wholesale-fabrication", re: /\bwholesale[-\s]fabrication\b/i,         reason: "Straw-mans methodology critiques; argue methodology directly." },
  { id: "dismissive-merely",     re: /\bmerely\b/i,                            reason: "Almost always dismissive; rewrite as a direct claim." },
  { id: "anchor-of-course",      re: /\bof course\b/i,                         reason: "Anchors certainty; reader should reach conclusion from evidence." },
  { id: "anchor-obviously",      re: /\bobviously\b/i,                         reason: "Anchors certainty; reader should reach conclusion from evidence." },
  { id: "selective-supposed",    re: /\bsupposed\b(?!ly)/i,                    reason: "Selective skepticism marker — flag for review." },
  { id: "selective-so-called",   re: /\bso[-\s]called\b/i,                     reason: "Selective skepticism marker." },
  { id: "everyone-knows",        re: /\beveryone knows\b/i,                    reason: "Skill rule #1: not evidence." },
  { id: "bad-faith",             re: /\bbad[-\s]faith\b/i,                     reason: "Implies motive; flag for review." },
  { id: "cherry-picked",         re: /\bcherry[-\s]picked\b/i,                 reason: "Asymmetric-search accusation unless the analysis documents it; flag." },
];

// Find every string-literal span on a line (double- or single-quoted).
// Heuristic — not a JS parser. We walk char-by-char, tracking whether we are
// inside a string and respecting backslash escapes. Template literals are
// rare in data.js and ignored intentionally.
function stringSpans(line) {
  const spans = [];
  let i = 0;
  let quote = null;
  let start = -1;
  while (i < line.length) {
    const ch = line[i];
    if (quote === null) {
      // Skip line comments — the rest of the line is not scanned.
      if (ch === "/" && line[i + 1] === "/") break;
      if (ch === '"' || ch === "'") {
        quote = ch;
        start = i + 1;
      }
    } else {
      if (ch === "\\") { i += 2; continue; }
      if (ch === quote) {
        spans.push({ start, end: i });
        quote = null;
      }
    }
    i++;
  }
  return spans;
}

function isInBlockComment(state, line) {
  // Mutates state.{inBlock} as it walks the line. Returns an array of
  // [start, end) ranges that are inside a block comment so we can mask them.
  const masked = [];
  let i = 0;
  let rangeStart = state.inBlock ? 0 : -1;
  while (i < line.length) {
    if (state.inBlock) {
      if (line[i] === "*" && line[i + 1] === "/") {
        masked.push([rangeStart, i + 2]);
        state.inBlock = false;
        rangeStart = -1;
        i += 2;
        continue;
      }
    } else {
      if (line[i] === "/" && line[i + 1] === "*") {
        state.inBlock = true;
        rangeStart = i;
        i += 2;
        continue;
      }
    }
    i++;
  }
  if (state.inBlock && rangeStart !== -1) masked.push([rangeStart, line.length]);
  return masked;
}

function rangesOverlap(a, b) {
  return a.start < b[1] && a.end > b[0];
}

const src = readFileSync(DATA_PATH, "utf8");
const lines = src.split("\n");
const findings = [];
const blockState = { inBlock: false };

for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
  const line = lines[lineIdx];
  const blockMasks = isInBlockComment(blockState, line);
  const allowMatch = line.match(/\/\/\s*lint-tone:allow\s+([\w-]+(?:\s*,\s*[\w-]+)*)/);
  const allowed = allowMatch ? new Set(allowMatch[1].split(/\s*,\s*/)) : new Set();
  const spans = stringSpans(line).filter(s => !blockMasks.some(m => rangesOverlap(s, m)));
  if (spans.length === 0) continue;

  for (const rule of RULES) {
    if (allowed.has(rule.id)) continue;
    const re = new RegExp(rule.re.source, rule.re.flags.includes("g") ? rule.re.flags : rule.re.flags + "g");
    for (const span of spans) {
      const slice = line.slice(span.start, span.end);
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(slice)) !== null) {
        const col = span.start + m.index + 1; // 1-indexed
        const ctxStart = Math.max(0, m.index - 24);
        const ctxEnd = Math.min(slice.length, m.index + m[0].length + 24);
        const ellipsisL = ctxStart > 0 ? "…" : "";
        const ellipsisR = ctxEnd < slice.length ? "…" : "";
        const context = ellipsisL + slice.slice(ctxStart, ctxEnd) + ellipsisR;
        findings.push({ line: lineIdx + 1, col, id: rule.id, context });
      }
    }
  }
}

if (findings.length === 0) {
  console.log("lint-tone: no findings");
  process.exit(0);
}

findings.sort((a, b) => a.line - b.line || a.col - b.col);
for (const f of findings) {
  console.log(`data.js:${f.line}:${f.col}  [${f.id}]  "${f.context}"`);
}
console.log(`\nlint-tone: ${findings.length} finding${findings.length === 1 ? "" : "s"}`);
process.exit(1);
