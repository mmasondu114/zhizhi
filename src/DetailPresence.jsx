import {useEffect,useRef,useState} from 'react';
export default function DetailPresence({open,children}){
 const [present,setPresent]=useState(open),last=useRef(children);
 if(open)last.current=children;
 useEffect(()=>{if(open){setPresent(true);return;}if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setPresent(false);return;}const timer=setTimeout(()=>setPresent(false),180);return()=>clearTimeout(timer);},[open]);
 if(!open&&!present)return null;
 return <div className={'detail-presence '+(open?'is-open':'is-closing')} inert={!open} aria-hidden={!open}>{open?children:last.current}</div>;
}
