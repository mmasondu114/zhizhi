import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Exercise the application's click handler without requiring a display server.
const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const start=source.search(/async function generate\s*\(/),end=source.search(/\n\s*const actions\s*=\s*useMemo\s*\(/);
assert.ok(start>=0&&end>start,'application click handler boundaries must exist');
const handler=source.slice(start,end).trim();
function setup(nodes,{provider='openai',detail=false}={}){
 const state={graph:{id:'graph',mode:'live',nodes},detail,selected:'chapter',requests:0,modal:null};
 const noop=()=>{};
 const env={
  gRef:{get current(){return state.graph;}},inflight:{current:new Map()},settingsRef:{current:{selected:provider}},epoch:{current:0},
  selected:state.selected,detail:state.detail,
  setSelected:id=>state.selected=id,setDetail:value=>state.detail=value,
  children:(g,id)=>g.nodes.filter(n=>n.parent===id),layout:g=>g,commit:g=>state.graph=g,
  notify:noop,setModal:m=>state.modal=m,cancelAll:noop,uid:()=>`new-${++state.nextId}`,
  setBusy:noop,setProgress:noop,setErrors:noop,setPreviews:noop,setConnection:noop,setTimeout:noop,
  LEVEL_GAP:300,AbortController,
  generation:{current:{request:async()=>{state.requests++;return {nodes:[]};},schedule:noop}},
 };
 state.nextId=0;
 state.click=Function(...Object.keys(env),`return (${handler});`)(...Object.values(env));
 return state;
}
const leaf={title:'抽样分布',prepared:true,sources:['source-a']};
const chapter={id:'chapter',title:'3A',materialIds:['a'],prepared:true,position:{x:0,y:0},outline:[leaf]};

for(const provider of ['openai','demo'])test(`chapter click expands cached children with provider ${provider}`,async()=>{
 const s=setup([structuredClone(chapter)],{provider,detail:true});
 await s.click('chapter');
 assert.equal(s.detail,false);assert.equal(s.modal,null);assert.equal(s.requests,0);
 assert.equal(s.graph.nodes.length,2);assert.equal(s.graph.nodes[1].title,leaf.title);
 assert.equal(s.graph.nodes[1].origin,'material');assert.equal(s.graph.nodes[1].prepared,true);
 const ids=s.graph.nodes.map(n=>n.id);
 await s.click('chapter');assert.equal(s.graph.nodes[0].collapsed,true);
 await s.click('chapter');assert.equal(s.graph.nodes[0].collapsed,false);
 assert.deepEqual(s.graph.nodes.map(n=>n.id),ids);assert.equal(s.requests,0);
});
test('materialized children take priority even without a cached outline',async()=>{
 const s=setup([{...chapter,outline:undefined},{...leaf,id:'child',parent:'chapter'}],{detail:true});
 await s.click('chapter');assert.equal(s.detail,false);assert.equal(s.graph.nodes[0].collapsed,true);assert.equal(s.requests,0);
});
test('prepared terminal concept opens its lecture and repeated click closes it',async()=>{
 for(const detail of [false,true]){
  const s=setup([{...leaf,id:'chapter'}],{detail});await s.click('chapter');
  assert.equal(s.detail,!detail);assert.equal(s.graph.nodes.length,1);assert.equal(s.requests,0);
 }
});
test('a chapter without prepared children can still open its overview',async()=>{
 const s=setup([{...chapter,outline:undefined}]);await s.click('chapter');assert.equal(s.detail,true);assert.equal(s.requests,0);
});
test('explicit force regeneration bypasses the cached outline',async()=>{
 const s=setup([structuredClone(chapter)]);await s.click('chapter',{force:true});assert.equal(s.requests,1);assert.equal(s.graph.nodes.length,1);
});
