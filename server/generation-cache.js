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
   // Only the schema changed: previous valid responses remain useful. Every
   // reused entry still passes the current validator and source checks below.
   const beforeLimits=JSON.parse(JSON.stringify(outputSchema),(key,value)=>['maxLength','minLength','maxItems'].includes(key)?undefined:value);
   const schemas=[beforeLimits];
   if(['inventory','coverage-audit'].includes(context.generationTask))for(const schema of [outputSchema,beforeLimits])schemas.push({...schema,properties:{nodes:{type:'array',minItems:1,maxItems:48,items:schema.properties.nodes.items}}});
   for(const schema of schemas){
    const system=SYSTEM.replace(JSON.stringify(outputSchema),JSON.stringify(schema));
    const key=createHash('sha256').update(JSON.stringify({...identity,system})).digest('hex');
    files.push(path.join(directory,key+'.json'));
   }
   for(const candidate of files)try{const saved=JSON.parse(await fs.readFile(candidate,'utf8'));if(saved.version===1&&Date.now()-saved.createdAt<30*86400000)return {nodes:check(saved.nodes),cached:true};}catch{/* Missing/damaged cache is recomputed; graphs remain untouched. */}
   const nodes=check(await invoke());
   await atomicWrite(file,{version:1,createdAt:Date.now(),nodes});
   return {nodes,cached:false};
  }
 };
}

