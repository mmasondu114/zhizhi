import React,{useEffect,useRef,useState} from 'react';
import {Upload,FileText,X,Check,Loader2} from 'lucide-react';

export default function Materials({graph,onChange,onConfirm,notify,api}){
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[failures,setFailures]=useState([]);
 const current=useRef(graph),active=useRef(true),request=useRef(null),locked=useRef(false);
 current.current=graph;
 useEffect(()=>{active.current=true;return()=>{active.current=false;request.current?.abort();};},[]);
 function update(values){const next={...current.current,...values};current.current=next;onChange(next);}
 async function upload(files){
  if(!files.length||locked.current)return;
  locked.current=true;setBusy(true);setFailures([]);
  const controller=new AbortController();request.current=controller;
  const added=[],failed=[];
  try{
   for(const [i,file] of files.entries()){
    if(!active.current)break;
    setProgress(`正在添加 ${i+1}/${files.length}：${file.name}`);
    try{
     if(current.current.materials.length+added.length>=50)throw new Error('最多添加 50 份教材');
     if(file.size>20*1024*1024)throw new Error('文件超过 20MB');
     const body=new FormData();body.append('file',file);
     added.push(await api('/material',{method:'POST',body,signal:controller.signal}));
    }catch(error){if(controller.signal.aborted)break;failed.push({name:file.name,error:error.message});}
   }
   if(active.current){
    if(added.length)update({materials:[...current.current.materials,...added]});
    setFailures(failed);
    notify(`已添加 ${added.length} 份教材${failed.length?`，${failed.length} 份未成功，可重新选择重试`:'，可继续添加或确认教材'}`);
   }
  }finally{locked.current=false;if(active.current){setBusy(false);setProgress('');}}
 }
 async function confirm(){
  if(locked.current)return;
  locked.current=true;setBusy(true);
  const controller=new AbortController();request.current=controller;
  try{
   if(text.trim()){
    if(current.current.materials.length>=50)throw new Error('最多添加 50 份教材');
    const material=await api('/material/text',{method:'POST',body:JSON.stringify({name:'粘贴的教材',text:text.trim()}),signal:controller.signal});
    if(!active.current)return;
    update({materials:[...current.current.materials,material]});setText('');
   }
   if(active.current)await onConfirm();
  }catch(error){if(active.current)notify(error.message);}
  finally{locked.current=false;if(active.current)setBusy(false);}
 }
 return <>
  <p className="muted">添加教材（可选）。不添加也可以开始学习，之后随时补充。</p>
  <label className={'upload-option '+(busy?'disabled':'')}>
   {busy?<Loader2 size={20}/>:<Upload size={20}/>}
   {progress||'选择教材文件（可多选）'}
   <input aria-label="选择教材文件（可多选）" type="file" multiple disabled={busy} accept=".pdf,.txt,.md,.markdown,.docx" onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void upload(files);}}/>
  </label>
  <p className="small-copy muted">支持 PDF / TXT / Markdown / DOCX，每个文件最大 20MB。扫描 PDF 需先识别文字。</p>
  {progress&&<p role="status">{progress}</p>}
  <div className="material-list">{graph.materials.map(m=><div key={m.id}>
   <FileText size={18}/><span><strong>{m.name}</strong><small>{m.chunks.length} 个片段 · {m.chunks.some(c=>c.page)?'保留 PDF 页码':'保留段落编号'}</small></span>
   <button type="button" className="icon-btn" aria-label={'移除教材 '+m.name} title={'移除教材 '+m.name} disabled={busy} onClick={()=>update({materials:current.current.materials.filter(x=>x.id!==m.id)})}><X size={16}/></button>
  </div>)}</div>
  {failures.length>0&&<div className="error-box" role="alert">{failures.map((f,i)=><p key={i}>{f.name}：{f.error}</p>)}</div>}
  <details className="material-optional"><summary>粘贴教材文字（可选）</summary>
   <label>教材正文与目录<textarea rows={4} disabled={busy} value={text} onChange={e=>setText(e.target.value)} placeholder="粘贴后点击底部「确认教材」即可一起添加。"/></label>
  </details>
  <details className="material-optional"><summary>学习范围与偏好（可选）</summary>
   <label>学习范围（可选）<input disabled={busy} maxLength={300} value={graph.scope} onChange={e=>update({scope:e.target.value})} placeholder="例如：抽样分布；学习具体章节时可填写章节主题"/></label>
   <div className="two-fields">
    <label>我已经会什么<textarea disabled={busy} maxLength={5000} value={graph.foundation} onChange={e=>update({foundation:e.target.value})} placeholder="可留空"/></label>
    <label>我希望怎样学<textarea disabled={busy} maxLength={5000} value={graph.instructions} onChange={e=>update({instructions:e.target.value})} placeholder="可留空"/></label>
   </div>
  </details>
  <div className="material-confirm">
   <p className="small-copy muted">{graph.materials.length?`已添加 ${graph.materials.length} 份教材`:'未添加教材，也可以直接继续'}</p>
   <button type="button" className="primary full" disabled={busy} onClick={confirm}>{busy?<Loader2 size={17}/>:<Check size={17}/>}确认教材</button>
  </div>
 </>;
}
