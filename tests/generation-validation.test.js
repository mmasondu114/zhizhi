import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseGeneration,outputSchema,hierarchySchema} from '../shared/protocol.js';
import {retryInvalidGeneration} from '../server/generation-retry.js';
import {callProvider} from '../server/providers.js';
const note={title:'抽样分布',summary:'重复抽样得到的统计量分布',detail:'比较每次同样大小的样本所得的统计量。',type:'knowledge',relation:'组成',formula:'',example:'',sources:[],webSources:[],lessonOverview:'学习抽样变异及其分布。',terms:[{name:'抽样分布',english:'Sampling distribution',definition:'重复抽样得到的统计量的分布。'}]};

test('model contract constrains bilingual titles, summaries and glossary entries before local validation',()=>{
 const p=outputSchema.properties.nodes.items.properties;
 assert.equal(p.title.maxLength,100);assert.equal(p.summary.maxLength,320);
 assert.equal(p.terms.items.properties.definition.maxLength,1600);
 assert.equal(hierarchySchema.properties.nodes.items.properties.outline.items.properties.title.maxLength,100);
 assert.equal(parseGeneration(JSON.stringify({nodes:[{...note,title:'a'.repeat(100)}]}))[0].title.length,100);
});

test('validation errors identify nested fields and limits without echoing private model content',()=>{
 let failure;try{parseGeneration(JSON.stringify({nodes:[{...note,title:'PRIVATE'.repeat(20),terms:[{name:'术语',english:'Term',definition:''}]}]}));}catch(error){failure=error;}
 assert.equal(failure.code,'GENERATION_FORMAT');assert.match(failure.message,/nodes\[0\]\.title.*100/);
 assert.match(failure.message,/nodes\[0\]\.terms\[0\]\.definition/);assert.ok(!failure.message.includes('PRIVATE'));
});

test('format repair is bounded, reports progress, and never retries cancellation or unrelated failures',async()=>{
 const events=[];let calls=0;
 const invalid=()=>parseGeneration(JSON.stringify({nodes:[{...note,summary:'x'.repeat(321)}]}));
 await assert.rejects(retryInvalidGeneration(async correction=>{if(calls++)assert.match(correction,/summary.*320/);return invalid();},{onRepair:e=>events.push(e)}),/summary/);
 assert.equal(calls,3);assert.deepEqual(events.map(e=>e.retry),[1,2]);
 calls=0;await assert.rejects(retryInvalidGeneration(async()=>{calls++;throw Error('network');}),/network/);assert.equal(calls,1);
 const ctrl=new AbortController();calls=0;await assert.rejects(retryInvalidGeneration(async()=>{calls++;ctrl.abort();return invalid();},{signal:ctrl.signal}));assert.equal(calls,1);
});

test('real CLI response decoding repairs only the invalid attempt and keeps Astra High and textbook context',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'zhizhi-format-'));
 try{
  const script=path.join(directory,'client.mjs'),record=path.join(directory,'calls.json');
  await fs.writeFile(script,`import fs from 'node:fs/promises';
const args=process.argv.slice(2);if(args.includes('--version')){console.log('codex-cli test');process.exit(0);}if(args.includes('--help')){console.log('--output-schema --sandbox --ignore-user-config');process.exit(0);}
let input='';for await(const chunk of process.stdin)input+=chunk;
const file=${JSON.stringify(record)};let calls=[];try{calls=JSON.parse(await fs.readFile(file,'utf8'));}catch{}calls.push({args,input});await fs.writeFile(file,JSON.stringify(calls));
const node=${JSON.stringify(note)};if(calls.length===1)node.title='x'.repeat(101);console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({nodes:[node]})}}));`);
  const result=await callProvider({kind:'codex',clientPath:script,model:'gpt-6-astra',reasoningEffort:'high',webSearch:false},{generationTask:'inventory',document:'3A.pdf',materials:[{id:'a',text:'Textbook marker'}]});
  assert.equal(result[0].title,note.title);
  const calls=JSON.parse(await fs.readFile(record,'utf8'));assert.equal(calls.length,2);
  for(const c of calls){assert.equal(c.args[c.args.indexOf('--model')+1],'gpt-6-astra');assert.ok(c.args.includes('model_reasoning_effort="high"'));assert.ok(c.input.includes('Textbook marker'));}
  assert.match(calls[1].input,/nodes\[0\]\.title.*100/);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
