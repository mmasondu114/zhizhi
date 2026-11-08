import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {makeGraph} from '../src/demo.js';
import {unprotect} from '../server/storage.js';
const exec=promisify(execFile);
if(process.platform!=='win32'||process.env.CI!=='true')throw new Error('Installer tests require an isolated Windows CI runner');
const root=path.resolve(import.meta.dirname,'..'),version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
const pkg=path.join(root,'release',`Zhizhi-${version}-windows-x64-setup.exe`),app=path.join(process.env.LOCALAPPDATA,'Programs','Zhizhi');
const runtime=path.join(app,'resources','runtime','node.exe'),data=path.join(process.env.LOCALAPPDATA,'Zhizhi','data');
const report={version,platform:process.platform,arch:process.arch,authenticodeSigned:false,checks:[]};let child;
async function install(){await exec(pkg,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-'],{timeout:240000,windowsHide:true});}
async function stop(){if(child&&child.exitCode===null){const closed=new Promise(r=>child.once('close',r));child.kill();await closed;}child=null;}
async function start(){
 child=spawn(runtime,[path.join(app,'resources','backend','server','index.js')],{env:{...process.env,PORT:'14326',TREE_DATA_DIR:data},windowsHide:true,stdio:['ignore','ignore','pipe']});child.stderr.resume();
 for(let i=0;i<60;i++){try{const h=await fetch('http://127.0.0.1:14326/api/health',{signal:AbortSignal.timeout(500)}).then(r=>r.json());assert.equal(h.version,version);assert.equal(h.appId,'io.github.mmasondu114.zhizhi');return;}catch{}await new Promise(r=>setTimeout(r,200));}throw new Error('Installed backend did not start');
}
try{
 await install();report.checks.push('real EXE installer completed without external Node');
 assert.equal((await exec(runtime,['-p','process.platform+"/"+process.arch'])).stdout.trim(),'win32/x64');
 await exec(path.join(app,'Zhizhi.exe'),['--smoke-test'],{timeout:60000,windowsHide:true});report.checks.push('desktop window starts bundled backend and stops process group');
 await start();let boot=await fetch('http://127.0.0.1:14326/api/bootstrap').then(r=>r.json());const headers={'Content-Type':'application/json','x-tree-token':boot.token};
 const graph=makeGraph('Windows 安装升级测试','demo');
 assert.equal((await fetch('http://127.0.0.1:14326/api/graphs/'+graph.id,{method:'PUT',headers,body:JSON.stringify(graph)})).status,200);
 const secret='ci-windows-key-'+crypto.randomUUID();
 assert.equal((await fetch('http://127.0.0.1:14326/api/settings',{method:'PUT',headers,body:JSON.stringify({selected:'openai',provider:{kind:'openai',key:secret}})})).status,200);
 const before=await fs.readFile(path.join(data,'graphs',graph.id+'.json'));const settings=await fs.readFile(path.join(data,'settings.json'),'utf8');assert.ok(!settings.includes(secret));assert.ok(settings.includes('dpapi:'));
 await stop();await install();assert.deepEqual(await fs.readFile(path.join(data,'graphs',graph.id+'.json')),before);assert.equal(await unprotect(JSON.parse(settings).providers.openai.secret),secret);report.checks.push('reinstall preserves graph and decryptable DPAPI key');
 await start();boot=await fetch('http://127.0.0.1:14326/api/bootstrap').then(r=>r.json());assert.equal(boot.settings.providers.openai.hasKey,true);assert.ok(!JSON.stringify(boot).includes(secret));await stop();
 await exec(path.join(app,'unins000.exe'),['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'],{timeout:180000,windowsHide:true});
 assert.deepEqual(await fs.readFile(path.join(data,'graphs',graph.id+'.json')),before);report.checks.push('uninstall preserves user learning data');report.passed=true;
}catch(error){report.passed=false;report.error=error.message;process.exitCode=1;}
finally{await stop();await fs.mkdir(path.join(root,'test-results'),{recursive:true});await fs.writeFile(path.join(root,'test-results','windows-install.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
