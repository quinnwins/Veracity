import {AuditError, requireThat, normalizeRange, likelihoodRange} from './engine.mjs';
import {assertDecomposition, childrenOf, decompositionSystemPrompt, probabilityElicitationPrompt} from './decomposition.mjs';
import {digest, fetchSource, validateEvidence} from './evidence.mjs';
import {analyzeGraph} from './graph.mjs';
import {RunBudget, JevProvider} from './providers.mjs';
import {createAgentRegistry} from './agents.mjs';
export const PIPELINE_VERSION = '2.0.0-beta.1';
const nonnumeric = n => ['definition', 'value'].includes(n.type);
const eligible = n => !nonnumeric(n) && !['and', 'or'].includes(n.relation?.kind) && n.atomicity?.status !== 'unresolved';
const now = () => new Date().toISOString();
export async function runAudit({question, previousModel, targetNodeId, signal, onProgress = async () => {}, provider, worker, judge, agentRegistry, orchestratorAgent, workerAgent, fetcher = fetchSource, limits = {}}) {
  const budget = provider?.budget || new RunBudget(limits);
  let selected = null;
  if (!provider || !worker) {
    const registry = agentRegistry || createAgentRegistry();
    selected = registry.roles({orchestrator: orchestratorAgent, worker: workerAgent, orchestratorBudget: budget, workerBudget: budget});
    provider ||= selected.orchestrator;
    if (!worker) {
      worker = selected.worker.configured ? selected.worker : provider;
      selected.effectiveWorkerName = selected.worker.configured ? selected.workerName : selected.orchestratorName;
    }
  }
  judge ||= new JevProvider({budget});
  requireThat(provider.configured, 'The selected orchestrator is not configured', 'PROVIDER_UNCONFIGURED', 503);
  requireThat(worker.configured, 'The selected worker is not configured', 'PROVIDER_UNCONFIGURED', 503);
  const maxNodes = limits.maxNodes || 40, maxRounds = limits.maxRounds || 2, maxTargets = limits.maxTargets || 6;
  const combinedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(600000)]) : AbortSignal.timeout(600000);
  const warnings = [], retrieval = [], modelVersions = {requested: provider.model, workerRequested: worker.model, orchestratorAgent: selected?.orchestratorName || provider.name || 'injected', workerAgent: selected?.effectiveWorkerName || selected?.workerName || worker.name || 'injected', orchestratorDriver: provider.driver || 'openai', workerDriver: worker.driver || 'openai', pipeline: PIPELINE_VERSION};
  let model, reviewComplete = false;
  const emit = async stage => { combinedSignal.throwIfAborted(); await onProgress({stage, model: model ? structuredClone(model) : null, usage: budget.snapshot()}); };
  if (previousModel) {
    model = structuredClone(previousModel);
    requireThat(!model.demo && model.contract.wording === question && Object.hasOwn(model.nodes, targetNodeId), 'Invalid focused investigation');
    requireThat(eligible(model.nodes[targetNodeId]), 'Select a measurable, independently assessed node');
    model.warnings ||= []; model.sources ||= {}; model.evidence ||= {};
    await emit('Reopening the selected uncertainty');
  } else {
    await emit('Defining the claim and its alternatives');
    const wire = await provider.json('decomposition', decompositionSystemPrompt(), {question, maxNodes, maxDepth: 5}, combinedSignal);
    requireThat(Array.isArray(wire.nodes) && wire.nodes.length <= maxNodes && new Set(wire.nodes.map(n => n.id)).size === wire.nodes.length, 'Invalid decomposition node list');
    requireThat(wire.contract?.wording === question, 'Provider changed the exact question');
    model = {...wire, nodes: Object.fromEntries(wire.nodes.map(n => [n.id, n])), sources: {}, evidence: {}, warnings: [], demo: false};
    assertDecomposition(model, {maxNodes, maxDepth: 6});
    if (model.contract.needsClarification) {
      return {model, analysis: analyzeGraph(model), status: 'needs_clarification', usage: budget.snapshot(), modelVersions, warnings: ['Choose an explicit reading before assigning a probability.']};
    }
    if (model.contract.mode !== 'descriptive') {
      for (let round = 0; round < maxRounds; round++) {
        const leaves = Object.entries(model.nodes).filter(([, n]) => !childrenOf(n).length && !nonnumeric(n) && !n.atomicity);
        if (!leaves.length) break;
        await emit(`Checking hidden assumptions · pass ${round + 1}`);
        const response = await provider.json('atomicity', `${decompositionSystemPrompt()}\nReview every leaf in the input. Report whether a single specified observation resolves it. If not, expose the missing subclaims. Never call a budget-stopped leaf atomic.`, {leaves: leaves.map(([id, n]) => ({nodeId: id, ...n})), contract: model.contract}, combinedSignal);
        requireThat(Array.isArray(response.reviews) && response.reviews.length === leaves.length && new Set(response.reviews.map(r => r.nodeId)).size === leaves.length, 'Atomicity review did not cover every requested leaf');
        for (const review of response.reviews) {
          requireThat(leaves.some(([id]) => id === review.nodeId) && typeof review.atomic === 'boolean' && review.reason && review.observation, 'Invalid atomicity review');
          const n = model.nodes[review.nodeId];
          if (review.atomic) { n.atomicity = {status: 'measurable', reason: review.reason, observation: review.observation}; continue; }
          const kids = review.children || [];
          if (!kids.length || round === maxRounds - 1 || Object.keys(model.nodes).length + kids.length > maxNodes) {
            n.atomicity = {status: 'unresolved', reason: `${review.reason} Decomposition stopped at the configured budget; no irreducibility claim is made.`}; continue;
          }
          requireThat(review.relation && ['and', 'or', 'informational'].includes(review.relation.kind), 'A split requires explicit relation semantics');
          const ids = kids.map((child, i) => {
            const id = `${review.nodeId}_${round}_${i}`; requireThat(!Object.hasOwn(model.nodes, id), 'Generated node ID collision');
            model.nodes[id] = {id, text: child.text, falsifier: child.falsifier, type: 'atomic', relation: null, nextInvestigation: child.falsifier}; return id;
          });
          n.type = n.type === 'atomic' ? 'premise' : n.type;
          n.atomicity = {status: 'decomposed', reason: review.reason};
          n.relation = {...review.relation, kind: review.relation.equivalent ? review.relation.kind : 'informational', children: ids};
        }
        assertDecomposition(model, {maxNodes, maxDepth: 6});
      }
    }
  }
  const targets = Object.entries(model.nodes).filter(([id, n]) => (!targetNodeId || id === targetNodeId) && eligible(n));
  // Research the root first when it requires its own evidence model; do not multiply its explanations.
  targets.sort(([a], [b]) => Number(b === model.rootId) - Number(a === model.rootId));
  for (const [id, n] of targets.slice(0, maxTargets)) {
    await emit(`Finding supporting and contrary evidence · ${id}`);
    try {
      const search = await worker.search(n, model.contract, combinedSignal), packets = [];
      retrieval.push({nodeId: id, at: now(), ...search});
      for (const s of search.sources.slice(0, 3)) {
        try {
          const cached = Object.values(model.sources).find(v => v.url === s.url);
          if (cached) { packets.push(cached); continue; }
          budget.reserve('source');
          const source = await fetcher(s.url, {signal: combinedSignal}); source.title = s.title || source.title;
          requireThat(source.text && source.sha256 === digest(source.text), 'Fetched source integrity failure');
          model.sources[source.id] = source; packets.push(source);
        } catch (e) { if (combinedSignal.aborted) throw combinedSignal.reason; warnings.push(`${id}: source unavailable (${s.url}): ${e.message}`); }
      }
      // Focused investigations re-elicitate ONE joint update over old + new evidence, never compound their own posterior.
      if (previousModel) for (const e of Object.values(model.evidence).filter(e => e.targetNodeIds.includes(id))) for (const ref of e.references) {
        const s = model.sources[ref.sourceId]; if (s && !packets.some(p => p.id === s.id)) packets.push(s);
      }
      if (!packets.length) { warnings.push(`${id}: no readable source text; no probability assigned`); continue; }
      if (judge.configured) {
        try { n.judgments = [await judge.judge(n, packets, combinedSignal)]; }
        catch (e) { if (combinedSignal.aborted) throw combinedSignal.reason; warnings.push(`${id}: Jev diagnostic unavailable: ${e.message}`); }
      }
      if (model.contract.mode === 'descriptive') { n.sourceIds = packets.map(p => p.id); continue; }
      await emit(`Assessing the evidence model · ${id}`);
      const boundedPackets = packets.map(s => ({id: s.id, url: s.url, title: s.title, text: s.text.slice(0, 24000), truncated: s.text.length > 24000}));
      n.readingWindows = boundedPackets.map(s => ({sourceId: s.id, charactersRead: s.text.length, truncated: s.truncated}));
      if (boundedPackets.some(s => s.truncated)) warnings.push(`${id}: some source text exceeded the per-source model reading budget; source coverage is partial`);
      const instructions = `${probabilityElicitationPrompt(n, 'The source packets are supplied once in the structured input sources field.')}\nUse the elicitation schema: one jointLR for the WHOLE packet, never independent LRs for correlated articles. Explain dependence in jointRationale. All evidence references require exact quotes. ${previousModel && n.prior ? `Retain the pre-evidence prior ${JSON.stringify(n.prior)} and reference class ${n.referenceClass}; do not use the earlier posterior as a prior.` : ''}`;
      const elicited = await provider.json('elicitation', instructions, {node: n, contract: model.contract, sources: boundedPackets}, combinedSignal);
      if (elicited.abstain) { n.abstentionReason = elicited.reason; delete n.prior; warnings.push(`${id}: ${elicited.reason}`); continue; }
      normalizeRange(elicited.prior); likelihoodRange(elicited.jointLR);
      requireThat(elicited.referenceClass && elicited.priorRationale && elicited.jointRationale, 'Missing probability rationale');
      requireThat(Array.isArray(elicited.references) && elicited.references.length > 0, 'No evidence references supplied');
      requireThat(elicited.references.every(r => typeof r.quote === 'string' && r.quote.trim().split(/\s+/).length <= 25), 'Model source quotes must be brief');
      requireThat(elicited.references.every(r => packets.some(p => p.id === r.sourceId) && elicited.excludesEvidenceIds.includes(r.sourceId)), 'Prior/evidence separation is not disclosed');
      const e = {id: `e-${id}-${digest(JSON.stringify(elicited.references)).slice(0, 10)}`, targetNodeIds: [id], observation: elicited.observation, references: elicited.references, independenceCluster: `joint-${id}`, status: 'observed', likelihood: {lr: elicited.jointLR, provenance: {kind: 'model', model: provider.model, rationale: elicited.jointRationale, at: now(), calibration: 'not-evaluated'}}};
      validateEvidence(e, model.sources);
      if (!previousModel || !n.prior) { n.prior = elicited.prior; n.referenceClass = elicited.referenceClass; n.provenance = {kind: 'model', model: provider.model, rationale: elicited.priorRationale, at: now(), calibration: 'not-evaluated'}; }
      for (const old of Object.values(model.evidence)) if (old.targetNodeIds.includes(id)) delete model.evidence[old.id];
      model.evidence[e.id] = e; n.plausiblePrior = [...n.prior]; n.nextInvestigation = elicited.nextInvestigation;
    } catch (e) { if (combinedSignal.aborted) throw combinedSignal.reason; warnings.push(`${id}: ${e.message}`); }
  }
  for (const [id] of targets.slice(maxTargets)) warnings.push(`${id}: not researched because the configured target budget was reached`);
  if (model.contract.mode !== 'descriptive') {
    await emit('Challenging the model and its strongest assumptions');
    try {
      const review = await provider.json('audit', `${decompositionSystemPrompt()}\nAttack this evidence model. Check logical equivalence, hidden dependencies, exact claim reading, priors recycling evidence, joint likelihood rationale, unrepresented rival mechanisms, weak source fit, and missing contrary evidence. Identify blocking flaws by node ID. Do not invent additional sources or a new numeric verdict.`, {model: {...model, sources: Object.fromEntries(Object.entries(model.sources).map(([id, s]) => [id, {...s, text: s.text.slice(0, 8000)}]))}}, combinedSignal);
      requireThat(Array.isArray(review.findings) && Array.isArray(review.contrarySearches), 'Malformed model review');
      for (const f of review.findings) {
        requireThat(Object.hasOwn(model.nodes, f.nodeId) && ['blocking', 'warning'].includes(f.severity) && f.reason, 'Invalid reviewer finding');
        warnings.push(`${f.nodeId}: ${f.reason}`);
        if (f.severity === 'blocking') model.nodes[f.nodeId].atomicity = {status: 'unresolved', reason: f.reason};
      }
      model.adversarialReview = {...review, model: provider.model, at: now(), independentEvidence: false}; reviewComplete = true;
    } catch (e) { if (combinedSignal.aborted) throw combinedSignal.reason; warnings.push(`Adversarial review incomplete: ${e.message}`); }
  } else reviewComplete = true;
  model.warnings = [...(model.warnings || []), ...warnings]; model.retrieval = [...(model.retrieval || []), ...retrieval]; model.versions = modelVersions;
  model.reviewStatus = reviewComplete ? 'completed' : 'incomplete';
  const analysis = analyzeGraph(model);
  const unresolved = Object.values(analysis.nodes).some(n => !n.range && n.status !== 'descriptive');
  return {model, analysis, status: model.contract.mode === 'descriptive' ? 'descriptive' : analysis.root.range && reviewComplete && !unresolved && !warnings.length ? 'ready' : 'partial', reviewComplete, usage: budget.snapshot(), modelVersions, warnings};
}
