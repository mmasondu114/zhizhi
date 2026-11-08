export const NODE_WIDTH=320, NODE_HEIGHT=244, LEVEL_GAP=344, SIBLING_GAP=48;
export function nodeHeight(node){
 if(node.layoutHeight)return node.layoutHeight;
 const lines=(text,capacity)=>String(text||'').split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil([...line].reduce((n,c)=>n+(c.charCodeAt(0)>255?1:.55),0)/capacity)),0);
 return 104+lines(node.title,15)*25+lines(node.summary,18)*22+(node.formula?40:0);
}
export const uid=()=>globalThis.crypto.randomUUID();
export function children(g,id){return g.nodes.filter(n=>n.parent===id);}
export function ancestors(g,id){const map=new Map(g.nodes.map(n=>[n.id,n])),r=[];let n=map.get(id);while(n){r.unshift(n);n=map.get(n.parent);}return r;}
export function visibleNodes(g){const map=new Map(g.nodes.map(n=>[n.id,n]));return g.nodes.filter(n=>{let p=map.get(n.parent);while(p){if(p.collapsed)return false;p=map.get(p.parent);}return true;});}
export function layout(g,anchor){
 const visible=visibleNodes(g),byId=new Map(visible.map(n=>[n.id,n])),cs=new Map(visible.map(n=>[n.id,[]]));for(const n of visible)if(n.parent&&cs.has(n.parent))cs.get(n.parent).push(n.id);
 // Compact tidy layout: reserve space only where sibling subtrees share a depth.
 const shapes=new Map(),offsets=new Map(),stack=[[g.root,false]];
 while(stack.length){const [id,done]=stack.pop(),kids=cs.get(id)||[];
  if(!done){stack.push([id,true]);for(const c of kids)stack.push([c,false]);continue;}
  const left=[],right=[],placed=[];
  for(const c of kids){const shape=shapes.get(c);let shift=0;
   if(placed.length)for(let d=0;d<Math.min(right.length,shape.left.length);d++)shift=Math.max(shift,right[d]+SIBLING_GAP-shape.left[d]);
   placed.push(shift);for(let d=0;d<shape.left.length;d++){left[d]=Math.min(left[d]??Infinity,shape.left[d]+shift);right[d]=Math.max(right[d]??-Infinity,shape.right[d]+shift);}
   shapes.delete(c);
  }
  const center=placed.length?(placed[0]+placed.at(-1))/2:0;
  kids.forEach((c,i)=>offsets.set(c,placed[i]-center));
  shapes.set(id,{left:[-NODE_WIDTH/2,...left.map(x=>x-center)],right:[NODE_WIDTH/2,...right.map(x=>x-center)]});
 }
 const levels=new Map(),heights=[],scan=[[g.root,0]];
 while(scan.length){const [id,depth]=scan.pop();levels.set(id,depth);heights[depth]=Math.max(heights[depth]||0,nodeHeight(byId.get(id)));for(const c of cs.get(id)||[])scan.push([c,depth+1]);}
 const rows=[0];for(let d=1;d<heights.length;d++)rows[d]=rows[d-1]+heights[d-1]+100;
 const positions=new Map(),todo=[[g.root,0,0]];
 while(todo.length){const [id,x,depth]=todo.pop();positions.set(id,{x:x-NODE_WIDTH/2,y:rows[depth]});for(const c of cs.get(id)||[])todo.push([c,x+offsets.get(c),depth+1]);}
 const target=byId.get(anchor||g.root);const after=positions.get(target?.id);const dx=target&&after?target.position.x-after.x:0,dy=target&&after?target.position.y-after.y:0;
 return {...g,nodes:g.nodes.map(n=>positions.has(n.id)?{...n,position:{x:positions.get(n.id).x+dx,y:positions.get(n.id).y+dy}}:n)};
}
export function reveal(g,id){const ids=new Set(ancestors(g,id).map(n=>n.id));return layout({...g,nodes:g.nodes.map(n=>ids.has(n.id)?{...n,collapsed:false}:n)},id);}
export function removeBranch(g,id){
 if(id===g.root)throw new Error('请在图管理中删除整张知识图');
 const doomed=new Set([id]);for(let changed=true;changed;){changed=false;for(const n of g.nodes)if(doomed.has(n.parent)&&!doomed.has(n.id)){doomed.add(n.id);changed=true;}}
 const keep=new Map();for(const r of g.references)if(!doomed.has(r.source)&&doomed.has(r.target))keep.set(r.target,r.source);
 for(const target of keep.keys()){doomed.delete(target);for(let changed=true;changed;){changed=false;for(const n of g.nodes)if(doomed.has(n.id)&&!doomed.has(n.parent)&&n.id!==id){doomed.delete(n.id);changed=true;}}}
 return layout({...g,nodes:g.nodes.filter(n=>!doomed.has(n.id)).map(n=>keep.has(n.id)?{...n,parent:keep.get(n.id)}:n),references:g.references.filter(r=>!doomed.has(r.source)&&!doomed.has(r.target)&&!keep.has(r.target))});
}
export function markdown(g){const lines=[`# ${g.name}`,'',`学习目标：${g.goal}`,'',`已有基础：${g.foundation||'未填写'}`,''];const stack=[[g.root,0]];while(stack.length){const [id,depth]=stack.pop(),n=g.nodes.find(n=>n.id===id);lines.push(`${'  '.repeat(depth)}- **${n.highlighted?'【重点】':''}${n.title}** — ${n.summary} [${n.origin}]`);if(n.formula)lines.push(`${'  '.repeat(depth+1)}公式：$${n.formula}$`);for(const c of children(g,id).reverse())stack.push([c.id,depth+1]);}return lines.join('\n');}

// Reflow only graphs whose saved cards collide at the new reading size.
export function readableLayout(g){
 const nodes=visibleNodes(g).sort((a,b)=>a.position.x-b.position.x);
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length&&nodes[j].position.x-nodes[i].position.x<NODE_WIDTH+16;j++)
  if(nodes[j].position.y<nodes[i].position.y+nodeHeight(nodes[i])+44&&nodes[i].position.y<nodes[j].position.y+nodeHeight(nodes[j])+44)return layout(g,g.root);
 return g;
}

export function resolveDrop(g,id,position){
 const moving=g.nodes.find(n=>n.id===id),other=visibleNodes(g).filter(n=>n.id!==id),original=moving?.position||position;
 const dx=NODE_WIDTH+20,dy=nodeHeight(moving)+48;
 const conflicts=p=>other.filter(n=>Math.abs(n.position.x-p.x)<dx&&n.position.y<p.y+dy&&p.y<n.position.y+nodeHeight(n)+48);
 const hit=conflicts(position);if(!hit.length)return position;
 const candidates=[original];for(const n of hit)candidates.push({x:n.position.x-dx,y:position.y},{x:n.position.x+dx,y:position.y},{x:position.x,y:n.position.y-dy},{x:position.x,y:n.position.y+nodeHeight(n)+48});
 candidates.sort((a,b)=>Math.hypot(a.x-position.x,a.y-position.y)-Math.hypot(b.x-position.x,b.y-position.y));
 return candidates.find(p=>!conflicts(p).length)||original;
}

