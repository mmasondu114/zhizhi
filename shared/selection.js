import {uid,NODE_WIDTH,nodeHeight} from './tree.js';
import {validateGraph} from './protocol.js';

export function copyNodes(graph,ids){
 const selected=new Set(ids),nodes=graph.nodes.filter(n=>selected.has(n.id));
 return structuredClone({nodes,references:graph.references.filter(r=>selected.has(r.source)&&selected.has(r.target))});
}
export function selectedText(payload){
 return payload.nodes.map(n=>['## '+n.title,n.summary,n.formula?'$'+n.formula+'$':'',n.detail,n.example?'例子：'+n.example:''].filter(Boolean).join('\n\n')).join('\n\n---\n\n');
}
export function deleteSelected(graph,ids){
 const doomed=new Set(ids.filter(id=>id!==graph.root)),byId=new Map(graph.nodes.map(n=>[n.id,n]));
 const nodes=graph.nodes.filter(n=>!doomed.has(n.id)).map(n=>{let parent=n.parent;while(doomed.has(parent))parent=byId.get(parent)?.parent||graph.root;return parent===n.parent?n:{...n,parent};});
 const parents=new Set(nodes.map(n=>n.parent));
 return {...graph,nodes:nodes.map(n=>!parents.has(n.id)&&graph.nodes.some(c=>c.parent===n.id&&doomed.has(c.id))?{...n,expanded:false,collapsed:false}:n),references:graph.references.filter(r=>!doomed.has(r.source)&&!doomed.has(r.target))};
}
export function pasteNodes(graph,payload,point){
 if(!payload?.nodes?.length)throw new Error('还没有复制节点');
 if(graph.nodes.length+payload.nodes.length>5000)throw new Error('粘贴后超过 5000 个节点，请粘贴到另一张图');
 const ids=new Map(payload.nodes.map(n=>[n.id,uid()])),minX=Math.min(...payload.nodes.map(n=>n.position.x)),minY=Math.min(...payload.nodes.map(n=>n.position.y));
 const allowedSources=new Set(graph.materials.flatMap(m=>m.chunks.map(c=>c.id))),allowedMaterials=new Set(graph.materials.map(m=>m.id));
 const clean=n=>({...n,sources:(n.sources||[]).filter(id=>allowedSources.has(id))});
 const fresh=payload.nodes.map(n=>({...clean(n),id:ids.get(n.id),parent:ids.get(n.parent)||graph.root,expanded:payload.nodes.some(c=>c.parent===n.id),collapsed:payload.nodes.some(c=>c.parent===n.id)?n.collapsed:false,materialIds:n.materialIds?.filter(id=>allowedMaterials.has(id)),outline:n.outline?.map(clean),origin:n.origin==='material'&&!n.sources.some(id=>allowedSources.has(id))?'user':n.origin,position:{x:point.x+n.position.x-minX,y:point.y+n.position.y-minY}}));
 const intersects=(a,b)=>a.position.x<b.position.x+NODE_WIDTH+20&&b.position.x<a.position.x+NODE_WIDTH+20&&a.position.y<b.position.y+nodeHeight(b)+30&&b.position.y<a.position.y+nodeHeight(a)+30;
 const offsets=[[0,0],[NODE_WIDTH+48,0],[-NODE_WIDTH-48,0],[0,320],[0,-320]];
 let offset=offsets.find(([x,y])=>fresh.every(n=>graph.nodes.every(other=>!intersects({...n,position:{x:n.position.x+x,y:n.position.y+y}},other))));
 if(!offset)offset=[0,Math.max(...graph.nodes.map(n=>n.position.y+nodeHeight(n)))+100-point.y];
 const nodes=fresh.map(n=>({...n,position:{x:n.position.x+offset[0],y:n.position.y+offset[1]}}));
 const references=(payload.references||[]).filter(r=>ids.has(r.source)&&ids.has(r.target)).map(r=>({source:ids.get(r.source),target:ids.get(r.target)}));
 const next=validateGraph({...graph,nodes:[...graph.nodes.map(n=>n.id===graph.root?{...n,collapsed:false,expanded:true}:n),...nodes],references:[...graph.references,...references]});
 return {graph:next,ids:nodes.map(n=>n.id)};
}
