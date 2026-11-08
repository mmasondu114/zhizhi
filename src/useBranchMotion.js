import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {applyNodeChanges} from '@xyflow/react';

const DURATION=220;
const sameLayout=(a,b)=>a.length===b.length&&a.every((n,i)=>n.id===b[i].id&&n.position.x===b[i].position.x&&n.position.y===b[i].position.y);
function anchor(node,lookup,ancestors){
 let parent=node.data.node.parent;const seen=new Set();
 while(parent&&!seen.has(parent)){seen.add(parent);const found=lookup.get(parent);if(found)return {x:found.position.x,y:found.position.y+32};parent=ancestors.get(parent)?.data.node.parent;}
 return node.position;
}
export function branchFrame(from,to,progress){
 const eased=1-Math.pow(1-progress,3),old=new Map(from.nodes.map(n=>[n.id,n])),next=new Map(to.nodes.map(n=>[n.id,n]));
 const nodes=to.nodes.map(n=>{const previous=old.get(n.id),start=previous?.position||anchor(n,old,next),opacity=previous?.style?.opacity??(previous?1:0);return {...n,position:{x:start.x+(n.position.x-start.x)*eased,y:start.y+(n.position.y-start.y)*eased},style:{...n.style,opacity:opacity+(1-opacity)*eased}};});
 for(const n of from.nodes)if(!next.has(n.id)){const end=anchor(n,next,old);nodes.push({...n,draggable:false,selectable:false,connectable:false,focusable:false,className:'branch-exiting',position:{x:n.position.x+(end.x-n.position.x)*eased,y:n.position.y+(end.y-n.position.y)*eased},style:{...n.style,opacity:(n.style?.opacity??1)*(1-eased),pointerEvents:'none'}});}
 const previousEdges=new Map(from.edges.map(e=>[e.id,e])),edgeIds=new Set(to.edges.map(e=>e.id));
 const edges=to.edges.map(e=>({...e,style:{...e.style,opacity:previousEdges.has(e.id)?(previousEdges.get(e.id).style?.opacity??1)+(1-(previousEdges.get(e.id).style?.opacity??1))*eased:eased}}));
 for(const e of from.edges)if(!edgeIds.has(e.id))edges.push({...e,focusable:false,selectable:false,style:{...e.style,opacity:(e.style?.opacity??1)*(1-eased),pointerEvents:'none'}});
 return {nodes,edges};
}

// Animate only presentation coordinates. Saved graph positions stay final.
export function useBranchMotion(nodes,edges,graphId){
 const [view,setView]=useState({nodes,edges}),current=useRef(view),target=useRef({nodes,edges}),frame=useRef(0),identity=useRef(graphId);
 const publish=useCallback(value=>{current.current=value;setView(value);},[]);
 const stop=useCallback(()=>{cancelAnimationFrame(frame.current);frame.current=0;},[]);
 useLayoutEffect(()=>{
  const next={nodes,edges},oldTarget=target.current;target.current=next;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(identity.current!==graphId||!current.current.nodes.length||reduced){identity.current=graphId;stop();publish(next);return;}
  if(sameLayout(oldTarget.nodes,nodes)){
   if(!frame.current)publish(next);
   return;
  }
  stop();const start=current.current,started=performance.now();
  const tick=now=>{const p=Math.min(1,(now-started)/DURATION);if(p===1){frame.current=0;publish(target.current);return;}publish(branchFrame(start,target.current,p));frame.current=requestAnimationFrame(tick);};
  publish(branchFrame(start,next,0));frame.current=requestAnimationFrame(tick);
 },[nodes,edges,graphId,publish,stop]);
 useLayoutEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),change=()=>{if(media.matches){stop();publish(target.current);}};media.addEventListener('change',change);return()=>{media.removeEventListener('change',change);stop();};},[publish,stop]);
 const onNodesChange=useCallback(changes=>{
  if(changes.some(c=>c.type==='position'&&c.dragging)){stop();publish({...target.current,nodes:applyNodeChanges(changes,target.current.nodes)});}
  else publish({...current.current,nodes:applyNodeChanges(changes,current.current.nodes)});
 },[publish,stop]);
 return {...view,onNodesChange};
}
