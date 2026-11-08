import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {makeGraph} from '../src/demo.js';
const exec=promisify(execFile);
if(process.platform!=='darwin'||process.arch!=='arm64'||process.env.CI!=='true')throw new Error('Installer smoke tests require an isolated Apple Silicon CI runner');
const root=path.resolve(import.meta.dirname,'..'),version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
const pkg=path.join(root,'release',`Zhizhi-${version}-macos-arm64.pkg`);
const app='/Applications/Zhizhi.app',resources=path.join(app,'Contents','Resources'),runtime=path.join(resources,'runtime','bin','node');
const data=path.join(os.homedir(),'Library','Application Support','Zhizhi');
const report={version,platform:process.platform,arch:process.arch,developerIdSigned:false,notarized:false,checks:[]};
let child;
async function install(){await exec('/usr/bin/sudo',['/usr/sbin/installer','-pkg',pkg,'-target','/'],{timeout:180000,maxBuffer:200000});}
async function stop(){if(child&&!child.killed){const closed=new Promise(r=>child.once('close',r));child.kill('SIGTERM');await closed;}child=null;}
async function start(){
 child=spawn(runtime,[path.join(resources,'backend','server','index.js')],{env:{...process.env,PORT:'14325',TREE_DATA_DIR:data,TREE_KEYCHAIN_HELPER:path.join(resources,'zhizhi-keychain')},stdio:['ignore','ignore','pipe']});
 child.stderr.on('data',()=>{});
 for(let i=0;i<50;i++){try{const health=await fetch('http://127.0.0.1:14325/api/health',{signal:AbortSignal.timeout(500)}).then(r=>r.json());assert.equal(health.version,version);assert.equal(health.appId,'io.github.mmasondu114.zhizhi');return;}catch{}await new Promise(r=>setTimeout(r,200));}
 throw new Error('Installed backend did not become ready');
}
try{
 await install();report.checks.push('real installer completed');
 assert.equal((await exec(runtime,['-p','process.platform+"/"+process.arch'])).stdout.trim(),'darwin/arm64');report.checks.push('bundled native ARM runtime');
 await exec(path.join(app,'Contents','MacOS','Zhizhi'),['--smoke-test'],{timeout:60000});report.checks.push('desktop window started server');
 await start();let boot=await fetch('http://127.0.0.1:14325/api/bootstrap').then(r=>r.json());let headers={'Content-Type':'application/json','x-tree-token':boot.token};
 const graph=makeGraph('Mac 安装升级持久化测试','demo');
 assert.equal((await fetch('http://127.0.0.1:14325/api/graphs/'+graph.id,{method:'PUT',headers,body:JSON.stringify(graph)})).status,200);
 const secret='ci-installed-key-'+crypto.randomUUID();
 assert.equal((await fetch('http://127.0.0.1:14325/api/settings',{method:'PUT',headers,body:JSON.stringify({selected:'openai',provider:{kind:'openai',key:secret}})})).status,200);
 const before=await fs.readFile(path.join(data,'graphs',graph.id+'.json'));const settings=await fs.readFile(path.join(data,'settings.json'),'utf8');assert.ok(settings.includes('keychain:'));assert.ok(!settings.includes(secret));
 await stop();await install();assert.deepEqual(await fs.readFile(path.join(data,'graphs',graph.id+'.json')),before);report.checks.push('reinstall preserves graph data and settings outside app');
 await start();boot=await fetch('http://127.0.0.1:14325/api/bootstrap').then(r=>r.json());assert.equal(boot.settings.providers.openai.hasKey,true);assert.ok(!JSON.stringify(boot).includes(secret));report.checks.push('installed API key storage redacted');
 const ref=JSON.parse(settings).providers.openai.secret;
 const value=await new Promise((resolve,reject)=>{const p=spawn(path.join(resources,'zhizhi-keychain'),[],{stdio:['pipe','pipe','pipe']});let result='';p.stdout.on('data',x=>result+=x);p.stderr.resume();p.on('error',reject);p.on('close',code=>code?reject(new Error('Installed keychain lookup failed')):resolve(JSON.parse(result).value));p.stdin.end(JSON.stringify({operation:'get',account:ref.slice(9)}));});assert.equal(value,secret);report.checks.push('keychain survives reinstall');
 report.passed=true;
}catch(error){report.passed=false;report.error=error.message;process.exitCode=1;}
finally{await stop();await fs.mkdir(path.join(root,'test-results'),{recursive:true});await fs.writeFile(path.join(root,'test-results','macos-install.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
