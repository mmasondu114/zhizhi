import {ancestors} from '../shared/tree.js';

export async function requestGeneration(graph,nodeId,provider,{signal,onProgress,onPreview,token='',fetcher=fetch}={}){
 const requestId=crypto.randomUUID();
 const response=await fetcher('/api/generate',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson','x-tree-token':token},body:JSON.stringify({requestId,graph,nodeId,provider}),signal});
 if(!response.ok){const data=await response.json();throw new Error(data.error||`请求失败 ${response.status}`);}
 let result;
 if(!(response.headers.get('content-type')||'').includes('application/x-ndjson'))result=await response.json();
 else{
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',size=0;
  const line=text=>{if(!text.trim())return;const event=JSON.parse(text);if(event.type==='error')throw new Error(event.error);if(event.type==='progress')onProgress?.(event);if(event.type==='preview'){if(event.requestId!==requestId||event.graphId!==graph.id||event.parentId!==nodeId||!graph.materials.some(m=>m.id===event.document?.id)||!Array.isArray(event.document?.nodes))throw new Error('预览与当前教材不匹配，已丢弃');if(!signal?.aborted)onPreview?.(event);}if(event.type==='result')result=event;};
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>25000000)throw new Error('响应过长');buffer+=decoder.decode(value,{stream:true});let i;while((i=buffer.indexOf('\n'))>=0){line(buffer.slice(0,i));buffer=buffer.slice(i+1);}}buffer+=decoder.decode();line(buffer);}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 }
 if(!result||result.requestId!==requestId||result.graphId!==graph.id||result.parentId!==nodeId||!Array.isArray(result.nodes))throw new Error('响应与当前分支不匹配或中途断开，已丢弃');
 return result;
}

// One speculative request at a time. Foreground clicks reuse or preempt it.
export class GenerationQueue{
 constructor(transport,{onChange=()=>{},ttl=10*60*1000,limit=30,idleMs=650}={}){Object.assign(this,{transport,onChange,ttl,limit,idleMs});this.jobs=new Map();this.cache=new Map();this.queue=[];this.context='';this.enabled=true;this.foreground=0;this.revision=0;}
 configure(graph,provider){const context=JSON.stringify([graph.id,provider,graph.goal,graph.scope,graph.foundation,graph.instructions,graph.materials]);if(this.context!==context){this.reset();this.context=context;}}
 key(graph,id){return JSON.stringify(ancestors(graph,id).map(n=>[n.id,n.title,n.summary,n.type,n.detail]));}
 emit(){const now=Date.now();for(const [k,v]of this.cache)if(v.until<=now)this.cache.delete(k);this.onChange({ready:[...this.cache.values()].filter(v=>v.ready).map(v=>v.id),active:[...this.jobs.values()].filter(j=>j.background).map(j=>j.id),queued:this.queue.length});}
 reset(){this.revision++;clearTimeout(this.timer);for(const job of this.jobs.values())job.controller.abort();this.jobs.clear();this.cache.clear();this.queue=[];this.context='';this.emit();}
 setEnabled(enabled){this.enabled=enabled;if(!enabled){clearTimeout(this.timer);this.queue=[];for(const job of this.jobs.values())if(job.background)job.controller.abort();}this.emit();}
 start(graph,id,provider,key,background){
  const controller=new AbortController(),revision=this.revision;
  const job={id,key,background,controller,listeners:new Set(),previewListeners:new Set(),previews:new Map(),progress:{stage:'connecting',elapsedMs:0}};
  this.jobs.set(key,job);
  job.promise=Promise.resolve().then(()=>{controller.signal.throwIfAborted();return this.transport(graph,id,provider,{signal:controller.signal,onPreview:p=>{if(controller.signal.aborted||revision!==this.revision)return;job.previews.set(p.document.id,p);for(const listener of job.previewListeners)listener(p);},onProgress:p=>{job.progress=p;for(const listener of job.listeners)listener(p);}});}).then(result=>{controller.signal.throwIfAborted();if(revision!==this.revision)throw new DOMException('请求已取消','AbortError');this.cache.set(key,{id,result,ready:job.background,until:Date.now()+this.ttl});while(this.cache.size>this.limit)this.cache.delete(this.cache.keys().next().value);return result;}).finally(()=>{if(this.jobs.get(key)===job)this.jobs.delete(key);this.emit();this.pump();});
  this.emit();return job;
 }
 async request(graph,id,provider,{signal,onProgress,onPreview,force=false}={}){
  signal?.throwIfAborted();this.configure(graph,provider);const key=this.key(graph,id);this.emit();
  if(force){this.cache.delete(key);this.jobs.get(key)?.controller.abort();this.jobs.delete(key);}
  const cached=this.cache.get(key);if(cached){this.cache.delete(key);cached.ready=false;this.cache.set(key,cached);this.emit();onProgress?.({stage:'cached',percent:100,elapsedMs:0});return cached.result;}
  this.foreground++;clearTimeout(this.timer);this.queue=this.queue.filter(x=>x.key!==key);
  let job=this.jobs.get(key);
  for(const other of this.jobs.values())if(other!==job&&other.background)other.controller.abort();
  if(!job||job.controller.signal.aborted)job=this.start(graph,id,provider,key,false);job.background=false;
  if(onProgress){job.listeners.add(onProgress);onProgress(job.progress);}
  if(onPreview){job.previewListeners.add(onPreview);for(const preview of job.previews.values())onPreview(preview);}
  const abort=()=>job.controller.abort();signal?.addEventListener('abort',abort,{once:true});
  try{return await job.promise;}finally{signal?.removeEventListener('abort',abort);if(onProgress)job.listeners.delete(onProgress);if(onPreview)job.previewListeners.delete(onPreview);this.foreground--;this.emit();this.pump();}
 }
 schedule(graph,nodes,provider){
  if(!this.enabled||provider==='demo')return;this.configure(graph,provider);
  // Replace stale predictions with the next visible choices. Never recurse automatically.
  this.queue=nodes.filter(n=>n.type!=='question'&&!n.prepared&&!n.expanded&&!Array.isArray(n.outline)).map(n=>({graph,id:n.id,provider,key:this.key(graph,n.id)})).filter(x=>!this.cache.has(x.key)&&!this.jobs.has(x.key));this.emit();this.pump();
 }
 pump(){
  clearTimeout(this.timer);if(!this.enabled||this.foreground||this.jobs.size||!this.queue.length)return;
  this.timer=setTimeout(()=>{if(!this.enabled||this.foreground||this.jobs.size)return;const next=this.queue.shift();if(!next)return;const revision=this.revision,job=this.start(next.graph,next.id,next.provider,next.key,true);job.promise.catch(()=>{if(revision===this.revision&&!job.controller.signal.aborted){this.queue=[];clearTimeout(this.timer);this.emit();}});},this.idleMs);
 }
}

