import mammoth from 'mammoth';
import {randomUUID} from 'node:crypto';
export function chunkText(text,prefix,page){
 const chunks=[];let paragraph=0;
 for(const p of text.replace(/\r/g,'').split(/\n\s*\n/).filter(p=>p.trim())){paragraph++;for(let i=0;i<p.length;i+=1400)chunks.push({id:`${prefix}-${chunks.length+1}`,text:p.slice(i,i+1600).trim(),paragraph,...(page?{page}:{})});}
 return chunks;
}
export async function parseMaterial(name,buffer){
 if(buffer.length>20*1024*1024)throw new Error('文件不能超过 20MB');
 const id=randomUUID();let chunks=[];const ext=name.toLowerCase().split('.').pop();
 if(ext==='pdf'){
  let getDocument;try{({getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'));}catch{throw new Error('PDF 解析依赖未完整安装，请运行 npm ci --include=optional 后重试；其他文件功能仍可使用');}
  let pdf;try{pdf=await getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useSystemFonts:true}).promise;for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const data=await page.getTextContent();const text=data.items.map(i=>i.str+(i.hasEOL?'\n':' ')).join('');chunks.push(...chunkText(text,`${id}-p${p}`,p));if(chunks.length>5000)throw new Error('文档过大，请按章节拆分');} }finally{await pdf?.destroy();}
  if(chunks.reduce((n,c)=>n+c.text.length,0)<30)throw new Error('此 PDF 未提取到足够文字，可能是扫描版，需要先进行 OCR');
 }else if(ext==='docx'){const result=await mammoth.extractRawText({buffer});chunks=chunkText(result.value,id);}
 else if(['txt','md','markdown'].includes(ext)){chunks=chunkText(buffer.toString('utf8'),id);}else throw new Error('仅支持文本型 PDF、TXT、Markdown 和 DOCX');
 if(!chunks.length)throw new Error('文件没有可读取的正文');if(chunks.length>5000)throw new Error('文档过大，请拆分为章节');
 return {id,name,chunks};
}
