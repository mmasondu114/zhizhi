import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {REASONING_LEVELS} from '../shared/model-options.js';

// Import only model and reasoning preferences; never client hooks or permissions.
export async function configuredCodexPreferences(home=process.env.CODEX_HOME||path.join(os.homedir(),'.codex')){
 const result={model:'',reasoningEffort:''};
 try{
  const file=path.join(home,'config.toml');
  if((await fs.stat(file)).size>1024*1024)return result;
  const content=await fs.readFile(file,'utf8');
  for(const line of content.split(/\r?\n/)){
   if(/^\s*\[/.test(line))break;
   const match=line.match(/^\s*(?:([a-z_]+)|"([a-z_]+)"|'([a-z_]+)')\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/);
   if(!match)continue;
   const key=match[1]||match[2]||match[3];if(!['model','model_reasoning_effort'].includes(key))continue;
   const value=match[4][0]==='"'?JSON.parse(match[4]):match[4].slice(1,-1);
   if(key==='model'&&/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(value))result.model=value;
   if(key==='model_reasoning_effort'&&REASONING_LEVELS.some(level=>level.id===value))result.reasoningEffort=value;
  }
 }catch{}
 return result;
}
export async function configuredCodexModel(home){return (await configuredCodexPreferences(home)).model;}
export async function resolveCodexConfig(config){
 if(config.kind!=='codex')return config;
 const followEffort=config.reasoningEffort==null||config.reasoningEffort==='';
 const preferences=(!config.model?.trim()||followEffort)?await configuredCodexPreferences():{};
 return {...config,model:config.model?.trim()||preferences.model||'',reasoningEffort:followEffort?preferences.reasoningEffort||'':config.reasoningEffort};
}

export function clientExitMessage(code,stderr,stdout){
 const errors=[];
 for(const line of stdout.split('\n')){
  try{const event=JSON.parse(line);if(event.type==='error'||event.type==='turn.failed')errors.push(JSON.stringify(event.error||event.message||''));}catch{}
 }
 const detail=errors.join('\n')+'\n'+stderr;
 // Classify known failures without displaying raw output, prompts or credentials.
 if(/requires a newer version|upgrade to the latest (?:app|cli)/i.test(detail))return '检测到的 Codex 版本过旧：请更新官方客户端，或在高级选项选择新版客户端路径';
 if(/model_not_found|model[^\n]{0,120}(?:not supported|does not exist|not available)|unsupported model/i.test(detail))return '当前模型不可用：请在模型与设置中选择可用模型，或选择跟随客户端';
 if(/reasoning[^\n]{0,120}(?:not supported|unsupported|invalid)|unsupported[^\n]{0,80}reasoning/i.test(detail))return '当前模型不支持所选推理强度：请调整推理强度后重试';
 if(/429|rate.?limit|too many requests|usage.limit|quota.exceeded/i.test(detail))return '429：请求过多或额度受限，请稍后重试';
 if(/401|unauthorized|not logged in|authentication|token.expired|refresh.token/i.test(detail))return '客户端登录已失效：请在官方客户端重新登录后重试';
 if(/tls handshake|connection refused|connection reset|failed to connect|dns|network is unreachable|error sending request/i.test(detail))return '客户端无法连接模型服务：请检查网络或代理后重试';
 if(/unexpected argument|unrecognized option|unknown option/i.test(detail))return '客户端版本不兼容：请更新官方客户端后重新检测';
 return `客户端退出（${code}）；请检查官方客户端登录、网络和模型配置`;
}
