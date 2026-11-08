import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {installExercises} from '../server/exercises.js';
import {makeGraph} from '../src/demo.js';
import {clientArgs} from '../server/providers.js';
import {parseGeneration} from '../shared/protocol.js';
test('Codex live search is explicitly enabled and can be disabled',()=>{
 assert.ok(clientArgs('codex','schema.json','',undefined,{webSearch:true}).includes('--search'));
 assert.ok(clientArgs('codex','schema.json').includes('web_search="disabled"'));
 assert.ok(clientArgs('codex','schema.json','',undefined,{webSearch:true}).includes('features.shell_tool=false'));
});
test('unsafe citation URLs are rejected',()=>{
 const n={title:'核心概念',summary:'总结',detail:'解释',webSources:[{title:'bad',url:'javascript:alert(1)'}]};assert.throws(()=>parseGeneration(JSON.stringify({nodes:[n]})));
});
test('exercise answers are withheld until submit; text grading and provider changes are handled',async()=>{
 const app=express();app.use(express.json());let kind='openai',mode='choice';const requests=new Map(),graph=makeGraph('标准化','live');
 const question={prompt:'均值70，标准差10，观测值85，求z-score。',mode:'choice',options:['0.5','1.5'],correctOption:1,answer:'1.5',explanation:'高出均值1.5个标准差。',steps:['85-70=15','15/10=1.5']};
 installExercises(app,{getSettings:()=>({selected:kind}),configFor:async()=>({kind}),requests,provider:async(_,c,o)=>o.parse(JSON.stringify(c.generationTask==='exercise-grade'?{correct:c.studentAnswer==='1.5',feedback:'按公式代入即可。'}:{...question,mode,options:mode==='choice'?question.options:[],correctOption:mode==='choice'?1:-1}))});
 app.use((e,req,res,next)=>res.status(400).json({error:e.message}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const post=async(url,body)=>{const r=await fetch(base+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 try{
  const created=(await post('/api/exercise',{graph,nodeId:graph.root})).data;assert.equal(created.answer,undefined);assert.equal(created.correctOption,undefined);assert.equal(created.explanation,undefined);
  const wrong=(await post('/api/exercise/'+created.id+'/answer',{answer:'0'})).data;assert.equal(wrong.correct,false);assert.equal(wrong.answer,'1.5');assert.equal(wrong.steps.length,2);
  const right=(await post('/api/exercise/'+created.id+'/answer',{answer:'1'})).data;assert.equal(right.correct,true);
  mode='text';const text=(await post('/api/exercise',{graph,nodeId:graph.root})).data;assert.equal((await post('/api/exercise/'+text.id+'/answer',{answer:'1.5'})).data.correct,true);
  kind='claude';assert.equal((await post('/api/exercise/'+text.id+'/answer',{answer:'1.5'})).status,400);
  assert.equal(graph.nodes.length,1);assert.equal(requests.size,0);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
