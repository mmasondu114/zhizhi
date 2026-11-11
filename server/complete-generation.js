import {retryRateLimited} from './generation-retry.js';
import {callProvider} from './providers.js';
import {teachingMaterials} from './teaching.js';
import {sourceLanguageContext,nodeLanguageContext} from './language.js';
import {ancestors} from '../shared/tree.js';
import {relevantChunks,parseGeneration} from '../shared/protocol.js';

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
  if(node.example&&!old.example.includes(node.example)){
   const example=node.example.includes(old.example)?node.example:[old.example,node.example].filter(Boolean).join('\n\n');
   if(example.length<=4000)old.example=example;
   else if(!old.detail.includes(node.example)){
    const detail=old.detail+'\n\n'+node.example;
    if(detail.length>10000)throw new Error('同一知识点的讲解与示例过长，请整理为完整且不重复的内容后重试');
    old.detail=detail;
   }
  }
 }
 return [...merged.values()];
}

export async function generateComplete(config,graph,node,{signal,onProgress=()=>{},onPreview=()=>{},provider=callProvider,cache,concurrency}={}){
 const stop=new AbortController();signal=signal?AbortSignal.any([signal,stop.signal]):stop.signal;
 let reused=0;
 const invoke=async(context,onProgress)=>{
  signal.throwIfAborted();
  const run=()=>retryRateLimited(()=>provider(config,context,{signal,onProgress,timeoutMs:context.generationTask?Math.max(config.timeoutMs||180000,context.generationTask==='hierarchy-synthesis'?600000:300000):undefined}),{signal,onWait:onProgress});
  try{
   if(!cache)return await run();
   const result=await cache.run(config,context,run);signal.throwIfAborted();if(result.cached)reused++;return result.nodes;
  }catch(error){
   if(error.code==='GENERATION_FORMAT'&&context.document)error.message=context.document+'：'+error.message;
   throw error;
  }
 };
 const base={sourceLanguageContext:nodeLanguageContext(graph,node,ancestors(graph,node.id)),goal:graph.goal,foundation:graph.foundation,instructions:graph.instructions,scope:graph.scope,path:ancestors(graph,node.id).slice(-12).map(n=>({title:n.title,summary:n.summary,type:n.type})),current:{title:node.title,summary:node.summary,type:node.type,detail:node.detail},question:node.type==='question'?node.title:null};
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
 const batches=materialBatches(materials,64000);
 const groups=materials.map(material=>batches.filter(b=>b.material.id===material.id));
 const total=2+batches.length*2+groups.filter(g=>g.length>1).length*2;
 let completed=0,scannedChunks=0,auditPasses=0,cursor=0,failure;
 const finished=new Map();
 const status=(stage,extra={})=>onProgress({stage,percent:Math.floor(completed/total*100),completed,total,reused,...extra});
 const lanes=Math.max(1,Math.min(Math.floor(concurrency)||groups.length,groups.length));
 status('planning');signal.throwIfAborted();completed++;status('reading');
 const check=(nodes,sourceIds)=>{
  const parsed=parseGeneration(JSON.stringify({nodes}),sourceIds);
  const visit=list=>{for(const item of list){if(!item.sources.length)throw new Error('讲解缺少教材来源，请重试');if(item.outline?.length)visit(item.outline);}};
  visit(parsed);return parsed;
 };
 const review=async(context,nodes,detail)=>{
  status('reviewing',detail);
  const corrections=await invoke({...context,generationTask:'lesson-review',existing:nodes},p=>status('reviewing',{...detail,providerStage:p.stage,characters:p.characters,bytes:p.bytes}));
  signal.throwIfAborted();auditPasses++;
  // The review returns complete replacements, so a corrected explanation never
  // gets appended to an incorrect one. There is no repeated audit loop.
  const corrected=new Map(nodes.map(n=>[n.title.trim().toLowerCase(),n]));
  for(const n of corrections)corrected.set(n.title.trim().toLowerCase(),n);
  const result=check([...corrected.values()],context.allowedSourceIds);
  completed++;status('reviewed',detail);return result;
 };
 const clean=nodes=>nodes.map(n=>{const {outline,chapterIntroduction,...rest}=n;return {...rest,prepared:true,...(outline?.length?{outline:clean(outline)}:{})};});
 async function worker(){
  while(cursor<groups.length){
   signal.throwIfAborted();const group=groups[cursor++],material=group[0].material;
   const common={...base,sourceLanguageContext:sourceLanguageContext([material]),document:material.name};
   const detail={file:material.name,parallel:lanes};let candidates=[];
   for(let i=0;i<group.length;i++){
    signal.throwIfAborted();const chunks=group[i].chunks;
    const context={...common,materials:chunks,allowedSourceIds:chunks.map(c=>c.id),candidates:[],batch:i+1,batchCount:group.length};
    const progressDetail={...detail,batch:i+1,batches:group.length};status('generating',progressDetail);
    const drafted=check(await invoke({...context,generationTask:'hierarchy-synthesis'},p=>status('generating',{...progressDetail,providerStage:p.stage,characters:p.characters,bytes:p.bytes})),context.allowedSourceIds);
    signal.throwIfAborted();completed++;
    const verified=await review(context,drafted,progressDetail);
    candidates.push(...verified);scannedChunks+=chunks.length;
    if(group.length>1)onPreview({document:{id:material.id,name:material.name,nodes:clean(candidates),reviewed:true,complete:false}});
   }
   if(group.length>1){
    const context={...common,materials:teachingMaterials(material,candidates),allowedSourceIds:material.chunks.map(c=>c.id),candidates};
    status('assembling',detail);
    const drafted=check(await invoke({...context,generationTask:'hierarchy-synthesis'},p=>status('assembling',{...detail,providerStage:p.stage,characters:p.characters,bytes:p.bytes})),context.allowedSourceIds);
    signal.throwIfAborted();completed++;candidates=await review(context,drafted,detail);
   }
   const prepared=clean(candidates);
   const intro=candidates[0].chapterIntroduction?.sources?.length?candidates[0].chapterIntroduction:candidates[0];
   const document={...intro,title:material.name.replace(/\.pdf$/i,'').slice(0,100),lessonOverview:intro.lessonOverview||intro.summary,terms:intro.terms||[],type:'knowledge',relation:'组成',materialIds:[material.id],outline:prepared};
   delete document.chapterIntroduction;
   finished.set(material.id,document);
   signal.throwIfAborted();onPreview({document:{id:material.id,name:material.name,nodes:prepared,reviewed:true,complete:true}});
  }
 }
 await Promise.all(Array.from({length:lanes},()=>worker().catch(error=>{if(!failure)failure=error;stop.abort();})));
 if(failure)throw failure;
 signal.throwIfAborted();status('validating');
 const ordered=[...materials].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
 const documents=ordered.map(m=>finished.get(m.id));
 const nodes=node.id===graph.root?documents:documents.flatMap(n=>n.outline);
 const count=nodes=>nodes.reduce((sum,n)=>sum+1+(n.outline?count(n.outline):0),0);
 if(graph.nodes.length+count(nodes)>5000)throw new Error('知识点超过当前图容量，请分图整理');
 const coverage={files:materials.length,chunks:scannedChunks,batches:batches.length,reviewedBatches:batches.length,auditPasses,concepts:documents.reduce((sum,n)=>sum+count(n.outline),0),coreConcepts:true,hierarchical:true};
 completed=total;status('complete',{coverage});return {nodes,coverage};
}
