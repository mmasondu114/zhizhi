// Keep unchanged card data referentially stable during progress and selection
// updates, so React.memo can skip rendering every other card in the graph.
export function reconcileFlowNodes(previous,next){
 const old=new Map(previous.map(n=>[n.id,n]));let changed=previous.length!==next.length;
 const result=next.map((node,index)=>{
  const prior=old.get(node.id);
  if(!prior){changed=true;return node;}
  const sameData=Object.keys(node.data).every(key=>Object.is(node.data[key],prior.data[key]));
  const data=sameData?prior.data:node.data;
  if(sameData&&prior.selected===node.selected&&prior.position.x===node.position.x&&prior.position.y===node.position.y){if(previous[index]!==prior)changed=true;return prior;}
  changed=true;return {...node,data};
 });
 return changed?result:previous;
}
