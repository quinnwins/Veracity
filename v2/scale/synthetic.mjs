import {digest} from '../evidence.mjs';
import {auditHash} from '../store.mjs';
import {requireThat} from '../engine.mjs';

// Throughput fixtures only. These are not evidence of model accuracy or factual calibration.
export function syntheticManifest(count = 1000, mutatePacket = -1) {
  requireThat(Number.isInteger(count) && count >= 1 && count <= 100000, 'Synthetic count must be 1–100,000');
  const packets = Array.from({length: Math.min(100, count)}, (_, i) => {
    const text = `FICTIONAL ENGINEERING TEST PACKET ${i}. Device records in this generated fixture have no real-world counterpart. These independent identifiers test queue behavior, not epistemic independence. Variant: ${mutatePacket === i ? 'changed source' : 'original source'}.`;
    return {id: `p${i}`, sources: [{id: `s${i}`, text, sha256: digest(text), origin: 'synthetic', title: `Fictional packet ${i}`, rootId: `synthetic-observation-${i}`} ]};
  });
  function* tasks() {
    for (let i = 0; i < count; i++) yield {packetId: `p${i % packets.length}`, proposition: `Fictional device ${i} meets the specified thermal threshold in this generated test record.`, falsifier: `A generated test observation for device ${i} exceeds the threshold.`, scope: `Fictional fixture observation ${i}; no empirical claim`, yes: 'The fixture threshold is met.', no: 'The fixture threshold is not met.', family: `family-${i % 20}`, priority: i % 83 === 0 ? 'critical' : 'normal', sourceFit: i % 43 === 0 ? 'contradictory' : 'direct'};
  }
  return {contract: {mode: 'empirical', wording: 'Fictional engineering fixture for probability pipeline testing.', scope: 'Synthetic data; not an assessment of the world', asOf: '2026-09-17T00:00:00.000Z'}, packets, tasks: tasks(), simulation: true};
}
export class SyntheticClient {
  constructor() { this.configured = true; this.namespace = 'synthetic-v1'; this.model = 'jev-1.13.0'; this.calls = 0; }
  async send(body, {signal} = {}) {
    signal?.throwIfAborted(); this.calls++;
    return {response: {model: this.model, answers: Object.fromEntries(Object.keys(body.questions).map(id => [id, {type: 'noul', noul: parseInt(auditHash({id}).slice(0, 8), 16) / 0x100000000}])),
      usage: {input_tokens: Math.ceil(Buffer.byteLength(JSON.stringify(body)) / 4), output_tokens: Object.keys(body.questions).length * 10}}, requestId: `synthetic-${this.calls}`};
  }
}
