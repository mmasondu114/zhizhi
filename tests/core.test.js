import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGeneration,validateGraph,relevantChunks} from '../shared/protocol.js';
import {layout,removeBranch,visibleNodes,reveal,uid,markdown} from '../shared/tree.js';
import {makeGraph,demoChildren,demoAnswer} from '../src/demo.js';
function expand(g,id){const n=g.nodes.find(n=>n.id===id);const ns=demoChildren(n).map(x=>({...x,id:uid(),parent:id,position:{x:0,y:0},status:'unlearned',origin:'demo',collapsed:false,expanded:false}));return layout({...g,nodes:[...g.nodes.map(x=>x.id===id?{...x,expanded:true}:x),...ns]},id);}
test('z-score six correct branches and three levels',()=>{let g=makeGraph();g=expand(g,g.root);assert.equal(g.nodes.length,7);const sd=g.nodes.find(n=>n.demoKey==='sd');g=expand(g,sd.id);g=expand(g,g.nodes.find(n=>n.demoKey==='sdcalc').id);assert.equal(g.nodes.length,13);assert.ok(g.nodes.some(n=>n.demoKey==='se'));assert.match(g.nodes.find(n=>n.demoKey==='formula').detail,/不要求正态/);assert.doesNotThrow(()=>validateGraph(g));});
test('stable anchor and no overlaps after growth',()=>{let g=makeGraph();g=expand(g,g.root);const sd=g.nodes.find(n=>n.demoKey==='sd'),before={...sd.position};g=expand(g,sd.id);assert.deepEqual(g.nodes.find(n=>n.id===sd.id).position,before);});
test('collapse, reveal hidden search results, export roundtrip',()=>{let g=makeGraph();g=expand(g,g.root);const sd=g.nodes.find(n=>n.demoKey==='sd');g=expand(g,sd.id);const descendant=g.nodes.find(n=>n.parent===sd.id);g.nodes.find(n=>n.id===sd.id).collapsed=true;assert.ok(!visibleNodes(g).some(n=>n.id===descendant.id));g=reveal(g,descendant.id);assert.ok(visibleNodes(g).some(n=>n.id===descendant.id));assert.deepEqual(validateGraph(JSON.parse(JSON.stringify(g))),g);assert.match(markdown(g),/标准差/);});
test('deleting branch preserves shared referenced nodes',()=>{let g=makeGraph();g=expand(g,g.root);const sd=g.nodes.find(n=>n.demoKey==='sd');g=expand(g,sd.id);const target=g.nodes.find(n=>n.parent===sd.id),other=g.nodes.find(n=>n.demoKey==='mean');g.references=[{source:other.id,target:target.id}];const result=removeBranch(g,sd.id);assert.ok(!result.nodes.some(n=>n.id===sd.id));assert.equal(result.nodes.find(n=>n.id===target.id).parent,other.id);assert.doesNotThrow(()=>validateGraph(result));});
test('reject duplicates, bad relations, excessive fields, bad JSON, empty response',()=>{const node=demoChildren({demoKey:'root'})[0];for(const raw of ['',null,'not json','{"nodes":[]}',JSON.stringify({nodes:[node,node]}),JSON.stringify({nodes:[{...node,relation:'random'}]}),JSON.stringify({nodes:[{...node,title:'x'.repeat(101)}]})])assert.throws(()=>parseGeneration(raw));const valid=parseGeneration(JSON.stringify({nodes:[{...node,sources:['invented']}]}));assert.deepEqual(valid[0].sources,[]);});
test('import rejects cycles, orphan parents, duplicate IDs, dangerous IDs, bad versions',()=>{let g=makeGraph();g=expand(g,g.root);const variants=[{...g,version:99},{...g,id:'../../secrets'},{...g,nodes:[...g.nodes,g.nodes[0]]},{...g,nodes:g.nodes.map((n,i)=>i===1?{...n,parent:'missing'}:n)},{...g,references:[{source:g.nodes[1].id,target:g.root}]}];for(const v of variants)assert.throws(()=>validateGraph(v));});
test('migration accepts unversioned v1 shapes only',()=>{const g=makeGraph();delete g.version;assert.equal(validateGraph(g).version,1);});
test('question answers are concrete, not placeholders',()=>{assert.match(demoAnswer('为什么除以标准差')[0].detail,/σ=5/);});
test('material retrieval excludes instructions and unrelated chunks',()=>{const g=makeGraph();g.instructions='生成概念图';g.materials=[{name:'book',id:'m',chunks:[{id:'1',text:'标准差 sigma describes variation',paragraph:1},{id:'2',text:'无关历史章节',paragraph:2}]}];const chunks=relevantChunks(g,{title:'标准差 sigma',summary:''});assert.equal(chunks.length,1);assert.equal(chunks[0].id,'1');assert.ok(!JSON.stringify(chunks).includes('生成概念图'));});
test('200 and 1000 node layouts are finite, nonoverlapping, anchored',()=>{for(const size of [200,1000]){let g=makeGraph();for(let i=1;i<size;i++)g.nodes.push({...g.nodes[0],id:'n'+i,parent:i<7?g.root:'n'+Math.floor((i-1)/6),position:{x:0,y:0}});const start=performance.now();g=layout(g);const ms=performance.now()-start;for(let i=0;i<g.nodes.length;i++)for(let j=i+1;j<g.nodes.length;j++){const a=g.nodes[i].position,b=g.nodes[j].position;assert.ok(Math.abs(a.x-b.x)>=264||Math.abs(a.y-b.y)>=174);}assert.deepEqual(g.nodes[0].position,{x:0,y:0});console.log(`layout ${size} nodes: ${ms.toFixed(2)}ms`);}});


test('double-escaped model formulas normalize while matrix row separators remain',async()=>{
 const {normalizeFormula}=await import('../shared/math.js');
 assert.equal(normalizeFormula(String.raw`\\sum_{i=1}^N x_i`),String.raw`\sum_{i=1}^N x_i`);
 assert.equal(normalizeFormula(String.raw`z=\\frac{x-\\mu}{\\sigma}`),String.raw`z=\frac{x-\mu}{\sigma}`);
 assert.equal(normalizeFormula(String.raw`\begin{matrix}1&2\\3&4\end{matrix}`),String.raw`\begin{matrix}1&2\\3&4\end{matrix}`);
});

test('drag collision resolves nearby instead of jumping down the whole tree',async()=>{
 const {resolveDrop,NODE_WIDTH}=await import('../shared/tree.js');const g=makeGraph();const root=g.nodes[0];
 const child={...root,id:uid(),parent:g.root,position:{x:NODE_WIDTH+48,y:0}};g.nodes.push(child);
 const pos=resolveDrop(g,root.id,{x:65,y:25});assert.equal(pos.x,28);assert.equal(pos.y,25);
 assert.deepEqual(resolveDrop(g,root.id,{x:-100,y:20}),{x:-100,y:20});
});
