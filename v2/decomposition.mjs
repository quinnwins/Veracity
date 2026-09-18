// Provider-neutral decomposition contract for Veracity V2.
// This module validates model output before it is allowed into the probability engine.

const TYPES=new Set(["claim","subclaim","premise","atomic","hypothesis"]);
const RELATIONS=new Set(["and","or","evidence","alternative_set","informational"]);

export function decompositionSystemPrompt(){
return `You are the decomposition stage of an epistemic audit. Your job is not to decide the conclusion. Preserve the user's exact claim, define ambiguous terms, and recursively split empirical dependencies until each leaf is atomic enough to be assessed against a single observation or compact evidence packet.

Rules:
- Never smuggle the conclusion into a premise.
- Separate empirical premises from definitions and value judgments.
- A leaf is atomic only when one concrete observation could materially support or contradict it without first resolving another hidden empirical claim.
- Give every non-leaf explicit relation semantics: and, or, evidence, alternative_set, or informational.
- Do not claim independence. Mark dependence unknown unless the structure itself establishes it.
- Generate the strongest materially distinct rival explanations.
- Only mark alternatives exclusive/exhaustive when they truly partition the possibility space.
- Every empirical node must state a falsifier.
- Do not assign final probabilities. Probability elicitation is a later stage.
- If the user's wording cannot be scored without choosing a reading, emit multiple readings rather than silently choosing.
Return strict JSON only.`;
}

export function validateDecomposition(d){
 const errors=[];if(!d||typeof d!=="object")return{ok:false,errors:["not an object"]};
 if(!d.contract?.wording)errors.push("missing exact claim wording");
 if(!d.contract?.falsifier)errors.push("root claim needs a falsifier");
 const nodes=d.nodes||{};if(!d.rootId||!nodes[d.rootId])errors.push("missing root");
 for(const [id,n] of Object.entries(nodes)){
   if(!TYPES.has(n.type))errors.push(id+": invalid type");
   if(!n.text?.trim())errors.push(id+": empty text");
   if(["claim","subclaim","premise","atomic","hypothesis"].includes(n.type)&&!n.falsifier?.trim())errors.push(id+": empirical node lacks falsifier");
   const children=n.children||[];
   if(children.length){
     if(!n.relation||!RELATIONS.has(n.relation.kind))errors.push(id+": children without explicit relation");
     for(const c of children)if(!nodes[c])errors.push(id+": missing child "+c);
   }
   if(n.type==="atomic"&&children.length)errors.push(id+": atomic node has children");
   if(n.relation?.kind==="alternative_set"&&(n.relation.exclusive!==true||n.relation.exhaustive!==true)) n.normalizable=false;
 }
 // cycle + reachability
 const seen=new Set(),active=new Set();
 function walk(id){if(active.has(id)){errors.push("cycle at "+id);return}if(seen.has(id)||!nodes[id])return;active.add(id);seen.add(id);for(const c of nodes[id].children||[])walk(c);active.delete(id)}
 if(d.rootId)walk(d.rootId);
 for(const id of Object.keys(nodes))if(!seen.has(id)&&nodes[id].type!=="hypothesis")errors.push(id+": unreachable from root");
 return{ok:errors.length===0,errors};
}

export function atomicityAuditPrompt(node,ancestry=[]){
 return `Audit whether this proposed leaf is truly atomic.
Claim: ${node.text}
Ancestry: ${ancestry.join(" > ")||"(root)"}
Falsifier: ${node.falsifier||"(missing)"}

Return JSON: {"atomic":boolean,"hiddenAssumptions":[string],"betterChildren":[{"text":string,"falsifier":string}],"reason":string}.
Set atomic=false whenever evaluating the leaf still requires resolving two or more materially distinct empirical propositions.`;
}

export function probabilityElicitationPrompt(node,evidenceSummary){
 return `Estimate a defensible PRIOR RANGE for this atomic proposition before the listed case-specific evidence, and separately propose likelihood-ratio ranges for each independent evidence cluster. Do not output a final posterior; code will compute it.

Atomic proposition: ${node.text}
Falsifier: ${node.falsifier}
Evidence clusters:
${evidenceSummary}

For every numeric range provide: reference class, rationale, provenance type, and what observation would make the estimate invalid. Prefer wide ranges to unsupported precision. If no defensible reference class or LR exists, return abstain=true.`;
}
