import {DatabaseSync} from 'node:sqlite';
import {chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AuditStore, auditHash, canonicalJSON} from '../store.mjs';
import {requireThat, AuditError, probability} from '../engine.mjs';
import {options, validateContract, packet, question, makeBody, questionShape, validateResponse, SCALE_VERSION} from './contracts.mjs';

const stamp = () => new Date().toISOString();
const levels = {normal: 0, high: 1, critical: 2};
export class ScaleStore {
  constructor(directory) { this.directory = directory; }
  async init() {
    this.lock = await new AuditStore(this.directory).init();
    try {
      const path = join(this.directory, 'campaigns.sqlite');
      this.db = new DatabaseSync(path);
      this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          status TEXT NOT NULL, metadata TEXT NOT NULL, limits_json TEXT NOT NULL,
          units INTEGER NOT NULL DEFAULT 0, reported_tokens INTEGER NOT NULL DEFAULT 0,
          requests INTEGER NOT NULL DEFAULT 0, duplicates INTEGER NOT NULL DEFAULT 0,
          error TEXT, plan_hash TEXT NOT NULL DEFAULT '', review_log TEXT NOT NULL DEFAULT '[]');
        CREATE TABLE IF NOT EXISTS packets (hash TEXT PRIMARY KEY, document TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tasks (
          run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, id TEXT NOT NULL,
          seq INTEGER NOT NULL, packet_hash TEXT NOT NULL REFERENCES packets(hash), spec TEXT NOT NULL,
          priority INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', score REAL, score_sha TEXT, batch_key TEXT,
          review_status TEXT NOT NULL DEFAULT 'unreviewed', review_reason TEXT,
          PRIMARY KEY(run_id,id), UNIQUE(run_id,seq));
        CREATE INDEX IF NOT EXISTS task_packet ON tasks(run_id,packet_hash,id);
        CREATE INDEX IF NOT EXISTS task_status ON tasks(run_id,status,seq);
        CREATE TABLE IF NOT EXISTS batches (
          run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, key TEXT NOT NULL,
          seq INTEGER NOT NULL, body TEXT NOT NULL, units INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending', cached INTEGER NOT NULL DEFAULT 0,
          response TEXT, error TEXT, PRIMARY KEY(run_id,key));
        CREATE INDEX IF NOT EXISTS batch_queue ON batches(run_id,status,seq);
        CREATE TABLE IF NOT EXISTS attempts (
          id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          batch_key TEXT NOT NULL, at TEXT NOT NULL, reserved INTEGER NOT NULL,
          reported INTEGER, status TEXT NOT NULL DEFAULT 'unknown', request_id TEXT);
        CREATE TABLE IF NOT EXISTS cache (
          key TEXT PRIMARY KEY, response TEXT NOT NULL, sha256 TEXT NOT NULL, at INTEGER NOT NULL);
      `);
      await chmod(path, 0o600);
      this.db.exec("UPDATE runs SET status='interrupted', error='Process stopped; explicitly resume. In-flight billing may be unknown.' WHERE status='running'; UPDATE batches SET status='pending' WHERE status='inflight';");
      this.statements = new Map();
      return this;
    } catch (e) { this.db?.close(); await this.lock.close(); throw e; }
  }
  sql(s) { if (!this.statements.has(s)) this.statements.set(s, this.db.prepare(s)); return this.statements.get(s); }
  tx(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const r = fn(); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  create({contract: c, packets, tasks, limits = {}, model = 'jev-1.13.0', simulation = false, parent = null, plan = null}) {
    const contract = validateContract(c), config = options(limits), id = randomUUID(), at = stamp();
    requireThat(/^jev-\d+\.\d+\.\d+$/.test(model), 'Pin the Jev model version');
    requireThat(typeof simulation === 'boolean', 'Invalid simulation flag');
    requireThat(this.sql('SELECT count(*) AS n FROM runs').get().n < 30, 'Campaign retention limit reached', 'RETENTION_LIMIT', 409);
    requireThat(Array.isArray(packets) && packets.length > 0 && packets.length <= 10000, 'Invalid packet list');
    const map = new Map(), prepared = []; let sourceBytes = 0;
    for (const p of packets) {
      requireThat(typeof p.id === 'string' && !map.has(p.id), 'Duplicate or missing packet ID');
      const checked = packet(contract, p);
      requireThat(simulation || checked.state.passages.every(s => s.origin !== 'synthetic'), 'Synthetic passages require simulation mode');
      map.set(p.id, checked.hash); prepared.push(checked); sourceBytes += Buffer.byteLength(canonicalJSON(checked));
    }
    requireThat(sourceBytes <= 64000000, 'Corpus exceeds 64 MB campaign limit');
    const metadata = {contract, model, simulation, parent, plan, version: SCALE_VERSION,
      interpretation: 'Local model probabilities conditional on the exact evidence packet; uncalibrated, not independent observations or likelihood ratios',
      costScope: 'Jev only; byte-based reservations are conservative estimates, not guaranteed billable token counts. Planning/review costs are separate.'};
    this.tx(() => {
      this.sql('INSERT INTO runs(id,created_at,updated_at,status,metadata,limits_json) VALUES(?,?,?,?,?,?)').run(id, at, at, 'planned', canonicalJSON(metadata), canonicalJSON(config));
      for (const p of prepared) this.sql('INSERT OR IGNORE INTO packets(hash,document) VALUES(?,?)').run(p.hash, canonicalJSON(p));
      let count = 0, supplied = 0, specBytes = 0;
      for (const t of tasks) {
        requireThat(++supplied <= config.maxQuestions, 'Question limit exceeded');
        requireThat(map.has(t.packetId), 'Question refers to an unknown evidence packet');
        const q = question(t, map.get(t.packetId)); const spec = canonicalJSON(q); specBytes += Buffer.byteLength(spec);
        requireThat(specBytes <= 180000000, 'Question manifest exceeds 180 MB');
        const result = this.sql('INSERT OR IGNORE INTO tasks(run_id,id,seq,packet_hash,spec,priority) VALUES(?,?,?,?,?,?)').run(id, q.id, count, q.packetHash, spec, levels[q.priority]);
        if (result.changes) count++;
        else this.sql('UPDATE tasks SET priority=max(priority,?) WHERE run_id=? AND id=?').run(levels[q.priority], id, q.id);
      }
      requireThat(count > 0, 'No eligible questions');
      this.sql('UPDATE runs SET duplicates=? WHERE id=?').run(supplied - count, id);
      let group = [], current = null, index = 0, questionBytes = 0, stateBytes = 0, baseUnits = 0;
      const save = () => {
        if (!group.length) return;
        const packed = makeBody(model, current, group);
        const key = auditHash({namespace: simulation ? 'synthetic-v1' : 'typesafe-live', version: SCALE_VERSION, body: packed.body});
        this.sql('INSERT INTO batches(run_id,key,seq,body,units) VALUES(?,?,?,?,?)').run(id, key, index++, canonicalJSON(packed.body), packed.units);
        for (const t of group) this.sql('UPDATE tasks SET batch_key=? WHERE run_id=? AND id=?').run(key, id, t.id);
        group = []; questionBytes = 0;
      };
      for (const row of this.sql('SELECT spec,packet_hash FROM tasks WHERE run_id=? ORDER BY packet_hash,id').iterate(id)) {
        const q = JSON.parse(row.spec);
        if (current?.hash !== row.packet_hash) { save(); current = this.getPacket(row.packet_hash); stateBytes = Buffer.byteLength(canonicalJSON(current.state)); baseUnits = Buffer.byteLength(canonicalJSON({model, state: current.state, questions: {}})) + 512; }
        if (group.length >= config.batchSize) save();
        const bytes = Buffer.byteLength(canonicalJSON(questionShape(q)));
        const entryBytes = bytes + Buffer.byteLength(JSON.stringify(q.id)) + 2;
        requireThat(stateBytes + bytes + 512 <= 30000 && baseUnits + entryBytes <= 60000, 'A single question exceeds context limits', 'CONTEXT_LIMIT', 422);
        if (baseUnits + questionBytes + entryBytes > 60000) save();
        group.push(q); questionBytes += entryBytes;
      }
      save();
      const manifest = this.sql('SELECT key FROM batches WHERE run_id=? ORDER BY seq').all(id).map(r => r.key);
      this.sql('UPDATE runs SET plan_hash=? WHERE id=?').run(auditHash({metadata, config, manifest}), id);
    });
    return this.get(id);
  }
  getPacket(hash) {
    const row = this.sql('SELECT document FROM packets WHERE hash=?').get(hash);
    requireThat(row, 'Evidence packet not found', 'NOT_FOUND', 404);
    const p = JSON.parse(row.document); requireThat(p.hash === hash && auditHash(p.state) === hash, 'Evidence packet integrity failure', 'STORE_INTEGRITY', 500); return p;
  }
  get(id) {
    const r = this.sql('SELECT * FROM runs WHERE id=?').get(id);
    requireThat(r, 'Campaign not found', 'NOT_FOUND', 404);
    const counts = Object.fromEntries(this.sql('SELECT status,count(*) n FROM tasks WHERE run_id=? GROUP BY status').all(id).map(x => [x.status, x.n]));
    const batches = this.sql('SELECT count(*) n,coalesce(sum(units),0) units,coalesce(sum(cached),0) cached FROM batches WHERE run_id=?').get(id);
    const reviews = Object.fromEntries(this.sql("SELECT review_status status,count(*) n FROM tasks WHERE run_id=? AND status='completed' GROUP BY review_status").all(id).map(x => [x.status, x.n]));
    const limits = JSON.parse(r.limits_json);
    return {id, createdAt: r.created_at, updatedAt: r.updated_at, status: r.status, ...JSON.parse(r.metadata), limits,
      planHash: r.plan_hash, error: r.error, counts, total: Object.values(counts).reduce((a, b) => a + b, 0),
      duplicateQuestions: r.duplicates, batches: batches.n, cacheHits: batches.cached,
      estimate: {inputUnits: batches.units, jevUSD: batches.units * limits.inputUSDPerMillion / 1e6, basis: 'UTF-8 bytes plus overhead; excludes retries, planning, review'},
      usage: {requests: r.requests, reservedOrReportedUnits: r.units, reportedInputTokens: r.reported_tokens,
        reportedJevUSD: r.reported_tokens * limits.inputUSDPerMillion / 1e6,
        unknownAttempts: this.sql("SELECT count(*) n FROM attempts WHERE run_id=? AND status='unknown'").get(id).n},
      reviews, reviewLog: JSON.parse(r.review_log)};
  }
  list() { return this.sql('SELECT id FROM runs ORDER BY created_at DESC').all().map(r => this.get(r.id)); }
  page(id, {after = -1, limit = 50, review = null} = {}) {
    this.get(id); requireThat(Number.isSafeInteger(after) && after >= -1 && Number.isSafeInteger(limit) && limit >= 1 && limit <= 200, 'Invalid pagination');
    requireThat(review === null || ['unreviewed', 'accepted', 'needs_evidence', 'rejected'].includes(review), 'Invalid review filter');
    const rows = this.sql('SELECT * FROM tasks WHERE run_id=? AND seq>? AND (? IS NULL OR review_status=?) ORDER BY seq LIMIT ?').all(id, after, review, review, limit + 1);
    return {items: rows.slice(0, limit).map(r => this.decodeTask(r)), next: rows.length > limit ? rows[limit - 1].seq : null};
  }
  decodeTask(r) { const spec = JSON.parse(r.spec); requireThat(auditHash({q: spec.q, packetHash: spec.packetHash, promptVersion: spec.promptVersion}) === r.id && spec.packetHash === r.packet_hash, 'Question integrity failure', 'STORE_INTEGRITY', 500); if (r.status === 'completed') requireThat(r.score_sha === auditHash({id: r.id, batchKey: r.batch_key, probability: r.score}), 'Estimate integrity failure', 'STORE_INTEGRITY', 500); return {...spec, priority: Object.keys(levels).find(k => levels[k] === r.priority), seq: r.seq, status: r.status, probability: r.score, batchKey: r.batch_key, review: {status: r.review_status, reason: r.review_reason}, calibration: 'not-evaluated', semantics: 'P(proposition | supplied evidence, model)'}; }
  *each(id) { for (const r of this.db.prepare('SELECT * FROM tasks WHERE run_id=? ORDER BY seq').iterate(id)) yield this.decodeTask(r); }
  start(id, planHash) {
    return this.tx(() => {
      const r = this.get(id);
      requireThat(r.planHash === planHash, 'Plan changed; review it before starting', 'REVISION_CONFLICT', 409);
      requireThat(['planned', 'paused', 'interrupted'].includes(r.status), 'Campaign cannot start in this state', 'RUN_STATE', 409);
      this.sql("UPDATE runs SET status='running',updated_at=?,error=NULL WHERE id=?").run(stamp(), id);
      return this.get(id);
    });
  }
  claim(id) {
    return this.tx(() => {
      requireThat(this.sql('SELECT status FROM runs WHERE id=?').get(id)?.status === 'running', 'Campaign is not running', 'RUN_STATE', 409);
      const b = this.sql("SELECT * FROM batches WHERE run_id=? AND status='pending' ORDER BY seq LIMIT 1").get(id);
      if (!b) return null;
      this.sql("UPDATE batches SET status='inflight' WHERE run_id=? AND key=?").run(id, b.key);
      const body = JSON.parse(b.body), run = JSON.parse(this.sql('SELECT metadata FROM runs WHERE id=?').get(id).metadata);
      requireThat(auditHash({namespace: run.simulation ? 'synthetic-v1' : 'typesafe-live', version: SCALE_VERSION, body}) === b.key, 'Batch integrity failure', 'STORE_INTEGRITY', 500);
      return {...b, body};
    });
  }
  reserve(id, b) {
    return this.tx(() => {
      const row = this.sql('SELECT status,units,requests,limits_json FROM runs WHERE id=?').get(id);
      requireThat(row, 'Campaign not found');
      const r = {status: row.status, limits: JSON.parse(row.limits_json), usage: {reservedOrReportedUnits: row.units, requests: row.requests}};
      const cost = (row.units + b.units) * r.limits.inputUSDPerMillion / 1e6;
      requireThat(r.status === 'running', 'Campaign was stopped', 'RUN_STATE', 409);
      requireThat(r.usage.requests < r.limits.maxRequests && r.usage.reservedOrReportedUnits + b.units <= r.limits.maxInputUnits && cost <= r.limits.maxJevUSD, 'Jev dispatch budget reached; campaign paused before another request', 'BUDGET', 409);
      const attempt = randomUUID();
      this.sql('INSERT INTO attempts(id,run_id,batch_key,at,reserved) VALUES(?,?,?,?,?)').run(attempt, id, b.key, stamp(), b.units);
      this.sql('UPDATE runs SET requests=requests+1,units=units+?,updated_at=? WHERE id=?').run(b.units, stamp(), id);
      return attempt;
    });
  }
  report(attempt, tokens, requestId = null) {
    if (!Number.isSafeInteger(tokens) || tokens < 0) return;
    this.tx(() => {
      const a = this.sql('SELECT * FROM attempts WHERE id=?').get(attempt); requireThat(a && a.reported === null, 'Attempt already reported');
      this.sql("UPDATE attempts SET reported=?,status='reported',request_id=? WHERE id=?").run(tokens, requestId, attempt);
      this.sql('UPDATE runs SET reported_tokens=reported_tokens+?,units=units+? WHERE id=?').run(tokens, Math.max(0, tokens - a.reserved), a.run_id);
    });
  }
  cached(key, hours) {
    if (!hours) return null;
    const c = this.sql('SELECT * FROM cache WHERE key=? AND at>=?').get(key, Date.now() - hours * 3600000);
    if (!c) return null;
    const response = JSON.parse(c.response); requireThat(auditHash(response) === c.sha256, 'Cached response integrity failure', 'STORE_INTEGRITY', 500); return response;
  }
  complete(id, b, response, cached = false) {
    validateResponse(response, b.body);
    this.tx(() => {
      const state = this.sql('SELECT status FROM batches WHERE run_id=? AND key=?').get(id, b.key);
      requireThat(state?.status === 'inflight', 'Batch lease no longer active', 'RUN_STATE', 409);
      for (const [q, a] of Object.entries(response.answers)) this.sql("UPDATE tasks SET status='completed',score=?,score_sha=? WHERE run_id=? AND id=? AND batch_key=?").run(probability(a.noul), auditHash({id: q, batchKey: b.key, probability: a.noul}), id, q, b.key);
      const encoded = canonicalJSON(response);
      this.sql("UPDATE batches SET status='completed',response=?,cached=?,error=NULL WHERE run_id=? AND key=?").run(encoded, Number(cached), id, b.key);
      if (!cached) this.sql('INSERT OR REPLACE INTO cache(key,response,sha256,at) VALUES(?,?,?,?)').run(b.key, encoded, auditHash(response), Date.now());
    });
  }
  fail(id, key, error) {
    this.tx(() => {
      this.sql("UPDATE batches SET status='failed',error=? WHERE run_id=? AND key=?").run(String(error).slice(0, 1000), id, key);
      this.sql("UPDATE tasks SET status='failed' WHERE run_id=? AND batch_key=?").run(id, key);
    });
  }
  release(id, key) { this.sql("UPDATE batches SET status='pending' WHERE run_id=? AND key=? AND status='inflight'").run(id, key); }
  finish(id, status, error = null) {
    requireThat(['paused','cancelled','completed','partial','interrupted','failed'].includes(status), 'Invalid campaign state');
    this.sql('UPDATE runs SET status=?,updated_at=?,error=? WHERE id=?').run(status, stamp(), error, id);
    return this.get(id);
  }
  saveReviews(id, reviews, provenance) {
    this.tx(() => {
      const r = this.get(id);
      for (const review of reviews) {
        requireThat(['accepted','needs_evidence','rejected'].includes(review.status) && typeof review.reason === 'string' && review.reason.trim().length >= 10, 'Invalid review');
        const t = this.sql("SELECT id FROM tasks WHERE run_id=? AND id=? AND status='completed'").get(id, review.id); requireThat(t, 'Review refers to unscored task');
        this.sql('UPDATE tasks SET review_status=?,review_reason=? WHERE run_id=? AND id=?').run(review.status, review.reason, id, review.id);
      }
      const log = [...r.reviewLog, {...provenance, at: stamp(), reviewedIds: reviews.map(x => x.id)}];
      requireThat(log.length <= 1000, 'Review-round retention limit reached');
      this.sql('UPDATE runs SET review_log=?,updated_at=? WHERE id=?').run(canonicalJSON(log), stamp(), id);
    });
  }
  trace(id, key) {
    const b = this.sql('SELECT body,response,cached,error FROM batches WHERE run_id=? AND key=?').get(id, key); requireThat(b, 'Batch not found', 'NOT_FOUND', 404);
    return {body: JSON.parse(b.body), response: b.response ? JSON.parse(b.response) : null, cached: Boolean(b.cached), error: b.error,
      attempts: this.sql('SELECT * FROM attempts WHERE run_id=? AND batch_key=? ORDER BY at').all(id, key)};
  }
  async close() { this.db?.close(); await this.lock?.close(); }
}
