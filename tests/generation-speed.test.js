import test from 'node:test';
import assert from 'node:assert/strict';
import {generateComplete} from '../server/complete-generation.js';
import {parseGeneration,hierarchySchema} from '../shared/protocol.js';
import {makeGraph} from '../src/demo.js';
import {introduction} from './lesson-fixture.js';
import {compactChapterContext} from '../server/providers.js';

test('overview requests retain reasoning and worked examples alongside topics and terminology',()=>{
 const term={name:'标准误',english:'Standard error',definition:'统计量抽样分布的标准差'};
 const node={title:'主题',summary:'关键含义',detail:'长篇重复讲解'.repeat(1000),formula:'SE',example:'计算过程与结论',sources:['a'],terms:[term]};
 const context={generationTask:'chapter-introduction',candidates:[{...node,outline:[{...node,title:'子概念'}]}]};
 const before=JSON.stringify(context),compact=compactChapterContext(context);
 assert.equal(JSON.stringify(context),before);assert.equal(compact.candidates[0].outline[0].title,'子概念');
 assert.equal(compact.candidates[0].formula,'SE');assert.deepEqual(compact.terminology,[term]);
 assert.equal(compact.candidates[0].detail,node.detail);assert.equal(compact.candidates[0].example,node.example);assert.equal(compact.candidates[0].outline[0].detail,node.detail);
 const inventory={...context,generationTask:'inventory'};assert.equal(compactChapterContext(inventory),inventory);
});

test('nine fully audited textbooks need 27 calls with combined overviews instead of 36',async()=>{
 const graph=makeGraph('Unit 3','live');
 graph.materials=Array.from({length:9},(_,i)=>({id:'m'+i,name:'Chapter '+i+'.pdf',chunks:[{id:'s'+i,text:'Core textbook concepts',paragraph:1}]}));
 const calls=[],events=[];
 const result=await generateComplete({model:'gpt-6-astra',reasoningEffort:'high'},graph,graph.nodes[0],{onProgress:p=>events.push(p),provider:async(config,c)=>{
  assert.equal(config.model,'gpt-6-astra');assert.equal(config.reasoningEffort,'high');calls.push(c.generationTask);
  if(c.generationTask==='inventory')return [introduction({...c,candidates:[],allowedSourceIds:c.materials.map(x=>x.id)})];
  if(c.generationTask==='coverage-audit')return [];
  assert.equal(c.generationTask,'hierarchy-synthesis','a valid combined response must skip the separate intro request');
  const intro=introduction(c);return [{...c.candidates[0],outline:c.candidates,chapterIntroduction:intro}];
 }});
 assert.equal(calls.length,27);assert.equal(calls.filter(t=>t==='coverage-audit').length,9);
 assert.equal(result.nodes.length,9);assert.equal(result.coverage.reviewedBatches,9);
 for(const n of result.nodes){assert.ok(n.lessonOverview);assert.ok(n.terms.length);assert.ok(n.outline[0].outline.length);assert.equal('chapterIntroduction' in n.outline[0],false);}
 assert.equal(events.at(-1).percent,100);assert.ok(events.every((e,i)=>!i||e.percent>=events[i-1].percent));
});

test('combined introduction is source checked; missing valid sources falls back to the existing intro stage',async()=>{
 const graph=makeGraph('3A','live');graph.materials=[{id:'m',name:'3A.pdf',chunks:[{id:'a',text:'Sampling',paragraph:1}]}];
 const intro=introduction({document:'3A.pdf',allowedSourceIds:['a'],candidates:[]});let fallback=0;
 const parsed=parseGeneration(JSON.stringify({nodes:[{...intro,chapterIntroduction:{...intro,sources:['invented']}}]}),['a']);
 assert.deepEqual(parsed[0].chapterIntroduction.sources,[]);
 assert.ok(hierarchySchema.properties.nodes.items.required.includes('chapterIntroduction'));
 const result=await generateComplete({},graph,graph.nodes[0],{provider:async(_,c)=>{
  if(c.generationTask==='inventory')return [intro];if(c.generationTask==='coverage-audit')return [];
  if(c.generationTask==='hierarchy-synthesis')return parsed;
  fallback++;return [intro];
 }});
 assert.equal(fallback,1);assert.deepEqual(result.nodes[0].sources,['a']);
});
