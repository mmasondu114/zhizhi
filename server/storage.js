import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const queues=new Map();
export async function atomicWrite(file,data){
 const prior=queues.get(file)||Promise.resolve();const next=prior.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(data,null,2),{mode:0o600});await fs.rename(temp,file);});queues.set(file,next);try{await next;}finally{if(queues.get(file)===next)queues.delete(file);}
}
export async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw new Error('本地数据读取失败；原文件已保留，请检查磁盘或备份');}}
function dpapi(value,decrypt=false){return new Promise((resolve,reject)=>{const script=`Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $b=${decrypt?'[Convert]::FromBase64String($s)':'[Text.Encoding]::UTF8.GetBytes($s)'}; $v=[Security.Cryptography.ProtectedData]::${decrypt?'Unprotect':'Protect'}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write(${decrypt?'[Text.Encoding]::UTF8.GetString($v)':'[Convert]::ToBase64String($v)'});`;const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';p.stdout.on('data',b=>out+=b.toString());p.on('error',()=>reject(new Error('无法调用 Windows 凭据保护')));p.on('close',code=>code?reject(new Error('无法解密本机密钥，请重新输入')):resolve(out));p.stdin.end(value);});}
function keychain(request){return new Promise((resolve,reject)=>{
 const helper=process.env.TREE_KEYCHAIN_HELPER||fileURLToPath(new URL('../platform/macos/zhizhi-keychain',import.meta.url));
 const child=spawn(helper,[],{stdio:['pipe','pipe','pipe']});let out='',done=false;
 const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(value);};
 const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new Error('钥匙串访问超时，请解锁登录钥匙串后重试'));},30000);
 child.stdout.on('data',chunk=>{out+=chunk;if(out.length>65536){child.kill('SIGKILL');finish(new Error('钥匙串响应异常'));}});
 child.stderr.resume();child.stdin.on('error',()=>{});
 child.once('error',()=>finish(new Error('Mac 钥匙串助手不可用，请安装完整的知枝应用')));
 child.once('close',code=>{if(code)return finish(new Error('无法访问 Mac 登录钥匙串，请解锁后重试或重新填写 API Key'));try{finish(null,JSON.parse(out));}catch{finish(new Error('钥匙串响应异常'));}});
 child.stdin.end(JSON.stringify(request));
});}
export async function protect(key){
 if(!key)return '';
 if(process.platform==='win32')return 'dpapi:'+await dpapi(key);
 if(process.platform==='darwin'){const account=randomUUID();await keychain({operation:'set',account,value:key});return 'keychain:'+account;}
 throw new Error('当前系统暂不支持持久保存 API Key，可使用无密钥的本地服务');
}
export async function unprotect(value){
 if(!value)return '';
 if(value.startsWith('dpapi:')){if(process.platform!=='win32')throw new Error('此 API Key 来自 Windows，请在本机重新填写');return dpapi(value.slice(6),true);}
 if(value.startsWith('keychain:')){if(process.platform!=='darwin')throw new Error('此 API Key 来自 Mac，请在本机重新填写');const result=await keychain({operation:'get',account:value.slice(9)});if(typeof result.value!=='string')throw new Error('钥匙串中没有对应密钥');return result.value;}
 throw new Error('未知密钥存储格式');
}
export async function forgetSecret(value){if(process.platform==='darwin'&&value?.startsWith('keychain:'))await keychain({operation:'delete',account:value.slice(9)});}
