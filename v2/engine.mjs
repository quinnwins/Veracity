// Pure probability arithmetic. No UI state, provider calls, or source rankings.
export const ENGINE_VERSION = '2.0.0-beta.1';
export class AuditError extends Error {
  constructor(message, code = 'INVALID_MODEL', status = 422) {
    super(message); this.name = 'AuditError'; this.code = code; this.status = status;
  }
}
export function requireThat(condition, message, code, status) {
  if (!condition) throw new AuditError(message, code, status);
}
export function probability(p, label = 'probability') {
  requireThat(typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1, `${label} must be finite and between 0 and 1`);
  return p;
}
export function normalizeRange(r) {
  requireThat(Array.isArray(r) && r.length === 2, 'Expected a two-endpoint probability range');
  r.forEach(x => probability(x));
  requireThat(r[0] <= r[1], 'Probability endpoints must be ordered; invalid inputs are never silently repaired');
  return [...r];
}
export const midpoint = r => { const [a, b] = normalizeRange(r); return (a + b) / 2; };
export const complement = r => { const [a, b] = normalizeRange(r); return [1 - b, 1 - a]; };
const logit = p => p === 0 ? -Infinity : p === 1 ? Infinity : Math.log(p) - Math.log1p(-p);
const logistic = x => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
export function likelihoodRange(r) {
  requireThat(Array.isArray(r) && r.length === 2 && r.every(x => Number.isFinite(x) && x > 0) && r[0] <= r[1], 'LR endpoints must be finite, positive, and ordered');
  return [...r];
}
export function bayesUpdate(prior, evidence = []) {
  let [lo, hi] = normalizeRange(prior).map(logit);
  const seen = new Set();
  requireThat(Array.isArray(evidence), 'Evidence must be an array');
  for (const item of evidence) {
    if (item.status === 'ungrounded' || item.kind === 'structural') continue;
    requireThat(item.likelihood?.lr, 'An evidence update needs an explicit likelihood range');
    const key = item.independenceCluster || item.id;
    requireThat(typeof key === 'string' && key.length > 0, 'An evidence update needs a cluster ID');
    requireThat(!seen.has(key), `Duplicate independence cluster: ${key}`);
    seen.add(key);
    const [a, b] = likelihoodRange(item.likelihood.lr);
    lo += Math.log(a); hi += Math.log(b);
  }
  return [logistic(lo), logistic(hi)];
}
export function composeRelation(relation, children) {
  requireThat(relation, 'Missing relation semantics');
  requireThat(Array.isArray(children) && children.length > 0, 'Relation has no children');
  const rs = children.map(normalizeRange), lo = rs.map(r => r[0]), hi = rs.map(r => r[1]);
  const sum = xs => xs.reduce((a, b) => a + b, 0), product = xs => xs.reduce((a, b) => a * b, 1);
  if (relation.kind === 'and') {
    if (relation.dependence === 'independent') return [product(lo), product(hi)];
    if (relation.dependence === 'bounded') return [Math.max(0, sum(lo) - (rs.length - 1)), Math.min(...hi)];
  }
  if (relation.kind === 'or') {
    if (relation.exclusivity === 'independent') return complement(composeRelation({kind: 'and', dependence: 'independent'}, rs.map(complement)));
    if (relation.exclusivity === 'exclusive') {
      requireThat(sum(lo) <= 1 + 1e-12, 'Exclusive event probabilities have an impossible sum');
      return [Math.min(1, sum(lo)), Math.min(1, sum(hi))];
    }
    if (relation.exclusivity === 'overlapping' || relation.exclusivity === 'bounded') return [Math.max(...lo), Math.min(1, sum(hi))];
  }
  throw new AuditError('Unsupported composition: explicit dependence or overlap semantics are required');
}
export function hypothesisPosterior(hypotheses, evidence = []) {
  requireThat(Array.isArray(hypotheses) && hypotheses.length > 0, 'Empty hypothesis set');
  requireThat(hypotheses.every(h => h.exclusive === true && h.exhaustive === true), 'Normalization requires an exclusive + exhaustive hypothesis set');
  requireThat(hypotheses.every(h => typeof h.id === 'string') && new Set(hypotheses.map(h => h.id)).size === hypotheses.length, 'Hypothesis IDs must be unique');
  requireThat(hypotheses.every(h => h.prior !== undefined), 'Every hypothesis needs a disclosed prior');
  const priors = hypotheses.map(h => probability(h.prior)), total = priors.reduce((a, b) => a + b, 0);
  requireThat(Math.abs(total - 1) < 1e-9, 'Hypothesis priors must sum to 1');
  const logs = priors.map(Math.log), seen = new Set();
  for (const e of evidence) {
    const key = e.independenceCluster || e.id;
    requireThat(key && !seen.has(key), 'Missing or duplicate independence cluster'); seen.add(key);
    requireThat(e.lrPerH && e.commonReference, 'Hypothesis likelihoods require a shared reference, not separate H-vs-rest odds');
    hypotheses.forEach((h, i) => { const lr = e.lrPerH[h.id]; likelihoodRange([lr, lr]); logs[i] += Math.log(lr); });
  }
  const max = Math.max(...logs), xs = logs.map(v => Math.exp(v - max)), z = xs.reduce((a, b) => a + b, 0);
  return Object.fromEntries(hypotheses.map((h, i) => [h.id, xs[i] / z]));
}
export function entropyBinary(p) {
  probability(p); return p === 0 || p === 1 ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}
export function expectedInformationGain(current, outcomes) {
  const r = normalizeRange(current);
  // EIG requires an actual predictive distribution, not arbitrary interval midpoints.
  requireThat(r[0] === r[1], 'EIG requires a point posterior; use potential swing for interval assessments');
  if (!Array.isArray(outcomes) || !outcomes.length) return null;
  let total = 0, mean = 0, conditionalEntropy = 0;
  for (const o of outcomes) {
    const q = probability(o.probability), p = normalizeRange(o.posterior);
    requireThat(p[0] === p[1], 'EIG outcome posteriors must be point probabilities');
    total += q; mean += q * p[0]; conditionalEntropy += q * entropyBinary(p[0]);
  }
  requireThat(Math.abs(total - 1) < 1e-9 && Math.abs(mean - r[0]) < 1e-9, 'Outcome probabilities and posteriors violate total probability');
  return Math.max(0, entropyBinary(r[0]) - conditionalEntropy);
}
export function rootSwing(base, variants) {
  requireThat(Array.isArray(variants) && variants.length > 0, 'No sensitivity variants');
  return Math.max(...variants.map(r => Math.abs(midpoint(r) - midpoint(base))));
}
export function validateAssessment(a) {
  const errors = [];
  if (!a?.contract?.wording) errors.push('Missing claim wording');
  if (!a?.contract?.falsifier) errors.push('Missing falsifier');
  if (!a?.nodes?.[a.rootId]) errors.push('Missing root node');
  for (const [id, n] of Object.entries(a?.nodes || {})) {
    try {
      if (n.prior) normalizeRange(n.prior);
      if (n.posterior) normalizeRange(n.posterior);
      if (n.status === 'scored') requireThat((n.prior || n.posterior) && n.provenance, `${id}: probability lacks provenance`);
    } catch (e) { errors.push(`${id}: ${e.message}`); }
  }
  return {ok: errors.length === 0, errors};
}
