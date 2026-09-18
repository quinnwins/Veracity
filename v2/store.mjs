import {mkdir, open, readFile, readdir, rename, unlink} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {digest} from './evidence.mjs';
import {AuditError, requireThat} from './engine.mjs';
export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
  requireThat(value !== undefined && (typeof value !== 'number' || Number.isFinite(value)), 'Non-serializable audit data');
  return JSON.stringify(value);
}
export const auditHash = value => digest(canonicalJSON(value));
export class AuditStore {
  constructor(directory) { this.directory = resolve(directory); this.locks = new Map(); this.ownedLock = false; }
  async init() {
    await mkdir(this.directory, {recursive: true, mode: 0o700});
    try { const lock = await open(join(this.directory, '.writer.lock'), 'wx', 0o600); await lock.writeFile(JSON.stringify({pid: process.pid, startedAt: new Date().toISOString()})); await lock.close(); this.ownedLock = true; }
    catch (e) { if (e.code === 'EEXIST') throw new AuditError('Audit store is locked by another process. Verify that process has stopped before removing .writer.lock.', 'STORE_LOCKED', 503); throw e; }
    // Never show a prior process's unfinished job as still running.
    try {
      for (const a of await this.list()) if (a.status === 'running') await this.update(a.id, a.revision, x => ({...x, status: 'interrupted', stage: 'Interrupted by server restart', error: 'Research was interrupted; the last saved evidence remains available.'}));
      return this;
    } catch (error) { await this.close(); throw error; }
  }
  path(id) { requireThat(typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id), 'Invalid assessment ID', 'NOT_FOUND', 404); return join(this.directory, `${id}.json`); }
  async get(id) {
    let raw; try { raw = await readFile(this.path(id), 'utf8'); } catch (e) { if (e.code === 'ENOENT') throw new AuditError('Assessment not found', 'NOT_FOUND', 404); throw e; }
    let envelope; try { envelope = JSON.parse(raw); } catch { throw new AuditError('Stored assessment is corrupt', 'STORE_INTEGRITY', 500); }
    requireThat(envelope.sha256 === auditHash(envelope.document), 'Stored assessment integrity check failed', 'STORE_INTEGRITY', 500);
    return envelope.document;
  }
  async list() {
    const names = (await readdir(this.directory)).filter(n => /^[a-f0-9-]{36}\.json$/.test(n));
    const rows = []; for (const n of names) rows.push(await this.get(n.slice(0, -5)));
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async write(document) {
    const path = this.path(document.id), tmp = `${path}.${randomUUID()}.tmp`;
    let file;
    try {
      file = await open(tmp, 'wx', 0o600);
      await file.writeFile(JSON.stringify({sha256: auditHash(document), document})); await file.sync(); await file.close(); file = null;
      await rename(tmp, path);
      const dir = await open(this.directory, 'r'); try { await dir.sync(); } finally { await dir.close(); }
    } catch (e) { await file?.close().catch(() => {}); await unlink(tmp).catch(() => {}); throw e; }
    return structuredClone(document);
  }
  async create(data) {
    const now = new Date().toISOString();
    return this.write({...data, id: randomUUID(), revision: 1, createdAt: now, updatedAt: now});
  }
  async update(id, expectedRevision, change) {
    const previous = this.locks.get(id) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const current = await this.get(id);
      requireThat(Number.isInteger(expectedRevision) && current.revision === expectedRevision, 'Assessment changed; reload before saving', 'REVISION_CONFLICT', 409);
      const next = await change(structuredClone(current));
      return this.write({...next, id, createdAt: current.createdAt, revision: current.revision + 1, updatedAt: new Date().toISOString()});
    });
    this.locks.set(id, task);
    try { return await task; } finally { if (this.locks.get(id) === task) this.locks.delete(id); }
  }
  async close() { if (this.ownedLock) { await unlink(join(this.directory, '.writer.lock')); this.ownedLock = false; } }
}
