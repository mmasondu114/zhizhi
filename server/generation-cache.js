import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {atomicWrite} from './storage.js';
import {SYSTEM} from './providers.js';
import {parseGeneration} from '../shared/protocol.js';

// Cache only validated, complete model responses. Never persist credentials.
export function generationCache(directory){
 return {
  async run(config,context,invoke){
   const identity={version:2,system:SYSTEM,provider:{kind:config.kind,model:config.model,baseUrl:config.baseUrl,clientPath:config.clientPath,webSearch:config.webSearch!==false},context};
   const key=createHash('sha256').update(JSON.stringify(identity)).digest('hex');
   const file=path.join(directory,key+'.json');
   const check=nodes=>parseGeneration(JSON.stringify({nodes}),[...(context.materials?.map(c=>c.id)||[]),...(context.allowedSourceIds||[])],{allowEmpty:context.generationTask==='coverage-audit'});
   try{const saved=JSON.parse(await fs.readFile(file,'utf8'));if(saved.version===1&&Date.now()-saved.createdAt<30*86400000)return {nodes:check(saved.nodes),cached:true};}catch{/* A missing/damaged cache is recomputed; graphs remain untouched. */}
   const nodes=check(await invoke());
   await atomicWrite(file,{version:1,createdAt:Date.now(),nodes});
   return {nodes,cached:false};
  }
 };
}
