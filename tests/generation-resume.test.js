import {introduction} from './lesson-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generationCache} from '../server/generation-cache.js';
import {retryRateLimited} from '../server/generation-retry.js';
import {generateComplete} from '../server/complete-generation.js';
import {makeGraph} from '../src/demo.js';
const note=id=>({title:'知识点 '+id,summary:'完整解释',detail:'具体内容',type:'knowledge',relation:'组成',sources:[id],formula:'',example:''});
function fixture(count=3){const g=makeGraph('完整教材','live');g.materials=Array.from({length:count},(_,i)=>String.fromCharCode(97+i)).map(id=>({id,name:id+'.pdf',chunks:[{id,text:'教材正文 '+id,page:1,paragraph:1}]}));return g;}
test('each PDF has its own lane, retains deterministic order and bounded workers',async()=>{
 const g=fixture(9);g.materials.forEach(m=>m.chunks=[0,1].map(i=>({id:m.id+'-'+i,text:'正文'.repeat(17500),page:i+1,paragraph:1})));let active=0,peak=0;const seen=[],files=new Set();
 const result=await generateComplete({},g,g.nodes[0],{provider:async(_,c)=>{assert.equal(files.has(c.document),false);files.add(c.document);active++;peak=Math.max(peak,active);seen.push(c.materials[0].id);await new Promise(r=>setTimeout(r,15));active--;files.delete(c.document);return c.generationTask==='lesson-review'?[]:c.candidates.length?c.candidates:[note(c.materials[0].id)];}});
 assert.equal(peak,9);assert.equal(active,0);assert.deepEqual(result.nodes.flatMap(n=>n.outline.map(c=>c.title)),g.materials.flatMap(m=>m.chunks.map(c=>'知识点 '+c.id)));assert.equal(seen.length,54);assert.equal(result.coverage.reviewedBatches,18);
});
test('interrupted audit resumes from durable validated responses; changes invalidate cache',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zhizhi-resume-'));try{
  const g=fixture();let fail=true,calls=[];const provider=async(_,c)=>{calls.push(c.document+':'+c.generationTask);if(fail&&c.document==='b.pdf'&&c.generationTask==='lesson-review')throw Error('网络中断');return c.generationTask==='hierarchy-synthesis'?[note(c.materials[0].id)]:[];};
  await assert.rejects(generateComplete({kind:'codex'},g,g.nodes[0],{provider,cache:generationCache(dir),concurrency:1}),/网络中断/);
  assert.equal(calls.length,4);calls=[];fail=false;const events=[];
  const result=await generateComplete({kind:'codex'},g,g.nodes[0],{provider,cache:generationCache(dir),concurrency:1,onProgress:p=>events.push(p)});
  assert.deepEqual(calls,['b.pdf:lesson-review','c.pdf:hierarchy-synthesis','c.pdf:lesson-review']);assert.equal(result.coverage.files,3);assert.equal(events.at(-1).reused,3);
  calls=[];await generateComplete({kind:'codex'},g,g.nodes[0],{provider,cache:generationCache(dir)});assert.equal(calls.length,0);
  g.instructions='更详细';await generateComplete({kind:'codex'},g,g.nodes[0],{provider,cache:generationCache(dir)});assert.equal(calls.length,6);
  const files=await fs.readdir(dir);assert.ok(files.every(f=>/^[a-f0-9]{64}\.json$/.test(f)));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('failure aborts sibling request, waits for cleanup and never signals completion',async()=>{
 const g=fixture(),events=[];let siblingEnded=false;
 await assert.rejects(generateComplete({},g,g.nodes[0],{onProgress:p=>events.push(p),provider:async(_,c,{signal})=>{
  if(c.document==='a.pdf'){await new Promise(r=>setTimeout(r,15));throw Error('上游失败');}
  await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{siblingEnded=true;reject(Error('取消'));},{once:true}));
 }}),/上游失败/);assert.equal(siblingEnded,true);assert.ok(events.every(p=>p.percent<100));
});

test('rate limits retry boundedly; cancellation interrupts backoff immediately',async()=>{
 let calls=0;assert.equal(await retryRateLimited(async()=>{if(++calls<3)throw Error('429');return 'done';},{delayMs:1}),'done');assert.equal(calls,3);
 calls=0;await assert.rejects(retryRateLimited(async()=>{calls++;throw Error('429');},{delayMs:1}),/429/);assert.equal(calls,4);
 const ctrl=new AbortController();const pending=retryRateLimited(async()=>{throw Error('429');},{signal:ctrl.signal,onWait:()=>ctrl.abort()});await assert.rejects(pending); 
});
