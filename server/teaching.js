export const TEACHING_RULE=`每个最终概念、主题和完整讲解必须提供 visuals 图解，与 detail/example 中的具体原理或示例对应，不能只有文字。flow 是从上到下的过程或因果示意图，items 按步骤给简短标签（value=0）；bar 是精确数值条形图，items 给类别及真实数值，并在 axisLabel 标明量和单位。图中标签遵守教材原文在前、中文在后，必须简短；详细解释放 description，指出应该看哪里、图形怎样帮助理解概念。图示必须基于教材或本次明确自拟且计算正确的示例，不伪造数据；不能把概念名称罗列成无意义流程。统计分布可画各统计量取值及其概率，抽样过程可画总体→样本→统计量→重复得到分布。无法给合理数值时使用过程示意图。不要返回外部图片网址、HTML 或可执行代码。
讲解的目标是让学生能解释原因并独立照做，不是认识几个定义。summary 只作导航；detail 和 example 必须承担教学，不能用“理解原理、掌握方法、比较结果”代替具体解释，也不能把同一定义改写几遍充数。
detail 按内容自然分段，可用 **短标题**：先用具体问题说明为什么需要这个概念，再把直觉连接到准确定义；接着讲清机制或推理链——前提是什么、每一步为什么成立、怎样得到结论。出现新术语先解释再使用；有公式时说明符号、单位、公式如何从概念或已学关系得到，不能只给公式和代入说明；没有公式的概念也要解释因果或逻辑，不硬凑公式。说明适用条件，以及条件不满足时会发生什么；用一个具体反例或易混情境解释常见误解。主题节点也要讲透一个代表性问题，说明子概念怎样共同解决它，不能只预告“接下来学习哪些内容”。
example 必须是可完整跟做的示例：明确情境、已知信息和要解决的问题；逐步写出操作或计算，并解释每一步为什么这样做；给出最终结果及其在情境中的含义，最后点明它怎样体现本概念。不能止于“可以模拟/计算/比较”，不能只报答案、跳过中间过程，不能留给学生自行补完。定性概念用具体场景逐步分析，不强造数字；定量概念列出必要中间数值并核对结果。优先用教材中信息完整的例子；改编或自拟时明确标注，不冒充教材原题或真实实验结果。若教材例子缺数据，应说明限制，或另用条件齐全且明确自拟的小例子；不得捏造未执行的模拟次数、概率或实验观测。
例如讲“抽样分布”，应实际给出一个小总体、抽样规则和几个样本，计算每个样本的统计量，再解释把这些统计量汇总后每个点代表什么、什么保持不变、什么在变化；不能只说“重复抽样得到一个分布”。这只是教学深度示范，不是要求把所有学科改写成统计学。按教材主题选择合适例子。
保持教材范围和用户基础，必要前置概念就地解释；不为例子、反例或推导另堆知识节点。完整性按解释是否能跟上判断，不按字数凑篇幅。上述讲解、例子及步骤都遵守 PDF 原文语言为主、紧随中文翻译的规则，中文教材不重复翻译。`;

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
