import React,{memo} from 'react';
import {X} from 'lucide-react';
import LessonVisuals from './LessonVisuals';
export default memo(function GenerationPreview({documents,active,Text,onDismiss}){
 const concepts=(nodes)=>nodes.map((node,index)=><details key={node.title+'-'+index}><summary>{node.title}</summary><p>{node.lessonOverview||node.summary}</p><LessonVisuals visuals={node.visuals}/>{node.example&&<><h4>跟着例子做一遍</h4><Text text={node.example}/></>}<Text text={node.detail}/>{node.outline?.length>0&&concepts(node.outline)}</details>);
 return <aside className="generation-preview" aria-label="核心知识预览">
  <header><div><strong>已检查的内容，先开始学</strong><p>{active?'这些讲解已完成检查，可以直接阅读；其他教材正在继续生成。':'下列内容已检查。未完成的教材可重试，已完成结果会复用。'}</p></div><button className="icon-btn" aria-label="关闭预览" onClick={onDismiss}><X size={18}/></button></header>
  <div className="preview-scroll">{Object.values(documents).map(document=><section key={document.id}><h3>{document.name}</h3><p className="preview-state">{document.complete?'本教材已完成':'已检查部分 · 其余内容生成中'}</p>{concepts(document.nodes)}</section>)}</div>
 </aside>;
});
