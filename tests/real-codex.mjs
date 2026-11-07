import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.js';
const root=path.resolve(import.meta.dirname,'..');const out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});
const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'tree-real-'));const port=14319;const server=(await createApp({dataDir,port})).listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':chromium.executablePath()),headless:true});const page=await browser.newPage({viewport:{width:1440,height:950}});const start=Date.now();let report={provider:'codex',real:true,startedAt:new Date().toISOString()};
try{
 await page.goto(`http://127.0.0.1:${port}`);await page.getByRole('button',{name:'关闭欢迎'}).click();await page.getByRole('button',{name:'模型与设置'}).click();await page.getByRole('tab',{name:'本机客户端',exact:true}).click();await page.getByRole('button',{name:'连接并使用',exact:true}).click();await page.locator('.connection-result').filter({hasText:'已连接'}).waitFor({timeout:200000});await page.getByRole('button',{name:'关闭窗口'}).click();
 await page.locator('.react-flow__node h3').first().click();await page.getByRole('button',{name:'取消生成'}).waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.outline-row').length>1||document.querySelector('.knowledge-node')?.textContent.includes('生成失败'),null,{timeout:200000});
 await page.waitForTimeout(500);const token=(await page.request.get(`http://127.0.0.1:${port}/api/bootstrap`).then(r=>r.json())).token;const id=await page.evaluate(()=>localStorage.getItem('zhizhi-last'));const graph=await page.request.get(`http://127.0.0.1:${port}/api/graphs/${id}`,{headers:{'x-tree-token':token}}).then(r=>r.json());
 report={...report,passed:graph.nodes.length>1,elapsedMs:Date.now()-start,nodeCount:graph.nodes.length,nodes:graph.nodes.map(n=>({title:n.title,summary:n.summary,origin:n.origin,formula:n.formula})),visibleError:await page.locator('.toast').textContent().catch(()=>null)};
 await page.getByRole('button',{name:'适应全部'}).click();await page.screenshot({path:path.join(out,'real-codex.png')});
}catch(e){report={...report,passed:false,elapsedMs:Date.now()-start,error:e.message};await page.screenshot({path:path.join(out,'real-codex.png')}).catch(()=>{});}
finally{await fs.writeFile(path.join(out,'real-codex.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(dataDir,{recursive:true,force:true});}
if(!report.passed)process.exitCode=1;
