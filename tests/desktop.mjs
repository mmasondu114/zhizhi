import {_electron as electron} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const root=path.resolve(import.meta.dirname,'..'),data=await fs.mkdtemp(path.join(os.tmpdir(),'zhizhi-desktop-')),out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(data,'desktop-session.json'),JSON.stringify({state:'running',startedAt:'2000-01-01T00:00:00Z',lastSeen:'2000-01-01T00:01:00Z'}));
let status=200;const mock=http.createServer((req,res)=>{req.resume();res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(status===200?{choices:[{message:{content:JSON.stringify({nodes:[{title:'连接测试',summary:'这是模拟服务测试。',type:'knowledge',relation:'解释',detail:'此内容仅用于协议回归。',formula:'',example:'',sources:[]}]})}}]}:{error:{message:'unauthorized'}}));});await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const port=14328,report={checks:[],passed:false};let app;
try{
 app=await electron.launch({...(process.env.TREE_ELECTRON_PATH?{executablePath:process.env.TREE_ELECTRON_PATH}:{}),args:[root],cwd:root,env:{...process.env,TREE_NODE_PATH:process.execPath,TREE_DATA_DIR:data,PORT:String(port)},timeout:45000});
 const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.getByRole('button',{name:'连接到 Agent',exact:true}).waitFor();
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
 assert.deepEqual(await page.evaluate(()=>({require:typeof window.require,process:typeof window.process})),{require:'undefined',process:'undefined'});
 const prefs=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());assert.equal(prefs.sandbox,true);assert.equal(prefs.contextIsolation,true);assert.equal(prefs.nodeIntegration,false);report.checks.push('standalone application window with isolated sandboxed renderer');
 await page.getByRole('button',{name:'连接到 Agent',exact:true}).click();await page.getByRole('tab',{name:'API 接入'}).click();
 await page.getByRole('textbox',{name:'服务地址',exact:true}).fill('http://127.0.0.1:'+mock.address().port+'/v1');await page.getByRole('textbox',{name:'模型名称',exact:true}).fill('test-model');
 await page.getByRole('button',{name:'连接并使用',exact:true}).click();await page.getByRole('button',{name:'Agent 已连接',exact:true}).waitFor();report.checks.push('top-right connection entry verifies and reflects success');
 status=401;await page.getByRole('button',{name:'连接并使用',exact:true}).click();await page.getByText(/连接未完成/).waitFor();await page.getByRole('button',{name:'连接到 Agent',exact:true}).waitFor();report.checks.push('failed connection restores direct reconnect entry');
 await page.getByRole('tab',{name:'离线示例',exact:true}).click();await page.getByRole('button',{name:'使用离线示例',exact:true}).click();await page.getByRole('button',{name:'关闭窗口'}).click();
 const example=page.getByRole('button',{name:'体验「计算 z-score」'});if(await example.count())await example.click();
 await page.locator('.react-flow__node h3').first().click();await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length>=4);report.checks.push('knowledge tree grows inside the application');
 await page.screenshot({path:path.join(out,'desktop-app.png')});
 await page.getByRole('button',{name:'连接到 Agent',exact:true}).click();await page.screenshot({path:path.join(out,'desktop-agent.png')});
 await page.evaluate(()=>window.open('https://example.com/'));await page.waitForTimeout(200);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);report.checks.push('untrusted popups cannot create application windows');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('zhizhi-recovery')||'{}').nodes?.length>=4);
 await app.evaluate(({BrowserWindow})=>new Promise((resolve,reject)=>{const wc=BrowserWindow.getAllWindows()[0].webContents,timer=setTimeout(()=>reject(Error('renderer recovery timed out')),15000);wc.once('did-finish-load',()=>{clearTimeout(timer);resolve(true);});wc.forcefullyCrashRenderer();}));
 assert.equal(await app.evaluate(async({BrowserWindow})=>{const wc=BrowserWindow.getAllWindows()[0].webContents;for(let i=0;i<100;i++){if(await wc.executeJavaScript("Boolean(document.querySelector('.topbar')&&document.querySelectorAll('.react-flow__node').length>=4)"))return true;await new Promise(r=>setTimeout(r,100));}return false;}),true);
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);assert.match(await fs.readFile(path.join(data,'desktop.log'),'utf8'),/renderer-recover/);report.checks.push('crashed renderer reloads and recovers saved graph without exiting');
 await app.close();app=null;await new Promise(r=>setTimeout(r,300));await assert.rejects(fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(1000)}));assert.equal(JSON.parse(await fs.readFile(path.join(data,'desktop-session.json'),'utf8')).state,'exited');assert.match(await fs.readFile(path.join(data,'desktop.log'),'utf8'),/previous-session-interrupted/);report.checks.push('closing the app also stops its owned backend; abrupt prior session detected and normal exit recorded');report.passed=true;
}catch(error){report.error=error.stack;process.exitCode=1;}finally{if(app)await app.close();mock.closeAllConnections();await new Promise(r=>mock.close(r));await fs.writeFile(path.join(out,'desktop-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}

