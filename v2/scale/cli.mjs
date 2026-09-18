#!/usr/bin/env node
import {openSync, closeSync, readSync, statSync} from 'node:fs';
import {readFile, mkdtemp, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {ScaleStore} from './store.mjs';
import {runCampaign, JevBatchClient} from './runner.mjs';
import {syntheticManifest, SyntheticClient} from './synthetic.mjs';
import {prepareCampaign, tierProviders} from './prepare.mjs';
import {reviewCampaign, selectReview} from './review.mjs';
import {composeReviewed} from './compose.mjs';
import {requireThat} from '../engine.mjs';

export function* readJSONL(path) {
  requireThat(statSync(path).size <= 200000000, 'Manifest exceeds 200 MB');
  const fd = openSync(path, 'r'), buffer = Buffer.alloc(65536); let pending = Buffer.alloc(0), lines = 0;
  try {
    let n;
    while ((n = readSync(fd, buffer))) {
      pending = Buffer.concat([pending, buffer.subarray(0, n)]); let index;
      while ((index = pending.indexOf(10)) >= 0) {
        const line = pending.subarray(0, index).toString('utf8'); pending = pending.subarray(index + 1);
        if (line.trim()) { requireThat(Buffer.byteLength(line) <= (lines ? 20000 : 64000000), 'Manifest line too large'); requireThat(++lines <= 100001, 'Manifest has too many lines'); yield JSON.parse(line); }
      }
      requireThat(pending.length <= (lines ? 20000 : 64000000), 'Manifest line too large');
    }
    if (pending.length) { requireThat(pending.length <= (lines ? 20000 : 64000000), 'Manifest line too large'); requireThat(++lines <= 100001, 'Manifest has too many lines'); yield JSON.parse(pending.toString('utf8')); }
  } finally { closeSync(fd); }
}
export async function benchmark(count = 100000, directory, onPhase = () => {}) {
  directory ||= await mkdtemp(join(tmpdir(), 'veracity-scale-benchmark-'));
  const store = await new ScaleStore(directory).init();
  const before = process.memoryUsage(), start = performance.now();
  const rows = [];
  try {
    for (const phase of ['cold', 'cached', 'one-packet-changed']) {
      const t = performance.now(), manifest = syntheticManifest(count, phase === 'one-packet-changed' ? 0 : -1);
      const run = store.create(manifest), imported = performance.now(), client = new SyntheticClient();
      const result = await runCampaign(store, run.id, {client, planHash: run.planHash});
      requireThat(result.status === 'completed' && result.counts.completed === count, `Synthetic ${phase} run did not complete all questions`);
      onPhase({phase, completed: result.counts.completed, simulatedCalls: client.calls, elapsedMs: Math.round(performance.now() - t)});
      rows.push({phase, id: result.id, questions: count, uniqueBatches: result.batches, simulatedProviderCalls: client.calls,
        cacheHits: result.cacheHits, importMs: Math.round(imported - t), runMs: Math.round(performance.now() - imported),
        reservedInputUnits: result.usage.reservedOrReportedUnits, syntheticReportedTokens: result.usage.reportedInputTokens});
      if (phase === 'cached') requireThat(client.calls === 0, 'Identical rerun should make no provider calls');
      if (phase === 'one-packet-changed') requireThat(client.calls > 0 && client.calls < result.batches, 'Only changed evidence should require fresh inference');
    }
    const last = store.get(rows[0].id), review = selectReview(store, last.id);
    const report = {kind: 'SYNTHETIC LOAD TEST — no paid calls, no real probabilities, no accuracy/calibration claim', count,
      elapsedMs: Math.round(performance.now() - start), node: process.version, rows,
      memory: {initialRSS: before.rss, finalRSS: process.memoryUsage().rss, maxRSSKiB: process.resourceUsage().maxRSS},
      review: {selected: review.selected.length, mandatoryCandidates: review.mandatory, stillUnreviewed: review.unreviewedAfterSelection},
      sqlBytes: statSync(join(directory, 'campaigns.sqlite')).size, directory};
    return report;
  } finally { await store.close(); }
}
async function main(args) {
  const [command, value] = args, opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  if (command === 'bench') {
    const report = await benchmark(Number(opt('--count', 100000)), opt('--db'), p => console.error(JSON.stringify(p)));
    if (opt('--report')) await writeFile(opt('--report'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2)); return;
  }
  const store = await new ScaleStore(resolve(opt('--db', '.scale-data'))).init();
  try {
    if (command === 'plan') {
      const reader = readJSONL(value); try {
        const header = reader.next().value;
        requireThat(header && header.contract && header.packets, 'First JSONL line must contain contract and packets');
        console.log(JSON.stringify(store.create({...header, tasks: reader, simulation: false}), null, 2));
      } finally { reader.return?.(); }
    } else if (command === 'prepare') {
      requireThat(statSync(value).size <= 20000000, 'Assessment exceeds 20 MB');
      const assessment = JSON.parse(await readFile(value, 'utf8')), providers = tierProviders();
      const manifest = await prepareCampaign(assessment, {...providers, maxQuestions: Number(opt('--limit', 500)), onProgress: async stage => console.error(stage)});
      console.log(JSON.stringify(store.create({...manifest, limits: {maxQuestions: Number(opt('--limit', 500))}}), null, 2));
    } else if (command === 'run') {
      const run = store.get(value);
      requireThat(opt('--approve') === run.planHash, 'Read the saved plan and pass --approve <planHash> to authorize paid inference');
      console.log(JSON.stringify(await runCampaign(store, run.id, {planHash: run.planHash, client: run.simulation ? new SyntheticClient() : new JevBatchClient()}), null, 2));
    } else if (command === 'show') console.log(JSON.stringify(store.get(value), null, 2));
    else if (command === 'review') {
      requireThat(opt('--approve') === store.get(value).planHash, 'Pass --approve <planHash> to authorize strong-model review');
      console.log(JSON.stringify(await reviewCampaign(store, value, tierProviders().orchestrator), null, 2));
    } else if (command === 'export') {
      console.log(JSON.stringify({type: 'campaign', run: store.get(value)}));
      for (const t of store.each(value)) console.log(JSON.stringify({type: 'estimate', ...t}));
    } else if (command === 'compose') {
      requireThat(opt('--graph') && statSync(opt('--graph')).size <= 1000000, 'Provide --graph with a JSON graph <= 1 MB');
      console.log(JSON.stringify(composeReviewed(store, value, JSON.parse(await readFile(opt('--graph'), 'utf8'))), null, 2));
    } else throw new Error('Commands: bench [--count 100000], prepare assessment.json, plan manifest.jsonl, show ID, run ID --approve HASH, review ID --approve HASH, export ID, compose ID --graph graph.json. All support --db DIRECTORY.');
  } finally { await store.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(e => { console.error(`${e.code || 'SCALE_ERROR'}: ${e.message}`); process.exitCode = 1; });
}
