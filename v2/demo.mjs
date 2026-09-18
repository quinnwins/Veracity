import {digest} from './evidence.mjs';
import {analyzeGraph} from './graph.mjs';
// Deliberately fictional fixture. No fabricated real-world research or citations.
export function createDemo() {
  const provenance = rationale => ({kind: 'synthetic', rationale, calibration: 'demonstration-only'});
  const source = (id, title, text) => ({id, title, text, sha256: digest(text), kind: 'synthetic', publishedAt: null, fetchedAt: null, url: null});
  const model = {
    demo: true, rootId: 'C0', rivalRootIds: ['H1'],
    contract: {wording: 'Will the next release meet both reliability targets?', reading: 'The fictional release passes only if the error rate stays below 1% AND its 95th-percentile response time stays below 200 ms in the specified load test.', scope: 'Synthetic staging environment, one test run, fixed traffic mix.', falsifier: 'Either measured target fails in the next controlled load test.', mode: 'empirical', alternatives: ['Meeting a target once does not establish sustained production reliability.']},
    nodes: {
      C0: {id: 'C0', type: 'claim', text: 'The release meets both reliability targets.', falsifier: 'At least one target fails.', relation: {kind: 'and', dependence: 'bounded', equivalent: true, rationale: 'Passing is defined as meeting both targets; their dependence is unknown.', children: ['A1', 'A2']}},
      A1: {id: 'A1', type: 'atomic', text: 'The request error rate stays below 1%.', falsifier: 'The next load test records an error rate of 1% or higher.', prior: [0.6, 0.8], plausiblePrior: [0.4, 0.9], referenceClass: 'Fictional releases with similar pre-release test conditions.', provenance: provenance('Illustrative pre-test prior, chosen to exercise sensitivity rather than represent an empirical frequency.'), atomicity: {status: 'measurable', reason: 'One thresholded measurement at a specified traffic mix.', observation: 'Count failed requests and total requests in the next load test.'}, nextInvestigation: 'Repeat the load test at the production traffic mix and record the failed-request count.'},
      A2: {id: 'A2', type: 'atomic', text: '95th-percentile response time stays below 200 ms.', falsifier: 'The next load test records p95 latency of 200 ms or more.', prior: [0.55, 0.75], plausiblePrior: [0.3, 0.85], referenceClass: 'Fictional releases with comparable load and infrastructure.', provenance: provenance('Illustrative pre-test prior, not a calibrated forecast.'), atomicity: {status: 'measurable', reason: 'One latency quantile measured under fixed conditions.', observation: 'Measure the p95 from raw request durations.'}, nextInvestigation: 'Run a peak-load test with the cache cold; preserve raw request durations.'},
      H1: {id: 'H1', type: 'hypothesis', text: 'A warm staging cache makes the test optimistic.', falsifier: 'Equivalent results in a cold-cache replication.', relation: null, nextInvestigation: 'Compare warm-cache and cold-cache load tests.', atomicity: {status: 'measurable', reason: 'A controlled replication can test this explanation.', observation: 'Observe whether the cold-cache result materially differs.'}}
    },
    sources: {
      s1: source('s1', 'Synthetic run log · request errors', 'Fictional fixture: The smoke test recorded 3 failed requests out of 1,000 requests. The traffic mix was lighter than production.'),
      s2: source('s2', 'Synthetic run log · response time', 'Fictional fixture: The smoke test recorded p95 latency of 178 ms. The cache was warm throughout the test.')
    },
    evidence: {
      e1: {id: 'e1', targetNodeIds: ['A1'], observation: 'Low error count in a lighter-load smoke test.', independenceCluster: 'synthetic-errors', status: 'observed', references: [{sourceId: 's1', quote: 'The smoke test recorded 3 failed requests out of 1,000 requests.'}], likelihood: {lr: [1.5, 3], provenance: provenance('Illustrative joint likelihood for this observation under passing versus failing the next test; uncertainty includes load mismatch.')}},
      e2: {id: 'e2', targetNodeIds: ['A2'], observation: 'Latency passes in a warm-cache smoke test.', independenceCluster: 'synthetic-latency', status: 'observed', references: [{sourceId: 's2', quote: 'The smoke test recorded p95 latency of 178 ms.'}], likelihood: {lr: [1.2, 2.5], provenance: provenance('Illustrative likelihood range; uncertainty includes the warm-cache confound.') }}
    }, warnings: ['This is a fictional engineering example. All priors and likelihoods are illustrative inputs, not real-world estimates.']
  };
  return {question: model.contract.wording, model, analysis: analyzeGraph(model), status: 'demo', stage: 'Fictional worked example', kind: 'demo', warnings: model.warnings, snapshots: [], usage: {calls: 0, sourceFetches: 0, tokens: 0}};
}
