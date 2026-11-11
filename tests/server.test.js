import {introduction} from './lesson-fixture.js';
import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {createApp} from '../server/index.js';
import {makeGraph} from '../src/demo.js';
import {parseMaterial,chunkText} from '../server/materials.js';
import {protect,unprotect} from '../server/storage.js';

test('materials TXT/MD preserve paragraphs; long docs chunk with overlap',async()=>{for(const ext of ['txt','md']){const m=await parseMaterial('教材.'+ext,Buffer.from('第一段 标准差描述离散程度。\n\n第二段 z score 无需正态。'));assert.equal(m.chunks.length,2);assert.equal(m.chunks[1].paragraph,2);}const chunks=chunkText('数'.repeat(5000),'m');assert.ok(chunks.length>=4);assert.ok(chunks.every(c=>c.text.length<=1600));});
test('text PDF extracts page source; empty scanned-like PDF requests OCR',async()=>{const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage().drawText('Chapter 3 - Sampling distributions. Standard error = sigma / sqrt(n).',{x:40,y:700,font,size:14});pdf.addPage().drawText('Page two: z-score does not require a normal distribution.',{x:40,y:700,font,size:14});const result=await parseMaterial('book.pdf',Buffer.from(await pdf.save()));assert.equal(result.chunks[0].page,1);assert.equal(result.chunks[1].page,2);const scanned=await PDFDocument.create();scanned.addPage();await assert.rejects(parseMaterial('scan.pdf',Buffer.from(await scanned.save())),/OCR/);});
test('DOCX text extraction preserves paragraph references',async()=>{const data=await fs.readFile(new URL('./fixtures/source.docx',import.meta.url));const m=await parseMaterial('source.docx',data);assert.ok(m.chunks.some(c=>c.text.includes('Standard deviation')));assert.ok(m.chunks.every(c=>c.paragraph&&!c.page));});
test('Windows DPAPI protects secret and roundtrips without plaintext',async()=>{if(process.platform!=='win32')return;const encrypted=await protect('test-only-key-123');assert.ok(!encrypted.includes('test-only-key-123'));assert.equal(await unprotect(encrypted),'test-only-key-123');});
test('backend loopback origin/token, persistence, upload, optional scope, redaction, trash',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'tree-test-'));const port=14317;const app=await createApp({dataDir:dir,port});const server=app.listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${port}`;
 const contexts=[];const model=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);const ctx=JSON.parse(body.messages[1].content);contexts.push(ctx);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({nodes:ctx.generationTask==='chapter-introduction'?[introduction(ctx)]:ctx.generationTask==='lesson-review'?[]:[{title:'统计中的样本',summary:'从总体抽取的一部分观测',detail:'模型协议测试返回的知识节点。',type:'knowledge',relation:'解释',formula:'',example:'',sources:ctx.materials.length?[ctx.materials[0].id]:(ctx.allowedSourceIds?.slice(0,1)||[])}]})}}]}));});await new Promise(r=>model.listen(0,'127.0.0.1',r));
 try{const boot=await fetch(base+'/api/bootstrap').then(r=>r.json()),headers={'Content-Type':'application/json','x-tree-token':boot.token};
 assert.equal((await fetch(base+'/api/graphs')).status,403);
 assert.equal((await fetch(base+'/api/bootstrap',{headers:{Origin:'https://evil.example'}})).status,403);
 let g=makeGraph();assert.equal((await fetch(base+'/api/graphs/'+g.id,{method:'PUT',headers,body:JSON.stringify(g)})).status,200);
 const restored=await fetch(base+'/api/graphs/'+g.id,{headers}).then(r=>r.json());assert.equal(restored.nodes[0].title,g.nodes[0].title);
 const bad={...g,nodes:[]};assert.equal((await fetch(base+'/api/graphs/'+g.id,{method:'PUT',headers,body:JSON.stringify(bad)})).status,400);assert.equal((await fetch(base+'/api/graphs/'+g.id,{headers}).then(r=>r.json())).nodes.length,1);
 const form=new FormData();form.append('file',new Blob(['Standard deviation is positive.']), 'sample.txt');const m=await fetch(base+'/api/material',{method:'POST',headers:{'x-tree-token':boot.token},body:form}).then(r=>r.json());assert.match(m.chunks[0].text,/Standard/);
 await fetch(base+'/api/settings',{method:'PUT',headers,body:JSON.stringify({selected:'openai',provider:{kind:'openai',baseUrl:`http://127.0.0.1:${model.address().port}/v1`,model:'scope-test'}})});
 g.goal='AP Statistics Chapter 3';g.scope='';
 for(const materialList of [[],[m]]){g.materials=materialList;const response=await fetch(base+'/api/generate',{method:'POST',headers,body:JSON.stringify({graph:g,nodeId:g.root,requestId:crypto.randomUUID(),provider:'openai'})});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.nodes.length,1);assert.equal(result.nodes[0].sources.length,materialList.length?1:0);if(materialList.length){assert.equal(result.nodes[0].outline.length,1);assert.equal(result.nodes[0].outline[0].sources.length,1);assert.equal(result.coverage.coreConcepts,true);assert.equal(result.coverage.files,1);}assert.equal(contexts.at(-1).scope,'');assert.equal(contexts.at(-1).goal,g.goal);}
 g.scope='抽样分布';g.materials=[];const noMaterials=await fetch(base+'/api/generate',{method:'POST',headers,body:JSON.stringify({graph:g,nodeId:g.root,requestId:crypto.randomUUID(),provider:'openai'})});assert.equal(noMaterials.status,200);assert.equal(contexts.at(-1).scope,'抽样分布');
 if(process.platform==='win32'){await fetch(base+'/api/settings',{method:'PUT',headers,body:JSON.stringify({selected:'openai',provider:{kind:'openai',key:'test-secret'}})});const publicSettings=await fetch(base+'/api/bootstrap').then(r=>r.json());assert.ok(!JSON.stringify(publicSettings).includes('test-secret'));assert.equal(publicSettings.settings.providers.openai.hasKey,true);assert.ok(!(await fs.readFile(path.join(dir,'settings.json'),'utf8')).includes('test-secret'));}
 assert.equal((await fetch(base+'/api/graphs/'+g.id,{method:'DELETE',headers})).status,200);assert.equal((await fs.readdir(path.join(dir,'trash'))).length,1);
 }finally{model.closeAllConnections();await new Promise(r=>model.close(r));server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});

