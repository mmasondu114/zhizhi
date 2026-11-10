import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {makeGraph} from '../src/demo.js';
import {introduction} from './lesson-fixture.js';
const root=path.resolve(import.meta.dirname,'..'),base='https://zhizhi.test';
let graph=makeGraph('Unit 3','live'),lessonCalls=0;
const lesson=introduction({document:'3A',candidates:[{title:'估计量与抽样分布'}],allowedSourceIds:['a']});
graph.materials=[{id:'a',name:'3A.pdf',chunks:[{id:'a',text:'Sampling distribution is the distribution of a statistic over repeated samples.',paragraph:1}]}];
graph.nodes[0].expanded=true;
graph.nodes.push({...graph.nodes[0],...lesson,id:'chapter',parent:graph.root,title:'3A 估计量与抽样分布',materialIds:['a'],expanded:false,position:{x:0,y:380},outline:[{...lesson,title:'抽样分布',prepared:true}]});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||chromium.executablePath(),headless:true});
const page=await browser.newPage({viewport:{width:1360,height:950},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url()),p=url.pathname;
 const json=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
 if(p==='/api/bootstrap')return json({token:'test',settings:{selected:'openai',providers:{openai:{kind:'openai',model:'test'},codex:{},claude:{},anthropic:{}}},connection:{status:'connected'}});
 if(p==='/api/graphs')return json([{id:graph.id,name:graph.name,count:graph.nodes.length}]);
 if(p.startsWith('/api/graphs/')){if(req.method()==='PUT'){graph=req.postDataJSON();return json({ok:true});}return json(graph);}
 if(p==='/api/clients')return json({});
 if(p==='/api/updates')return json({available:false});
 if(p==='/api/lesson'){lessonCalls++;return json({lesson:{...lesson,detail:'先想象反复抽取同样大小的样本，再比较每次统计量的值。'}});}
 if(p.startsWith('/api/'))return route.fulfill({status:400,contentType:'application/json',body:'{"error":"Unexpected test request"}'});
 const file=path.resolve(root,'dist',p==='/'?'index.html':p.slice(1));
 if(!file.startsWith(path.join(root,'dist')+path.sep))return route.abort();
 const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
 try{return await route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}catch{return route.fulfill({status:404,body:''});}
});
const card=()=>page.locator('.react-flow__node[data-id="chapter"]');
const open=async()=>{await card().getByRole('button',{name:'查看详情'}).click();await page.getByRole('dialog',{name:'概念讲解'}).waitFor();};
const closed=()=>page.locator('.concept-overlay').waitFor({state:'detached'});
try{
 await fs.mkdir(path.join(root,'test-results'),{recursive:true});
 await page.goto(base);await card().waitFor();await page.waitForTimeout(400);
 await open();assert.equal(await page.getByRole('heading',{name:'本章学什么'}).count(),1);assert.equal(await page.locator('.lesson-terms dt span').textContent(),'Sampling distribution');
 await page.screenshot({path:path.join(root,'test-results/lesson-popup.png')});
 await page.keyboard.press('Escape');await closed();
 await open();await page.getByRole('button',{name:'关闭详情'}).click();await closed();
 await open();await page.locator('.concept-overlay').click({position:{x:4,y:4}});await closed();
 await open();await page.getByRole('button',{name:'已理解',exact:true}).click();await page.keyboard.press('Control+z');await closed();await page.evaluate(()=>window.zhizhiFlush());assert.equal(graph.nodes.find(n=>n.id==='chapter').status,'understood','Ctrl+Z must close the lecture, not undo learning status');
 await open();await page.getByRole('button',{name:'编辑这个节点',exact:true}).click();await page.keyboard.press('Escape');await page.locator('.modal-overlay').waitFor({state:'detached'});assert.equal(await page.locator('.concept-overlay').count(),1);await page.keyboard.press('Escape');await closed();
 await open();await page.getByRole('button',{name:'开始学习本章 · 展开知识点'}).click();await closed();await page.evaluate(()=>window.zhizhiFlush());assert.equal(graph.nodes.length,3);
 const oldIds=graph.nodes.map(n=>n.id);await open();await page.getByRole('button',{name:'重新讲解这个知识点'}).click();await page.getByText('先想象反复抽取同样大小的样本，再比较每次统计量的值。',{exact:true}).waitFor();await page.keyboard.press('Escape');await page.evaluate(()=>window.zhizhiFlush());assert.equal(lessonCalls,1);assert.deepEqual(graph.nodes.map(n=>n.id),oldIds);
 await page.getByRole('button',{name:'模型与设置'}).click();await page.getByRole('radio',{name:'右侧面板',exact:true}).check();await page.keyboard.press('Escape');await card().getByRole('button',{name:'查看详情'}).click();await page.locator('.detail-presence.is-open').waitFor();assert.equal(await page.locator('.concept-overlay').count(),0);await page.keyboard.press('Escape');await page.reload();await card().waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('zhizhi-concept-mode')),'panel');
 await page.getByRole('button',{name:'模型与设置'}).click();await page.getByRole('radio',{name:'弹窗页面（默认）',exact:true}).check();await page.keyboard.press('Escape');await open();await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('.concept-page').evaluate(e=>{const b=e.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth+1;}));await page.screenshot({path:path.join(root,'test-results/lesson-mobile.png')});await page.keyboard.press('Meta+z');await closed();
 assert.deepEqual(errors,[]);console.log('PASS: popup, glossary, chapter start, all exits, nested editor, safe undo, legacy refresh, persisted sidebar, mobile');
}finally{await browser.close();}
