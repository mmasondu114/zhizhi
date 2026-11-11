export const TEACHING_RULE=`用一个贯穿的具体例子教会当前概念。lessonOverview 用一句话提出要解决的问题；example 先给已知信息，再逐步做出来，每一步解释理由，最后解释答案。detail 从这个例子归纳概念和原理，用短句说明为什么成立；新术语就地解释，有公式再说明符号，只讲与当前问题相关的条件和误区。不要一上来堆定义、术语表、抽象总览或冗长免责声明，也不要在多个字段重复同一段话。
配一张与例子对应的 visuals 图：flow 按步骤画箭头，items 的 value=0；bar 按实际数据画数值图，axisLabel 写量和单位。标签简短，description 告诉学生看哪里、图说明什么。数据与算式一致，自拟例子注明“自拟”，不要编造实验或模拟结果。terms 只收录理解本例必需的词。summary 只概括核心意思。`;

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
