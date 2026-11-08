import React,{useLayoutEffect,useRef,useState} from 'react';
import {Copy,ClipboardPaste,Trash2,Check,Minus,X} from 'lucide-react';

export default function SelectionMenu({point,count,canDelete,canPaste,onCopy,onPaste,onDelete,onUnderstand,onCollapse,onClear,onDismiss}){
 const host=useRef(null),[position,setPosition]=useState({left:point.x+8,top:point.y+8});
 useLayoutEffect(()=>{const box=host.current.getBoundingClientRect();setPosition({left:Math.max(12,Math.min(point.x+8,window.innerWidth-box.width-12)),top:Math.max(12,Math.min(point.y+8,window.innerHeight-box.height-12))});host.current.focus({preventScroll:true});},[point]);
 useLayoutEffect(()=>{const dismiss=e=>{if(!host.current?.contains(e.target))onDismiss();};document.addEventListener('pointerdown',dismiss,true);return()=>document.removeEventListener('pointerdown',dismiss,true);},[onDismiss]);
 function keys(e){if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...host.current.querySelectorAll('button:not(:disabled)')],current=buttons.indexOf(document.activeElement);const i=e.key==='Home'?0:e.key==='End'?buttons.length-1:(current+(e.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;buttons[i]?.focus();}
 return <div className="selection-menu" role="menu" aria-label="已选节点操作" tabIndex={-1} style={position} ref={host} onKeyDown={keys} onContextMenu={e=>e.preventDefault()}>
  <div className="selection-menu-heading">{count?`已选中 ${count} 个知识点`:'节点操作'}</div>
  <button role="menuitem" disabled={!count} onClick={onCopy}><Copy size={16}/>复制节点<span>Ctrl C</span></button>
  <button role="menuitem" disabled={!canPaste} onClick={onPaste}><ClipboardPaste size={16}/>粘贴节点副本<span>Ctrl V</span></button>
  <hr/>
  <button role="menuitem" disabled={!count} onClick={onUnderstand}><Check size={16}/>标为已理解</button>
  <button role="menuitem" disabled={!count} onClick={onCollapse}><Minus size={16}/>折叠所选分支</button>
  <button role="menuitem" className="selection-delete" disabled={!canDelete} onClick={onDelete}><Trash2 size={16}/>删除选中节点<span>Del</span></button>
  <div className="selection-menu-note">删除可撤销，未选中的子节点会保留。</div>
  <hr/><button role="menuitem" onClick={onClear}><X size={16}/>取消选择<span>Esc</span></button>
 </div>;
}
