import {normalizeFormula} from './math.js';
import {z} from 'zod';
export const types=['knowledge','question','answer','formula','example'];
export const relations=['需要','解释','组成','步骤','条件','区别','提问','回答','举例','原理'];
const text=(max)=>z.string().trim().min(1).max(max);
export const generatedNode=z.object({title:text(100),summary:text(320),type:z.enum(types).default('knowledge'),relation:z.enum(relations).default('解释'),detail:text(10000),formula:z.string().max(2000).optional().default(''),example:z.string().max(4000).optional().default(''),sources:z.array(z.string().max(100)).max(8).optional().default([])});
export const generationSchema=z.object({nodes:z.array(generatedNode).min(1).max(48)});
export const outputSchema={type:'object',additionalProperties:false,properties:{nodes:{type:'array',minItems:1,maxItems:48,items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},summary:{type:'string'},type:{type:'string',enum:types},relation:{type:'string',enum:relations},detail:{type:'string'},formula:{type:'string'},example:{type:'string'},sources:{type:'array',items:{type:'string'}}},required:['title','summary','type','relation','detail','formula','example','sources']}}},required:['nodes']};
export function parseGeneration(raw,allowedSources=[],{allowEmpty=false}={}){
 if(typeof raw!=='string'||raw.length>300000)throw new Error('模型输出为空或超过长度上限');
 let obj;try{obj=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{throw new Error('模型返回了非法 JSON，请重试');}
 const r=(allowEmpty?z.object({nodes:z.array(generatedNode).max(48)}):generationSchema).safeParse(obj);if(!r.success)throw new Error('模型输出结构不完整：需要 1–48 个有效节点');
 const seen=new Set();for(const n of r.data.nodes){const k=n.title.toLowerCase().replace(/\s/g,'');if(seen.has(k))throw new Error('模型输出包含重复节点，请重试');seen.add(k);n.formula=normalizeFormula(n.formula);n.sources=n.sources.filter(id=>allowedSources.includes(id));}return r.data.nodes;
}
export const nodeSchema=generatedNode.extend({layoutHeight:z.number().min(80).max(10000).optional(),materialIds:z.array(z.string().max(100)).max(50).optional(),outline:z.array(generatedNode).max(1000).optional(),id:text(100),parent:z.string().max(100).nullable(),status:z.enum(['unlearned','learning','understood']).default('unlearned'),collapsed:z.boolean().default(false),expanded:z.boolean().default(false),position:z.object({x:z.number().finite(),y:z.number().finite()}),origin:z.enum(['demo','ai','material','user']).default('user'),demoKey:z.string().max(100).optional(),highlighted:z.boolean().optional()});
export const graphSchema=z.object({version:z.literal(1),id:text(100).regex(/^[a-zA-Z0-9_-]+$/),name:text(120),goal:z.string().max(2000),foundation:z.string().max(5000).default(''),instructions:z.string().max(5000).default(''),scope:z.string().max(300).default(''),mode:z.enum(['demo','live']).default('live'),root:text(100),nodes:z.array(nodeSchema).min(1).max(5000),references:z.array(z.object({source:text(100),target:text(100)})).max(10000).default([]),materials:z.array(z.object({id:text(100),name:text(255),chunks:z.array(z.object({id:text(100),text:text(5000),page:z.number().int().positive().optional(),paragraph:z.number().int().positive()})).max(5000)})).max(50).default([]),viewport:z.object({x:z.number().finite(),y:z.number().finite(),zoom:z.number().min(.0005).max(4)}).optional(),updatedAt:z.string().optional()});
export function validateGraph(input){
 const migrated=input.version===undefined?{...input,version:1}:input;
 const g=graphSchema.parse(migrated),map=new Map(g.nodes.map(n=>[n.id,n]));
 if(map.size!==g.nodes.length||!map.has(g.root))throw new Error('节点 ID 重复或根节点不存在');
 if(map.get(g.root).parent!==null)throw new Error('根节点不能有父节点');
 for(const n of g.nodes){if(n.id!==g.root&&(!n.parent||!map.has(n.parent)))throw new Error('存在无效的父节点');let p=n,seen=new Set();while(p){if(seen.has(p.id))throw new Error('知识图存在循环');seen.add(p.id);p=map.get(p.parent);}}
 const adjacency=new Map(g.nodes.map(n=>[n.id,[]]));for(const n of g.nodes)if(n.parent)adjacency.get(n.parent).push(n.id);
 for(const r of g.references){if(!map.has(r.source)||!map.has(r.target))throw new Error('引用指向不存在的节点');adjacency.get(r.source).push(r.target);}
 const colors=new Map(),stack=[[g.root,false]];while(stack.length){const [id,exit]=stack.pop();if(exit){colors.set(id,2);continue;}if(colors.get(id)===1)throw new Error('引用关系存在循环');if(colors.get(id)===2)continue;colors.set(id,1);stack.push([id,true]);for(const c of adjacency.get(id))stack.push([c,false]);}return g;
}
export function relevantChunks(graph,node,path=[]){
 const query=[graph.scope,node.title,node.summary,node.detail,...path.slice(-2).map(n=>n.title)].join(' ').toLowerCase();
 const terms=[...new Set(query.match(/[a-z0-9]+|[\u4e00-\u9fff]{2}/g)||[])];
 const sourceNode=[node,...path.slice().reverse()].find(n=>n.sources?.length),pinned=new Set(sourceNode?.sources||[]);
 const scopedNode=[node,...path.slice().reverse()].find(n=>n.materialIds?.length),materialIds=new Set(scopedNode?.materialIds||graph.materials.filter(m=>m.chunks.some(c=>pinned.has(c.id))).map(m=>m.id));
 const candidates=graph.materials.filter(m=>!materialIds.size||materialIds.has(m.id)).flatMap(m=>m.chunks.map((c,i)=>({...c,file:m.name,score:(pinned.has(c.id)?1000:0)+(pinned.has(m.chunks[i-1]?.id)||pinned.has(m.chunks[i+1]?.id)?100:0)+terms.reduce((s,t)=>s+(c.text.toLowerCase().includes(t)?1:0),0)}))).filter(c=>c.score>0).sort((a,b)=>b.score-a.score);
 const result=[];let characters=0;for(const c of candidates){if(result.length>=24)break;if(characters+c.text.length>32000)continue;result.push(c);characters+=c.text.length;}return result;
}
