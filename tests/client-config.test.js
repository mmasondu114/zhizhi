import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {configuredCodexModel,clientExitMessage} from '../server/client-config.js';
import {callProvider,runProcess} from '../server/providers.js';
import {macClientCandidates} from '../server/platform.js';

test('Mac detects the current desktop CLI before the legacy desktop bundle',()=>{
 const candidates=macClientCandidates('codex','/Users/test');
 const current='/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
 assert.ok(candidates.includes(current));
 assert.ok(candidates.indexOf(current)<candidates.indexOf('/Applications/Codex.app/Contents/Resources/codex'));
 assert.ok(candidates.includes('/Users/test/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex'));
 assert.ok(!macClientCandidates('claude','/Users/test').includes(current));
});

test('read only the root Codex model preference, including CODEX_HOME',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zhizhi-model-'));
 try{
  assert.equal(await configuredCodexModel(dir),'');
  await fs.writeFile(path.join(dir,'config.toml'),'model = "gpt-6-astra" # preferred\n[profiles.other]\nmodel="other"\n');
  assert.equal(await configuredCodexModel(dir),'gpt-6-astra');
  await fs.writeFile(path.join(dir,'config.toml'),"# model='comment'\nmodel = 'another-model'\n[hooks]\ncommand='never-run'\n");
  assert.equal(await configuredCodexModel(dir),'another-model');
  for(const content of ['[profiles.other]\nmodel="other"','model="bad value"','model="$(echo nope)"','model=""']){
   await fs.writeFile(path.join(dir,'config.toml'),content);
   assert.equal(await configuredCodexModel(dir),'');
  }
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('Codex request inherits configured model, explicit model wins, tools remain restricted',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zhizhi-client-'));
 const old=process.env.CODEX_HOME;process.env.CODEX_HOME=dir;
 try{
  await fs.writeFile(path.join(dir,'config.toml'),'model="configured-model"\n[hooks]\ncommand="must-not-run"');
  const client=path.join(dir,'fake-codex.mjs');
  await fs.writeFile(client,`const args=process.argv.slice(2);
if(args.includes('--version'))console.log('codex test');
else if(args.includes('--help'))console.log('--output-schema --sandbox --ignore-user-config');
else{
 if(!args.includes('--ignore-user-config')||!args.includes('features.shell_tool=false')||!args.includes('mcp_servers={}'))process.exit(2);
 const model=args[args.indexOf('--model')+1];
 console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({nodes:[{title:model,summary:'summary',detail:'detail',type:'knowledge',relation:'解释'}]})}}));
}`);
  for(const [model,expected]of [['','configured-model'],['chosen-model','chosen-model']]){
   const result=await callProvider({kind:'codex',clientPath:client,model},{materials:[]});
   assert.equal(result[0].title,expected);
  }
 }finally{if(old===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=old;await fs.rm(dir,{recursive:true,force:true});}
});

test('JSONL model errors take precedence over a transient TLS warning',async()=>{
 const stdout=JSON.stringify({type:'turn.failed',error:{message:JSON.stringify({error:{code:'model_not_found',message:"The 'gpt-5.5' model is not supported when using Codex with a ChatGPT account."}})}});
 assert.match(clientExitMessage(1,'tls handshake eof',stdout),/当前模型不可用/);
 await assert.rejects(runProcess(process.execPath,['-e',`console.log(${JSON.stringify(stdout)});process.exitCode=1;`]),/当前模型不可用/);
});

test('client errors are actionable and never echo raw output or credentials',()=>{
 for(const [input,expected]of [['401 Unauthorized Bearer secret',/重新登录/],['429 rate limit',/额度受限/],['tls handshake eof',/网络或代理/],['unexpected argument',/版本不兼容/],['The model requires a newer version of Codex',/版本过旧/],['private document and token',/客户端退出/]]){
  const message=clientExitMessage(1,input,'');assert.match(message,expected);assert.ok(!message.includes(input));
 }
});
