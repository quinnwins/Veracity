// Evidence ledger utilities: provenance, root-source collapse, and model-judgment storage.

export function canonicalClusterKey(e){
  // Prefer an explicitly verified root observation. URL/domain similarity alone is never enough.
  return e.rootObservationId||e.primaryStudyId||e.datasetEventId||e.independenceCluster||e.id;
}
export function collapseEvidence(items){
  const groups=new Map();
  for(const e of items||[]){const k=canonicalClusterKey(e);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e)}
  return [...groups.entries()].map(([id,members])=>({id,members,representative:pickRepresentative(members)}));
}
function pickRepresentative(xs){
  return [...xs].sort((a,b)=>score(b)-score(a))[0];
}
function score(e){
  // This ranks inspectability, NOT truth. It must never become an LR automatically.
  return (e.exactSpan?2:0)+(e.primarySource?2:0)+(e.observedAt?1:0)+(e.method?1:0);
}
export function makeJudgmentEnvelope({id,task,provider,model,question,options,sourceIds,sourceSpans=[],createdAt=new Date().toISOString(),adapterVersion="1"}){
  if(!id||!task||!provider||!model||!question)throw new Error("incomplete model judgment provenance");
  const sum=(options||[]).reduce((s,o)=>s+o.probability,0);if(Math.abs(sum-1)>.001)throw new Error("judgment probabilities must sum to 1");
  return{id,task,provider,model,question,options,sourceIds,sourceSpans,createdAt,adapterVersion};
}
export function groundingScore(nodes){
  const sensitive=Object.values(nodes||{}).filter(n=>(n.sensitivityWeight||0)>0);
  const denom=sensitive.reduce((s,n)=>s+n.sensitivityWeight,0);if(!denom)return 0;
  const backed=sensitive.reduce((s,n)=>s+n.sensitivityWeight*(n.inspectableEvidence?1:0),0);
  return backed/denom;
}
