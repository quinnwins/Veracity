import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, chmod, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {AgentRegistry, CommandAgentProvider, HttpAgentProvider, assertSchema} from '../agents.mjs';
import {RunBudget} from '../providers.mjs';

const simpleSchema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};

async function temp(t) {
  const dir=await mkdtemp(join(tmpdir(),'veracity-agents-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  return dir;
}
async function bridgeScript(t, body) {
  const dir=await temp(t), file=join(dir,'bridge.mjs');
  await writeFile(file, body); await chmod(file,0o755); return file;
}
function runBridge(file, request, env={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[file],{stdio:['pipe','pipe','pipe'],env:{...process.env,...env}});
    let out='',err='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
    child.once('error',reject);child.once('close',code=>code===0?resolve(JSON.parse(out)):reject(new Error(err||String(code))));
    child.stdin.end(JSON.stringify(request));
  });
}

test('schema validator rejects extra and wrong-typed harness output',()=>{
  assert.throws(()=>assertSchema({ok:true,extra:1},simpleSchema),/unexpected field/);
  assert.throws(()=>assertSchema({ok:'yes'},simpleSchema),/expected boolean/);
  assert.deepEqual(assertSchema({ok:true},simpleSchema),{ok:true});
});

test('generic command agent validates protocol, schema and records harness identity',async t=>{
  const bridge=await bridgeScript(t,`let x='';for await(const c of process.stdin)x+=c;const r=JSON.parse(x);process.stdout.write(JSON.stringify({protocol:r.protocol,requestId:r.requestId,model:'fixture-harness-v2',output:{findings:[],contrarySearches:[]},usage:{input_tokens:3,output_tokens:2}}));`);
  const budget=new RunBudget(), p=new CommandAgentProvider({name:'fixture',role:'orchestrator',command:[process.execPath,bridge],model:'requested',budget});
  const out=await p.json('audit','audit it',{x:1});
  assert.deepEqual(out,{findings:[],contrarySearches:[]});
  assert.equal(budget.events[0].provider,'harness:fixture');
  assert.equal(budget.events[0].model,'fixture-harness-v2');
});

test('generic command agent rejects response-id mismatch',async t=>{
  const bridge=await bridgeScript(t,`let x='';for await(const c of process.stdin)x+=c;const r=JSON.parse(x);process.stdout.write(JSON.stringify({protocol:r.protocol,requestId:'wrong',model:'fixture',output:{findings:[],contrarySearches:[]}}));`);
  const p=new CommandAgentProvider({name:'fixture',role:'orchestrator',command:[process.execPath,bridge],model:'requested'});
  await assert.rejects(()=>p.json('audit','audit it',{}),/response ID mismatch/);
});

test('agent registry selects named command agents per role and public config omits commands',async t=>{
  const bridge=await bridgeScript(t,`let x='';for await(const c of process.stdin)x+=c;const r=JSON.parse(x);process.stdout.write(JSON.stringify({protocol:r.protocol,requestId:r.requestId,model:r.model,output:{findings:[],contrarySearches:[]}}));`);
  const config={roles:{orchestrator:'strong',worker:'grunt'},agents:{
    strong:{driver:'command',command:[process.execPath,bridge],model:'strong-model',capabilities:{search:false}},
    grunt:{driver:'command',command:[process.execPath,bridge],model:'cheap-model',capabilities:{search:true}}
  }};
  const registry=new AgentRegistry({config}), roles=registry.roles();
  assert.equal(roles.orchestratorName,'strong');assert.equal(roles.workerName,'grunt');
  assert.equal(roles.orchestrator.model,'strong-model');assert.equal(roles.worker.model,'cheap-model');
  const pub=registry.publicConfig(); assert.equal(pub.defaults.worker,'grunt');
  assert.equal(JSON.stringify(pub).includes(bridge),false);
  const swapped=registry.roles({orchestrator:'grunt',worker:'strong'});
  assert.equal(swapped.orchestratorName,'grunt');assert.equal(swapped.workerName,'strong');
});

test('HTTP bridge requires HTTPS unless it is loopback',()=>{
  assert.throws(()=>new HttpAgentProvider({name:'bad',endpoint:'http://example.com/agent',model:'x'}),/HTTPS or loopback/);
  assert.doesNotThrow(()=>new HttpAgentProvider({name:'local',endpoint:'http://127.0.0.1:9911/agent',model:'x'}));
});

for (const [name,envName,fakeBody] of [
  ['claude-code','VERACITY_CLAUDE_BIN',`#!/usr/bin/env node
process.stdout.write(JSON.stringify({model:'claude-fixture',structured_output:{ok:true}}));`],
  ['gemini-cli','VERACITY_GEMINI_BIN',`#!/usr/bin/env node
process.stdout.write(JSON.stringify({model:'gemini-fixture',response:JSON.stringify({ok:true})}));`],
  ['codex-cli','VERACITY_CODEX_BIN',`#!/usr/bin/env node
import fs from 'node:fs';const args=process.argv.slice(2);const i=args.indexOf('--output-last-message');fs.writeFileSync(args[i+1],JSON.stringify({ok:true}));`]
]) test(name+' wrapper converts vendor CLI output to Veracity bridge protocol',async t=>{
  const fake=await bridgeScript(t,fakeBody);
  const req={protocol:'veracity-agent/v1',requestId:'req-1',role:'worker',task:'fixture',model:'fixture-model',instructions:'Return the fixture.',input:{},schema:simpleSchema};
  const response=await runBridge(join(process.cwd(),'scripts','harness',name+'.mjs'),req,{[envName]:fake});
  assert.equal(response.protocol,'veracity-agent/v1');assert.equal(response.requestId,'req-1');assert.deepEqual(response.output,{ok:true});
});
