import {setTimeout as wait} from 'node:timers/promises';
// Repair only formatting errors, using the same provider/model. Never accept a
// truncated response or retry cancellation, authentication, or network failures.
export async function retryInvalidGeneration(run,{signal,onRepair=()=>{}}={}){
 let correction;
 for(let attempt=0;;attempt++){
  signal?.throwIfAborted();
  try{return await run(correction);}catch(error){
   if(signal?.aborted||attempt>=2||error.code!=='GENERATION_FORMAT')throw error;
   correction=error.message;
   onRepair({stage:'repairing',retry:attempt+1});
  }
 }
}
export async function retryRateLimited(run,{signal,onWait=()=>{},delayMs=2000}={}){
 for(let attempt=0;;attempt++){
  signal?.throwIfAborted();
  try{return await run();}catch(error){
   if(signal?.aborted||error.code==='GENERATION_FORMAT'||attempt>=3||!/(?:^|HTTP\s+|status(?:\s+code)?[\s:]+)429\b|rate.?limit|too many requests|限流|请求过多/i.test(error.message))throw error;
   const retryMs=delayMs*2**attempt;onWait({stage:'rate-limited',retry:attempt+1,retryMs});
   await wait(retryMs,undefined,{signal});
  }
 }
}
