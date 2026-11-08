import express from 'express';
import {defaultDataDir} from './platform.js';
import {APP_ID,APP_VERSION,RELEASES_URL,checkForUpdates} from './updates.js';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {validateGraph,relevantChunks} from '../shared/protocol.js';
import {ancestors} from '../shared/tree.js';
import {callProvider,inspectClient} from './providers.js';
import {parseMaterial,chunkText} from './materials.js';
import {atomicWrite,readJson,protect,unprotect,forgetSecret} from './storage.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function createApp({dataDir=defaultDataDir({root}),port=Number(process.env.PORT||4317),dev=false}={}){
 await fs.mkdir(path.join(dataDir,'graphs'),{recursive:true});
 const app=express(),token=randomBytes(32).toString('hex'),requests=new Map();const settingsFile=path.join(dataDir,'settings.json');
 const defaults={selected:'demo',providers:{openai:{kind:'openai',baseUrl:'',model:'',secret:'',timeoutMs:120000},anthropic:{kind:'anthropic',baseUrl:'https://api.anthropic.com/v1',model:'',secret:'',timeoutMs:120000},codex:{kind:'codex',model:'',clientPath:'',timeoutMs:180000},claude:{kind:'claude',model:'',clientPath:'',timeoutMs:180000}}};
 let settings=await readJson(settingsFile,defaults);const publicSettings=()=>({...settings,providers:Object.fromEntries(Object.entries(settings.providers).map(([id,p])=>{const {secret,...rest}=p;return [id,{...rest,hasKey:!!secret}];}))});
 let configEpoch=0,connection={kind:settings.selected,status:settings.selected==='demo'?'disconnected':'unverified'};
 const connected=kind=>{connection={kind,status:'connected',verifiedAt:new Date().toISOString()};};
 app.locals.shutdown=()=>{for(const request of requests.values())request.abort();};
 app.disable('x-powered-by');
 app.use((req,res,next)=>{const hosts=[`127.0.0.1:${port}`,`localhost:${port}`];if(!hosts.includes(req.headers.host))return res.status(403).json({error:'无效的本机 Host'});if(req.headers.origin&&!hosts.map(h=>'http://'+h).includes(req.headers.origin))return res.status(403).json({error:'拒绝跨来源访问'});res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');if(!dev)res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'");next();});
 app.use('/api', (req,res,next)=>{res.setHeader('Cache-Control','no-store');if(['/bootstrap','/health'].includes(req.path)&&req.method==='GET')return next();if(req.headers['x-tree-token']!==token)return res.status(403).json({error:'会话已失效，请刷新页面'});next();});
 app.use(express.json({limit:'25mb'}));
 app.get('/api/bootstrap',(req,res)=>res.json({token,settings:publicSettings(),version:1,appVersion:APP_VERSION,platform:process.platform,connection}));
 app.get('/api/health',(req,res)=>res.json({appId:APP_ID,version:APP_VERSION}));
 app.get('/api/connection',(req,res)=>res.json(connection));
 app.get('/api/updates',async(req,res)=>res.json(await checkForUpdates()));
 app.get('/api/graphs',async(req,res)=>{const files=await fs.readdir(path.join(dataDir,'graphs'));const list=[];for(const file of files.filter(f=>f.endsWith('.json'))){try{const g=await readJson(path.join(dataDir,'graphs',file));list.push({id:g.id,name:g.name,updatedAt:g.updatedAt,count:g.nodes.length});}catch{list.push({id:file.slice(0,-5),name:'数据损坏 · 原文件保留',error:true});}}res.json(list.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')));});
 const graphPath=id=>{if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('无效图 ID');return path.join(dataDir,'graphs',id+'.json');};
 app.get('/api/graphs/:id',async(req,res)=>{const g=await readJson(graphPath(req.params.id),null);g?res.json(validateGraph(g)):res.status(404).json({error:'知识图不存在'});});
 app.put('/api/graphs/:id',async(req,res)=>{const g=validateGraph(req.body);if(g.id!==req.params.id)throw new Error('图 ID 不一致');g.updatedAt=new Date().toISOString();await atomicWrite(graphPath(g.id),g);res.json({ok:true,updatedAt:g.updatedAt});});
 app.delete('/api/graphs/:id',async(req,res)=>{const file=graphPath(req.params.id);await fs.mkdir(path.join(dataDir,'trash'),{recursive:true});await fs.rename(file,path.join(dataDir,'trash',req.params.id+'-'+Date.now()+'.json'));res.json({ok:true});});
 const settingSchema=z.object({selected:z.enum(['demo','openai','anthropic','codex','claude']),provider:z.object({kind:z.enum(['openai','anthropic','codex','claude']),baseUrl:z.string().max(1000).optional(),model:z.string().max(200).optional(),key:z.string().max(4000).optional(),clearKey:z.boolean().optional(),clientPath:z.string().max(1000).optional(),timeoutMs:z.number().min(1000).max(600000).optional()}).optional()});
 app.put('/api/settings',async(req,res)=>{const b=settingSchema.parse(req.body);const next=structuredClone(settings);let oldSecret,newSecret;next.selected=b.selected;if(b.provider){const {key,clearKey,...p}=b.provider;oldSecret=settings.providers[p.kind]?.secret;if(p.baseUrl){const u=new URL(p.baseUrl);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('无效 Base URL');}next.providers[p.kind]={...next.providers[p.kind],...p};if(clearKey)next.providers[p.kind].secret='';else if(key)next.providers[p.kind].secret=await protect(key);}newSecret=b.provider?next.providers[b.provider.kind].secret:undefined;try{await atomicWrite(settingsFile,next);}catch(error){if(newSecret&&newSecret!==oldSecret)await forgetSecret(newSecret).catch(()=>{});throw error;}settings=next;configEpoch++;connection={kind:next.selected,status:next.selected==='demo'?'disconnected':'unverified'};if(oldSecret&&oldSecret!==newSecret)await forgetSecret(oldSecret).catch(()=>{});for(const r of requests.values())r.abort();res.json(publicSettings());});
 app.get('/api/clients',async(req,res)=>res.json(Object.fromEntries(await Promise.all(['codex','claude'].map(async k=>[k,await inspectClient(k,settings.providers[k]?.clientPath)])))));
 app.post('/api/test',async(req,res)=>{const kind=z.enum(['openai','anthropic','codex','claude']).parse(req.body.kind);const p=settings.providers[kind],epoch=configEpoch;connection={kind,status:'connecting'};const controller=new AbortController();res.on('close',()=>controller.abort());const requestKey='test:'+crypto.randomUUID();requests.set(requestKey,controller);try{const nodes=await callProvider({...p,key:await unprotect(p.secret)},{goal:'计算 z-score',current:{title:'计算 z-score',summary:'解释标准化'},question:'给出正确公式与条件',materials:[]},{signal:controller.signal});if(epoch===configEpoch&&!controller.signal.aborted)connected(kind);res.json({ok:true,nodes,connection,message:'真实模型连接与结构校验成功'});}catch(error){if(epoch===configEpoch&&!controller.signal.aborted)connection={kind,status:'error',message:error.message};throw error;}finally{requests.delete(requestKey);}});
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:1}});
 app.post('/api/material',upload.single('file'),async(req,res)=>{if(!req.file)throw new Error('请选择文件');res.json(await parseMaterial(Buffer.from(req.file.originalname,'latin1').toString('utf8'),req.file.buffer));});
 app.post('/api/material/text',async(req,res)=>{const b=z.object({name:z.string().max(255),text:z.string().min(1).max(2000000)}).parse(req.body);const id=crypto.randomUUID();res.json({id,name:b.name||'粘贴的教材',chunks:chunkText(b.text,id)});});
 app.post('/api/generate',async(req,res)=>{
  const body=z.object({requestId:z.string().uuid(),graph:z.unknown(),nodeId:z.string(),provider:z.enum(['openai','anthropic','codex','claude'])}).parse(req.body);const graph=validateGraph(body.graph);const node=graph.nodes.find(n=>n.id===body.nodeId);if(!node)throw new Error('节点已删除');
  const key=graph.id+':'+node.id;if(requests.has(key))return res.status(409).json({error:'该分支正在生成'});if(body.provider!==settings.selected)return res.status(409).json({error:'模型已切换，请重试'});
  const pathNodes=ancestors(graph,node.id);const fragments=relevantChunks(graph,node,pathNodes);
  const controller=new AbortController(),epoch=configEpoch;requests.set(key,controller);res.on('close',()=>controller.abort());
  try{const p=settings.providers[body.provider];const nodes=await callProvider({...p,key:await unprotect(p.secret)},{goal:graph.goal,foundation:graph.foundation,instructions:graph.instructions,scope:graph.scope,path:pathNodes.slice(-12).map(n=>({title:n.title,summary:n.summary,type:n.type})),current:{title:node.title,summary:node.summary,type:node.type,detail:node.detail},question:node.type==='question'?node.title:null,materials:fragments},{signal:controller.signal});if(!controller.signal.aborted&&epoch===configEpoch){connected(body.provider);res.json({requestId:body.requestId,graphId:graph.id,parentId:node.id,nodes,connection});}}catch(error){if(epoch===configEpoch&&!controller.signal.aborted)connection={kind:body.provider,status:'error',message:error.message};throw error;}finally{requests.delete(key);}
 });
 if(dev){const {createServer}=await import('vite');const vite=await createServer({root,server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}else{app.use(express.static(path.join(root,'dist')));app.get('/{*path}',(req,res)=>res.sendFile(path.join(root,'dist/index.html')));}
 app.use((err,req,res,next)=>{if(res.headersSent)return next(err);const error=err instanceof z.ZodError?'数据格式不正确，未覆盖原有内容':err.message||'服务异常';res.status(err.code==='LIMIT_FILE_SIZE'?413:400).json({error});});
 return app;
}
if(process.argv[1]&&await fs.realpath(process.argv[1]).catch(()=>path.resolve(process.argv[1]))===await fs.realpath(fileURLToPath(import.meta.url))){
 const port=Number(process.env.PORT||4317);const app=await createApp({port,dev:process.argv.includes('--dev')});const server=app.listen(port,'127.0.0.1',()=>console.log(`知枝已启动 http://127.0.0.1:${port}`));server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'端口已占用，请打开已运行的应用或设置 PORT':e.message);process.exit(1);});
 let stopping=false;const shutdown=()=>{if(stopping)return;stopping=true;app.locals.shutdown();server.closeIdleConnections();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref();};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);process.on('message',message=>{if(message?.type==='shutdown')shutdown();});if(process.send)process.on('disconnect',shutdown);
}

