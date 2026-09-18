#!/usr/bin/env node
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {readEnvelope,promptFor,run,parseMaybeJSON,emit} from './common.mjs';
const req = await readEnvelope(), bin = process.env.VERACITY_CODEX_BIN || 'codex', dir = await mkdtemp(join(tmpdir(),'veracity-codex-'));
try {
  const schema = join(dir,'schema.json'), outputFile = join(dir,'output.json');
  await writeFile(schema,JSON.stringify(req.schema));
  const args = ['exec','--ephemeral','--sandbox','read-only','--skip-git-repo-check','--model',req.model,'--output-schema',schema,'--output-last-message',outputFile];
  if (req.task === 'search') args.push('--config','web_search="live"');
  args.push(promptFor(req));
  await run(bin,args,{timeoutMs:Number(process.env.VERACITY_HARNESS_TIMEOUT_MS||180000)});
  const output = parseMaybeJSON(await readFile(outputFile,'utf8'));
  emit(req,req.model,output,null);
} finally { await rm(dir,{recursive:true,force:true}); }
