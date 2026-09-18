import {join} from 'node:path';
import {once} from 'node:events';
import {AuditError, requireThat} from '../engine.mjs';
import {auditHash} from '../store.mjs';
import {ScaleStore} from './store.mjs';
import {runCampaign, JevBatchClient} from './runner.mjs';
import {prepareCampaign, tierProviders} from './prepare.mjs';
import {createAgentRegistry} from '../agents.mjs';
import {syntheticManifest, SyntheticClient} from './synthetic.mjs';
import {selectReview, reviewCampaign} from './review.mjs';
import {composeReviewed} from './compose.mjs';

export class ScaleService {
  constructor({directory, audits, providers, agentRegistry = createAgentRegistry(), clientFactory = () => new JevBatchClient()} = {}) {
    this.directory = directory; this.audits = audits; this.agentRegistry = agentRegistry;
    this.providers = providers || (selection => tierProviders({...selection, registry: this.agentRegistry}));
    this.clientFactory = clientFactory; this.jobs = new Map(); this.preparations = new Map(); this.closing = false; this.pending = false; this.exporting = new Set();
  }
  async init() { this.store = await new ScaleStore(join(this.directory, 'probability-scale')).init(); return this; }
  config() {
    const p = this.providers(), c = this.clientFactory();
    return {orchestrator: {name: p.orchestratorName || p.orchestrator.name || null, model: p.orchestrator.model || null, driver: p.orchestrator.driver || 'openai', configured: p.orchestrator.configured},
      worker: {name: p.workerName || p.worker.name || null, model: p.worker.model || null, driver: p.worker.driver || 'openai', configured: p.worker.configured},
      agents: this.agentRegistry?.publicConfig?.() || null,
      jev: {model: c.model, configured: c.configured}, maxQuestions: 100000, activeJobs: this.jobs.size,
      calibration: 'not-evaluated', deployment: 'Single process, private SQLite workspace', costScope: 'Jev preview excludes planning and review; byte reservations are not a guaranteed invoice cap'};
  }
  capacity() { requireThat(!this.closing && !this.pending && this.jobs.size === 0 && this.exporting.size === 0, 'One scale operation can run at a time', 'BUSY', 429); }
  track(id, work) {
    const controller = new AbortController(), job = {controller, promise: null}; this.jobs.set(id, job);
    job.promise = Promise.resolve().then(() => work(controller.signal)).catch(e => {
      // Details are persisted on the preparation/run, never keys or full request bodies in logs.
      console.error(JSON.stringify({event: 'scale_job_stopped', id, code: e.code || 'SCALE_JOB'}));
      this.store.sql('UPDATE runs SET error=?,updated_at=? WHERE id=?').run(e instanceof AuditError ? e.message : 'Scale operation stopped; unreviewed results remain unreviewed', new Date().toISOString(), id);
    }).finally(() => this.jobs.delete(id));
  }
  async prepare(b, key) {
    requireThat(typeof key === 'string' && /^[a-zA-Z0-9_.-]{8,100}$/.test(key), 'Supply a valid Idempotency-Key');
    const fingerprint = auditHash(b);
    const existing = (await this.audits.list()).find(a => a.scaleRequestKey === key);
    if (existing) { requireThat(existing.requestFingerprint === fingerprint, 'Idempotency key reused with different input', 'IDEMPOTENCY_CONFLICT', 409); return {preparationId: existing.id}; }
    requireThat(Number.isInteger(b.maxQuestions) && b.maxQuestions > 0 && b.maxQuestions <= 100000, 'Invalid question limit');
    this.capacity(); const providers = this.providers({orchestratorAgent: b.orchestratorAgent, workerAgent: b.workerAgent});
    requireThat(providers.orchestrator.configured && providers.worker.configured && this.clientFactory().configured, 'Configure orchestrator, worker and Jev providers first', 'PROVIDER_UNCONFIGURED', 503);
    this.pending = true;
    try {
      requireThat(this.store.list().length < 30 && (await this.audits.list()).length < 200, 'Research retention limit reached', 'RETENTION_LIMIT', 409);
      const parent = await this.audits.get(b.assessmentId);
      requireThat(parent.revision === b.expectedRevision && parent.model && parent.status !== 'running', 'Parent changed or is not ready', 'REVISION_CONFLICT', 409);
      const record = await this.audits.create({kind: 'scale-preparation', question: parent.question, parentId: parent.id,
        status: 'running', stage: 'Preparing a bounded probability study', scaleRequestKey: key, requestFingerprint: fingerprint, events: []});
      this.track(record.id, async signal => {
        const update = async fields => { const r = await this.audits.get(record.id); return this.audits.update(r.id, r.revision, a => ({...a, ...fields})); };
        try {
          const manifest = await prepareCampaign(parent, {...providers, maxQuestions: b.maxQuestions, signal, onProgress: stage => update({stage})});
          signal.throwIfAborted(); const campaign = this.store.create({...manifest, limits: {maxQuestions: b.maxQuestions}});
          await update({status: 'scale-planned', stage: 'Probability study planned; review the Jev dispatch estimate before starting', campaignId: campaign.id, preparationUsage: manifest.plan.usage});
        } catch (e) { await update({status: signal.aborted ? 'cancelled' : 'failed', stage: 'Study preparation stopped', error: e instanceof AuditError ? e.message : 'Preparation failed; inspect provider configuration', preparationUsage: {orchestrator: providers.orchestrator.budget?.snapshot(), worker: providers.worker.budget?.snapshot()}}); }
      });
      return {preparationId: record.id};
    } finally { this.pending = false; }
  }
  async handle(req, res, url, {body, json}) {
    const path = url.pathname;
    if (!path.startsWith('/api/scale/')) return false;
    const get = req.method === 'GET';
    if (path === '/api/scale/config' && get) { json(res, 200, this.config()); return true; }
    if (path === '/api/scale/runs' && get) { json(res, 200, {runs: this.store.list()}); return true; }
    if (path === '/api/scale/prepare' && req.method === 'POST') { json(res, 202, await this.prepare(await body(req), req.headers['idempotency-key'])); return true; }
    if (path === '/api/scale/simulation' && req.method === 'POST') {
      const b = await body(req); this.capacity(); requireThat([1000,10000,100000].includes(b.count), 'Choose 1,000, 10,000 or 100,000 synthetic judgments');
      const r = this.store.create(syntheticManifest(b.count)); json(res, 201, r); return true;
    }
    const preparation = path.match(/^\/api\/scale\/preparations\/([a-f0-9-]{36})\/cancel$/);
    if (preparation && req.method === 'POST') {
      const record = await this.audits.get(preparation[1]), job = this.jobs.get(record.id);
      requireThat(record.kind === 'scale-preparation' && job, 'No active preparation', 'NOT_RUNNING', 409);
      job.controller.abort(new AuditError('Preparation cancelled by user', 'CANCELLED'));
      json(res, 202, {status: 'stopping'}); return true;
    }
    const m = path.match(/^\/api\/scale\/runs\/([a-f0-9-]{36})(?:\/(start|pause|cancel|review|review-plan|items|trace|export|compose))?$/);
    requireThat(m, 'Not found', 'NOT_FOUND', 404); const [, id, action] = m; const run = this.store.get(id);
    if (get && !action) { json(res, 200, {...run, active: this.jobs.has(id)}); return true; }
    if (get && action === 'items') { json(res, 200, this.store.page(id, {after: Number(url.searchParams.get('after') ?? -1), limit: Number(url.searchParams.get('limit') ?? 50), review: url.searchParams.get('review')})); return true; }
    if (get && action === 'review-plan') { json(res, 200, selectReview(this.store, id)); return true; }
    if (get && action === 'trace') { json(res, 200, this.store.trace(id, url.searchParams.get('key'))); return true; }
    if (get && action === 'export') {
      this.capacity();
      const exportControl = new AbortController(); let finishExport; const exportJob = {controller: exportControl, promise: new Promise(resolve => { finishExport = resolve; })}; this.exporting.add(exportJob);
      try {
        res.writeHead(200, {'Content-Type': 'application/x-ndjson; charset=utf-8', 'Content-Disposition': `attachment; filename="veracity-probabilities-${id}.jsonl"`, 'Cache-Control': 'no-store'});
        const controller = exportControl; res.once('close', () => controller.abort());
        const write = async obj => { controller.signal.throwIfAborted(); if (!res.write(JSON.stringify(obj) + '\n')) await once(res, 'drain', {signal: controller.signal}); };
        await write({type: 'campaign', run});
        for (const p of this.store.sql('SELECT DISTINCT packet_hash hash FROM tasks WHERE run_id=?').all(id)) await write({type: 'packet', ...this.store.getPacket(p.hash)});
        for (const t of this.store.each(id)) await write({type: 'estimate', ...t});
        for (const b of this.store.sql('SELECT key FROM batches WHERE run_id=? ORDER BY seq').all(id)) await write({type: 'batch', key: b.key, ...this.store.trace(id, b.key)});
        res.end(); return true;
      } finally { this.exporting.delete(exportJob); finishExport(); }
    }
    requireThat(req.method === 'POST', 'Method not allowed', 'METHOD', 405); const b = await body(req);
    if (action === 'pause' || action === 'cancel') {
      const job = this.jobs.get(id); requireThat(job, 'No active operation', 'NOT_RUNNING', 409);
      job.controller.abort(new AuditError(action === 'cancel' ? 'Cancelled by user' : 'Paused by user', action === 'cancel' ? 'CANCELLED' : 'PAUSED'));
      json(res, 202, {status: 'stopping'}); return true;
    }
    this.capacity();
    if (action === 'start') {
      requireThat(b.planHash === run.planHash && ['planned','paused','interrupted'].includes(run.status), 'Reload the saved plan before starting', 'REVISION_CONFLICT', 409);
      requireThat(run.simulation || b.approvePaid === true, 'Explicitly approve this saved plan before paid Jev inference', 'APPROVAL_REQUIRED', 422);
      const client = run.simulation ? new SyntheticClient() : this.clientFactory(); requireThat(client.configured, 'Configure TYPESAFE_API_KEY', 'PROVIDER_UNCONFIGURED', 503);
      this.track(id, signal => runCampaign(this.store, id, {client, signal, planHash: b.planHash})); json(res, 202, {id, status: 'starting'}); return true;
    }
    if (action === 'review') {
      requireThat(['completed', 'partial'].includes(run.status), 'Finish inference before strong-model review', 'NOT_READY', 409);
      requireThat(!run.simulation && b.approvePaid === true, 'Strong-model review requires an explicitly approved live study', 'APPROVAL_REQUIRED', 422);
      const {orchestrator} = this.providers({orchestratorAgent: run.plan?.agents?.orchestrator, workerAgent: run.plan?.agents?.worker}); requireThat(orchestrator.configured, 'Configure the orchestrator', 'PROVIDER_UNCONFIGURED', 503);
      this.track(id, async signal => { try { await reviewCampaign(this.store, id, orchestrator, {signal}); }
        finally { const r = this.store.get(id), log = [...r.reviewLog, {at: new Date().toISOString(), role: 'orchestrator', operation: 'review usage', usage: orchestrator.budget?.snapshot?.() || null}]; this.store.sql('UPDATE runs SET review_log=? WHERE id=?').run(JSON.stringify(log), id); } });
      json(res, 202, {id, status: 'reviewing'}); return true;
    }
    if (action === 'compose') { json(res, 200, composeReviewed(this.store, id, b.graph)); return true; }
    throw new AuditError('Not found', 'NOT_FOUND', 404);
  }
  async close() { this.closing = true; for (const e of this.exporting) e.controller.abort(); await Promise.allSettled([...this.exporting].map(e => e.promise)); for (const j of this.jobs.values()) j.controller.abort(new AuditError('Service shutting down', 'PAUSED')); await Promise.allSettled([...this.jobs.values()].map(j => j.promise)); await this.store.close(); }
}
