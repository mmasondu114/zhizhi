import {introduction} from './lesson-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateComplete} from '../server/complete-generation.js';
import {makeGraph} from '../src/demo.js';
import {reconcileFlowNodes} from '../src/flow-nodes.js';
import {GenerationQueue,requestGeneration} from '../src/generation-client.js';
const node=title=>({title,summary:'核心概念',detail:'定义和条件',type:'knowledge',relation:'组成',sources:['s'],formula:'',example:''});
function fixture(){const graph=makeGraph('统计','live');graph.materials=[{id:'m',name:'统计.pdf',chunks:[{id:'s',paragraph:1,text:'正文'}]}];return graph;}

test('a checked PDF is readable while another PDF is still generating; drafts are not published',async()=>{
 const graph=fixture();graph.materials.push({id:'slow',name:'slow.pdf',chunks:[{id:'slow-source',paragraph:1,text:'slow'}]});
 const previews=[];let releaseReview,reviewStarted,finished=false;
 const waiting=new Promise(r=>reviewStarted=r),gate=new Promise(r=>releaseReview=r);
 const result=generateComplete({},graph,graph.nodes[0],{onPreview:p=>previews.push(p),provider:async(_,context)=>{
  if(context.generationTask==='hierarchy-synthesis')return [{...node(context.document),sources:context.allowedSourceIds}];
  if(context.document==='slow.pdf'){reviewStarted();await gate;}
  return [];
 }}).then(r=>{finished=true;return r;});
 await waiting;await new Promise(r=>setImmediate(r));
 assert.equal(finished,false);assert.equal(previews.length,1);assert.equal(previews[0].document.id,'m');assert.equal(previews[0].document.complete,true);assert.equal(previews[0].document.reviewed,true);assert.equal(graph.nodes.length,1);
 releaseReview();const final=await result;assert.equal(previews.length,2);assert.equal(final.nodes.length,2);
});

test('failed review never publishes the unchecked document',async()=>{
 const graph=fixture(),previews=[];
 await assert.rejects(generateComplete({},graph,graph.nodes[0],{onPreview:p=>previews.push(p),provider:async(_,c)=>{if(c.generationTask==='hierarchy-synthesis')return [node('均值')];throw Error('offline');}}),/offline/);
 assert.equal(previews.length,0);assert.equal(graph.nodes.length,1);
});

test('progress updates keep all unaffected card objects stable',()=>{
 const cards=Array.from({length:200},(_,i)=>({id:String(i),position:{x:i*400,y:0},selected:false,data:{node:{title:'节点'+i},busy:false,progress:undefined}}));
 const next=cards.map(n=>({...n,position:{...n.position},data:{...n.data}}));next[0].data.progress={percent:40};
 const merged=reconcileFlowNodes(cards,next);assert.notEqual(merged[0],cards[0]);for(let i=1;i<cards.length;i++)assert.equal(merged[i],cards[i]);
 assert.equal(reconcileFlowNodes(merged,merged.map(n=>({...n,data:{...n.data}}))),merged);
});

test('preview stream validates graph identity and still requires a final result',async()=>{
 const graph=fixture();let shown=0;
 const fetcher=(wrong=false)=>async(_,options)=>{const request=JSON.parse(options.body),event={type:'preview',requestId:request.requestId,graphId:wrong?'another':graph.id,parentId:graph.root,document:{id:'m',nodes:[node('均值')]}};return new Response(JSON.stringify(event)+'\n',{headers:{'content-type':'application/x-ndjson'}});};
 await assert.rejects(requestGeneration(graph,graph.root,'codex',{fetcher:fetcher(),onPreview:()=>shown++}),/断开/);assert.equal(shown,1);
 await assert.rejects(requestGeneration(graph,graph.root,'codex',{fetcher:fetcher(true),onPreview:()=>shown++}),/不匹配/);assert.equal(shown,1);
});

test('cancelled or replaced jobs cannot publish stale previews',async()=>{
 const graph=fixture();let publish,finish,started;
 const ready=new Promise(r=>started=r),queue=new GenerationQueue((g,id,p,options)=>{publish=options.onPreview;started();return new Promise(r=>finish=r);});let shown=0;
 const result=queue.request(graph,graph.root,'codex',{onPreview:()=>shown++});await ready;queue.reset();publish({document:{id:'m',nodes:[node('均值')]}});finish({nodes:[]});await assert.rejects(result);assert.equal(shown,0);assert.equal(queue.cache.size,0);
});

test('one review replaces an incorrect lesson instead of appending conflicting explanations',async()=>{
 const graph=fixture(),calls=[],previews=[];
 const result=await generateComplete({},graph,graph.nodes[0],{onPreview:p=>previews.push(p),provider:async(_,context)=>{
  calls.push(context.generationTask);
  return [{...node('均值'),detail:context.generationTask==='lesson-review'?'正确的计算过程':'错误的计算过程'}];
 }});
 assert.deepEqual(calls,['hierarchy-synthesis','lesson-review']);
 assert.equal(result.nodes[0].outline[0].detail,'正确的计算过程');
 assert.equal(previews.length,1);assert.equal(previews[0].document.nodes[0].detail,'正确的计算过程');
});
