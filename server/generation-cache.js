import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {atomicWrite} from './storage.js';
import {SYSTEM} from './providers.js';
import {parseGeneration,outputSchema} from '../shared/protocol.js';

// Cache only validated, complete model responses. Never persist credentials.
export function generationCache(directory){
 return {
  async run(config,context,invoke){
   const identity={version:2,system:SYSTEM,provider:{kind:config.kind,model:config.model,...(config.kind==='codex'?{reasoningEffort:config.reasoningEffort??'low'}:{}),baseUrl:config.baseUrl,clientPath:config.clientPath,webSearch:config.webSearch!==false},context};
   const key=createHash('sha256').update(JSON.stringify(identity)).digest('hex');
   const file=path.join(directory,key+'.json');
   const check=nodes=>parseGeneration(JSON.stringify({nodes}),[...(context.materials?.map(c=>c.id)||[]),...(context.allowedSourceIds||[])],{allowEmpty:context.generationTask==='coverage-audit'});
   const files=[file];
   // Inventory/audit instructions are unchanged: reuse fully reviewed responses
   // from before the schema-only removal of the 48-node output ceiling.
   if(['inventory','coverage-audit'].includes(context.generationTask)){
    const legacySchema={...outputSchema,properties:{nodes:{type:'array',minItems:1,maxItems:48,items:outputSchema.properties.nodes.items}}};
    const legacySystem=SYSTEM.replace(JSON.stringify(outputSchema),JSON.stringify(legacySchema));
    const legacyKey=createHash('sha256').update(JSON.stringify({...identity,system:legacySystem})).digest('hex');
    files.push(path.join(directory,legacyKey+'.json'));
   }
   for(const candidate of files)try{const saved=JSON.parse(await fs.readFile(candidate,'utf8'));if(saved.version===1&&Date.now()-saved.createdAt<30*86400000)return {nodes:check(saved.nodes),cached:true};}catch{/* Missing/damaged cache is recomputed; graphs remain untouched. */}
   const nodes=check(await invoke());
   await atomicWrite(file,{version:1,createdAt:Date.now(),nodes});
   return {nodes,cached:false};
  }
 };
}

