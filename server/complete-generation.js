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

export async function generateComplete(config,graph,node,{signal,onProgress=()=>{},provider=callProvider}={}){
 const base={goal:graph.goal,foundation:graph.foundation,instructions:graph.instructions,scope:graph.scope,path:ancestors(graph,node.id).slice(-12).map(n=>({title:n.title,summary:n.summary,type:n.type})),current:{title:node.title,summary:node.summary,type:node.type,detail:node.detail},question:node.type==='question'?node.title:null};
 const exhaustive=graph.materials.length>0&&(node.id===graph.root||node.materialIds?.length);
 if(!exhaustive){
  const total=3;onProgress({stage:'preparing',percent:0,completed:0,total});signal?.throwIfAborted();
  const materials=relevantChunks(graph,node,ancestors(graph,node.id));
  onProgress({stage:'generating',percent:33,completed:1,total});
  const nodes=await provider(config,{...base,materials},{signal,onProgress:p=>onProgress({...p,percent:33,completed:1,total})});
  signal?.throwIfAborted();onProgress({stage:'validating',percent:66,completed:2,total});
  onProgress({stage:'complete',percent:100,completed:3,total});return {nodes};
 }
 const materials=node.id===graph.root?graph.materials:graph.materials.filter(m=>node.materialIds.includes(m.id));
 if(!materials.length)throw new Error('该章节的教材已移除，请重新梳理教材');
 const batches=materialBatches(materials),total=batches.length*2+2;let completed=0;
 const status=(stage,extra={})=>onProgress({stage,percent:Math.floor(completed/total*100),completed,total,...extra});
 status('planning');signal?.throwIfAborted();completed++;status('reading');
 const inventories=new Map(materials.map(m=>[m.id,[]]));
 let scannedChunks=0,auditPasses=0;
 for(let i=0;i<batches.length;i++){
  signal?.throwIfAborted();const {material,chunks}=batches[i];
  const context={...base,materials:chunks,document:material.name,batch:i+1,batchCount:batches.length};
  const detail={file:material.name,batch:i+1,batches:batches.length};
  status('reading',detail);
  const extracted=await provider(config,{...context,generationTask:'inventory'},{signal,onProgress:p=>status('reading',{...detail,providerStage:p.stage,characters:p.characters,bytes:p.bytes})});
  if(!extracted.length||extracted.some(n=>!n.sources?.length))throw new Error(`${material.name}：知识点缺少教材来源，未把不完整结果写入图中，请重试`);
  completed++;status('reviewing',detail);
  let batchNodes=extracted,reviewed=false;
  for(let round=1;round<=8;round++){
   signal?.throwIfAborted();status('reviewing',{...detail,reviewRound:round});
   const missing=await provider(config,{...context,generationTask:'coverage-audit',existing:batchNodes},{signal,onProgress:p=>status('reviewing',{...detail,reviewRound:round,providerStage:p.stage,characters:p.characters,bytes:p.bytes})});auditPasses++;
   if(missing.some(n=>!n.sources?.length))throw new Error(material.name+'：复核补充缺少来源，请重试');
   if(!missing.length){reviewed=true;break;}
   const combined=mergeKnowledge([...batchNodes,...missing]);
   if(JSON.stringify(combined)===JSON.stringify(batchNodes))throw new Error(material.name+'：模型复核反复返回相同内容，尚未完成，请重试');
   batchNodes=combined;
  }
  if(!reviewed)throw new Error(material.name+'：仍有新增遗漏，未把部分结果当作完成，请拆分资料后重试');
  inventories.get(material.id).push(...batchNodes);scannedChunks+=chunks.length;completed++;status('reviewed',detail);
 }
 signal?.throwIfAborted();status('assembling');
 const nodes=[];let concepts=0;
 for(const material of [...materials].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))){
  const outline=mergeKnowledge(inventories.get(material.id));concepts+=outline.length;
  if(outline.length>1000)throw new Error('单份资料的知识点超过 1000 个，请按章节拆分资料');
  if(node.id!==graph.root){nodes.push(...outline);continue;}
  const pages=new Set(material.chunks.map(c=>c.page).filter(Boolean)).size;
  nodes.push({title:material.name.replace(/^\[[^\]]+\]\s*/,'').replace(/\.\w+$/,'').slice(0,100),summary:`${outline.length} 个独立知识点 · ${pages?pages+' 页':'全文'}已逐段梳理并复核，点击展开完整清单。`,detail:`资料：${material.name}\n已处理全部 ${material.chunks.length} 段可提取正文，并逐批检查遗漏。每个定义、条件、公式、步骤和独立例题分别列为知识点；不会把多个主题压成少数概括。模型复核仍可能有遗漏，请结合原文核对。`,type:'knowledge',relation:'组成',formula:'',example:'',sources:material.chunks.slice(0,8).map(c=>c.id),materialIds:[material.id],outline});
 }
 if(graph.nodes.length+nodes.length+concepts>5000)throw new Error('完整知识点超过当前图容量，请按章节分别建立知识图；未截断教材内容');
 const coverage={files:materials.length,chunks:scannedChunks,batches:batches.length,reviewedBatches:batches.length,auditPasses,concepts};
 completed=total;status('complete',{coverage});return {nodes,coverage};
}
