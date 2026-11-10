import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import DetailPresence from './DetailPresence';

export default function ConceptView({open,mode,onClose,children}){
 const host=useRef(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  if(!open)return;
  const previous=document.activeElement;
  const popup=mode==='popup';
  if(popup)host.current?.querySelector('button')?.focus({preventScroll:true});
  const keys=e=>{
   // A nested editor or exercise owns its keyboard until it closes.
   if(document.querySelector('.modal-overlay,.exercise-overlay,.ask-popover'))return;
   const back=e.key==='Escape'||((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z');
   if(back){e.preventDefault();e.stopImmediatePropagation();close.current();return;}
   if(popup&&e.key==='Tab'){
    const targets=[...host.current.querySelectorAll('button:not(:disabled),a[href],input,textarea,select,[tabindex="0"]')].filter(n=>n.getClientRects().length);
    const first=targets[0],last=targets.at(-1);
    if(!first){e.preventDefault();return;}
    if(e.shiftKey&&(document.activeElement===first||!host.current.contains(document.activeElement))){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&(document.activeElement===last||!host.current.contains(document.activeElement))){e.preventDefault();first.focus();}
   }
  };
  window.addEventListener('keydown',keys,true);
  return()=>{window.removeEventListener('keydown',keys,true);if(popup&&previous?.isConnected)previous.focus({preventScroll:true});};
 },[open,mode]);
 if(mode==='panel')return <DetailPresence open={open}>{children}</DetailPresence>;
 if(!open)return null;
 return createPortal(<div className="concept-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close.current();}}><section ref={host} className="concept-page" role="dialog" aria-modal="true" aria-label="概念讲解">{children}</section></div>,document.body);
}
