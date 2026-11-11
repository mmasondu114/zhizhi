export const TEACHING_RULE=`学生沿思维导图逐层学习。标题是简短概念名，summary 一句话说清含义；主题讲清子概念的关系，具体概念讲清自己的原理，不在父子节点重复整段课程。
用一个贯穿的具体例子教会当前概念：example 给已知信息和解题过程，每一步解释理由，最后解释答案；detail 用短句解释为什么成立和必要条件，不复述例题。新术语就地解释；只有额外帮助时才填 lessonOverview、terms、formula，否则用空字符串或空数组。无需凑篇幅，讲懂即止。
visuals 配一张帮助理解的图：flow 表示过程（value=0），bar 表示真实数值（axisLabel 写单位）。description 简短指出该看哪里，不复述正文。数据与算式一致，自拟例子注明“自拟”。`;

// Extraction has already read every chunk. Reattach original evidence when
// writing lessons so condensed candidates cannot erase reasoning and examples.
export function teachingMaterials(material,candidates,maxCharacters=64000){
 const ids=new Set();
 const visit=nodes=>{for(const node of nodes){for(const id of node.sources||[])ids.add(id);visit(node.outline||[]);}};
 visit(candidates);
 const ranked=material.chunks.map((chunk,index)=>({chunk,index,rank:ids.has(chunk.id)?0:ids.has(material.chunks[index-1]?.id)||ids.has(material.chunks[index+1]?.id)?1:2})).sort((a,b)=>a.rank-b.rank||a.index-b.index);
 const selected=[];let characters=0;
 for(const item of ranked){if(characters+item.chunk.text.length>maxCharacters)continue;selected.push(item);characters+=item.chunk.text.length;}
 return selected.sort((a,b)=>a.index-b.index).map(({chunk})=>({...chunk,file:material.name}));
}
