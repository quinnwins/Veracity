import {createHash} from 'node:crypto';
import https from 'node:https';
import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {AuditError, requireThat, likelihoodRange, probability} from './engine.mjs';
export const digest = text => createHash('sha256').update(text).digest('hex');
export const normalizeText = text => String(text).normalize('NFKC').replace(/\s+/g, ' ').trim();
export function canonicalClusterKey(e) {
  const key = e.rootObservationId || e.primaryStudyId || e.datasetEventId || e.independenceCluster;
  requireThat(typeof key === 'string' && key.length > 0, 'Evidence needs an explicit root-observation cluster');
  return key;
}
export function collapseEvidence(items) {
  const groups = new Map();
  for (const e of items) {
    const key = canonicalClusterKey(e);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return [...groups].map(([id, members]) => {
    const representative = members[0];
    for (const other of members.slice(1)) {
      requireThat(JSON.stringify(other.likelihood?.lr) === JSON.stringify(representative.likelihood?.lr) && normalizeText(other.observation) === normalizeText(representative.observation), `Conflicting updates in cluster ${id}; supply a joint likelihood instead of counting reports twice`);
    }
    return {id, members, representative: {...representative, independenceCluster: id}};
  });
}
export function validateEvidence(e, sources, {asOf, demo = false} = {}) {
  requireThat(e && typeof e.observation === 'string' && e.observation.length > 0, 'Evidence needs an observation');
  canonicalClusterKey(e);
  requireThat(Array.isArray(e.references) && e.references.length > 0, 'Evidence needs exact source references');
  for (const ref of e.references) {
    const s = sources[ref.sourceId];
    requireThat(s && typeof s.text === 'string' && ['fetched', 'user-provided', 'synthetic'].includes(s.kind), `Missing source ${ref.sourceId}`);
    requireThat(s.kind !== 'synthetic' || demo, 'Synthetic evidence is only usable in the labeled demonstration');
    requireThat(typeof ref.quote === 'string' && ref.quote.trim().length >= 5 && normalizeText(s.text).includes(normalizeText(ref.quote)), 'Quoted passage does not occur in the stored source');
    requireThat(ref.quote.length <= 2000, 'Source quote is too long');
    requireThat(s.sha256 && s.sha256 === digest(s.text), 'Stored source digest mismatch');
    if (asOf) {
      requireThat(Number.isFinite(Date.parse(asOf)), 'Invalid historical cutoff');
      requireThat(s.publishedAt && Number.isFinite(Date.parse(s.publishedAt)) && Date.parse(s.publishedAt) <= Date.parse(asOf), 'Source publication date is missing or after the historical cutoff');
    }
  }
  likelihoodRange(e.likelihood?.lr);
  const p = e.likelihood?.provenance;
  requireThat(p && ['elicited', 'model', 'measured', 'synthetic'].includes(p.kind) && typeof p.rationale === 'string' && p.rationale.length >= 10, 'Likelihood needs provenance and a substantive rationale');
  requireThat(p.kind !== 'synthetic' || demo, 'Synthetic likelihood outside demonstration');
  return true;
}
export function makeJudgmentEnvelope({id, task, provider, model, question, options, sourceIds, sourceSpans = [], createdAt = new Date().toISOString(), adapterVersion = '2'}) {
  requireThat(id && task && provider && model && question, 'Incomplete model judgment provenance');
  requireThat(Array.isArray(options) && options.length > 0 && new Set(options.map(o => o.label)).size === options.length, 'Invalid judgment options');
  let total = 0;
  for (const o of options) { requireThat(typeof o.label === 'string', 'Invalid label'); total += probability(o.probability); }
  requireThat(Math.abs(total - 1) < 1e-6, 'Judgment probabilities must sum to 1');
  return {id, task, provider, model, question, options, sourceIds, sourceSpans, createdAt, adapterVersion, calibration: 'not-evaluated'};
}
export function groundingScore(nodes) {
  const xs = Object.values(nodes || {});
  xs.forEach(n => requireThat(Number.isFinite(n.sensitivityWeight) && n.sensitivityWeight >= 0, 'Invalid grounding weight'));
  const total = xs.reduce((s, n) => s + n.sensitivityWeight, 0);
  return total ? xs.reduce((s, n) => s + n.sensitivityWeight * (n.inspectableEvidence ? 1 : 0), 0) / total : null;
}
export function publicIPv4(ip) {
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
export function sourceURL(raw) {
  let u; try { u = new URL(raw); } catch { throw new AuditError('Invalid source URL'); }
  requireThat(u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443'), 'Only public HTTPS source URLs are accepted');
  requireThat(!u.hostname.includes(':') && u.hostname.includes('.') && !/\.(localhost|local|internal|test|invalid)$/i.test(u.hostname), 'Private or unsupported source host');
  if (isIP(u.hostname)) requireThat(publicIPv4(u.hostname), 'Private source address');
  u.hash = ''; return u;
}
export function htmlText(html) {
  return normalizeText(html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, ent) => {
    const named = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};
    if (named[ent.toLowerCase()]) return named[ent.toLowerCase()];
    const value = ent[1].toLowerCase() === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
  }));
}
// DNS is checked AND pinned per connection. Redirects repeat both checks.
export async function fetchSource(raw, {signal, lookup = dnsLookup, request = https.get, redirects = 3, maxBytes = 1_000_000} = {}) {
  const u = sourceURL(raw);
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
  signal.throwIfAborted();
  const addresses = await new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, {once: true});
    Promise.resolve().then(() => lookup(u.hostname, {all: true, family: 4})).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
  signal.throwIfAborted();
  requireThat(addresses.length > 0 && addresses.every(a => publicIPv4(a.address)), 'Source DNS resolves to a private or reserved address');
  return new Promise((resolve, reject) => {
    const req = request(u, {agent: false, signal, timeout: 15000, headers: {'User-Agent': 'VeracityEvidence/2.0', Accept: 'text/html,text/plain;q=0.9', 'Accept-Encoding': 'identity'}, lookup: (_host, options, cb) => {
      if (options.all) cb(null, [addresses[0]]); else cb(null, addresses[0].address, 4);
    }}, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        if (!redirects || !res.headers.location) return reject(new AuditError('Source redirect limit reached'));
        let next; try { next = new URL(res.headers.location, u).href; } catch { return reject(new AuditError('Invalid source redirect')); }
        fetchSource(next, {signal, lookup, request, redirects: redirects - 1, maxBytes}).then(resolve, reject); return;
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new AuditError(`Source returned HTTP ${res.statusCode}`)); }
      const type = String(res.headers['content-type'] || '');
      if (!/^(text\/html|text\/plain|application\/json)(;|$)/i.test(type)) { res.resume(); return reject(new AuditError('Source format unsupported: text or HTML required; PDF extraction is not implemented')); }
      if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') { res.resume(); return reject(new AuditError('Compressed source unsupported')); }
      let size = 0; const chunks = [];
      res.on('data', chunk => { size += chunk.length; if (size > maxBytes) req.destroy(new AuditError('Source exceeds size limit')); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => {
        const rawText = Buffer.concat(chunks).toString('utf8'), text = /text\/html/i.test(type) ? htmlText(rawText) : normalizeText(rawText);
        if (text.length < 80) return reject(new AuditError('Insufficient readable source text'));
        resolve({id: `s-${digest(u.href).slice(0, 16)}`, url: u.href, title: u.hostname, text, sha256: digest(text), fetchedAt: new Date().toISOString(), publishedAt: null, kind: 'fetched', verification: 'exact-text-only'});
      });
    });
    req.on('timeout', () => req.destroy(new AuditError('Source fetch timed out', 'TIMEOUT', 504)));
    req.on('error', reject);
  });
}
