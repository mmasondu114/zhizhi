import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.js';
import {makeGraph} from '../src/demo.js';
const data=await fs.mkdtemp(path.join(os.tmpdir(),'zhizhi-practice-')),port=14333,base='http://127.0.0.1:'+port;
let created=0;const model=http.createServer(async(req,res)=>{let body='';for await(const b of req)body+=b;const c=JSON.parse(JSON.parse(body).messages.at(-1).content);const q=c.generationTask==='exercise-grade'?{correct:c.studentAnswer==='1.5',feedback:'代入标准化公式，计算正确。'}:{prompt:'均值为70，标准差为10，观测值85。请计算 z-score。',mode:++created===1?'choice':'text',options:created===1?['0.5','1.5']:[],correctOption:created===1?1:-1,answer:'1.5',explanation:'比均值高出1.5个标准差，不要求总体正态。',steps:['计算偏差：85−70=15。','除以标准差：15÷10=1.5。']};res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(q)}}]}));});await new Promise(r=>model.listen(0,'127.0.0.1',r));
const app=await createApp({dataDir:data,port}),server=app.listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));const boot=await(await fetch(base+'/api/bootstrap')).json(),headers={'content-type':'application/json','x-tree-token':boot.token};
const g=makeGraph('标准化','live');await fetch(base+'/api/graphs/'+g.id,{method:'PUT',headers,body:JSON.stringify(g)});await fetch(base+'/api/settings',{method:'PUT',headers,body:JSON.stringify({selected:'openai',provider:{kind:'openai',baseUrl:'http://127.0.0.1:'+model.address().port+'/v1',model:'test'}})});
let browser;try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':chromium.executablePath()),headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('.knowledge-node').first().waitFor();
 await page.locator('.knowledge-node').first().click({button:'right'});await page.getByRole('menuitem',{name:'给我一个例子',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('radio').first().waitFor();assert.equal(await page.getByRole('heading',{name:'参考答案',exact:true}).count(),0);
 await page.getByRole('radio').first().check();await page.getByRole('button',{name:'提交并查看解析'}).click();await page.getByRole('heading',{name:'再看一下这道题'}).waitFor();await page.getByRole('heading',{name:'解题过程'}).waitFor();assert.equal(await page.locator('.knowledge-node').count(),1);
 assert.ok(await page.locator('.exercise-option').first().evaluate(e=>{const b=e.getBoundingClientRect(),r=e.querySelector('input').getBoundingClientRect();return r.width<=24&&e.scrollWidth<=e.clientWidth+1&&[...e.children].every(n=>n.getBoundingClientRect().right<=b.right+1);}));
 await page.screenshot({path:'test-results/exercise-feedback.png'});
 await page.getByRole('button',{name:'再来一道'}).click();await page.getByRole('textbox',{name:'你的答案与解题过程'}).fill('1.5');await page.getByRole('button',{name:'提交并查看解析'}).click();await page.getByRole('heading',{name:'回答正确'}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('.exercise-overlay').evaluate(e=>e.scrollWidth<=window.innerWidth));await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(await page.locator('.knowledge-node').count(),1);assert.deepEqual(errors,[]);
 console.log('PASS: right-click exercise, hidden answers, wrong choice feedback, text grading, narrow screen, Escape and unchanged tree');
}finally{if(browser)await browser.close();app.locals.shutdown();server.closeAllConnections();model.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>model.close(r))]);await fs.rm(data,{recursive:true,force:true});}
