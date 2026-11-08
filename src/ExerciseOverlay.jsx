import React,{useEffect,useRef,useState} from 'react';
import {X,ArrowLeft,RefreshCw,Check} from 'lucide-react';

export default function ExerciseOverlay({graph,node,api,onClose,Text}){
 const [question,setQuestion]=useState(null),[answer,setAnswer]=useState(''),[result,setResult]=useState(null),[working,setWorking]=useState('loading'),[error,setError]=useState('');
 const controller=useRef(null),dialog=useRef(null),close=useRef(onClose);close.current=onClose;
 async function load(){
  controller.current?.abort();const next=new AbortController();controller.current=next;setWorking('loading');setQuestion(null);setResult(null);setAnswer('');setError('');
  try{const q=await api('/exercise',{method:'POST',body:JSON.stringify({graph,nodeId:node.id}),signal:next.signal});if(!next.signal.aborted)setQuestion(q);}catch(e){if(!next.signal.aborted)setError(e.message);}finally{if(!next.signal.aborted)setWorking('');}
 }
 async function submit(e){
  e.preventDefault();if(!answer.trim()||working)return;const next=new AbortController();controller.current=next;setWorking('grading');setError('');
  try{const r=await api('/exercise/'+question.id+'/answer',{method:'POST',body:JSON.stringify({answer}),signal:next.signal});if(!next.signal.aborted)setResult(r);}catch(e){if(!next.signal.aborted)setError(e.message);}finally{if(!next.signal.aborted)setWorking('');}
 }
 useEffect(()=>{
  const previous=document.activeElement;dialog.current?.focus();load();
  const keys=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close.current();}else if(e.key==='Tab'){
   const nodes=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];if(!nodes.length)return;
   const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }};
  document.addEventListener('keydown',keys,true);return()=>{controller.current?.abort();document.removeEventListener('keydown',keys,true);if(previous?.isConnected)previous.focus();};
 },[]);
 return <section className="exercise-overlay" role="dialog" aria-modal="true" aria-labelledby="exercise-title" ref={dialog} tabIndex={-1}>
  <header className="exercise-header"><button className="text-btn" onClick={onClose}><ArrowLeft size={17}/>返回知识树</button><span>练习</span><button className="icon-btn" aria-label="关闭练习" onClick={onClose}><X size={20}/></button></header>
  <div className="exercise-scroll"><div className="exercise-paper">
   <p className="eyebrow">围绕这个知识点</p><h1 id="exercise-title">{node.title}</h1>
   {working==='loading'&&<p className="exercise-loading" role="status">正在准备一道相关练习…</p>}
   {error&&<div className="error-box" role="alert">{error}{!question&&<button onClick={load}>重新出题</button>}</div>}
   {question&&<form onSubmit={submit}>
    <div className="exercise-question"><Text text={question.prompt}/></div>
    <fieldset className="exercise-answer" disabled={!!working||!!result}><legend>你的答案</legend>
     {question.mode==='choice'?question.options.map((option,i)=><label key={i} className={'exercise-option '+(answer===String(i)?'is-selected':'')}><input type="radio" name="exercise-answer" value={i} checked={answer===String(i)} onChange={e=>setAnswer(e.target.value)}/><span className="exercise-letter">{String.fromCharCode(65+i)}</span><Text text={option}/></label>):<textarea aria-label="你的答案与解题过程" placeholder="写下答案，也可以写出计算或推理过程…" value={answer} onChange={e=>setAnswer(e.target.value)} maxLength={8000} rows={6}/>}
    </fieldset>
    {!result&&<button className="primary" type="submit" disabled={!!working||!answer.trim()}>{working==='grading'?'正在检查答案…':'提交并查看解析'}</button>}
   </form>}
   {result&&<section className="exercise-result" aria-label="答案与解析" aria-live="polite">
    <h2 className={result.correct?'correct':'incorrect'}>{result.correct?<Check size={22}/>:null}{result.correct?'回答正确':'再看一下这道题'}</h2><Text text={result.feedback}/>
    <h3>参考答案</h3><Text text={result.answer}/>
    <h3>解题过程</h3><ol>{result.steps.map((step,i)=><li key={i}><Text text={step}/></li>)}</ol>
    <h3>为什么这样做</h3><Text text={result.explanation}/>
    <div className="exercise-result-actions"><button className="primary" onClick={load}><RefreshCw size={16}/>再来一道</button><button className="secondary" onClick={()=>{setResult(null);setAnswer('');}}>重新作答</button></div>
   </section>}
   <p className="exercise-note">题目优先取自相关教材或据其改编。练习不会新增知识树节点，重要结论请结合教材核对。</p>
  </div></div>
 </section>;
}
