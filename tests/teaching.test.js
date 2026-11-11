import test from 'node:test';
import assert from 'node:assert/strict';
import {teachingMaterials,TEACHING_RULE} from '../server/teaching.js';
import {generateComplete,mergeKnowledge} from '../server/complete-generation.js';
import {makeGraph} from '../src/demo.js';
import {introduction} from './lesson-fixture.js';
import {SYSTEM} from '../server/providers.js';

test('final lessons regain original reasoning and adjacent example steps from the same PDF',async()=>{
 const graph=makeGraph('抽样分布','live');
 graph.materials=[{id:'m',name:'statistics.pdf',chunks:[{id:'a',paragraph:1,text:'固定总体与抽样规则，样本统计量随样本改变。'},{id:'b',paragraph:2,text:'例子：总体为0、2、4，有放回抽两个；样本(0,2)均值为1。'},{id:'c',paragraph:3,text:'因为每个样本的均值只算一个点，统计量的分布不同于原始数据的分布。'}]}];
 const note={title:'抽样分布',summary:'统计量的分布',detail:'重复抽样得到统计量。',sources:['a'],example:''};let finalCalls=0;
 const result=await generateComplete({},graph,graph.nodes[0],{provider:async(_,context)=>{
  if(context.generationTask==='inventory')return [note];
  if(context.generationTask==='coverage-audit')return [];
  finalCalls++;
  assert.deepEqual(context.materials.map(c=>c.id),['a','b','c']);
  assert.ok(context.materials.some(c=>c.text.includes('(0,2)')));
  if(context.generationTask==='chapter-introduction')return [introduction(context)];
  return [{...note,detail:'固定抽样规则后，每个可能样本产生一个统计量。',example:'(0,2)的样本均值为(0+2)/2=1，所以在均值1处记录一个点。'}];
 }});
 assert.equal(finalCalls,2);assert.match(result.nodes[0].outline[0].example,/记录一个点/);
});

test('bounded teaching evidence prioritizes cited chunks and neighbors without truncating their text',()=>{
 const material={name:'one.pdf',chunks:Array.from({length:8},(_,i)=>({id:String(i),text:String(i).repeat(10),paragraph:i+1}))};
 const before=JSON.stringify(material);
 const evidence=teachingMaterials(material,[{sources:['5'],outline:[{sources:['6']}]}],40);
 assert.deepEqual(evidence.map(c=>c.id),['4','5','6','7']);
 assert.ok(evidence.every(c=>c.text.length===10&&c.file==='one.pdf'));
 assert.equal(JSON.stringify(material),before);
});

test('audit can enrich an existing concept with reasoning and an example without adding a node or truncating it',()=>{
 const base={title:'抽样分布',formula:'',detail:'定义',example:'',sources:['a']};
 const enriched=mergeKnowledge([base,{...base,detail:'固定规则让不同样本的统计量可比较。',example:'(0,2)的均值是1，(2,4)的均值是3；每个均值在图上占一个点。',sources:['b']}]);
 assert.equal(enriched.length,1);assert.match(enriched[0].detail,/定义[\s\S]*固定规则/);assert.match(enriched[0].example,/占一个点/);assert.deepEqual(enriched[0].sources,['a','b']);
 const long=mergeKnowledge([{...base,example:'a'.repeat(3000)},{...base,example:'b'.repeat(2000)}])[0];
 assert.equal(long.example,'a'.repeat(3000));assert.ok(long.detail.endsWith('b'.repeat(2000)));
 assert.throws(()=>mergeKnowledge([{...base,detail:'x'.repeat(9000),example:'a'.repeat(3000)},{...base,detail:'x'.repeat(9000),example:'b'.repeat(2000)}]),/讲解与示例过长/);
});

test('all new lessons require mechanisms, worked steps with reasons, and honest example provenance',()=>{
 assert.ok(SYSTEM.includes(TEACHING_RULE));
 for(const phrase of ['每一步为什么成立','最终结果及其在情境中的含义','改编或自拟时明确标注','不能只预告','不能留给学生自行补完'])assert.ok(SYSTEM.includes(phrase));
});

test('lesson diagrams survive generation and graph persistence while rejecting nonnumeric chart data',async()=>{
 const {parseGeneration,validateGraph}=await import('../shared/protocol.js');
 const visual={kind:'bar',title:'Sample means（样本均值）',description:'Two samples produce 71.5.\n两个样本得到71.5。',axisLabel:'Probability（概率）',items:[{label:'69.5',value:1/6},{label:'71.5',value:1/3}]};
 const node={title:'Sampling distributions',summary:'样本统计量的分布',detail:'解释原理',visuals:[visual]};
 const parsed=parseGeneration(JSON.stringify({nodes:[node]}))[0];
 const graph=makeGraph('sampling','live');graph.nodes[0]={...graph.nodes[0],...parsed};
 assert.deepEqual(validateGraph(graph).nodes[0].visuals,[visual]);
 assert.throws(()=>parseGeneration(JSON.stringify({nodes:[{...node,visuals:[{...visual,items:[{label:'x',value:'unknown'}]}]}]})));
});
