// Evaluate externally reviewed/resolved predictions. This does not manufacture a benchmark.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {probability, requireThat} from './engine.mjs';
export function evaluatePredictions(rows, {bins = 10} = {}) {
  requireThat(Array.isArray(rows) && rows.length > 0 && rows.length <= 100000, 'Provide 1–100000 resolved predictions');
  requireThat(Number.isInteger(bins) && bins >= 2 && bins <= 50, 'Use 2–50 reliability bins');
  const seen = new Set(), groups = new Set(), buckets = Array.from({length: bins}, (_, i) => ({low: i / bins, high: (i + 1) / bins, count: 0, probabilitySum: 0, outcomes: 0}));
  let brier = 0, logLoss = 0;
  for (const row of rows) {
    requireThat(typeof row.id === 'string' && row.id && !seen.has(row.id), 'Prediction IDs must be unique'); seen.add(row.id);
    requireThat(typeof row.task === 'string' && row.task && typeof row.model === 'string' && row.model, 'Every prediction needs a task and model version');
    groups.add(JSON.stringify([row.task, row.model]));
    const p = probability(row.probability);
    requireThat(row.outcome === 0 || row.outcome === 1, 'Outcomes must be resolved binary labels, not model agreement scores');
    const predicted = Date.parse(row.predictedAt), resolved = Date.parse(row.resolvedAt);
    requireThat(Number.isFinite(predicted) && Number.isFinite(resolved) && predicted < resolved, 'Prediction must precede resolution');
    if (row.evidenceCutoff !== undefined) requireThat(Number.isFinite(Date.parse(row.evidenceCutoff)) && Date.parse(row.evidenceCutoff) <= predicted, 'Evidence cutoff must not follow the prediction');
    brier += (p - row.outcome) ** 2;
    const assigned = row.outcome === 1 ? p : 1 - p;
    logLoss += assigned === 0 ? Infinity : -Math.log(assigned);
    const bucket = buckets[Math.min(bins - 1, Math.floor(p * bins))];
    bucket.count++; bucket.probabilitySum += p; bucket.outcomes += row.outcome;
  }
  requireThat(groups.size === 1, 'Evaluate one task/model population at a time; do not pool unrelated calibration');
  const reliability = buckets.map(b => ({low: b.low, high: b.high, count: b.count, meanProbability: b.count ? b.probabilitySum / b.count : null, observedFrequency: b.count ? b.outcomes / b.count : null}));
  const ece = reliability.reduce((sum, b) => sum + (b.count ? b.count / rows.length * Math.abs(b.meanProbability - b.observedFrequency) : 0), 0);
  return {task: rows[0].task, model: rows[0].model, count: rows.length, brier: brier / rows.length, logLoss: Number.isFinite(logLoss) ? logLoss / rows.length : 'infinite', expectedCalibrationError: ece, reliability, limitations: 'Empirical diagnostics for the supplied labels and population only. Small-bin frequencies are uncertain. Timestamp checks cannot detect hidden training-data leakage or validate label provenance.'};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireThat(process.argv[2], 'Usage: node evaluate.mjs reviewed-predictions.jsonl');
    const raw = await readFile(process.argv[2], 'utf8'); requireThat(raw.length <= 50000000, 'Evaluation input is too large');
    const rows = raw.split(/\r?\n/).filter(s => s.trim()).map(s => JSON.parse(s));
    console.log(JSON.stringify(evaluatePredictions(rows), null, 2));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
