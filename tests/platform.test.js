import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {defaultDataDir,macClientCandidates} from '../server/platform.js';
import {APP_VERSION,newerVersion,releaseSummary} from '../server/updates.js';
import {protect,unprotect,forgetSecret} from '../server/storage.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('Mac data lives outside the replaceable application bundle',()=>{
 assert.equal(defaultDataDir({platform:'darwin',home:'/Users/test',env:{},root:'/Applications/Zhizhi.app'}),path.join('/Users/test','Library','Application Support','Zhizhi'));
 assert.equal(defaultDataDir({platform:'win32',home:'test',env:{},root:'app'}),path.join('app','data'));
 assert.equal(defaultDataDir({platform:'darwin',env:{TREE_DATA_DIR:'test-data'},root:'app'}),path.resolve('test-data'));
 assert.ok(macClientCandidates('codex','/Users/test').includes('/opt/homebrew/bin/codex'));
 assert.ok(macClientCandidates('claude','/Users/test').includes('/usr/local/bin/claude'));
});
test('update versions compare numerically and reject prerelease or malformed values',()=>{
 assert.equal(newerVersion('v1.10.0','1.9.9'),true);
 assert.equal(newerVersion('1.1.0','1.1.0'),false);
 assert.equal(newerVersion('0.9.0','1.0.0'),false);
 assert.equal(newerVersion('1.2.0-evil','1.1.0'),false);
 assert.equal(newerVersion('<script>','1.1.0'),false);
});
test('update downloads are restricted to the exact repository release asset',()=>{
 const name='Zhizhi-1.2.0-macos-arm64.pkg',url='https://github.com/mmasondu114/zhizhi/releases/download/v1.2.0/'+name;
 const result=releaseSummary({tag_name:'v1.2.0',assets:[{name,browser_download_url:url}]},'darwin');
 assert.equal(result.downloadUrl,url);assert.equal(result.currentVersion,APP_VERSION);
 assert.equal(releaseSummary({tag_name:'v1.2.0',assets:[{name,browser_download_url:'https://evil.example/installer.pkg'}]},'darwin').downloadUrl,null);
 assert.throws(()=>releaseSummary({tag_name:'../escape'}));
 assert.throws(()=>releaseSummary({tag_name:'v1.2.0',draft:true}));
});
test('foreign platform credentials produce a useful re-entry error',async()=>{
 if(process.platform!=='win32')await assert.rejects(unprotect('dpapi:test'),/Windows/);
 if(process.platform!=='darwin')await assert.rejects(unprotect('keychain:00000000-0000-0000-0000-000000000000'),/Mac/);
});
test('Mac Keychain real save/read/delete through native helper',{skip:process.platform!=='darwin'},async()=>{
 const value='keychain-test-'+crypto.randomUUID();const ref=await protect(value);
 try{assert.match(ref,/^keychain:/);assert.ok(!ref.includes(value));assert.equal(await unprotect(ref),value);}finally{await forgetSecret(ref);}
 await assert.rejects(unprotect(ref),/钥匙串/);
});
test('server starts through a filesystem alias',{skip:process.platform==='win32'},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zhizhi-entry-'));
 const alias=path.join(dir,'entry.mjs');await fs.symlink(fileURLToPath(new URL('../server/index.js',import.meta.url)),alias);
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const child=spawn(process.execPath,[alias],{env:{...process.env,PORT:String(port),TREE_DATA_DIR:path.join(dir,'data')},stdio:'ignore'});let exited=false;child.once('exit',()=>exited=true);
 try{let ready=false;for(let i=0;i<50&&!exited;i++){try{const health=await fetch(`http://127.0.0.1:${port}/api/health`).then(r=>r.json());ready=health.version===APP_VERSION;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,'entry path alias must start the actual backend');}
 finally{if(!exited){const closed=new Promise(r=>child.once('close',r));child.kill('SIGTERM');await closed;}await fs.rm(dir,{recursive:true,force:true});}
});

test("Windows update picks Windows installer",()=>{const name="Zhizhi-1.2.0-windows-x64-setup.exe",url="https://github.com/mmasondu114/zhizhi/releases/download/v1.2.0/"+name;assert.equal(releaseSummary({tag_name:"v1.2.0",assets:[{name,browser_download_url:url}]},"win32").downloadUrl,url);assert.equal(releaseSummary({tag_name:"v1.2.0",assets:[{name,browser_download_url:url}]},"linux").downloadUrl,null);});
