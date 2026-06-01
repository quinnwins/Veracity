import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const babelUrl = "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js";

function approx(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

function approxRange(actual, expected, epsilon = 1e-9) {
  assert.ok(Array.isArray(actual), "range should be an array");
  assert.equal(actual.length, 2);
  approx(actual[0], expected[0], epsilon);
  approx(actual[1], expected[1], epsilon);
}

async function loadBabel() {
  const res = await fetch(babelUrl);
  assert.ok(res.ok, `failed to fetch Babel standalone: ${res.status}`);
  const code = await res.text();
  const context = { console, setTimeout, clearTimeout };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: "babel-standalone.js" });
  assert.ok(context.Babel, "Babel standalone did not initialize");
  return context.Babel;
}

async function loadMathContext() {
  const Babel = await loadBabel();
  const React = {
    Fragment: Symbol("Fragment"),
    createElement(type, props, ...children) {
      return { type, props: props || {}, children };
    },
    useState(initial) {
      return [typeof initial === "function" ? initial() : initial, () => {}];
    },
    useEffect() {},
    useMemo(fn) {
      return fn();
    },
    useRef(initial) {
      return { current: initial };
    },
    useLayoutEffect() {},
    useCallback(fn) {
      return fn;
    }
  };
  const context = {
    console,
    setTimeout,
    clearTimeout,
    document: { getElementById: () => ({}) },
    React,
    ReactDOM: { createRoot: () => ({ render: () => {} }) }
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);

  const dataCode = await fs.readFile(new URL("data.js", root), "utf8");
  vm.runInContext(dataCode, context, { filename: "data.js" });

  for (const file of ["verdict.jsx", "components.jsx", "app.jsx"]) {
    const source = await fs.readFile(new URL(file, root), "utf8");
    const transformed = Babel.transform(source, {
      presets: ["react"],
      sourceType: "script",
      filename: file
    }).code;
    vm.runInContext(transformed, context, { filename: file });
  }

  vm.runInContext(`
    Object.assign(window, {
      computeConjBayes,
      detectLoadBearing,
      classifyCruxDirection,
      altConjBayes,
      classifyDirection,
      invertRange
    });
  `, context, { filename: "math-exports.js" });

  return context;
}

const ctx = await loadMathContext();
const minwage = ctx.ANALYSES.minwage;

function simpleAnalysis(nodes) {
  return { nodes };
}

test("computeConjBayes multiplies child ranges", () => {
  const result = ctx.computeConjBayes(simpleAnalysis({
    C0: { id: "C0", estimate: [0, 1] },
    A: { id: "A", parent: "C0", estimate: [0.5, 0.6] },
    B: { id: "B", parent: "C0", estimate: [0.2, 0.4] }
  }), {}, {});
  approxRange(result.C0, [0.1, 0.24]);
});

test("computeConjBayes uses leaf estimate when there are no children", () => {
  const result = ctx.computeConjBayes(simpleAnalysis({
    C0: { id: "C0", estimate: [0.3, 0.7] }
  }), {}, {});
  approxRange(result.C0, [0.3, 0.7]);
});

test("computeConjBayes matches minwage regression posterior", () => {
  const result = ctx.computeConjBayes(minwage, {}, {});
  approxRange(result.C0, [3.240000000000002e-8, 0.00044903281500000003]);
});

test("lrPosteriorRange applies LR to prior odds", () => {
  const result = ctx.lrPosteriorRange([0.5, 0.5], [{ lrLow: 2, lrHigh: 4 }]);
  approxRange(result, [2 / 3, 0.8]);
});

test("lrPosteriorRange returns null when no item carries LR data", () => {
  assert.equal(ctx.lrPosteriorRange([0.4, 0.6], [{ item: "neutral" }]), null);
});

test("lrPosteriorRange matches minwage LR regression posterior", () => {
  const result = ctx.lrPosteriorRange(minwage.priorRange, minwage.evidenceBudget);
  approxRange(result, [0.0007708339281125988, 0.10540013012361743]);
});

test("computeHypothesisPosterior normalizes per-hypothesis LRs", () => {
  const result = ctx.computeHypothesisPosterior(
    [{ id: "H0", h: "A" }, { id: "H1", h: "B" }],
    [{ lrPerH: { H0: 2, H1: 0.5 } }]
  );
  approx(result[0].posterior, 0.8);
  approx(result[1].posterior, 0.2);
});

test("computeHypothesisPosterior returns null for empty hypotheses or no evidence", () => {
  assert.equal(ctx.computeHypothesisPosterior([], []), null);
  assert.equal(ctx.computeHypothesisPosterior([{ id: "H0" }], [{ item: "none" }]), null);
});

test("computeHypothesisPosterior matches minwage regression distribution", () => {
  const result = ctx.computeHypothesisPosterior(minwage.hypotheses, minwage.evidenceBudget);
  approx(result.find(h => h.id === "H0").posterior, 0.002909796314258005);
  approx(result.find(h => h.id === "H1").posterior, 0.8147429679922404);
  approx(result.find(h => h.id === "H2").posterior, 0.04655674102812804);
  approx(result.find(h => h.id === "H3").posterior, 0.13579049466537346);
});

test("computeHypothesisPosterior clamps Tier-2 LRs to [0.2, 5]", () => {
  // A Tier-2 named-source aggregation with an LR of 100 against H1 and 0.01
  // against H0 should be clamped to 5 / 0.2 (Cromwell's rule on evidence).
  // The clamped posterior should match what an evidence item with the
  // pre-clamped values { H0: 5, H1: 0.2 } would yield.
  const hypotheses = [{ id: "H0", h: "A" }, { id: "H1", h: "B" }];
  const clamped = ctx.computeHypothesisPosterior(
    hypotheses,
    [{ tier: 2, lrPerH: { H0: 100, H1: 0.01 } }]
  );
  const reference = ctx.computeHypothesisPosterior(
    hypotheses,
    [{ lrPerH: { H0: 5, H1: 0.2 } }]
  );
  approx(clamped[0].posterior, reference[0].posterior);
  approx(clamped[1].posterior, reference[1].posterior);
});

test("computeHypothesisPosterior clamps Tier-3 LRs to [1/3, 3]", () => {
  // Tier-3 reconstruction / synthesis evidence: extreme LRs collapse to the
  // narrow [1/3, 3] band.
  const hypotheses = [{ id: "H0", h: "A" }, { id: "H1", h: "B" }];
  const clamped = ctx.computeHypothesisPosterior(
    hypotheses,
    [{ tier: 3, lrPerH: { H0: 50, H1: 0.001 } }]
  );
  const reference = ctx.computeHypothesisPosterior(
    hypotheses,
    [{ lrPerH: { H0: 3, H1: 1 / 3 } }]
  );
  approx(clamped[0].posterior, reference[0].posterior);
  approx(clamped[1].posterior, reference[1].posterior);
});

test("computeHypothesisPosterior leaves Tier-0 and unspecified-tier items uncapped", () => {
  // Tier-0 direct-sensory facts retain their full LR. So do items without a
  // tier (backward-compatible default — preserves the existing 31 tests).
  const hypotheses = [{ id: "H0", h: "A" }, { id: "H1", h: "B" }];
  const tier0 = ctx.computeHypothesisPosterior(
    hypotheses,
    [{ tier: 0, lrPerH: { H0: 100, H1: 0.01 } }]
  );
  const noTier = ctx.computeHypothesisPosterior(
    hypotheses,
    [{ lrPerH: { H0: 100, H1: 0.01 } }]
  );
  // Both should match the unclamped posterior exactly.
  approx(tier0[0].posterior, noTier[0].posterior);
  approx(tier0[1].posterior, noTier[1].posterior);
  // And the posterior should NOT match the Tier-2 clamped version.
  const tier2 = ctx.computeHypothesisPosterior(
    hypotheses,
    [{ tier: 2, lrPerH: { H0: 100, H1: 0.01 } }]
  );
  assert.ok(Math.abs(tier0[0].posterior - tier2[0].posterior) > 1e-6,
    "Tier-0 and Tier-2 LRs should produce different posteriors");
});

test("lrPosteriorRange clamps Tier-2 evidence LRs to [0.2, 5]", () => {
  const clamped = ctx.lrPosteriorRange([0.5, 0.5], [{ tier: 2, lrLow: 100, lrHigh: 100 }]);
  const reference = ctx.lrPosteriorRange([0.5, 0.5], [{ lrLow: 5, lrHigh: 5 }]);
  approxRange(clamped, reference);
});

test("lrPosteriorRange and computeHypothesisPosterior skip kind:structural items", () => {
  // Synthetic: one informative item plus one structural item whose LRs would
  // double-count a doctrinal anchor that is already encoded in the hypothesis
  // label. The structural item must be ignored by both engines.
  const items = [
    { lrLow: 2, lrHigh: 4, lrPerH: { H0: 2, H1: 0.5 } },
    { kind: "structural", lrLow: 0.1, lrHigh: 0.1, lrPerH: { H0: 0.1, H1: 10 } }
  ];
  // Single-claim posterior: matches the LR-only-on-the-non-structural-item case.
  const lrResult = ctx.lrPosteriorRange([0.5, 0.5], items);
  approxRange(lrResult, [2 / 3, 0.8]);
  // Multi-hypothesis posterior: matches the LR-only-on-the-non-structural-item case.
  const hypResult = ctx.computeHypothesisPosterior(
    [{ id: "H0", h: "A" }, { id: "H1", h: "B" }],
    items
  );
  approx(hypResult[0].posterior, 0.8);
  approx(hypResult[1].posterior, 0.2);
});

test("detectLoadBearing flags a tunable that can move C0", () => {
  const analysis = simpleAnalysis({
    C0: { id: "C0", estimate: [0.2, 0.4] },
    A: { id: "A", parent: "C0", estimate: [0.2, 0.4], prior: [0.2, 0.4], tunable: true },
    B: { id: "B", parent: "C0", estimate: [0.8, 0.9] }
  });
  const result = ctx.detectLoadBearing(analysis, {}, 0.1);
  assert.ok(result.A);
  assert.ok(result.A.swing > 0.5);
});

test("detectLoadBearing returns empty object when no tunables exist", () => {
  const result = ctx.detectLoadBearing(simpleAnalysis({
    C0: { id: "C0", estimate: [0.2, 0.4] },
    A: { id: "A", parent: "C0", estimate: [0.2, 0.4] }
  }), {}, 0.1);
  assert.deepEqual(Object.keys(result), []);
});

test("detectLoadBearing matches minwage load-bearing regression", () => {
  const result = ctx.detectLoadBearing(minwage, {}, 0.15);
  assert.ok(result["P5.2"]);
  assert.ok(result["P5.2"].swing >= 0.29);
});

test("classifyDirection identifies supporting and opposing evidence", () => {
  assert.equal(ctx.classifyDirection("for"), "for");
  assert.equal(ctx.classifyDirection("against"), "against");
});

test("classifyDirection handles mixed and unknown directions", () => {
  assert.equal(ctx.classifyDirection("for and against"), "mixed");
  assert.equal(ctx.classifyDirection(""), "unknown");
});

test("classifyDirection matches minwage evidence classifications", () => {
  assert.deepEqual(
    Array.from(minwage.evidenceBudget.map(e => ctx.classifyDirection(e.direction))),
    ["against", "for", "against", "for", "mixed"]
  );
});

test("isUngrounded flags unsupported leaf nodes", () => {
  assert.equal(ctx.isUngrounded({ id: "A" }, simpleAnalysis({ A: { id: "A" } })), true);
});

test("isUngrounded treats null and evidenced nodes as grounded", () => {
  assert.equal(ctx.isUngrounded(null, simpleAnalysis({})), false);
  assert.equal(ctx.isUngrounded({ id: "A", evidence: "Observed." }, simpleAnalysis({ A: { id: "A" } })), false);
});

test("isUngrounded matches minwage grounded C0 regression", () => {
  assert.equal(ctx.isUngrounded(minwage.nodes.C0, minwage), false);
});

test("isLowFalsifiability flags nodes without verification or change path", () => {
  assert.equal(ctx.isLowFalsifiability({ id: "A" }), true);
});

test("isLowFalsifiability handles null and falsifiable nodes", () => {
  assert.equal(ctx.isLowFalsifiability(null), false);
  assert.equal(ctx.isLowFalsifiability({ verification: "Check data.", changes: "Contrary data." }), false);
});

test("isLowFalsifiability matches minwage C0 regression", () => {
  assert.equal(ctx.isLowFalsifiability(minwage.nodes.C0), false);
});

test("altConjBayes multiplies hypothesis decomposition ranges", () => {
  const result = ctx.altConjBayes({
    decomposition: [
      { estimate: [0.5, 0.6] },
      { estimate: [0.2, 0.4] }
    ]
  });
  approxRange(result, [0.1, 0.24]);
});

test("altConjBayes returns null for missing or invalid decomposition", () => {
  assert.equal(ctx.altConjBayes({}), null);
  assert.equal(ctx.altConjBayes({ decomposition: [{ estimate: [0.1] }] }), null);
});

test("altConjBayes matches minwage H0 decomposition regression", () => {
  const result = ctx.altConjBayes(minwage.hypotheses[0]);
  approxRange(result, [0.0099, 0.1326]);
});

test("classifyCruxDirection infers up and down movement", () => {
  assert.equal(ctx.classifyCruxDirection({ wouldMove: "This would raise the estimate." }), "up");
  assert.equal(ctx.classifyCruxDirection({ wouldMove: "This would weaken the claim." }), "down");
});

test("classifyCruxDirection respects explicit direction and defaults to either", () => {
  assert.equal(ctx.classifyCruxDirection({ direction: "either", wouldMove: "raise" }), "either");
  assert.equal(ctx.classifyCruxDirection({ wouldMove: "Evidence could matter." }), "either");
});

test("classifyCruxDirection matches minwage crux regression", () => {
  assert.deepEqual(Array.from(minwage.cruxes.map(ctx.classifyCruxDirection)), ["up", "up", "up"]);
});

test("invertRange flips probability range", () => {
  approxRange(ctx.invertRange([0.2, 0.7]), [0.3, 0.8]);
});

test("invertRange returns invalid input unchanged", () => {
  const invalid = "not a range";
  assert.equal(ctx.invertRange(invalid), invalid);
});

test("invertRange matches minwage estimate regression", () => {
  approxRange(ctx.invertRange(minwage.estimate), [0.58, 0.82]);
});
