import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.js';
import {makeGraph} from '../src/demo.js';
const root=path.resolve(import.meta.dirname,'..'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'zhizhi-preview-')),port=14339,base=`http://127.0.0.1:${port}`;
const app=await createApp({dataDir:dir,port}),server=app.listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));
let releaseAudit;const auditGate=new Promise(r=>releaseAudit=r);
const concept={title:'抽样分布（Sampling distribution）',summary:'统计量在重复抽样中的分布。',detail:'先区分样本数据的分布与统计量的抽样分布。',type:'knowledge',relation:'组成',sources:['s'],formula:'',example:'',webSources:[]};
const mock=http.createServer(async(req,res)=>{let raw='';for await(const b of req)raw+=b;const ctx=JSON.parse(JSON.parse(raw).messages.at(-1).content);if(ctx.generationTask==='coverage-audit')await auditGate;const nodes=ctx.generationTask==='coverage-audit'?[]:ctx.generationTask==='hierarchy-synthesis'?ctx.candidates:[concept];res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({nodes})}}]}));});await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const boot=await fetch(base+'/api/bootstrap').then(r=>r.json()),headers={'content-type':'application/json','x-tree-token':boot.token};
const graph=makeGraph('预览与交互测试','live');graph.materials=[{id:'m',name:'统计教材.pdf',chunks:[{id:'s',paragraph:1,text:'抽样分布的定义。'}]}];
await fetch(base+'/api/graphs/'+graph.id,{method:'PUT',headers,body:JSON.stringify(graph)});
await fetch(base+'/api/settings',{method:'PUT',headers,body:JSON.stringify({selected:'openai',provider:{kind:'openai',baseUrl:`http://127.0.0.1:${mock.address().port}/v1`,model:'mock'}})});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||chromium.executablePath(),headless:true}),page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
try{
 await page.goto(base);await page.getByRole('button',{name:'操作指引',exact:true}).click();await page.getByRole('dialog',{name:'操作指引'}).waitFor();assert.equal(await page.locator('.operation-guide dt').count(),6);await page.screenshot({path:path.join(root,'test-results/operation-guide.png')});await page.keyboard.press('Escape');assert.equal(await page.locator('.modal-overlay').count(),0);
 assert.equal(await page.locator('.canvas-hint').count(),0);assert.equal(await page.getByText('松手归位',{exact:true}).count(),0);
 await page.locator('.react-flow__node h3').click();await page.getByRole('complementary',{name:'核心知识预览'}).waitFor();await page.locator('.preview-scroll summary').click();await page.getByText(concept.detail,{exact:true}).waitFor();assert.equal((await fetch(base+'/api/graphs/'+graph.id,{headers}).then(r=>r.json())).nodes.length,1,'unreviewed preview must not be saved as a finished graph');await page.screenshot({path:path.join(root,'test-results/early-preview.png')});
 releaseAudit();await page.locator('.generation-preview').waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelectorAll('.outline-row').length===2);assert.equal(await page.evaluate(()=>window.zhizhiFlush()),true);const saved=await fetch(base+'/api/graphs/'+graph.id,{headers}).then(r=>r.json());assert.equal(saved.nodes.length,2);assert.equal(saved.nodes[1].outline[0].title,concept.title);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'操作指引',exact:true}).click();const bounds=await page.getByRole('dialog',{name:'操作指引'}).boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);await page.screenshot({path:path.join(root,'test-results/operation-guide-mobile.png')});assert.deepEqual(errors,[]);console.log('PASS help guide, clean canvas, readable preview before audit, final tree persistence, mobile layout');
}catch(error){await page.screenshot({path:path.join(root,'test-results/ui-polish-failure.png')}).catch(()=>{});throw error;}
finally{releaseAudit();await browser.close();app.locals.shutdown();server.closeAllConnections();mock.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>mock.close(r))]);await fs.rm(dir,{recursive:true,force:true});}
