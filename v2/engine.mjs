// Veracity V2 deterministic probability engine.
// No UI state, model calls, or source-prestige heuristics belong in this module.

export const ENGINE_VERSION = "2.0.0-alpha.1";
const EPS=1e-9;
const clamp01=x=>Math.min(1,Math.max(0,x));
const logit=p=>Math.log(Math.max(EPS,Math.min(1-EPS,p))/(1-Math.max(EPS,Math.min(1-EPS,p))));
const logistic=x=>1/(1+Math.exp(-x));
export const midpoint=r=>(r[0]+r[1])/2;
export function normalizeRange(r){
  if(!Array.isArray(r)||r.length!==2||r.some(x=>typeof x!=="number"||!Number.isFinite(x))) throw new Error("invalid probability range");
  return [Math.min(clamp01(r[0]),clamp01(r[1])),Math.max(clamp01(r[0]),clamp01(r[1]))];
}
export function complement(r){const [lo,hi]=normalizeRange(r);return [1-hi,1-lo]}

export function bayesUpdate(prior,evidence=[]){
  const [pLo,pHi]=normalizeRange(prior); let lo=logit(pLo),hi=logit(pHi);
  const clusters=new Map();
  for(const e of evidence){
    if(!e||e.status==="ungrounded"||!e.likelihood?.lr) continue;
    const key=e.independenceCluster||e.id;
    if(clusters.has(key)) throw new Error("duplicate independence cluster must be collapsed upstream: "+key);
    clusters.set(key,e);
  }
  for(const e of clusters.values()){
    const [a,b]=e.likelihood.lr;
    if(!(a>0&&b>0)) throw new Error("LR must be positive");
    const l=Math.min(a,b),h=Math.max(a,b); lo+=Math.log(l); hi+=Math.log(h);
  }
  return normalizeRange([logistic(lo),logistic(hi)]);
}

function andBounded(rs){
  const lows=rs.map(r=>normalizeRange(r)[0]), highs=rs.map(r=>normalizeRange(r)[1]), n=rs.length;
  return normalizeRange([Math.max(0,lows.reduce((a,b)=>a+b,0)-(n-1)),Math.min(...highs)]);
}
function andIndependent(rs){return normalizeRange([rs.reduce((p,r)=>p*normalizeRange(r)[0],1),rs.reduce((p,r)=>p*normalizeRange(r)[1],1)])}
function orExclusive(rs){return normalizeRange([Math.min(1,rs.reduce((s,r)=>s+normalizeRange(r)[0],0)),Math.min(1,rs.reduce((s,r)=>s+normalizeRange(r)[1],0))])}
function orIndependent(rs){return complement(andIndependent(rs.map(complement)))}

export function composeRelation(relation, childRanges){
  if(!relation) throw new Error("missing relation semantics");
  if(!Array.isArray(childRanges)||!childRanges.length) throw new Error("relation has no children");
  if(relation.kind==="and"){
    if(relation.dependence==="independent") return andIndependent(childRanges);
    if(relation.dependence==="bounded") return andBounded(childRanges);
    throw new Error("modeled AND dependence requires an explicit dependence model");
  }
  if(relation.kind==="or"){
    if(relation.exclusivity==="exclusive") return orExclusive(childRanges);
    if(relation.exclusivity==="independent") return orIndependent(childRanges);
    throw new Error("overlapping OR requires an overlap model or bounds");
  }
  throw new Error("relation is not directly composable: "+relation.kind);
}

export function hypothesisPosterior(hypotheses,evidence=[]){
  if(!hypotheses?.length) throw new Error("empty hypothesis set");
  if(!hypotheses.every(h=>h.exclusive===true&&h.exhaustive===true)) throw new Error("normalization requires an exclusive + exhaustive hypothesis set");
  const priors=hypotheses.map(h=>h.prior??1/hypotheses.length),sum=priors.reduce((a,b)=>a+b,0);
  const logs=priors.map(p=>Math.log(Math.max(EPS,p/sum)));
  const seen=new Set();
  for(const e of evidence){
    const key=e.independenceCluster||e.id;if(seen.has(key)) throw new Error("duplicate independence cluster: "+key);seen.add(key);
    if(!e.lrPerH) continue;
    hypotheses.forEach((h,i)=>{const lr=e.lrPerH[h.id];if(typeof lr==="number"&&lr>0) logs[i]+=Math.log(lr)});
  }
  const m=Math.max(...logs),xs=logs.map(x=>Math.exp(x-m)),z=xs.reduce((a,b)=>a+b,0);
  return Object.fromEntries(hypotheses.map((h,i)=>[h.id,xs[i]/z]));
}

export function entropyBinary(p){p=Math.max(EPS,Math.min(1-EPS,p));return -(p*Math.log2(p)+(1-p)*Math.log2(1-p))}
export function expectedInformationGain(currentRange,outcomes){
  const p=midpoint(normalizeRange(currentRange)),base=entropyBinary(p);
  if(!Array.isArray(outcomes)||!outcomes.length) return null;
  const total=outcomes.reduce((s,o)=>s+o.probability,0); if(Math.abs(total-1)>.001) throw new Error("outcome probabilities must sum to 1");
  return Math.max(0,base-outcomes.reduce((s,o)=>s+o.probability*entropyBinary(midpoint(normalizeRange(o.posterior))),0));
}

export function rootSwing(base,variants){const m=midpoint(normalizeRange(base));return Math.max(...variants.map(r=>Math.abs(midpoint(normalizeRange(r))-m)))}

export function validateAssessment(a){
  const errors=[]; if(!a?.contract?.wording) errors.push("missing claim wording"); if(!a?.contract?.falsifier) errors.push("missing falsifier");
  if(!a?.rootId||!a?.nodes?.[a.rootId]) errors.push("missing root node");
  for(const [id,n] of Object.entries(a?.nodes||{})){
    if(n.status==="scored"&&!n.posterior&&!n.prior) errors.push(id+": scored without probability");
    if((n.prior||n.posterior)&&!n.provenance&&n.status==="scored") errors.push(id+": probability lacks provenance");
    if(n.relation?.kind==="alternative_set"&&!(n.relation.exclusive&&n.relation.exhaustive)) errors.push(id+": normalized alternative set must be exclusive and exhaustive");
  }
  return {ok:errors.length===0,errors};
}
