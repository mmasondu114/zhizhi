// Assemble only complete provider output; partial JSON is never inserted into a graph.
export async function readProviderResponse(res,{anthropic=false,onProgress}={}){
 const streaming=(res.headers.get('content-type')||'').includes('text/event-stream');
 const decoder=new TextDecoder();let raw='',pending='',text='',ended=false,bytes=0;
 function event(block){
  const data=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
  if(!data)return;if(data==='[DONE]'){ended=true;return;}
  let value;try{value=JSON.parse(data);}catch{throw new Error('服务返回了非法流数据');}
  if(value.error||value.type==='error')throw new Error('模型服务中断，请重试');
  if(value.type==='message_stop')ended=true;
  const delta=anthropic?(value.type==='content_block_delta'&&value.delta?.type==='text_delta'?value.delta.text:''):value.choices?.[0]?.delta?.content;
  if(typeof delta==='string'){text+=delta;onProgress?.({stage:'receiving',characters:text.length});}
 }
 for await(const chunk of res.body){
  bytes+=chunk.length;if(bytes>2000000)throw new Error('输出过长');
  const part=decoder.decode(chunk,{stream:true});
  if(streaming){pending+=part;let boundary;while((boundary=pending.search(/\r?\n\r?\n/))>=0){const match=pending.slice(boundary).match(/^\r?\n\r?\n/)[0];event(pending.slice(0,boundary).replace(/\r\n/g,'\n'));pending=pending.slice(boundary+match.length);}if(text.length>300000||pending.length>300000)throw new Error('输出过长');}
  else{raw+=part;if(raw.length>300000)throw new Error('输出过长');onProgress?.({stage:'receiving',bytes});}
 }
 const tail=decoder.decode();
 if(streaming){pending+=tail;if(pending.trim())event(pending.replace(/\r\n/g,'\n'));if(!ended)throw new Error('响应中断，未收到完成标记');return text;}
 let data;try{data=JSON.parse(raw+tail);}catch{throw new Error('服务返回了非法 JSON');}
 return anthropic?data.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n'):data.choices?.[0]?.message?.content;
}
