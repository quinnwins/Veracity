#!/usr/bin/env node
import {readEnvelope,promptFor,run,parseMaybeJSON,emit} from './common.mjs';
const req = await readEnvelope(), bin = process.env.VERACITY_CLAUDE_BIN || 'claude';
const args = ['-p','--model',req.model,'--output-format','json','--json-schema',JSON.stringify(req.schema),'--system-prompt',req.instructions];
if (req.task === 'search') args.push('--tools','WebSearch','WebFetch'); else args.push('--tools','');
args.push(promptFor({...req,instructions:'Follow the system prompt and return the requested structured result.'}));
const raw = await run(bin,args,{timeoutMs:Number(process.env.VERACITY_HARNESS_TIMEOUT_MS||180000)});
const envelope = JSON.parse(raw), output = envelope.structured_output ?? parseMaybeJSON(envelope.result ?? envelope.response ?? envelope.output);
emit(req,envelope.model || req.model,output,envelope.usage || null);
