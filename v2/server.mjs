import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';
import {randomBytes, timingSafeEqual, randomUUID} from 'node:crypto';
import {AuditError, requireThat, normalizeRange, likelihoodRange} from './engine.mjs';
import {AuditStore, auditHash} from './store.mjs';
import {analyzeGraph} from './graph.mjs';
import {createDemo} from './demo.mjs';
import {digest, sourceURL, validateEvidence} from './evidence.mjs';
import {runAudit} from './pipeline.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const terminal = new Set(['ready', 'partial', 'demo', 'scenario', 'descriptive', 'needs_clarification', 'interrupted', 'failed', 'cancelled']);
const sameSecret = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string') return false; const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const snapshot = (model, analysis, reason) => ({at: new Date().toISOString(), modelHash: auditHash(model), engineVersion: analysis.engineVersion, range: analysis.root.range, reason, model: structuredClone(model)});
export async function createApplication({directory = process.env.VERACITY_DATA_DIR || join(HERE, '.data'), host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 8787), accessToken = process.env.VERACITY_ACCESS_TOKEN || '', publicOrigin = process.env.PUBLIC_ORIGIN || '', configured = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL), runner = runAudit, maxRunning = 2, maxAssessments = 200} = {}) {
  const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (publicOrigin) {
    let origin; try { origin = new URL(publicOrigin); } catch { throw new AuditError('Invalid PUBLIC_ORIGIN', 'INSECURE_CONFIG', 500); }
    requireThat(origin.protocol === 'https:' && origin.origin === publicOrigin.replace(/\/$/, ''), 'PUBLIC_ORIGIN must be a bare HTTPS origin, without credentials or a path', 'INSECURE_CONFIG', 500);
  }
  requireThat((local && !publicOrigin) || (accessToken.length >= 24 && /^https:\/\//.test(publicOrigin)), 'Non-loopback deployment requires a long VERACITY_ACCESS_TOKEN and HTTPS PUBLIC_ORIGIN', 'INSECURE_CONFIG', 500);
  requireThat(!accessToken || accessToken.length >= 24, 'Access token must have at least 24 characters');
  requireThat(Number.isInteger(port) && port >= 0 && port <= 65535, 'Invalid port');
  const store = await new AuditStore(directory).init(), running = new Map(), idem = new Map(), rate = new Map();
  const sessions = new Map(); let closing = false, pendingCreates = 0;
  function limited(key, max) {
    const now = Date.now();
    for (const [k, v] of rate) if (v.until < now) rate.delete(k);
    requireThat(rate.has(key) || rate.size < 1999, 'Rate limiter capacity reached', 'RATE_LIMIT', 429);
    const value = rate.get(key) || {count: 0, until: now + 60000}; value.count++; rate.set(key, value);
    requireThat(value.count <= max && rate.size < 2000, 'Rate limit reached; retry later', 'RATE_LIMIT', 429);
  }
  function json(res, status, data) { res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(data)); }
  async function body(req) {
    requireThat((req.headers['content-type'] || '').split(';')[0] === 'application/json', 'Use application/json', 'CONTENT_TYPE', 415);
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; requireThat(size <= 256000, 'Request too large', 'BODY_LIMIT', 413); chunks.push(chunk); }
    let value; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AuditError('Malformed JSON body', 'JSON', 400); }
    requireThat(value && typeof value === 'object' && !Array.isArray(value), 'Expected a JSON object', 'JSON', 400); return value;
  }
  async function progress(id, fields) {
    const current = await store.get(id);
    if (current.status !== 'running') return current;
    return store.update(id, current.revision, a => ({...a, ...fields, events: [...(a.events || []), {at: new Date().toISOString(), stage: fields.stage}].slice(-100)}));
  }
  function launch(record, args = {}) {
    const controller = new AbortController();
    const job = {controller, promise: null}; running.set(record.id, job);
    job.promise = (async () => {
      try {
        const result = await runner({question: record.question, signal: controller.signal, onProgress: fields => progress(record.id, fields), ...args});
        controller.signal.throwIfAborted();
        const current = await store.get(record.id);
        await store.update(record.id, current.revision, a => ({...a, ...result, stage: 'Assessment saved', snapshots: [snapshot(result.model, result.analysis, record.kind === 'investigation' ? 'Focused evidence investigation' : 'Initial assessment')]}));
      } catch (e) {
        const current = await store.get(record.id);
        const message = e instanceof AuditError ? e.message : controller.signal.aborted ? 'Research cancelled; last saved evidence retained.' : 'Research stopped unexpectedly. Inspect the saved evidence and retry.';
        await store.update(record.id, current.revision, a => ({...a, status: controller.signal.aborted ? 'cancelled' : 'failed', stage: controller.signal.aborted ? 'Cancelled' : 'Research stopped', error: message, errorCode: e.code || 'RUN_FAILED'}));
      } finally { running.delete(record.id); }
    })().catch(e => { console.error(JSON.stringify({event: 'persistence_failure', code: e.code || 'STORE_ERROR', id: record.id})); running.delete(record.id); });
  }
  async function newResearch(data, key) {
    requireThat(configured, 'Live research is not configured. Set server-side OPENAI_API_KEY and OPENAI_MODEL. The worked example is available without keys.', 'PROVIDER_UNCONFIGURED', 503);
    requireThat(typeof data.question === 'string' && data.question.trim().length >= 8 && data.question.length <= 2000, 'Enter a question between 8 and 2,000 characters');
    const fingerprint = auditHash(data);
    if (key) {
      requireThat(/^[A-Za-z0-9_.-]{8,100}$/.test(key), 'Invalid idempotency key');
      if (idem.has(key)) { const item = idem.get(key); requireThat(item.fingerprint === fingerprint, 'Idempotency key reused with different input', 'IDEMPOTENCY_CONFLICT', 409); return item.promise; }
    }
    const promise = (async () => {
      const existing = await store.list();
      const replay = key && existing.find(a => a.requestKey === key);
      if (replay) { requireThat(replay.requestFingerprint === fingerprint, 'Idempotency key reused with different input', 'IDEMPOTENCY_CONFLICT', 409); return replay; }
      requireThat(!closing && running.size + pendingCreates < maxRunning, 'Research capacity reached; finish or cancel an active run first', 'BUSY', 429);
      requireThat(existing.length + pendingCreates < maxAssessments, 'Assessment retention limit reached; archive the data directory before adding more', 'RETENTION_LIMIT', 409);
      let args = {};
      if (data.parentId) {
        const parent = await store.get(data.parentId);
        requireThat(parent.revision === data.expectedRevision && terminal.has(parent.status) && parent.model, 'Parent assessment changed or is not ready', 'REVISION_CONFLICT', 409);
        requireThat(data.question === parent.question, 'Focused investigation must preserve the original question');
        args = {previousModel: parent.model, targetNodeId: data.targetNodeId};
      }
      pendingCreates++;
      try {
      const record = await store.create({question: data.question.trim(), status: 'running', stage: 'Starting research', kind: data.parentId ? 'investigation' : 'live', parentId: data.parentId || null, requestKey: key || null, requestFingerprint: fingerprint, events: [], snapshots: []});
      launch(record, args); return record;
      } finally { pendingCreates--; }
    })();
    if (key) { idem.set(key, {fingerprint, promise}); promise.catch(() => idem.delete(key)); if (idem.size > 300) idem.delete(idem.keys().next().value); }
    return promise;
  }
  const assets = {'/': ['index.html', 'text/html'], '/app.mjs': ['app.mjs', 'text/javascript'], '/styles.css': ['styles.css', 'text/css']};
  const server = http.createServer(async (req, res) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-ID', requestId); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    try {
      const actualPort = server.address()?.port || port;
      const origins = new Set([`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`, `http://[::1]:${actualPort}`]);
      if (publicOrigin) origins.add(new URL(publicOrigin).origin);
      requireThat([...origins].some(o => new URL(o).host === req.headers.host), 'Unrecognized Host header', 'HOST', 403);
      const url = new URL(req.url, `http://${req.headers.host}`), path = url.pathname;
      if (path === '/healthz') return json(res, 200, {ok: true});
      if (assets[path] && req.method === 'GET') {
        const [name, type] = assets[path]; res.writeHead(200, {'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache'}); return res.end(await readFile(join(HERE, 'public', name)));
      }
      requireThat(path.startsWith('/api/'), 'Not found', 'NOT_FOUND', 404);
      limited(`api:${req.socket.remoteAddress}`, 600);
      const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');
      const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('veracity_session='))?.slice(17);
      for (const [token, expires] of sessions) if (expires <= Date.now()) sessions.delete(token);
      const authorized = !accessToken || sameSecret(bearer, accessToken) || (typeof cookie === 'string' && sessions.has(cookie));
      if (req.method !== 'GET') {
        const origin = req.headers.origin;
        requireThat((origin && origins.has(origin)) || (accessToken && sameSecret(bearer, accessToken)) || (!origin && local && !req.headers['sec-fetch-site']), 'Cross-origin write rejected', 'ORIGIN', 403);
        limited(`write:${req.socket.remoteAddress}`, 40);
      }
      if (path === '/api/login' && req.method === 'POST') {
        limited(`login:${req.socket.remoteAddress}`, 8); const b = await body(req);
        requireThat(accessToken && sameSecret(b.token, accessToken), 'Invalid access token', 'UNAUTHORIZED', 401);
        const session = randomBytes(32).toString('hex'); sessions.set(session, Date.now() + 28800000);
        if (sessions.size > 20) sessions.delete(sessions.keys().next().value);
        res.setHeader('Set-Cookie', `veracity_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${publicOrigin.startsWith('https:') ? '; Secure' : ''}`);
        return json(res, 200, {ok: true});
      }
      requireThat(authorized, 'Enter the server access token', 'UNAUTHORIZED', 401);
      if (path === '/api/config' && req.method === 'GET') return json(res, 200, {version: '2.0.0-beta.1', researchConfigured: configured, jevConfigured: Boolean(process.env.TYPESAFE_API_KEY), activeRuns: running.size, localOnly: local, calibration: 'not-evaluated'});
      if (path === '/api/assessments' && req.method === 'GET') return json(res, 200, {assessments: (await store.list()).map(a => ({id: a.id, question: a.question, status: a.status, kind: a.kind, updatedAt: a.updatedAt, parentId: a.parentId || null, range: a.analysis?.root.range || null}))});
      if (path === '/api/assessments' && req.method === 'POST') return json(res, 202, await newResearch(await body(req), req.headers['idempotency-key']));
      if (path === '/api/demo' && req.method === 'POST') {
        await body(req); requireThat((await store.list()).length < maxAssessments, 'Assessment retention limit reached', 'RETENTION_LIMIT', 409);
        const data = createDemo(); data.snapshots.push(snapshot(data.model, data.analysis, 'Fictional worked example')); return json(res, 201, await store.create(data));
      }
      const match = path.match(/^\/api\/assessments\/([a-f0-9-]{36})(?:\/(cancel|scenario|evidence|export))?$/);
      requireThat(match, 'Not found', 'NOT_FOUND', 404);
      const [, id, action] = match, current = await store.get(id);
      if (req.method === 'GET' && (!action || action === 'export')) {
        if (action === 'export') res.setHeader('Content-Disposition', `attachment; filename="veracity-${id}.json"`);
        return json(res, 200, current);
      }
      requireThat(req.method === 'POST', 'Method not allowed', 'METHOD', 405);
      const b = await body(req);
      if (action === 'cancel') { const job = running.get(id); requireThat(job, 'Run is no longer active', 'NOT_RUNNING', 409); job.controller.abort(new AuditError('Cancelled by user', 'CANCELLED')); return json(res, 202, {id, status: 'cancelling'}); }
      requireThat(current.revision === b.expectedRevision && terminal.has(current.status) && current.model, 'Assessment changed or is still running', 'REVISION_CONFLICT', 409);
      if (action === 'scenario') {
        requireThat(b.overrides && typeof b.overrides === 'object' && !Array.isArray(b.overrides) && Object.keys(b.overrides).length > 0, 'Scenario requires input overrides');
        // Validate all overrides before mutating a copy.
        analyzeGraph(current.model, {overrides: b.overrides});
        const model = structuredClone(current.model);
        for (const [nodeId, prior] of Object.entries(b.overrides)) { model.nodes[nodeId].prior = normalizeRange(prior); model.nodes[nodeId].provenance = {kind: 'elicited', actor: 'user', rationale: typeof b.reason === 'string' && b.reason.trim().length >= 10 ? b.reason.trim() : 'User-selected what-if prior; not new evidence.'}; }
        const analysis = analyzeGraph(model);
        requireThat((await store.list()).length < maxAssessments, 'Assessment retention limit reached', 'RETENTION_LIMIT', 409);
        return json(res, 201, await store.create({question: current.question, kind: 'scenario', status: 'scenario', stage: 'What-if scenario saved', parentId: id, model, analysis, snapshots: [snapshot(model, analysis, 'What-if prior change; original unchanged')], warnings: current.warnings || [], usage: {calls: 0, sourceFetches: 0, tokens: 0}}));
      }
      if (action === 'evidence') {
        requireThat(Object.hasOwn(current.model.nodes, b.nodeId) && current.model.nodes[b.nodeId].prior, 'Choose an independently scored node');
        requireThat(typeof b.text === 'string' && b.text.length >= 20 && b.text.length <= 60000 && typeof b.title === 'string' && b.title.length <= 300, 'Source title and text are required');
        requireThat(typeof b.rationale === 'string' && b.rationale.length >= 20 && b.rationale.length <= 4000, 'Explain the likelihood assumptions');
        requireThat(typeof b.cluster === 'string' && b.cluster.trim().length >= 3 && b.cluster.length <= 120, 'Provide the underlying observation or study ID');
        const lr = likelihoodRange(b.lr), model = structuredClone(current.model), sourceId = `s-${digest(b.text).slice(0, 20)}`;
        model.sources[sourceId] = {id: sourceId, title: b.title, text: b.text, sha256: digest(b.text), kind: 'user-provided', verification: 'user-supplied-text', url: b.url ? sourceURL(b.url).href : null, fetchedAt: null, publishedAt: null};
        const evidenceId = `e-${digest(`${b.nodeId}:${b.cluster}:${b.quote}`).slice(0, 20)}`;
        const e = {id: evidenceId, targetNodeIds: [b.nodeId], observation: b.quote, independenceCluster: b.cluster.trim(), status: 'observed', references: [{sourceId, quote: b.quote}], likelihood: {lr, provenance: {kind: 'elicited', actor: 'user', rationale: b.rationale}}};
        validateEvidence(e, model.sources, {demo: model.demo});
        if (Object.values(model.evidence).some(old => old.targetNodeIds.includes(b.nodeId) && old.independenceCluster !== e.independenceCluster)) {
          requireThat(typeof b.independenceRationale === 'string' && b.independenceRationale.length >= 30, 'Explain why this observation is conditionally independent of the existing evidence, or replace the same cluster with a joint likelihood');
          model.nodes[b.nodeId].independenceRationale = b.independenceRationale;
        }
        // Updating the same observation cluster replaces its likelihood; it never adds another update.
        for (const old of Object.values(model.evidence)) if (old.targetNodeIds.includes(b.nodeId) && old.independenceCluster === e.independenceCluster) delete model.evidence[old.id];
        model.evidence[evidenceId] = e;
        const analysis = analyzeGraph(model);
        requireThat(analysis.nodes[b.nodeId].range, analysis.nodes[b.nodeId].reasons.join('; '));
        const saved = await store.update(id, b.expectedRevision, a => ({...a, model, analysis, stage: 'Evidence updated', snapshots: [...a.snapshots, snapshot(model, analysis, `User evidence: ${b.title}`)].slice(-30)}));
        return json(res, 200, saved);
      }
      throw new AuditError('Not found', 'NOT_FOUND', 404);
    } catch (e) {
      if (res.headersSent) return res.destroy();
      if (e.status === 429) res.setHeader('Retry-After', '60');
      return json(res, e instanceof AuditError ? e.status : 500, {error: e instanceof AuditError ? e.message : 'Internal server error', code: e.code || 'INTERNAL', requestId});
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  return {server, store, running, host, port, async listen() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); return server.address(); }, async close() { closing = true; for (const job of running.values()) job.controller.abort(new AuditError('Server shutting down', 'CANCELLED')); await Promise.allSettled([...running.values()].map(j => j.promise)); await new Promise(resolve => server.close(resolve)); await store.close(); }};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApplication(); const address = await app.listen();
  console.log(`Veracity V2 listening on http://${app.host}:${address.port}`);
  for (const s of ['SIGTERM', 'SIGINT']) process.once(s, () => { void app.close().then(() => process.exit(0)); });
}
