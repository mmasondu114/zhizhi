// Keep original-language evidence even when later stages only receive generated
// candidates. Sample each PDF separately; filenames and user UI language are not
// reliable indicators of the language used by the textbook.
export function sourceLanguageContext(materials){
 return materials.map(material=>{
  const chunks=material.chunks.filter(c=>c.text?.trim());
  const indices=[...new Set([0,Math.floor(chunks.length/2),chunks.length-1])];
  return {file:material.name,samples:indices.filter(i=>i>=0&&i<chunks.length).map(i=>chunks[i].text.slice(0,1000))};
 });
}

export function nodeLanguageContext(graph,node,path=[]){
 const lineage=[node,...path.slice().reverse()];
 const scoped=lineage.find(n=>n.materialIds?.length);
 const source=lineage.find(n=>n.sources?.length);
 const materials=scoped?graph.materials.filter(m=>scoped.materialIds.includes(m.id)):
  source?graph.materials.filter(m=>m.chunks.some(c=>source.sources.includes(c.id))):graph.materials;
 return sourceLanguageContext(materials);
}
