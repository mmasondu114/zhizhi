import {z} from 'zod';
import {validateGraph,relevantChunks} from '../shared/protocol.js';
import {ancestors} from '../shared/tree.js';
import {callProvider} from './providers.js';
import {resolveCodexConfig} from './client-config.js';

export function lessonContext(graph,node){
 const materials=relevantChunks(graph,node,ancestors(graph,node.id));
 const scoped=graph.materials.filter(m=>node.materialIds?.includes(m.id));
 return {generationTask:node.materialIds?.length?'chapter-introduction':'concept-lesson',goal:graph.goal,foundation:graph.foundation,instructions:graph.instructions,scope:graph.scope,document:scoped.map(m=>m.name).join(' / '),current:node,candidates:node.outline||graph.nodes.filter(n=>n.parent===node.id),materials,allowedSourceIds:scoped.flatMap(m=>m.chunks.map(c=>c.id))};
}

export function installLessons(app,{getSettings,configFor,requests}){
 app.post('/api/lesson',async(req,res)=>{
  const body=z.object({graph:z.unknown(),nodeId:z.string().max(100)}).parse(req.body),graph=validateGraph(body.graph),node=graph.nodes.find(n=>n.id===body.nodeId);
  if(!node)throw new Error('知识点已移除');
  const kind=getSettings().selected;if(kind==='demo')throw new Error('请先连接模型，再补全讲解');
  const key='lesson:'+graph.id+':'+node.id;
  if(requests.has(key))return res.status(409).json({error:'讲解正在准备中'});
  const controller=new AbortController();requests.set(key,controller);res.on('close',()=>controller.abort());
  try{
   const config=await resolveCodexConfig(await configFor(kind));
   const nodes=await callProvider(config,lessonContext(graph,node),{signal:controller.signal});
   if(controller.signal.aborted)return;
   if(nodes.length!==1||!nodes[0].lessonOverview?.trim()||!Array.isArray(nodes[0].terms))throw new Error('讲解不完整，请重试');
   const {lessonOverview,terms,detail,formula,example,sources,webSources}=nodes[0];
   res.json({lesson:{lessonOverview,terms,detail,formula,example,sources,webSources}});
  }finally{if(requests.get(key)===controller)requests.delete(key);}
 });
}
