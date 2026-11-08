import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createApp} from '../server/index.js';
test('connection requires verified response; failure and changed settings clear it',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zhizhi-connection-'));let status=200;
 const mock=http.createServer((req,res)=>{req.resume();res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(status===200?{choices:[{message:{content:JSON.stringify({nodes:[{title:'核心公式',summary:'z = (x − μ) / σ，σ 大于零。',type:'formula',relation:'解释',detail:'标准化不要求正态分布。',formula:'',example:'',sources:[]}]})}}]}:{error:{message:'unauthorized'}}));});await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 const port=14329,app=await createApp({dataDir:dir,port}),server=app.listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+port;
 try{const boot=await fetch(base+'/api/bootstrap').then(r=>r.json());assert.equal(boot.connection.status,'disconnected');const headers={'Content-Type':'application/json','x-tree-token':boot.token};const state=()=>fetch(base+'/api/connection',{headers}).then(r=>r.json());
 const config={selected:'openai',provider:{kind:'openai',baseUrl:'http://127.0.0.1:'+mock.address().port+'/v1',model:'protocol-test'}};
 await fetch(base+'/api/settings',{method:'PUT',headers,body:JSON.stringify(config)});assert.equal((await state()).status,'unverified');
 const check=()=>fetch(base+'/api/test',{method:'POST',headers,body:'{"kind":"openai"}'});
 assert.equal((await check()).status,200);assert.equal((await state()).status,'connected');status=401;assert.equal((await check()).status,400);assert.equal((await state()).status,'error');
 await fetch(base+'/api/settings',{method:'PUT',headers,body:JSON.stringify(config)});assert.equal((await state()).status,'unverified');
 await fetch(base+'/api/settings',{method:'PUT',headers,body:'{"selected":"demo"}'});assert.equal((await state()).status,'disconnected');
 }finally{server.closeAllConnections();mock.closeAllConnections();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>mock.close(r))]);await fs.rm(dir,{recursive:true,force:true});}
});
