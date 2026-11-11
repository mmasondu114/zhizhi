import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {makeGraph} from '../src/demo.js';
import {generateComplete} from '../server/complete-generation.js';
import {lessonContext} from '../server/lessons.js';
import {installExercises} from '../server/exercises.js';
import {callProvider,TERMINOLOGY_RULE} from '../server/providers.js';
import {introduction} from './lesson-fixture.js';

function fixture(){
 const graph=makeGraph('统计学','live');
 graph.materials=[{id:'en',name:'中文文件名.pdf',chunks:[{id:'en-1',text:'Sampling distributions describe the variation of a statistic across repeated samples.',page:1,paragraph:1}]},{id:'zh',name:'English filename.pdf',chunks:[{id:'zh-1',text:'抽样分布描述重复抽样时统计量的变化。',page:1,paragraph:1}]}];
 return graph;
}
const note=id=>({title:'Sampling distribution（抽样分布）',summary:'Variation across samples.\n样本间的变化。',detail:'Repeat the sampling process.\n重复抽样过程。',type:'knowledge',relation:'组成',sources:[id],formula:'',example:''});

test('each PDF keeps its own original language evidence through direct lessons and review',async()=>{
 const graph=fixture(),seen=[];
 await generateComplete({},graph,graph.nodes[0],{provider:async(_,context)=>{
  seen.push(context);
  const material=graph.materials.find(m=>m.name===context.document);
  assert.deepEqual(context.sourceLanguageContext,[{file:material.name,samples:[material.chunks[0].text]}]);
  if(context.generationTask==='lesson-review')return [];
  if(context.generationTask==='chapter-introduction')return [introduction(context)];
  return [note(material.chunks[0].id)];
 }});
 for(const task of ['hierarchy-synthesis','lesson-review'])assert.equal(seen.filter(c=>c.generationTask===task).length,2);
});

test('concept lessons and follow-up questions inherit the source PDF despite old Chinese content',async()=>{
 const graph=fixture();
 const chapter={...note('en-1'),id:'chapter',parent:graph.root,materialIds:['en'],title:'旧中文章节'};
 const question={...note('en-1'),id:'question',parent:'chapter',type:'question',title:'为什么？',sources:[]};
 graph.nodes.push(chapter,question);
 assert.equal(lessonContext(graph,question).sourceLanguageContext[0].samples[0],graph.materials[0].chunks[0].text);
 await generateComplete({},graph,question,{provider:async(_,context)=>{
  assert.equal(context.sourceLanguageContext.length,1);
  assert.equal(context.sourceLanguageContext[0].file,graph.materials[0].name);
  return [note('en-1')];
 }});
});

test('exercise grading retains original PDF evidence when the student answers in Chinese',async()=>{
 const app=express();app.use(express.json());const graph=fixture();graph.nodes[0].materialIds=['en'];
 const calls=[];
 installExercises(app,{getSettings:()=>({selected:'openai'}),configFor:async()=>({kind:'openai'}),requests:new Map(),provider:async(_,context,options)=>{
  calls.push({context,options});
  return options.parse(JSON.stringify(context.generationTask==='exercise-grade'?{correct:true,feedback:'Correct.\n正确。'}:{prompt:'What varies?\n什么在变化？',mode:'text',options:[],correctOption:-1,answer:'The statistic.\n统计量。',explanation:'Samples differ.\n样本不同。',steps:['Compare samples.\n比较样本。']}));
 }});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const post=async(url,body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);return response.json();};
 try{
  const created=await post('/api/exercise',{graph,nodeId:graph.root});
  const graded=await post('/api/exercise/'+created.id+'/answer',{answer:'统计量'});
  assert.equal(graded.correct,true);assert.equal(graded.feedback,'Correct.\n正确。');
  assert.deepEqual(calls[1].context.sourceLanguageContext,calls[0].context.sourceLanguageContext);
  assert.equal(calls[1].context.sourceLanguageContext.length,1);
  for(const call of calls)assert.ok(call.options.systemPrompt.includes(TERMINOLOGY_RULE));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('all generation stages send the source-first translation policy without Chinese-only instructions',async()=>{
 const app=express();app.use(express.json());const prompts=[];
 app.post('/chat/completions',(req,res)=>{prompts.push(req.body.messages[0].content);res.json({choices:[{message:{content:JSON.stringify({nodes:[note('en-1')]})}}]});});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  for(const generationTask of ['hierarchy-synthesis','lesson-review','chapter-introduction','concept-lesson','focused-layer']){
   await callProvider({kind:'openai',baseUrl:'http://127.0.0.1:'+server.address().port,model:'test'},{generationTask,materials:[{id:'en-1',text:'Sampling distributions'}]});
  }
  for(const prompt of prompts){
   assert.ok(prompt.includes(TERMINOLOGY_RULE));
   assert.match(prompt,/中文教材只用中文，不重复翻译/);
   assert.doesNotMatch(prompt,/正文仍用中文|definition 为中文含义|name 为中文名称|你是中文学习导师/);
  }
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
