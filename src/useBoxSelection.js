import {useEffect,useRef,useState} from 'react';

export function useBoxSelection(host,graphId,callbacks){
 const latest=useRef(callbacks);latest.current=callbacks;
 const [box,setBox]=useState(null);
 useEffect(()=>{
  const element=host.current;if(!element)return;let gesture=null,frame=0;
  const clamp=(n,a,b)=>Math.max(a,Math.min(n,b));
  function draw(){
   frame=0;const g=gesture;if(!g?.dragging)return;
   const x=clamp(g.end.x,g.bounds.left,g.bounds.right),y=clamp(g.end.y,g.bounds.top,g.bounds.bottom);
   const rect={left:Math.min(g.start.x,x),top:Math.min(g.start.y,y),right:Math.max(g.start.x,x),bottom:Math.max(g.start.y,y)};
   setBox({left:rect.left-g.bounds.left,top:rect.top-g.bounds.top,width:rect.right-rect.left,height:rect.bottom-rect.top});
   const hits=g.cards.filter(c=>c.rect.left<=rect.right&&c.rect.right>=rect.left&&c.rect.top<=rect.bottom&&c.rect.bottom>=rect.top).map(c=>c.id);
   g.ids=[...new Set([...g.base,...hits])];const signature=g.ids.join('|');
   if(signature!==g.signature){g.signature=signature;latest.current.onChange(g.ids);}
  }
  function down(e){
   if(e.button!==2||e.pointerType!=='mouse'||e.target.closest('button,input,textarea,select,[contenteditable=true]'))return;
   e.preventDefault();e.stopPropagation();
   const bounds=element.getBoundingClientRect();
   gesture={pointerId:e.pointerId,start:{x:e.clientX,y:e.clientY},end:{x:e.clientX,y:e.clientY},bounds,dragging:false,ids:[],signature:null,base:e.shiftKey?[...(latest.current.selectedIds||[])]:[],nodeId:e.target.closest('.react-flow__node')?.getAttribute('data-id'),cards:[...element.querySelectorAll('.react-flow__node[data-id]')].map(n=>({id:n.getAttribute('data-id'),rect:n.getBoundingClientRect()}))};
   element.setPointerCapture(e.pointerId);
  }
  function move(e){
   if(!gesture||e.pointerId!==gesture.pointerId)return;
   e.preventDefault();e.stopPropagation();gesture.end={x:e.clientX,y:e.clientY};
   if(!gesture.dragging&&Math.hypot(e.clientX-gesture.start.x,e.clientY-gesture.start.y)>=6){gesture.dragging=true;latest.current.onStart?.();}
   if(gesture.dragging&&!frame)frame=requestAnimationFrame(draw);
  }
  function release(){if(gesture&&element.hasPointerCapture(gesture.pointerId))element.releasePointerCapture(gesture.pointerId);gesture=null;cancelAnimationFrame(frame);frame=0;setBox(null);}
  function up(e){
   if(!gesture||e.pointerId!==gesture.pointerId)return;
   e.preventDefault();e.stopPropagation();gesture.end={x:e.clientX,y:e.clientY};
   cancelAnimationFrame(frame);if(gesture.dragging)draw();const g=gesture,point={x:e.clientX,y:e.clientY};release();
   if(g.dragging)latest.current.onEnd(g.ids,point);else latest.current.onContext(g.nodeId,point);
  }
  function cancel(){if(gesture?.dragging)latest.current.onChange([]);release();}
  const key=e=>{if(e.key==='Escape')cancel();};
  const context=e=>{e.preventDefault();e.stopPropagation();};
  const wheel=e=>{if(gesture){e.preventDefault();e.stopImmediatePropagation();}};
  element.addEventListener('pointerdown',down,true);element.addEventListener('pointermove',move,true);element.addEventListener('pointerup',up,true);element.addEventListener('pointercancel',cancel,true);element.addEventListener('contextmenu',context,true);element.addEventListener('wheel',wheel,{capture:true,passive:false});window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);window.addEventListener('keydown',key);
  return()=>{release();element.removeEventListener('pointerdown',down,true);element.removeEventListener('pointermove',move,true);element.removeEventListener('pointerup',up,true);element.removeEventListener('pointercancel',cancel,true);element.removeEventListener('contextmenu',context,true);element.removeEventListener('wheel',wheel,true);window.removeEventListener('blur',cancel);window.removeEventListener('resize',cancel);window.removeEventListener('keydown',key);};
 },[host,graphId]);
 return box;
}
