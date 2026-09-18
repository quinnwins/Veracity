import test from "node:test";import assert from "node:assert/strict";
import {bayesUpdate,complement,composeRelation,hypothesisPosterior,expectedInformationGain,validateAssessment} from "./engine.mjs";

test("Bayes update is deterministic",()=>{assert.deepEqual(bayesUpdate([.5,.5],[{id:"e",independenceCluster:"x",likelihood:{lr:[2,2]}}]),[2/3,2/3])});
test("duplicate evidence cannot be double counted",()=>{assert.throws(()=>bayesUpdate([.5,.5],[{id:"a",independenceCluster:"x",likelihood:{lr:[2,2]}},{id:"b",independenceCluster:"x",likelihood:{lr:[2,2]}}]),/duplicate/)});
test("complement is exact",()=>{assert.deepEqual(complement([.2,.4]),[.6,.8])});
test("unknown-dependence AND uses Frechet bounds",()=>{assert.deepEqual(composeRelation({kind:"and",dependence:"bounded"},[[.8,.8],[.8,.8]]),[.6000000000000001,.8])});
test("independent AND multiplies",()=>{assert.deepEqual(composeRelation({kind:"and",dependence:"independent"},[[.8,.8],[.8,.8]]),[.6400000000000001,.6400000000000001])});
test("missing relation refuses computation",()=>{assert.throws(()=>composeRelation(null,[[.5,.5]]),/missing/)});
test("overlapping hypothesis set refuses normalization",()=>{assert.throws(()=>hypothesisPosterior([{id:"a",exclusive:false,exhaustive:true}],[]),/exclusive/)});
test("EIG rewards informative observations",()=>{const x=expectedInformationGain([.5,.5],[{probability:.5,posterior:[.1,.1]},{probability:.5,posterior:[.9,.9]}]);assert.ok(x>.5)});
test("validation requires provenance",()=>{const r=validateAssessment({contract:{wording:"x",falsifier:"y"},rootId:"C0",nodes:{C0:{status:"scored",posterior:[.4,.6]}}});assert.equal(r.ok,false);assert.match(r.errors.join(" "),/provenance/)});
