import React,{memo} from 'react';
import {X} from 'lucide-react';
export default memo(function GenerationPreview({documents,active,Text,onDismiss}){
 return <aside className="generation-preview" aria-label="核心知识预览">
  <header><div><strong>先读核心知识</strong><p>{active?'后台继续复核与整理，完成后进入知识树。':'复核尚未完成，这些内容仅供预览；重试可复用已完成的批次。'}</p></div><button className="icon-btn" aria-label="关闭预览" onClick={onDismiss}><X size={18}/></button></header>
  <div className="preview-scroll">{Object.values(documents).map(document=><section key={document.id}><h3>{document.name}</h3><p className="preview-state">{document.nodes.length} 个已提炼概念 · {document.reviewed?'已复核':'待复核'}</p>{document.nodes.map((node,index)=><details key={node.title+'-'+index}><summary>{node.title}</summary><p>{node.summary}</p><Text text={node.detail}/></details>)}</section>)}</div>
 </aside>;
});
