import {ENGINE_VERSION, requireThat, normalizeRange, midpoint, composeRelation, bayesUpdate} from './engine.mjs';
import {childrenOf, assertDecomposition} from './decomposition.mjs';
import {validateEvidence, collapseEvidence} from './evidence.mjs';
export function evaluateGraph(assessment, {overrides = {}, excludeEvidenceIds = []} = {}) {
  assertDecomposition(assessment);
  const nodes = assessment.nodes, output = Object.create(null), warnings = [], excluded = new Set(excludeEvidenceIds);
  for (const [id, range] of Object.entries(overrides)) {
    requireThat(Object.hasOwn(nodes, id) && nodes[id].prior && !['and', 'or'].includes(nodes[id].relation?.kind), `Cannot override non-input node ${id}`);
    normalizeRange(range);
  }
  function visit(id) {
    if (Object.hasOwn(output, id)) return output[id];
    const n = nodes[id], relation = n.relation, childResults = childrenOf(n).map(visit);
    const entry = {id, range: null, status: 'unscored', reasons: [], inputs: [], evidenceIds: [], support: []};
    output[id] = entry;
    if (assessment.contract.mode === 'descriptive' || ['definition', 'value'].includes(n.type)) {
      entry.status = 'descriptive'; entry.reasons.push('Evidence map; no numeric verdict'); return entry;
    }
    if (assessment.reviewStatus === 'incomplete') { entry.reasons.push('Mandatory adversarial review did not complete'); return entry; }
    if (n.atomicity?.status === 'unresolved') { entry.reasons.push(n.atomicity.reason || 'Atomicity is unresolved'); return entry; }
    if (relation && ['and', 'or'].includes(relation.kind)) {
      if (relation.equivalent !== true || !relation.rationale) { entry.reasons.push('Supporting or necessary conditions are not a logically equivalent event'); return entry; }
      if (childResults.some(c => !c.range)) { entry.reasons.push('At least one required child is unscored'); return entry; }
      let applied = {...relation};
      const used = new Set(); let overlap = false;
      for (const c of childResults) for (const token of c.support) { if (used.has(token)) overlap = true; used.add(token); }
      if (relation.dependence === 'independent' || relation.exclusivity === 'independent') {
        if (!relation.independenceRationale || overlap) {
          applied = {...relation, dependence: 'bounded', exclusivity: 'bounded'};
          warnings.push(`${id}: independence not established or shared evidence detected; used dependence bounds`);
        }
      }
      entry.range = composeRelation(applied, childResults.map(c => c.range));
      entry.inputs = childrenOf(n); entry.support = [...used]; entry.rule = applied;
      entry.status = (applied.dependence === 'bounded' || applied.exclusivity === 'bounded' || applied.exclusivity === 'overlapping') ? 'bounded' : 'computed';
      return entry;
    }
    if (!n.prior || !n.provenance?.rationale) { entry.reasons.push('No disclosed, pre-evidence prior'); return entry; }
    if (!['elicited', 'model', 'measured', 'synthetic'].includes(n.provenance.kind) || (n.provenance.kind === 'synthetic' && !assessment.demo)) { entry.reasons.push('Invalid prior provenance'); return entry; }
    if (!n.referenceClass) { entry.reasons.push('Prior reference class is missing'); return entry; }
    let items = Object.values(assessment.evidence || {}).filter(e => e.targetNodeIds?.includes(id) && !excluded.has(e.id));
    try {
      items.forEach(e => validateEvidence(e, assessment.sources || {}, {asOf: assessment.contract.asOf, demo: assessment.demo}));
      items = collapseEvidence(items).map(g => g.representative);
      if (items.length > 1) requireThat(n.independenceRationale, 'Multiple evidence clusters need a conditional-independence rationale or one joint likelihood');
      const prior = normalizeRange(overrides[id] || n.prior);
      entry.range = bayesUpdate(prior, items); entry.prior = prior;
      entry.evidenceIds = items.map(e => e.id); entry.inputs = [id];
      entry.support = [`input:${id}`, ...items.flatMap(e => [`cluster:${e.independenceCluster || e.rootObservationId}`, ...e.references.map(r => `source:${r.sourceId}`)])];
      entry.rule = 'prior odds × joint likelihood ratios'; entry.status = items.length ? 'computed' : 'prior-only';
      if (!items.length) entry.reasons.push('Prior only: no verified evidence update');
    } catch (e) { entry.range = null; entry.reasons.push(e.message); }
    return entry;
  }
  const root = visit(assessment.rootId);
  for (const id of assessment.rivalRootIds || []) visit(id);
  const probabilityInputIds = Object.values(output).filter(n => n.prior).map(n => n.id);
  return {engineVersion: ENGINE_VERSION, root: {...root}, nodes: output, warnings, probabilityInputIds, interpretation: 'Sensitivity envelope under disclosed assumptions; not a calibrated confidence interval'};
}
export function analyzeGraph(a, options = {}) {
  const result = evaluateGraph(a, options), baseline = result.root.range, cruxes = [];
  if (baseline) {
    for (const id of result.probabilityInputIds) {
      if (!result.root.support.includes(`input:${id}`)) continue;
      const node = a.nodes[id], plausible = normalizeRange(node.plausiblePrior || options.overrides?.[id] || node.prior);
      const variants = plausible.map(p => evaluateGraph(a, {...options, overrides: {...options.overrides, [id]: [p, p]}}).root.range);
      if (variants.every(Boolean)) {
        const swing = Math.max(...variants.map(r => Math.max(Math.abs(r[0] - baseline[0]), Math.abs(r[1] - baseline[1]))));
        const span = Math.max(Math.abs(variants[1][0] - variants[0][0]), Math.abs(variants[1][1] - variants[0][1]));
        cruxes.push({nodeId: id, text: node.text, kind: 'prior', plausible, variants, swing, span, nextInvestigation: node.nextInvestigation || node.falsifier});
      }
    }
    for (const e of Object.values(a.evidence || {})) {
      const altered = structuredClone(a), width = e.likelihood?.lr;
      if (!width || width[0] === width[1]) continue;
      const variants = width.map(x => { altered.evidence[e.id].likelihood.lr = [x, x]; return evaluateGraph(altered, options).root.range; });
      if (variants.every(Boolean)) {
        const span = Math.max(...[0, 1].map(i => Math.abs(variants[1][i] - variants[0][i])));
        cruxes.push({nodeId: e.targetNodeIds[0], evidenceId: e.id, text: e.observation, kind: 'likelihood', variants, swing: span, span, nextInvestigation: 'Check the joint likelihood assumptions against an independent measurement.'});
      }
    }
  }
  cruxes.sort((a, b) => b.span - a.span);
  const relevant = Object.values(result.nodes).filter(n => baseline && result.root.support.includes(`input:${n.id}`));
  const withEvidence = relevant.filter(n => n.evidenceIds.length);
  result.cruxes = cruxes;
  // Counts are inspectability diagnostics, never a pseudo-probability of truth.
  result.grounding = {backedInputs: withEvidence.length, totalInputs: relevant.length, metric: 'inputs with exact source passages'};
  result.stability = {maxEndpointSwing: cruxes.length ? cruxes[0].span : null, tested: cruxes.length, scope: 'one-at-a-time prior and LR endpoints; not joint or structural robustness'};
  result.calibration = 'not-evaluated';
  result.nextInvestigations = cruxes.slice(0, 3).map(c => ({nodeId: c.nodeId, question: c.nextInvestigation, potentialSwing: c.span, expectedInformationGain: null}));
  if (!baseline) result.nextInvestigations = Object.values(result.nodes).filter(n => !n.range && n.status !== 'descriptive').map(n => ({nodeId: n.id, question: a.nodes[n.id].nextInvestigation || a.nodes[n.id].falsifier, reason: n.reasons.join('; ')})).slice(0, 5);
  return result;
}
