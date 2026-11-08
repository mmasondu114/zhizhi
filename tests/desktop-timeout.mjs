import {_electron as electron} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {makeGraph} from '../src/demo.js';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zhizhi-timeout-')),port=14331,base='http://127.0.0.1:'+port;
const client=path.join(dir,'fake-codex.js');await fs.writeFile(client,"if(process.argv.includes('--version'))console.log('codex test');else if(process.argv.includes('--help'))console.log('--output-schema --sandbox --ignore-user-config');else setTimeout(()=>{},30000);");
let app;try{
 app=await electron.launch({executablePath:process.env.TREE_ELECTRON_PATH,args:[path.resolve('.')],env:{...process.env,TREE_NODE_PATH:process.execPath,TREE_DATA_DIR:dir,PORT:String(port)},timeout:45000});
 const page=await app.firstWindow();await page.locator('.topbar').waitFor();
 const boot=await(await fetch(base+'/api/bootstrap')).json(),headers={'x-tree-token':boot.token,'content-type':'application/json'};
 await fetch(base+'/api/settings',{method:'PUT',headers,body:JSON.stringify({selected:'codex',provider:{kind:'codex',clientPath:client,timeoutMs:1000}})});
 const graph=makeGraph('timeout regression','live');
 const response=await fetch(base+'/api/generate',{method:'POST',headers,body:JSON.stringify({requestId:crypto.randomUUID(),graph,nodeId:graph.root,provider:'codex'})});const result=await response.json();
 assert.equal(response.ok,false);assert.match(result.error,/超时/);assert.equal((await fetch(base+'/api/health')).ok,true);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
 console.log('PASS: model subprocess timeout does not close desktop window or backend');
}finally{if(app)await app.close();await fs.rm(dir,{recursive:true,force:true});}
