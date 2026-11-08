import {setTimeout as wait} from 'node:timers/promises';
export async function retryRateLimited(run,{signal,onWait=()=>{},delayMs=2000}={}){
 for(let attempt=0;;attempt++){
  signal?.throwIfAborted();
  try{return await run();}catch(error){
   if(signal?.aborted||attempt>=3||!/429|rate.?limit|too many requests|限流|请求过多/i.test(error.message))throw error;
   const retryMs=delayMs*2**attempt;onWait({stage:'rate-limited',retry:attempt+1,retryMs});
   await wait(retryMs,undefined,{signal});
  }
 }
}
