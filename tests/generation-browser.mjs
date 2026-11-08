import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.js';
import {makeGraph} from '../src/demo.js';
const root=path.resolve(import.meta.dirname,'..'),dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'zhizhi-progress-'));
const port=14326,base=`http://127.0.0.1:${port}`,app=await createApp({dataDir,port});
const server=app.listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));
let calls=0,active=0,maxActive=0;
const mock=http.createServer(async(req,res)=>{let raw='';for await(const b of req)raw+=b;const body=JSON.parse(raw),ctx=JSON.parse(body.messages.at(-1).content);assert.equal(body.stream,true);calls++;active++;maxActive=Math.max(maxActive,active);res.on('close',()=>active--);const titles=ctx.current.title==='理解标准化'?['方差的作用','均值的作用']:[ctx.current.title+'的例子'];const nodes=titles.map(title=>({title,summary:'用具体的量理解这个概念',detail:'完整解释与适用条件。',type:'knowledge',relation:'组成',formula:'',example:'',sources:[]}));const output=JSON.stringify({nodes});res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('data: '+JSON.stringify({choices:[{delta:{content:output.slice(0,20)}}]})+'\n\n');setTimeout(()=>{if(res.destroyed)return;res.end('data: '+JSON.stringify({choices:[{delta:{content:output.slice(20)}}]})+'\n\ndata: [DONE]\n\n');},1500);});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const token=(await fetch(base+'/api/bootstrap').then(r=>r.json())).token;
async function api(url,body){const r=await fetch(base+'/api'+url,{method:'PUT',headers:{'Content-Type':'application/json','x-tree-token':token},body:JSON.stringify(body)});assert.ok(r.ok);return r.json();}
const graph=makeGraph('理解标准化','live');await api('/graphs/'+graph.id,graph);await api('/settings',{selected:'openai',provider:{kind:'openai',baseUrl:`http://127.0.0.1:${mock.address().port}/v1`,model:'test'}});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':chromium.executablePath()),headless:true});
const page=await browser.newPage({viewport:{width:1440,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);await page.locator('.knowledge-node h3').first().waitFor();await page.waitForTimeout(500);await page.locator('.knowledge-node h3').first().click();
 await page.getByRole('progressbar',{name:'生成进度'}).waitFor();await page.waitForFunction(()=>document.querySelector('.node-footer')?.textContent.includes('20 字符'));
 await page.waitForFunction(()=>document.querySelector('.node-footer')?.textContent.includes('1秒'));
 await page.waitForFunction(()=>document.querySelector('.prefetch-toggle')?.textContent.includes('2 层已就绪'),null,{timeout:15000});
 assert.equal(calls,3);assert.equal(maxActive,1);
 await page.getByRole('textbox',{name:'搜索知识点'}).fill('方差的作用');await page.locator('.search-result').click();await page.getByRole('button',{name:'清空搜索'}).click();await page.waitForTimeout(300);
 const start=performance.now();await page.locator('.knowledge-node').filter({has:page.getByRole('heading',{name:'方差的作用',exact:true})}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.knowledge-node h3')].some(n=>n.textContent==='方差的作用的例子'));
 assert.ok(performance.now()-start<600,'cached layer should expand immediately');assert.equal(calls,3);
 await page.locator('.prefetch-toggle').click();await page.waitForTimeout(900);assert.equal(calls,3,'off switch stops speculative work');
 await page.getByRole('button',{name:'教材',exact:true}).click();await page.getByRole('button',{name:'确认教材',exact:true}).click();await page.getByRole('status').waitFor();
 await page.waitForTimeout(4200);assert.equal(await page.getByRole('status').count(),1);await page.getByRole('status').waitFor({state:'detached',timeout:1800});
 const appearance=await page.evaluate(()=>{const b=getComputedStyle(document.querySelector('.primary'));return {background:b.backgroundColor,color:b.color,blur:getComputedStyle(document.querySelector('.topbar')).backdropFilter};});
 assert.equal(appearance.background,'rgb(220, 238, 228)');assert.equal(appearance.blur,'none');
 await page.getByRole('button',{name:'适应全部'}).click();await page.waitForTimeout(300);await page.screenshot({path:path.join(root,'test-results/flat-green-progress.png')});
 assert.deepEqual(errors,[]);console.log('PASS: real streamed progress, bounded prefetch, instant cached layer, off switch, 5s toast, flat pale green UI');
}catch(error){console.log(JSON.stringify({calls,body:await page.locator('body').innerText()}));await page.screenshot({path:path.join(root,'test-results/generation-failure.png')});throw error;}finally{await browser.close();app.locals.shutdown();server.closeAllConnections();mock.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>mock.close(r))]);await fs.rm(dataDir,{recursive:true,force:true});}
