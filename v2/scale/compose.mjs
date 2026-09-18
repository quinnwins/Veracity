import {requireThat, composeRelation} from '../engine.mjs';
import {auditHash} from '../store.mjs';

// Direct estimates are already conditional on their evidence. Never feed them back as priors + the same LRs.
export function composeReviewed(store, runId, graph) {
  const run = store.get(runId);
  requireThat(['completed','partial'].includes(run.status), 'Finish the probability pass before composing');
  requireThat(graph && Array.isArray(graph.nodes) && graph.nodes.length >= 1 && graph.nodes.length <= 1000, 'Composition supports 1–1,000 explicit nodes');
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  requireThat(nodes.size === graph.nodes.length && nodes.has(graph.rootId), 'Invalid composition node IDs');
  const needed = new Set(graph.nodes.filter(n => n.kind === 'estimate').map(n => n.taskId)), estimates = new Map();
  for (const t of store.each(runId)) if (needed.has(t.id)) estimates.set(t.id, t);
  if (new Set([...estimates.values()].map(t => t.packetHash)).size > 1) requireThat(typeof graph.commonConditioningRationale === 'string' && graph.commonConditioningRationale.trim().length >= 40, 'Different evidence packets need a common-conditioning rationale: local marginals must remain valid under the combined evidence');
  const active = new Set(), computed = new Map(), warnings = [];
  function visit(id, depth = 0) {
    requireThat(depth <= 20 && !active.has(id), 'Composition cycle or excessive depth');
    if (computed.has(id)) return computed.get(id);
    const n = nodes.get(id); requireThat(n, 'Missing composition node'); active.add(id);
    let out;
    if (n.kind === 'estimate') {
      const t = estimates.get(n.taskId);
      requireThat(t?.status === 'completed' && t.review.status === 'accepted', 'Only explicitly reviewed local estimates can enter this model');
      requireThat(!n.prior && !n.evidence && !n.likelihood && !n.lr, 'A direct estimate cannot be updated again with the same evidence');
      const packet = store.getPacket(t.packetHash);
      out = {id, range: [t.probability, t.probability], taskId: t.id, text: t.q.proposition,
        support: [`estimate:${t.id}`, ...packet.state.passages.flatMap(s => [`source:${s.sourceDigest}`, `root:${s.rootId}`])],
        semantics: 'direct conditional model estimate; not a prior'};
    } else {
      requireThat(['and','or'].includes(n.kind) && Array.isArray(n.children) && n.children.length >= 1 && new Set(n.children).size === n.children.length, 'Invalid combination');
      requireThat(n.equivalent === true && typeof n.rationale === 'string' && n.rationale.trim().length >= 20 && typeof n.text === 'string' && n.text.trim().length > 0, 'Composition requires declared logical equivalence and rationale');
      const children = n.children.map(c => visit(c, depth + 1)), support = new Set(); let overlap = false;
      for (const c of children) for (const s of new Set(c.support)) { if (support.has(s)) overlap = true; support.add(s); }
      let relation = {kind: n.kind, dependence: 'bounded', exclusivity: 'bounded'};
      if (n.independent === true && !overlap) {
        requireThat(typeof n.independenceRationale === 'string' && n.independenceRationale.length >= 30, 'Independent composition requires a substantive rationale');
        relation = {kind: n.kind, dependence: 'independent', exclusivity: 'independent'};
      } else if (n.independent && overlap) warnings.push(`${id}: shared inputs or sources; independence shortcut withheld`);
      out = {id, text: n.text, range: composeRelation(relation, children.map(c => c.range)), relation, support: [...support], rationale: n.rationale};
    }
    active.delete(id); computed.set(id, out); return out;
  }
  const root = visit(graph.rootId);
  requireThat(computed.size === nodes.size, 'Composition contains disconnected nodes');
  return {id: auditHash({runId, graph, estimates: [...estimates.values()].map(t => ({id: t.id, p: t.probability, review: t.review}))}), runId, simulation: run.simulation,
    contract: run.contract, root, nodes: [...computed.values()], warnings,
    calibration: 'not-evaluated', interpretation: 'Dependence bounds over reviewed MODEL estimates; not a calibrated credible interval or automatic truth verdict',
    graph, createdAt: new Date().toISOString()};
}
