import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.js';
import {makeGraph} from '../src/demo.js';
const root=path.resolve(import.meta.dirname,'..'),dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'zhizhi-drag-')),port=14335,base='http://127.0.0.1:'+port;
const app=await createApp({dataDir,port}),server=app.listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const boot=await(await fetch(base+'/api/bootstrap')).json(),headers={'content-type':'application/json','x-tree-token':boot.token};
const g=makeGraph('磁吸拖动测试','demo');g.nodes[0].position={x:150,y:120};g.viewport={x:20,y:20,zoom:1};
const save=graph=>fetch(base+'/api/graphs/'+g.id,{method:'PUT',headers,body:JSON.stringify(graph)});
await save(g);
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':chromium.executablePath()),headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);const errors=[];let generates=0;page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/generate'))generates++;});
const card=page.locator('.react-flow__node[data-id="'+g.root+'"] .knowledge-node');
async function saved(){await page.evaluate(()=>window.zhizhiFlush());return (await(await fetch(base+'/api/graphs/'+g.id,{headers})).json()).nodes[0].position;}
try{
 for(const zoom of [1,.5]){
  await save({...g,viewport:{x:20,y:20,zoom}});await page.goto(base);await page.evaluate(id=>{localStorage.removeItem('zhizhi-view-'+id);localStorage.removeItem('zhizhi-recovery');},g.id);await page.reload();await card.waitFor();await page.waitForTimeout(600);
  const original=await card.boundingBox(),start={x:original.x+60*zoom,y:original.y+65*zoom};
  await page.mouse.move(start.x,start.y);await page.mouse.down();let grabOffset,lastX=original.x;
  for(const dx of [12,28,44,70,110,150]){await page.mouse.move(start.x+dx,start.y);if(dx===44)await card.locator('h3').evaluate(e=>e.style.paddingBottom='8px');await page.waitForTimeout(45);const actual=await card.boundingBox();grabOffset??=actual.x-original.x-dx;assert.ok(actual.x>=lastX-1&&Math.abs(actual.x-original.x-dx-grabOffset)<3,'drag must track continuously after threshold at zoom '+zoom+': '+JSON.stringify({dx,actual:actual.x,expected:original.x+dx+grabOffset}));lastX=actual.x;}
  assert.equal(await page.getByTestId('node-home-target').count(),0);
  await page.mouse.move(start.x+26-grabOffset,start.y,{steps:8});assert.equal(await page.getByTestId('node-home-target').count(),0,'26 screen pixels away must not attract');
  await page.mouse.move(start.x+8-grabOffset,start.y,{steps:8});await page.getByTestId('node-home-target').waitFor();assert.equal(await page.getByTestId('node-home-target').textContent(),'');const guide=await page.getByTestId('node-home-target').boundingBox();assert.ok(Math.abs(guide.x-(original.x-6))<3);await page.screenshot({path:path.join(root,'test-results/drag-magnet-'+zoom+'.png')});
  await page.mouse.up();await page.waitForTimeout(350);assert.equal(await page.getByTestId('node-home-target').count(),0);assert.deepEqual(await saved(),g.nodes[0].position,'drop near original returns exactly');
  const next=await card.boundingBox(),point={x:next.x+60*zoom,y:next.y+65*zoom};await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+160,point.y+60,{steps:12});assert.equal(await page.getByTestId('node-home-target').count(),0);const released=await card.boundingBox();await page.mouse.up();await page.waitForTimeout(350);const free=await saved();assert.ok(Math.abs(free.x-(g.nodes[0].position.x+(released.x-next.x)/zoom))<2);assert.ok(Math.abs(free.y-(g.nodes[0].position.y+(released.y-next.y)/zoom))<2);
  // The next drag uses the most recently saved position as its home.
  const moved=await card.boundingBox(),p={x:moved.x+60*zoom,y:moved.y+65*zoom};await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+90,p.y,{steps:6});await page.mouse.move(p.x+18,p.y,{steps:6});await page.getByTestId('node-home-target').waitFor();await page.mouse.up();await page.waitForTimeout(350);assert.deepEqual(await saved(),free);
 }
 assert.equal(generates,0);assert.deepEqual(errors,[]);console.log('PASS pointer tracking during selection/measurement updates, visible home magnet, exact return, free drop, refreshed origin and zoom-independent attraction');
}catch(e){await page.screenshot({path:path.join(root,'test-results/drag-failure.png')}).catch(()=>{});throw e;}finally{await browser.close();app.locals.shutdown();server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(dataDir,{recursive:true,force:true});}

