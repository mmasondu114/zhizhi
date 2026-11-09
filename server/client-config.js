import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Read only the model preference. Keep --ignore-user-config so hooks, tools,
// MCP servers and execution permissions never leak into a learning request.
export async function configuredCodexModel(home=process.env.CODEX_HOME||path.join(os.homedir(),'.codex')){
 try{
  const file=path.join(home,'config.toml');
  if((await fs.stat(file)).size>1024*1024)return '';
  const content=await fs.readFile(file,'utf8');
  for(const line of content.split(/\r?\n/)){
   if(/^\s*\[/.test(line))break;
   const match=line.match(/^\s*(?:model|"model"|'model')\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/);
   if(!match)continue;
   const value=match[1][0]==='"'?JSON.parse(match[1]):match[1].slice(1,-1);
   return /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(value)?value:'';
  }
 }catch{}
 return '';
}

export function clientExitMessage(code,stderr,stdout){
 const errors=[];
 for(const line of stdout.split('\n')){
  try{const event=JSON.parse(line);if(event.type==='error'||event.type==='turn.failed')errors.push(JSON.stringify(event.error||event.message||''));}catch{}
 }
 const detail=errors.join('\n')+'\n'+stderr;
 // Classify known failures without displaying raw output, prompts or credentials.
 if(/requires a newer version|upgrade to the latest (?:app|cli)/i.test(detail))return '检测到的 Codex 版本过旧：请更新官方客户端，或在高级选项选择新版客户端路径';
 if(/model_not_found|model[^\n]{0,120}(?:not supported|does not exist|not available)|unsupported model/i.test(detail))return '当前模型不可用：请在高级选项填写 Codex 中可用的模型，或清空模型名称以使用 Codex 配置中的模型';
 if(/429|rate.?limit|too many requests|usage.limit|quota.exceeded/i.test(detail))return '429：请求过多或额度受限，请稍后重试';
 if(/401|unauthorized|not logged in|authentication|token.expired|refresh.token/i.test(detail))return '客户端登录已失效：请在官方客户端重新登录后重试';
 if(/tls handshake|connection refused|connection reset|failed to connect|dns|network is unreachable|error sending request/i.test(detail))return '客户端无法连接模型服务：请检查网络或代理后重试';
 if(/unexpected argument|unrecognized option|unknown option/i.test(detail))return '客户端版本不兼容：请更新官方客户端后重新检测';
 return `客户端退出（${code}）；请检查官方客户端登录、网络和模型配置`;
}
