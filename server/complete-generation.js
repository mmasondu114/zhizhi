import {retryRateLimited} from './generation-retry.js';
import {callProvider} from './providers.js';
import {ancestors} from '../shared/tree.js';
import {relevantChunks} from '../shared/protocol.js';

export function materialBatches(materials,maxCharacters=24000){
 const batches=[];
 for(const material of [...materials].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))){
  let chunks=[],characters=0;
  for(const chunk of material.chunks){
   if(chunks.length&&characters+chunk.text.length>maxCharacters){batches.push({material,chunks});chunks=[];characters=0;}
   chunks.push({...chunk,file:material.name});characters+=chunk.text.length;
  }
  if(chunks.length)batches.push({material,chunks});
 }
 return batches;
}

export function mergeKnowledge(nodes){
 const merged=new Map();
 for(const node of nodes){
  const key=node.title.toLowerCase().replace(/[\s\p{P}]/gu,'')+'|'+(node.formula||'');
  const old=merged.get(key);
  if(!old){merged.set(key,{...node,sources:[...node.sources]});continue;}
  if(!old.detail.includes(node.detail)){
   const detail=old.detail+'\n\n'+node.detail;
   if(detail.length>10000)throw new Error('同一知识点的解释过长，请拆成更细的知识点后重试');
   old.detail=detail;
  }
  old.sources=[...new Set([...old.sources,...node.sources])].slice(0,8);
  if(node.example&&!old.example.includes(node.example))old.example=[old.example,node.example].filter(Boolean).join('\n').slice(0,4000);
 }
 return [...merged.values()];
}

export async function generateComplete(config,graph,node,{signal,onProgress=()=>{},provider=callProvider,cache,concurrency}={}){
 const stop=new AbortController();signal=signal?AbortSignal.any([signal,stop.signal]):stop.signal;
 let reused=0;
 const invoke=async(context,onProgress)=>{signal.throwIfAborted();const run=()=>retryRateLimited(()=>provider(config,context,{signal,onProgress,timeoutMs:context.generationTask?Math.max(config.timeoutMs||180000,context.generationTask==='hierarchy-synthesis'?600000:300000):undefined}),{signal,onWait:onProgress});if(!cache)return run();const result=await cache.run(config,context,run);signal.throwIfAborted();if(result.cached)reused++;return result.nodes;};
 const base={goal:graph.goal,foundation:graph.foundation,instructions:graph.instructions,scope:graph.scope,path:ancestors(graph,node.id).slice(-12).map(n=>({title:n.title,summary:n.summary,type:n.type})),current:{title:node.title,summary:node.summary,type:node.type,detail:node.detail},question:node.type==='question'?node.title:null};
 const exhaustive=graph.materials.length>0&&(node.id===graph.root||node.materialIds?.length);
 if(!exhaustive){
  const total=3;onProgress({stage:'preparing',percent:0,completed:0,total});signal?.throwIfAborted();
  const materials=relevantChunks(graph,node,ancestors(graph,node.id));
  onProgress({stage:'generating',percent:33,completed:1,total});
  const nodes=await invoke({...base,materials,generationTask:'focused-layer'},p=>onProgress({...p,percent:33,completed:1,total}));
  signal?.throwIfAborted();onProgress({stage:'validating',percent:66,completed:2,total});
  onProgress({stage:'complete',percent:100,completed:3,total});return {nodes};
 }
 const materials=node.id===graph.root?graph.materials:graph.materials.filter(m=>node.materialIds.includes(m.id));
 if(!materials.length)throw new Error('该章节的教材已移除，请重新梳理教材');
 const batches=materialBatches(materials),total=batches.length*2+materials.length+2;let completed=0;
 const status=(stage,extra={})=>onProgress({stage,percent:Math.floor(completed/total*100),completed,total,reused,...extra});
 status('planning');signal?.throwIfAborted();completed++;status('reading');
 const outlines=new Map();
 let scannedChunks=0,auditPasses=0;
 const results=new Array(batches.length),groups=materials.map(material=>batches.map((b,i)=>b.material.id===material.id?i:-1).filter(i=>i>=0));const lanes=Math.max(1,Math.min(Math.floor(concurrency)||groups.length,groups.length));let cursor=0,failure;
 async function worker(){
  while(cursor<groups.length){
   signal.throwIfAborted();const indices=groups[cursor++];
   for(const i of indices){
   signal.throwIfAborted();const {material,chunks}=batches[i];
   const context={...base,materials:chunks,document:material.name,batch:i+1,batchCount:batches.length};
   const detail={file:material.name,batch:i+1,batches:batches.length,parallel:lanes};
   status('reading',detail);
   const extracted=await invoke({...context,generationTask:'inventory'},p=>status('reading',{...detail,providerStage:p.stage,characters:p.characters,bytes:p.bytes}));
   signal.throwIfAborted();
   if(!extracted.length||extracted.some(n=>!n.sources?.length))throw new Error(material.name+'：知识点缺少教材来源，请重试');
   completed++;status('reviewing',detail);
   let batchNodes=extracted,reviewed=false;
   for(let round=1;round<=8;round++){
    signal.throwIfAborted();status('reviewing',{...detail,reviewRound:round});
    const missing=await invoke({...context,generationTask:'coverage-audit',existing:batchNodes},p=>status('reviewing',{...detail,reviewRound:round,providerStage:p.stage,characters:p.characters,bytes:p.bytes}));auditPasses++;
    signal.throwIfAborted();
    if(missing.some(n=>!n.sources?.length))throw new Error(material.name+'：复核补充缺少来源，请重试');
    if(!missing.length){reviewed=true;break;}
    const combined=mergeKnowledge([...batchNodes,...missing]);
    if(JSON.stringify(combined)===JSON.stringify(batchNodes))throw new Error(material.name+'：模型复核反复返回相同内容，尚未完成，请重试');
    batchNodes=combined;
   }
   if(!reviewed)throw new Error(material.name+'：仍有新增遗漏，未把部分结果当作完成，请拆分资料后重试');
   results[i]=batchNodes;scannedChunks+=chunks.length;completed++;status('reviewed',detail);
   }
   const material=batches[indices[0]].material;
   const candidates=mergeKnowledge(indices.flatMap(i=>results[i])).filter(n=>n.type!=='example'&&n.relation!=='举例');
   if(!candidates.length)throw new Error(material.name+'：未提炼到核心概念');
   const detail={file:material.name,parallel:lanes};status('assembling',detail);
   const prepared=await invoke({...base,generationTask:'hierarchy-synthesis',hierarchyVersion:2,document:material.name,materials:[],allowedSourceIds:material.chunks.map(c=>c.id),candidates},p=>status('assembling',{...detail,providerStage:p.stage,characters:p.characters,bytes:p.bytes}));
   function clean(nodes){if(!nodes.length)throw new Error(material.name+'：未整理到核心主题，请重试');return nodes.map(n=>{if(n.type==='example'||n.relation==='举例'||!n.sources.length)throw new Error(material.name+'：主题应为有教材依据的核心知识');const {outline,...leaf}=n;return {...leaf,prepared:true,example:'',...(outline?.length?{outline:clean(outline)}:{})};});}
   outlines.set(material.id,clean(prepared));completed++;status('reviewed',detail);
  }
 }
 await Promise.all(Array.from({length:lanes},()=>worker().catch(error=>{if(!failure)failure=error;stop.abort();})));
 if(failure)throw failure;
 signal.throwIfAborted();status('validating');
 const ordered=[...materials].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
 const nodes=node.id===graph.root?ordered.map(material=>{const outline=outlines.get(material.id);return {title:material.name.replace(/\.pdf$/i,'').slice(0,100),summary:outline.length+' 个核心主题 · 点击逐层展开',detail:'先选择这份教材中的核心主题，再按需深入具体概念。练习可在知识点右键菜单打开。',type:'knowledge',relation:'组成',formula:'',example:'',sources:[],materialIds:[material.id],outline};}):ordered.flatMap(material=>outlines.get(material.id));
 const count=nodes=>nodes.reduce((sum,n)=>sum+1+(n.outline?count(n.outline):0),0);
 if(graph.nodes.length+count(nodes)>5000)throw new Error('知识点超过当前图容量，请分图整理');
 const concepts=[...outlines.values()].reduce((sum,nodes)=>sum+count(nodes),0);
 const coverage={files:materials.length,chunks:scannedChunks,batches:batches.length,reviewedBatches:batches.length,auditPasses,concepts,coreConcepts:true,hierarchical:true};
 completed=total;status('complete',{coverage});return {nodes,coverage};
}
