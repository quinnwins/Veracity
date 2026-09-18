import test from "node:test";import assert from "node:assert/strict";import {validateDecomposition} from "./decomposition.mjs";
const good={contract:{wording:"A causes B",falsifier:"observe A without B under scope"},rootId:"C0",nodes:{C0:{type:"claim",text:"A causes B",falsifier:"x",children:["A1","A2"],relation:{kind:"and",dependence:"bounded"}},A1:{type:"atomic",text:"A occurs",falsifier:"not A",children:[]},A2:{type:"atomic",text:"B follows",falsifier:"B does not follow",children:[]}}};
test("valid decomposition passes",()=>assert.equal(validateDecomposition(good).ok,true));
test("atomic nodes cannot hide children",()=>{const x=structuredClone(good);x.nodes.A1.children=["A2"];assert.match(validateDecomposition(x).errors.join(" "),/atomic node has children/)});
test("children require semantics",()=>{const x=structuredClone(good);delete x.nodes.C0.relation;assert.match(validateDecomposition(x).errors.join(" "),/explicit relation/)});
test("cycles are rejected",()=>{const x=structuredClone(good);x.nodes.A2.type="premise";x.nodes.A2.children=["C0"];x.nodes.A2.relation={kind:"and",dependence:"bounded"};assert.match(validateDecomposition(x).errors.join(" "),/cycle/)});
