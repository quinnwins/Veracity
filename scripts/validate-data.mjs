import fs from "node:fs";

const dataUrl = new URL("../data.js", import.meta.url);
const code = fs.readFileSync(dataUrl, "utf8");
const window = {};

new Function("window", code)(window);

const errors = [];
const warnings = [];
const evidenceStatusRank = {
  "needs-verification": 0,
  "model-estimate": 1,
  "named-source": 2,
  "verified": 3
};

function validRange(value) {
  return Array.isArray(value) &&
    value.length === 2 &&
    value.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) &&
    value[0] <= value[1];
}

function validOpenRange(value) {
  return validRange(value) && value[0] > 0 && value[1] < 1;
}

function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

for (const [analysisId, analysis] of Object.entries(window.ANALYSES || {})) {
  const nodes = analysis.nodes || {};
  const nodeIds = new Set(Object.keys(nodes));
  const hypotheses = analysis.hypotheses || [];
  const hypothesisIds = new Set(hypotheses.map((h, i) => h.id || `H${i}`));
  const evidenceBudget = analysis.evidenceBudget || [];

  if (!nodes.C0) errors.push(`${analysisId}: missing C0 node`);
  if (!validRange(analysis.estimate)) errors.push(`${analysisId}: invalid top-level estimate`);
  if (analysis.priorRange && !validOpenRange(analysis.priorRange)) {
    errors.push(`${analysisId}: invalid priorRange`);
  }
  if (!analysis.rangeAnchors?.lower || !analysis.rangeAnchors?.upper) {
    warnings.push(`${analysisId}: missing top-level range anchors`);
  }

  hypotheses.forEach((hypothesis, i) => {
    const hypothesisId = hypothesis.id || `H${i}`;
    if (hypothesis.id && hypothesisIds.has(hypothesis.id) &&
        hypotheses.findIndex(h => h.id === hypothesis.id) !== i) {
      errors.push(`${analysisId}: duplicate hypothesis id ${hypothesis.id}`);
    }
    if (hypothesis.decomposition) {
      if (!Array.isArray(hypothesis.decomposition)) {
        errors.push(`${analysisId}:${hypothesisId}: decomposition must be an array`);
      } else {
        hypothesis.decomposition.forEach((subclaim, j) => {
          if (typeof subclaim.text !== "string" || !subclaim.text.trim()) {
            errors.push(`${analysisId}:${hypothesisId}: decomposition ${j} missing text`);
          }
          if (!validRange(subclaim.estimate)) {
            errors.push(`${analysisId}:${hypothesisId}: decomposition ${j} invalid estimate`);
          }
        });
      }
    }
  });

  const itemsWithLrPerH = evidenceBudget.filter(item => item.lrPerH);
  if (itemsWithLrPerH.length > 0 && itemsWithLrPerH.length < evidenceBudget.length) {
    warnings.push(`${analysisId}: lrPerH present on ${itemsWithLrPerH.length}/${evidenceBudget.length} evidenceBudget items`);
  }

  evidenceBudget.forEach((item, i) => {
    if ("kind" in item && item.kind !== "structural") {
      errors.push(`${analysisId}: evidenceBudget ${i} has invalid kind ${JSON.stringify(item.kind)} (allowed: "structural" or absent)`);
    }
    // FIX — tier field (Cromwell's rule per-tier LR cap). Optional; if
    // present must be 0|1|2|3 referencing the underlying atomic's sensoryTier.
    if ("tier" in item) {
      if (![0, 1, 2, 3].includes(item.tier)) {
        errors.push(`${analysisId}: evidenceBudget ${i} has invalid tier ${JSON.stringify(item.tier)} (allowed: 0, 1, 2, 3 or absent)`);
      }
    }
    if ("lr" in item && !positiveNumber(item.lr)) {
      errors.push(`${analysisId}: evidenceBudget ${i} has invalid lr`);
    }
    const hasLrLow = "lrLow" in item;
    const hasLrHigh = "lrHigh" in item;
    if (hasLrLow || hasLrHigh) {
      if (!positiveNumber(item.lrLow) || !positiveNumber(item.lrHigh)) {
        errors.push(`${analysisId}: evidenceBudget ${i} has invalid lrLow/lrHigh`);
      } else if (item.lrLow > item.lrHigh) {
        errors.push(`${analysisId}: evidenceBudget ${i} has lrLow > lrHigh`);
      }
    }
    if (item.lrPerH) {
      if (typeof item.lrPerH !== "object" || Array.isArray(item.lrPerH)) {
        errors.push(`${analysisId}: evidenceBudget ${i} lrPerH must be an object`);
      } else {
        for (const [hypothesisId, lr] of Object.entries(item.lrPerH)) {
          if (!hypothesisIds.has(hypothesisId)) {
            errors.push(`${analysisId}: evidenceBudget ${i} lrPerH references missing hypothesis ${hypothesisId}`);
          }
          if (!positiveNumber(lr)) {
            errors.push(`${analysisId}: evidenceBudget ${i} lrPerH.${hypothesisId} must be positive`);
          }
        }
      }
    }
  });

  for (const id of analysis.weakest || []) {
    if (!nodeIds.has(id)) errors.push(`${analysisId}: weakest references missing node ${id}`);
  }

  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node.id !== nodeId) errors.push(`${analysisId}: node key ${nodeId} has mismatched id ${node.id}`);
    if (node.parent && !nodeIds.has(node.parent)) {
      errors.push(`${analysisId}:${nodeId}: missing parent ${node.parent}`);
    }
    if (node.estimate && !validRange(node.estimate)) {
      errors.push(`${analysisId}:${nodeId}: invalid estimate`);
    }
    if (node.evidenceStatus && !(node.evidenceStatus in evidenceStatusRank)) {
      errors.push(`${analysisId}:${nodeId}: unknown evidenceStatus ${node.evidenceStatus}`);
    }
    // FIX — sensoryTier on atomic nodes (Cromwell's rule at the leaves).
    // Only meaningful on atomics; reject on non-atomics. Reject values other
    // than 0|1|2|3. Warn (not error) when the estimate upper bound exceeds
    // the tier's ceiling — analyst may justify the deviation but should
    // think about it. Tier-0 also gets a floor (Tier-0 facts shouldn't
    // carry low credence; if they did, they wouldn't be Tier-0).
    if ("sensoryTier" in node) {
      if (node.kind !== "atomic") {
        errors.push(`${analysisId}:${nodeId}: sensoryTier only valid on atomic nodes (kind: "atomic")`);
      } else if (![0, 1, 2, 3].includes(node.sensoryTier)) {
        errors.push(`${analysisId}:${nodeId}: invalid sensoryTier ${JSON.stringify(node.sensoryTier)} (allowed: 0, 1, 2, 3 or absent)`);
      } else if (validRange(node.estimate)) {
        const t = node.sensoryTier;
        const ceilings = { 0: 0.99, 1: 0.95, 2: 0.88, 3: 0.80 };
        const ceiling = ceilings[t];
        const [lo, hi] = node.estimate;
        if (hi > ceiling) {
          warnings.push(`${analysisId}:${nodeId}: Tier-${t} atomic estimate [${lo}, ${hi}] exceeds ceiling ${ceiling}`);
        }
        if (t === 0 && lo < 0.90) {
          warnings.push(`${analysisId}:${nodeId}: Tier-${t} atomic estimate [${lo}, ${hi}] floor below 0.90 — direct-sensory facts shouldn't carry low credence`);
        }
      }
    }
    for (const depId of node.depends || []) {
      if (!nodeIds.has(depId)) errors.push(`${analysisId}:${nodeId}: missing dependency ${depId}`);
      const dep = nodes[depId];
      if (node.evidenceStatus && dep?.evidenceStatus && dep.evidenceStatus === "needs-verification" &&
          ["named-source", "verified"].includes(node.evidenceStatus) &&
          evidenceStatusRank[node.evidenceStatus] > evidenceStatusRank[dep.evidenceStatus]) {
        warnings.push(`${analysisId}:${nodeId}: evidenceStatus ${node.evidenceStatus} is stronger than dependency ${depId} (${dep.evidenceStatus})`);
      }
    }
  }

  // FIX 2 — authored estimate vs softmax(H0) divergence warning.
  // When the multi-hypothesis posterior under equal priors diverges materially
  // from the authored top-level estimate band, the skill says treat the gap as
  // a flag, not noise. Mirrors `computeHypothesisPosterior` in verdict.jsx;
  // skips structural items per FIX 1.
  if (hypotheses.length > 0 && evidenceBudget.some(it => it.lrPerH) && validRange(analysis.estimate)) {
    const ids = hypotheses.map((h, i) => h.id || `H${i}`);
    const priors = ids.map(() => 1 / hypotheses.length);
    const logPosts = priors.map(p => Math.log(Math.max(p, 1e-12)));
    let anyEvidence = false;
    for (const item of evidenceBudget) {
      if (item.kind === "structural") continue;
      const lrMap = item.lrPerH;
      if (!lrMap || typeof lrMap !== "object") continue;
      for (let i = 0; i < ids.length; i++) {
        const lr = lrMap[ids[i]];
        if (typeof lr === "number" && lr > 0) {
          logPosts[i] += Math.log(lr);
          anyEvidence = true;
        }
      }
    }
    if (anyEvidence) {
      const maxLog = Math.max(...logPosts);
      const expShifted = logPosts.map(l => Math.exp(l - maxLog));
      const sumExp = expShifted.reduce((a, b) => a + b, 0);
      const posteriorH0 = expShifted[0] / sumExp;
      const midpoint = (analysis.estimate[0] + analysis.estimate[1]) / 2;
      const divergence = Math.abs(midpoint - posteriorH0);
      if (divergence > 0.25) {
        warnings.push(`${analysisId}: authored estimate midpoint ${midpoint.toFixed(2)} vs softmax(H0) ${posteriorH0.toFixed(2)} — divergence ${divergence.toFixed(2)} (>0.25)`);
      }
    }
  }
}

// FIX 3 — Cross-check ANALYSES keys against app.jsx SAMPLES IDs.
// Catches the failure mode where an analysis is authored in data.js and passes
// validation but is invisible in the web UI because SAMPLES is hardcoded.
// Drift in either direction is a warning, not an error.
try {
  const appUrl = new URL("../app.jsx", import.meta.url);
  const appCode = fs.readFileSync(appUrl, "utf8");
  const samplesMatch = appCode.match(/const SAMPLES\s*=\s*\[([\s\S]*?)\];/);
  if (samplesMatch) {
    const sampleIds = new Set();
    const idPattern = /\{\s*id:\s*"([^"]+)"/g;
    let m;
    while ((m = idPattern.exec(samplesMatch[1])) !== null) {
      sampleIds.add(m[1]);
    }
    const analysisIds = new Set(Object.keys(window.ANALYSES || {}));
    for (const id of analysisIds) {
      if (!sampleIds.has(id)) {
        warnings.push(`analysis ${id} exists in data.js but is missing from app.jsx SAMPLES (will not surface in the web UI)`);
      }
    }
    for (const id of sampleIds) {
      if (!analysisIds.has(id)) {
        warnings.push(`app.jsx SAMPLES references id ${id} but no such analysis exists in data.js`);
      }
    }
  } else {
    warnings.push(`could not locate SAMPLES array in app.jsx for cross-check`);
  }
} catch (err) {
  warnings.push(`SAMPLES cross-check failed: ${err.message}`);
}

for (const profile of window.PROFILES || []) {
  for (const [analysisId, overrides] of Object.entries(profile.adjustments || {})) {
    const analysis = window.ANALYSES?.[analysisId];
    if (!analysis) {
      errors.push(`profile ${profile.id}: missing analysis ${analysisId}`);
      continue;
    }
    for (const [nodeId, range] of Object.entries(overrides)) {
      const node = analysis.nodes?.[nodeId];
      if (!node) {
        errors.push(`profile ${profile.id}:${analysisId}: override references missing node ${nodeId}`);
      } else if (!node.tunable) {
        errors.push(`profile ${profile.id}:${analysisId}: override references non-tunable node ${nodeId}`);
      }
      if (!validRange(range)) errors.push(`profile ${profile.id}:${analysisId}:${nodeId}: invalid override range`);
    }
  }
}

for (const warning of warnings) console.warn(`WARN ${warning}`);

if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exit(1);
}

console.log(`Validated ${Object.keys(window.ANALYSES || {}).length} analyses and ${(window.PROFILES || []).length} profiles.`);
