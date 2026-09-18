import {setTimeout as sleep} from 'node:timers/promises';
import {AuditError, requireThat} from '../engine.mjs';
import {validateResponse} from './contracts.mjs';

export function retryDelay(value, attempt, now = Date.now(), random = Math.random) {
  if (value) {
    const numeric = Number(value), date = Date.parse(value);
    const ms = Number.isFinite(numeric) ? numeric * 1000 : date - now;
    if (Number.isFinite(ms) && ms >= 0) return Math.max(ms, 250);
  }
  return Math.min(30000, 500 * 2 ** attempt) + Math.floor(random() * 200);
}
export class RateGate {
  constructor({requestsPerMinute, inputUnitsPerSecond}, {clock = Date.now, wait = sleep} = {}) {
    this.rpm = requestsPerMinute; this.tps = inputUnitsPerSecond; this.clock = clock; this.wait = wait;
    this.nextRequest = 0; this.nextTokens = 0; this.tail = Promise.resolve();
  }
  async acquire(units, signal) {
    requireThat(units <= this.tps, 'A batch is larger than the configured per-second input reservation; increase the limit or use smaller batches', 'RATE_CONFIG', 422);
    const work = this.tail.catch(() => {}).then(async () => {
      signal?.throwIfAborted();
      const now = this.clock(), at = Math.max(now, this.nextRequest, this.nextTokens);
      if (at > now) await this.wait(at - now, undefined, {signal});
      signal?.throwIfAborted();
      const sent = this.clock(); this.nextRequest = sent + 60000 / this.rpm; this.nextTokens = sent + 1000 * units / this.tps;
    });
    this.tail = work; return work;
  }
}
export class JevBatchClient {
  constructor({key = process.env.TYPESAFE_API_KEY, model = process.env.JEV_MODEL || 'jev-1.13.0', fetchImpl = fetch} = {}) {
    this.key = key; this.model = model; this.fetchImpl = fetchImpl; this.namespace = 'typesafe-live';
  }
  get configured() { return Boolean(this.key); }
  async send(body, {signal, timeoutMs}) {
    requireThat(this.configured, 'Set TYPESAFE_API_KEY on the server', 'PROVIDER_UNCONFIGURED', 503);
    requireThat(body.model === this.model, 'Pinned client and campaign model differ', 'PROVIDER_VERSION', 422);
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    let r;
    try {
      r = await this.fetchImpl('https://api.typesafe.ai/v1/systemone', {method: 'POST', redirect: 'error',
        headers: {Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: combined});
    } catch {
      signal?.throwIfAborted(); const e = new AuditError('Jev request failed or timed out; this attempt may still be billed', 'PROVIDER_NETWORK', 502); e.retryable = true; throw e;
    }
    if (!r.ok) {
      await r.body?.cancel();
      const e = new AuditError(`Jev returned HTTP ${r.status}`, 'PROVIDER_HTTP', 502);
      e.retryable = [429, 529, 502, 503, 504].includes(r.status); e.retryAfter = r.headers.get('retry-after'); throw e;
    }
    let size = 0; const chunks = [];
    try {
      for await (const c of r.body) { combined.throwIfAborted(); size += c.length; requireThat(size <= 2000000, 'Jev response too large', 'PROVIDER_FORMAT', 502); chunks.push(c); }
      return {response: JSON.parse(Buffer.concat(chunks).toString('utf8')), requestId: r.headers.get('x-request-id')?.slice(0, 160) || null};
    } catch (e) { signal?.throwIfAborted(); if (e instanceof AuditError) throw e; throw new AuditError('Jev response was incomplete or malformed', 'PROVIDER_FORMAT', 502); }
  }
}
export async function runCampaign(store, id, {client = new JevBatchClient(), signal, planHash,
  onProgress = async () => {}, gate, wait = sleep} = {}) {
  const initial = store.get(id);
  requireThat(client.configured, 'Probability provider is not configured', 'PROVIDER_UNCONFIGURED', 503);
  requireThat(client.model === initial.model && client.namespace === (initial.simulation ? 'synthetic-v1' : 'typesafe-live'), 'Provider namespace/model mismatch', 'PROVIDER_VERSION', 422);
  const controller = new AbortController();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  gate ||= initial.simulation ? {async acquire() { combined.throwIfAborted(); }} : new RateGate(initial.limits);
  const opts = initial.limits; let lastProgress = 0, stopReason = null;
  store.start(id, planHash);
  const progress = async force => { if (force || Date.now() - lastProgress > 1000) { lastProgress = Date.now(); await onProgress(store.get(id)); } };
  const stop = error => { stopReason ||= error; controller.abort(error); };
  async function worker() {
    let processed = 0;
    while (!combined.aborted) {
      let b;
      try {
        // Even an all-cache campaign must yield to HTTP polling and cancellation.
        if (++processed % 16 === 0) await sleep(0, undefined, {signal: combined});
        b = store.claim(id); if (!b) return;
        const cache = store.cached(b.key, opts.cacheHours);
        if (cache) { store.complete(id, b, cache, true); await progress(false); continue; }
        let response;
        for (let attempt = 0; attempt <= opts.retries; attempt++) {
          await gate.acquire(b.units, combined); combined.throwIfAborted();
          const attemptId = store.reserve(id, b);
          try {
            const r = await client.send(b.body, {signal: combined, timeoutMs: opts.timeoutMs});
            store.report(attemptId, r.response?.usage?.input_tokens, r.requestId);
            combined.throwIfAborted(); response = validateResponse(r.response, b.body); break;
          } catch (e) {
            combined.throwIfAborted();
            if (!e.retryable || attempt === opts.retries) throw e;
            const delay = retryDelay(e.retryAfter, attempt);
            if (delay > 300000) throw new AuditError('Provider asks for a long retry delay; explicitly resume later', 'RATE_PAUSE', 429);
            await wait(delay, undefined, {signal: combined});
          }
        }
        store.complete(id, b, response); await progress(false);
      } catch (e) {
        if (b) store.release(id, b.key);
        if (combined.aborted) return;
        // Stop new dispatch on protocol/auth/budget failures rather than burning the remaining allocation.
        stop(e); return;
      }
    }
  }
  try {
    await progress(true);
    await Promise.all(Array.from({length: opts.concurrency}, worker));
    const final = store.get(id);
    const status = signal?.aborted && signal.reason?.code === 'CANCELLED' ? 'cancelled' : combined.aborted ? 'paused' : final.counts.failed ? 'partial' : 'completed';
    store.finish(id, status, combined.aborted ? (stopReason?.message || signal?.reason?.message || 'Paused; saved results retained') : null);
    await progress(true); return store.get(id);
  } catch (e) { store.finish(id, 'paused', 'Campaign interrupted; explicitly resume saved work'); throw e; }
}
