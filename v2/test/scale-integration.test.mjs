import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as sleep} from 'node:timers/promises';
import {createApplication} from '../server.mjs';
import {OpenAIProvider, RunBudget} from '../providers.mjs';
import {digest} from '../evidence.mjs';
import {prepareCampaign, sourceWindows} from '../scale/prepare.mjs';
import {ScaleStore} from '../scale/store.mjs';
import {runCampaign} from '../scale/runner.mjs';
import {syntheticManifest, SyntheticClient} from '../scale/synthetic.mjs';
import {readJSONL} from '../scale/cli.mjs';
import {composeReviewed} from '../scale/compose.mjs';

function parent() {
  const text='The engineering trial documented seven failures in the controlled thermal test. A second trial was not reported.';
  return {id:'parent-id',revision:1,status:'partial',updatedAt:'2026-09-17T12:00:00Z',question:'Does the tested design meet its thermal reliability threshold?',kind:'live',
    model:{demo:false,contract:{wording:'Does the tested design meet its thermal reliability threshold?',scope:'The controlled engineering test, not all designs',mode:'empirical'},
      nodes:{C0:{id:'C0',type:'claim',text:'The tested design meets the threshold',falsifier:'It failed the declared test'}},
      sources:{s1:{id:'s1',text,sha256:digest(text),url:'https://example.org/engineering',title:'Engineering test fixture',kind:'retrieved',publishedAt:'2026-09-15T00:00:00Z'}},evidence:{}}};
}
function models() {
  const calls=[];
  const orchestrator={configured:true,model:'strong-fixture',budget:new RunBudget(),json:async(task,prompt,input)=>{
    calls.push({role:'orchestrator',task,input,prompt});orchestrator.budget.reserve('model');orchestrator.budget.record('openai','strong-fixture',{input_tokens:100,output_tokens:50});
    if(task==='scalePlan')return {mode:'empirical',reason:'Empirical test',workstreams:[{family:'thermal',parentNodeId:'C0',question:'Was the threshold met?',falsifier:'Observed excess failures',priority:'critical'}]};
    return {id:input.task.id,status:'needs_evidence',reason:'A second independent test would be needed to establish external validity.'};
  }};
  const worker={configured:true,model:'cheap-fixture',budget:new RunBudget(),json:async(task,prompt,input)=>{
    calls.push({role:'worker',task,input,prompt});worker.budget.reserve('model');worker.budget.record('openai','cheap-fixture',{input_tokens:80,output_tokens:60});
    return {questions:[{proposition:'The controlled thermal trial documented seven failures.',falsifier:'The original trial record reports a different count.',scope:'This controlled trial only',yes:'Seven failures were reported.',no:'Seven failures were not reported.',family:'thermal',parentNodeId:'C0',priority:'normal',sourceFit:'direct',references:[{sourceId:input.passages[0].id,quote:'documented seven failures'}]}],gaps:['No independent replication is present.']};
  }};return{orchestrator,worker,calls};
}
async function app(t, opts={}) {
  const directory=await mkdtemp(join(tmpdir(),'veracity-scale-http-'));
  const a=await createApplication({directory,port:0,host:'127.0.0.1',...opts});await a.listen();
  t.after(async()=>{await a.close();await rm(directory,{recursive:true,force:true});});
  a.base=`http://127.0.0.1:${a.server.address().port}`;
  a.request=async(path,data,headers={})=>{const r=await fetch(a.base+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:a.base,...headers},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,data:await r.json(),headers:r.headers};};return a;
}
async function until(fn) {for(let i=0;i<200;i++){const r=await fn();if(r)return r;await sleep(5);}throw new Error('Timed out waiting for local fixture');}

test('strong orchestration and cheap extraction use separate providers with recorded usage',async()=>{const p=models(),result=await prepareCampaign(parent(),{...p,maxQuestions:10});assert.deepEqual(p.calls.map(x=>[x.role,x.task]),[['orchestrator','scalePlan'],['worker','scaleExtract']]);assert.equal(result.tasks.length,1);assert.equal(result.tasks[0].author.requestedModel,'cheap-fixture');assert.equal(result.tasks[0].priority,'critical');assert.equal(result.plan.usage.orchestrator.calls,1);assert.equal(result.plan.usage.worker.calls,1);assert.equal(result.plan.enumerationComplete,false);});
test('workers cannot fabricate grounding quotations',async()=>{const p=models(),orig=p.worker.json;p.worker.json=async(...args)=>{const r=await orig(...args);r.questions[0].references[0].quote='a fabricated result';return r;};await assert.rejects(prepareCampaign(parent(),{...p}),/No grounded/);});
test('workers cannot silently move questions to another graph node',async()=>{const p=models(),orig=p.worker.json;p.worker.json=async(...args)=>{const r=await orig(...args);r.questions[0].parentNodeId='X';return r;};await assert.rejects(prepareCampaign(parent(),{...p}),/No grounded/);});
test('numeric scale preparation obeys descriptive-mode triage',async()=>{const p=models();p.orchestrator.json=async()=>({mode:'descriptive',reason:'Value choice',workstreams:[]});await assert.rejects(prepareCampaign(parent(),p),/descriptive/);assert.equal(p.worker.budget.calls,0);});
test('preparation requires a real empirical parent and explicit worker configuration',async()=>{const p=models(),a=parent();a.model.demo=true;await assert.rejects(prepareCampaign(a,p),/fictional/);p.worker.configured=false;await assert.rejects(prepareCampaign(parent(),p),/Configure/);});
test('worker overproduction is rejected, not silently padded to a quota',async()=>{const p=models(),original=p.worker.json;p.worker.json=async(...args)=>{const r=await original(...args);r.questions.push({...r.questions[0],proposition:'another'});return r;};await assert.rejects(prepareCampaign(parent(),{...p,maxQuestions:1}),/No grounded/);});
test('source windows preserve original digest and explicit boundaries',()=>{const a=parent();a.model.sources.s1.text='Test passage. '.repeat(1000);a.model.sources.s1.sha256=digest(a.model.sources.s1.text);const ws=sourceWindows(a,{maxWindows:2});assert.equal(ws.length,2);assert.equal(ws[1].window.start,4500);assert.equal(ws[0].sources[0].sourceDigest,a.model.sources.s1.sha256);assert.equal(ws[0].sources[0].sha256,digest(ws[0].sources[0].text));});
test('actual OpenAI wire adapter uses strict schemas for scale tasks',async()=>{let sent;const provider=new OpenAIProvider({key:'not-real',model:'account-model',fetchImpl:async(_url,r)=>{sent=JSON.parse(r.body);return new Response(JSON.stringify({id:'response-fixture',model:'returned-snapshot',status:'completed',usage:{input_tokens:20,output_tokens:10},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({mode:'empirical',reason:'fixture',workstreams:[]})}]}]}));}});await provider.json('scalePlan','Plan a study',{question:'test'});assert.equal(sent.text.format.strict,true);assert.equal(sent.text.format.schema.additionalProperties,false);assert.equal(provider.budget.events[0].model,'returned-snapshot');assert.equal(sent.store,false);});
test('scale HTTP routes run a real stored simulation and bounded pagination',async t=>{const a=await app(t);let r=await a.request('/api/scale/simulation',{count:1000});assert.equal(r.status,201);const id=r.data.id,planHash=r.data.planHash;assert.equal((await a.request(`/api/scale/runs/${id}/start`,{planHash})).status,202);const done=await until(async()=>{const r=(await a.request(`/api/scale/runs/${id}`)).data;return !r.active&&r.status==='completed'?r:null;});assert.equal(done.counts.completed,1000);const page=(await a.request(`/api/scale/runs/${id}/items?limit=5`)).data;assert.equal(page.items.length,5);assert.equal(page.next,4);assert.equal((await a.request(`/api/scale/runs/${id}/items?limit=100000`)).status,422);const trace=(await a.request(`/api/scale/runs/${id}/trace?key=${page.items[0].batchKey}`)).data;assert.equal(trace.body.model,'jev-1.13.0');assert.ok(trace.response.answers[page.items[0].id]);});
test('live scoring requires explicit plan approval even with a configured fake client',async t=>{const providers=models();const a=await app(t,{scaleOptions:{providers:()=>providers,clientFactory:()=>{const c=new SyntheticClient();c.namespace='typesafe-live';return c;}}});const p=await a.store.create(parent());const start=await a.request('/api/scale/prepare',{assessmentId:p.id,expectedRevision:p.revision,maxQuestions:10},{'Idempotency-Key':'plan-integration-1'});assert.equal(start.status,202);const saved=await until(async()=>{const r=await a.store.get(start.data.preparationId);return r.status!=='running'?r:null;});assert.equal(saved.status,'scale-planned');await until(async()=>a.scale.jobs.size===0);const r=a.scale.store.get(saved.campaignId);assert.equal((await a.request(`/api/scale/runs/${r.id}/start`,{planHash:r.planHash})).status,422);assert.equal((await a.request(`/api/scale/runs/${r.id}/start`,{planHash:r.planHash,approvePaid:true})).status,202);await until(async()=>a.scale.jobs.size===0);assert.equal(a.scale.store.get(r.id).counts.completed,1);const again=await a.request('/api/scale/prepare',{assessmentId:p.id,expectedRevision:p.revision,maxQuestions:10},{'Idempotency-Key':'plan-integration-1'});assert.equal(again.data.preparationId,saved.id);assert.equal(providers.calls.filter(c=>c.task==='scalePlan').length,1);});

test('live Probability Lab can score with a grunt agent when Jev is unavailable',async t=>{
  const providers=models();
  const probabilityProvider={configured:true,name:'grunt-prob',model:'grunt-json-v1',driver:'command',budget:new RunBudget(),structured:async(_task,_instructions,input)=>{
    probabilityProvider.budget.reserve('model');probabilityProvider.budget.record('harness:grunt-prob','grunt-json-v1',null,'grunt-request');
    return {answers:Object.fromEntries(Object.keys(input.questions).map(id=>[id,{probability:.64,abstain:false,reason:'The saved fixture passage directly bears on this scoped proposition.'}]))};
  }};
  const registry={
    publicConfig:()=>({agents:[{name:'grunt-prob',driver:'command',model:'grunt-json-v1',configured:true,capabilities:{search:false}}],defaults:{orchestrator:'grunt-prob',worker:'grunt-prob'},customConfig:true}),
    create:name=>{assert.equal(name,'grunt-prob');return probabilityProvider;}
  };
  const noJev=()=>({configured:false,model:'jev-1.13.0',namespace:'typesafe-live'});
  const a=await app(t,{scaleOptions:{providers:()=>providers,agentRegistry:registry,clientFactory:noJev}});
  const p=await a.store.create(parent());
  const cfg=(await a.request('/api/scale/config')).data;
  assert.equal(cfg.jev.configured,false);assert.ok(cfg.probabilityEstimators.some(x=>x.id==='agent:grunt-prob'));
  const start=await a.request('/api/scale/prepare',{assessmentId:p.id,expectedRevision:p.revision,maxQuestions:10,probabilityEstimator:'agent:grunt-prob'},{'Idempotency-Key':'grunt-prob-no-jev'});
  assert.equal(start.status,202);
  const saved=await until(async()=>{const r=await a.store.get(start.data.preparationId);return r.status!=='running'?r:null;});
  assert.equal(saved.status,'scale-planned');await until(async()=>a.scale.jobs.size===0);
  const run=a.scale.store.get(saved.campaignId);assert.equal(run.estimator.kind,'agent');assert.equal(run.estimator.name,'grunt-prob');assert.equal(run.estimate.providerUSD,null);
  assert.equal((await a.request(`/api/scale/runs/${run.id}/start`,{planHash:run.planHash,approvePaid:true})).status,202);
  await until(async()=>a.scale.jobs.size===0);
  const done=a.scale.store.get(run.id);assert.equal(done.counts.completed,1);assert.equal(done.status,'completed');
  assert.equal(a.scale.store.page(run.id).items[0].probability,.64);
});
test('preparation idempotency collisions fail rather than reusing a different plan',async t=>{const a=await app(t);await a.store.create({...parent(),scaleRequestKey:'existing-scale-key',requestFingerprint:'not-the-input'});const r=await a.request('/api/scale/prepare',{assessmentId:'anything',maxQuestions:1},{'Idempotency-Key':'existing-scale-key'});assert.equal(r.status,409);});
test('scale API shares authorization and cross-origin write protection',async t=>{const a=await app(t,{accessToken:'a-test-token-long-enough-for-this-fixture'});assert.equal((await a.request('/api/scale/config')).status,401);const logged=await a.request('/api/login',{token:'a-test-token-long-enough-for-this-fixture'});const cookie=logged.headers.get('set-cookie').split(';')[0];assert.equal((await a.request('/api/scale/config',undefined,{Cookie:cookie})).status,200);assert.equal((await a.request('/api/scale/simulation',{count:1000},{Cookie:cookie,Origin:'https://other.example'})).status,403);});
test('scale configuration never returns provider keys',async t=>{const a=await app(t);const c=(await a.request('/api/scale/config')).data;assert.ok(c.orchestrator);assert.equal(JSON.stringify(c).includes('API_KEY'),false);assert.equal(c.maxQuestions,100000);});
test('full ledger export includes exact packets, estimates, batch contexts and attempts',async t=>{const a=await app(t),r=a.scale.store.create(syntheticManifest(2));await runCampaign(a.scale.store,r.id,{client:new SyntheticClient(),planHash:r.planHash});const res=await fetch(a.base+`/api/scale/runs/${r.id}/export`);assert.equal(res.status,200);const lines=(await res.text()).trim().split('\n').map(JSON.parse);assert.equal(lines.filter(x=>x.type==='estimate').length,2);assert.equal(lines.filter(x=>x.type==='packet').length,2);assert.equal(lines.filter(x=>x.type==='batch').length,2);assert.ok(lines.find(x=>x.type==='batch').attempts.length);});
test('stored task probability corruption is detected before display or composition',async t=>{const a=await app(t),r=a.scale.store.create(syntheticManifest(1));await runCampaign(a.scale.store,r.id,{client:new SyntheticClient(),planHash:r.planHash});a.scale.store.sql('UPDATE tasks SET score=.314 WHERE run_id=?').run(r.id);assert.throws(()=>a.scale.store.page(r.id),/integrity/);});
test('cross-packet composition requires a common conditioning model',async t=>{const a=await app(t),r=a.scale.store.create(syntheticManifest(2));await runCampaign(a.scale.store,r.id,{client:new SyntheticClient(),planHash:r.planHash});const tasks=a.scale.store.page(r.id).items;a.scale.store.saveReviews(r.id,tasks.map(t=>({id:t.id,status:'accepted',reason:'Accepted fixture semantics for this structural test.'})),{});const graph={rootId:'R',nodes:[{id:'R',kind:'and',children:['A','B'],text:'Both propositions',equivalent:true,rationale:'Both and only both of the two propositions hold.'},...tasks.map((t,i)=>({id:i?'B':'A',kind:'estimate',taskId:t.id}))]};assert.throws(()=>composeReviewed(a.scale.store,r.id,graph),/common-conditioning/);graph.commonConditioningRationale='Assume each local marginal remains valid after conditioning on the combined evidence from both packets.';assert.ok(composeReviewed(a.scale.store,r.id,graph).root.range);});
test('JSONL manifest reader preserves multi-byte text across chunk boundaries',async t=>{const d=await mkdtemp(join(tmpdir(),'scale-jsonl-'));t.after(()=>rm(d,{recursive:true,force:true}));const p=join(d,'input.jsonl'),header={contract:{scope:'測'.repeat(22000)},packets:[]};await writeFile(p,JSON.stringify(header)+'\n'+JSON.stringify({text:'完整'})+'\n');const rows=[...readJSONL(p)];assert.deepEqual(rows,[header,{text:'完整'}]);});
test('interrupted batch recovers as pending without resetting spent reservations',async t=>{const dir=await mkdtemp(join(tmpdir(),'scale-restart-'));let s=await new ScaleStore(dir).init();const r=s.create(syntheticManifest(1));s.start(r.id,r.planHash);const b=s.claim(r.id);s.reserve(r.id,b);await s.close();s=await new ScaleStore(dir).init();t.after(async()=>{await s.close();await rm(dir,{recursive:true,force:true});});const restored=s.get(r.id);assert.equal(restored.status,'interrupted');assert.equal(restored.usage.requests,1);assert.equal(restored.usage.unknownAttempts,1);const done=await runCampaign(s,r.id,{client:new SyntheticClient(),planHash:r.planHash});assert.equal(done.counts.completed,1);assert.equal(done.usage.requests,2);});
test('preparation cancellation stops worker dispatch and records a cancelled job',async t=>{
  const p=models();let entered=false;
  p.orchestrator.json=async(_task,_prompt,_input,signal)=>{entered=true;await sleep(30000,undefined,{signal});};
  const a=await app(t,{scaleOptions:{providers:()=>p,clientFactory:()=>new SyntheticClient()}}),saved=await a.store.create(parent());
  const start=await a.request('/api/scale/prepare',{assessmentId:saved.id,expectedRevision:saved.revision,maxQuestions:10},{'Idempotency-Key':'cancel-preparation-test'});
  assert.equal(start.status,202);await until(async()=>entered);
  assert.equal((await a.request(`/api/scale/preparations/${start.data.preparationId}/cancel`,{})).status,202);
  const done=await until(async()=>{const r=await a.store.get(start.data.preparationId);return r.status==='cancelled'?r:null;});
  assert.equal(done.status,'cancelled');assert.equal(p.worker.budget.calls,0);assert.equal(a.scale.store.list().length,0);
});
test('JSONL task line limits also apply to a whole line inside a single read chunk',async t=>{
  const d=await mkdtemp(join(tmpdir(),'scale-line-limit-'));t.after(()=>rm(d,{recursive:true,force:true}));const file=join(d,'input.jsonl');
  await writeFile(file,'{"contract":{},"packets":[]}\n'+JSON.stringify({x:'a'.repeat(25000)})+'\n');
  assert.throws(()=>[...readJSONL(file)],/line too large/);
});

test('Probability Lab preparation forwards user-selected orchestrator and grunt agents and persists them',async t=>{
  const selections=[];
  const providerFactory=selection=>{
    selections.push(selection||{});
    const p=models();
    return {...p,orchestratorName:selection?.orchestratorAgent||'default-strong',workerName:selection?.workerAgent||'default-grunt'};
  };
  const a=await app(t,{scaleOptions:{providers:providerFactory,clientFactory:()=>new SyntheticClient()}});
  const saved=await a.store.create(parent());
  const start=await a.request('/api/scale/prepare',{assessmentId:saved.id,expectedRevision:saved.revision,maxQuestions:10,orchestratorAgent:'codex-high',workerAgent:'gemini-worker'},{'Idempotency-Key':'selected-agent-plan'});
  assert.equal(start.status,202);
  const prep=await until(async()=>{const x=await a.store.get(start.data.preparationId);return x.status!=='running'?x:null;});
  assert.equal(prep.status,'scale-planned');
  const campaign=a.scale.store.get(prep.campaignId);
  assert.equal(campaign.plan.agents.orchestrator,'codex-high');
  assert.equal(campaign.plan.agents.worker,'gemini-worker');
  assert.ok(selections.some(x=>x.orchestratorAgent==='codex-high'&&x.workerAgent==='gemini-worker'));
});
