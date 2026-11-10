import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGeneration,validateGraph} from '../shared/protocol.js';
import {makeGraph} from '../src/demo.js';
import {lessonContext} from '../server/lessons.js';
import {generateComplete} from '../server/complete-generation.js';
import {introduction} from './lesson-fixture.js';

test('structured terminology survives nested outlines and graph save; legacy graphs still load',()=>{
 const graph=makeGraph('抽样分布','live');
 const lesson=introduction({document:'3A',candidates:[],allowedSourceIds:['a']});
 const nodes=parseGeneration(JSON.stringify({nodes:[{...lesson,outline:[lesson]}]}),['a']);
 graph.nodes[0]={...graph.nodes[0],...nodes[0]};
 const saved=validateGraph(JSON.parse(JSON.stringify(graph)));
 assert.equal(saved.nodes[0].outline[0].terms[0].english,'Sampling distribution');
 assert.equal(saved.nodes[0].lessonOverview,nodes[0].lessonOverview);
 assert.equal(validateGraph(makeGraph()).nodes.length,1);
 assert.throws(()=>parseGeneration(JSON.stringify({nodes:[{...lesson,terms:[{name:'词',english:'Term',definition:''}]}]}),['a']));
});

test('refresh lesson respects the selected chapter and does not mutate its graph',()=>{
 const graph=makeGraph('Unit 3','live');
 graph.materials=['3A','3B'].map(id=>({id,name:id+'.pdf',chunks:[{id,text:id+' sampling distribution',paragraph:1}]}));
 const chapter={...graph.nodes[0],id:'chapter',parent:graph.root,materialIds:['3A'],sources:['3A'],outline:[]};graph.nodes.push(chapter);
 const before=JSON.stringify(graph),context=lessonContext(graph,chapter);
 assert.equal(context.generationTask,'chapter-introduction');assert.equal(context.document,'3A.pdf');
 assert.deepEqual(context.allowedSourceIds,['3A']);assert.ok(context.materials.every(m=>m.file==='3A.pdf'));
 assert.equal(JSON.stringify(graph),before);
});

test('incomplete chapter introduction cannot become a completed knowledge tree',async()=>{
 const graph=makeGraph('3A','live');graph.materials=[{id:'a',name:'3A.pdf',chunks:[{id:'a',text:'Sampling distribution',paragraph:1}]}];
 const events=[],lesson=introduction({document:'3A',candidates:[],allowedSourceIds:['a']});
 await assert.rejects(generateComplete({},graph,graph.nodes[0],{onProgress:p=>events.push(p),provider:async(_,c)=>c.generationTask==='coverage-audit'?[]:c.generationTask==='chapter-introduction'?[{...lesson,terms:[]}]:[lesson]}),/专有名词不完整/);
 assert.ok(events.every(e=>e.percent<100));assert.equal(graph.nodes.length,1);
});
