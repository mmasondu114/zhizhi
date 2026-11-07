import {useEffect,useRef} from 'react';
import {useReactFlow} from '@xyflow/react';

// Keep animation state outside React. Each wheel burst has one target and one
// RAF loop; viewport persistence is deferred until motion settles.
export function useSmoothWheel(host,mode,graphId,onMoveEnd){
 const flow=useReactFlow(),active=useRef(false),finishRef=useRef(onMoveEnd);
 finishRef.current=onMoveEnd;
 useEffect(()=>{
  const element=host.current;if(!element)return;
  let frame=0,target=null,lastTime=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const finish=()=>{if(!active.current)return;active.current=false;target=null;finishRef.current?.(null,flow.getViewport());};
  const stop=()=>{cancelAnimationFrame(frame);frame=0;finish();};
  const tick=time=>{
   const current=flow.getViewport(),dt=lastTime?Math.min(40,time-lastTime):16;lastTime=time;
   const alpha=1-Math.exp(-dt/65);
   const next={x:current.x+(target.x-current.x)*alpha,y:current.y+(target.y-current.y)*alpha,zoom:current.zoom+(target.zoom-current.zoom)*alpha};
   const done=Math.abs(next.x-target.x)<.15&&Math.abs(next.y-target.y)<.15&&Math.abs(Math.log(next.zoom/target.zoom))<.0001;
   flow.setViewport(done?target:next,{duration:0});
   if(done){frame=0;finish();}else frame=requestAnimationFrame(tick);
  };
  const wheel=e=>{
   if(e.target.closest('input,textarea,select,.nowheel'))return;
   e.preventDefault();e.stopPropagation();
   const current=flow.getViewport();const previous=target||current;
   const factor=e.deltaMode===1?16:e.deltaMode===2?element.clientHeight:1;
   const dx=Math.max(-280,Math.min(280,e.deltaX*factor)),dy=Math.max(-280,Math.min(280,e.deltaY*factor));
   if(mode==='zoom'||e.ctrlKey||e.metaKey){
    const rect=element.getBoundingClientRect(),px=e.clientX-rect.left,py=e.clientY-rect.top;
    const zoom=Math.max(.0005,Math.min(2,previous.zoom*Math.exp(-dy*.0017)));
    // Anchor against the currently painted view, even if the cursor moves
    // during an unfinished wheel burst.
    target={zoom,x:px-(px-current.x)*zoom/current.zoom,y:py-(py-current.y)*zoom/current.zoom};
   }else target={...previous,x:previous.x-(e.shiftKey&&!dx?dy:dx)*.8,y:previous.y-(e.shiftKey&&!dx?0:dy)*.8};
   active.current=true;
   if(reduced.matches){flow.setViewport(target,{duration:0});finish();return;}
   if(!frame){lastTime=0;frame=requestAnimationFrame(tick);}
  };
  element.addEventListener('wheel',wheel,{passive:false,capture:true});
  window.addEventListener('pointerdown',stop,true);
  return()=>{element.removeEventListener('wheel',wheel,true);window.removeEventListener('pointerdown',stop,true);cancelAnimationFrame(frame);active.current=false;};
 },[flow,host,mode,graphId]);
 return active;
}
