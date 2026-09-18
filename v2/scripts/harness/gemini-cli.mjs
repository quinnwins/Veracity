#!/usr/bin/env node
import {readEnvelope,promptFor,run,parseMaybeJSON,emit} from './common.mjs';
const req = await readEnvelope(), bin = process.env.VERACITY_GEMINI_BIN || 'gemini';
const prompt = promptFor(req);
const args = ['--model',req.model,'--prompt',prompt,'--output-format','json','--approval-mode','plan'];
const raw = await run(bin,args,{timeoutMs:Number(process.env.VERACITY_HARNESS_TIMEOUT_MS||180000)});
const envelope = JSON.parse(raw), output = parseMaybeJSON(envelope.response ?? envelope.result ?? envelope.output ?? envelope.text ?? envelope);
emit(req,envelope.model || req.model,output,envelope.usage || envelope.stats || null);
