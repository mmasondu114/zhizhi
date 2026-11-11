import React from 'react';
import './lesson-visuals.css';

export default function LessonVisuals({visuals=[]}){
 if(!visuals.length)return null;
 return <section className="lesson-visuals"><h4>看图理解</h4>{visuals.map((visual,index)=>{
  const items=visual.items||[];
  if(!items.length)return null;
  const flow=visual.kind==='flow';
  let cursor=32;
  const rows=items.map(item=>{const units=[...item.label].reduce((n,c)=>n+(/[^\x00-\x7f]/.test(c)?1:0.6),0);const row=Math.max(flow?108:76,Math.ceil(units*17/(flow?532:210))*24+38);const y=cursor;cursor+=row;return {y,row};});
  const height=cursor+48;
  const min=Math.min(0,...items.map(i=>i.value)),max=Math.max(0,...items.map(i=>i.value));
  const scale=value=>240+(value-min)/(max-min||1)*330,zero=scale(0);
  return <figure className="lesson-visual" key={index}>
   <figcaption>{visual.title}</figcaption>
   <svg viewBox={`0 0 640 ${height}`} role="img" aria-label={visual.title} xmlns="http://www.w3.org/2000/svg">
    <title>{visual.title}</title><desc>{visual.description}</desc>
    <rect width="640" height={height} rx="14" fill="#f4faf7"/>
    {items.map((item,i)=>{const {y,row}=rows[i];return flow?<g key={i}>
     <rect x="40" y={y} width="560" height={row-26} rx="12" fill="#e1f1e9" stroke="#8bb5a3"/>
     <foreignObject x="54" y={y+6} width="532" height={row-38}><div xmlns="http://www.w3.org/1999/xhtml" className="visual-label flow-label">{item.label}</div></foreignObject>
     {i<items.length-1&&<path d={`M320 ${y+row-24} v20 m-6 -6 l6 6 6 -6`} fill="none" stroke="#507b68" strokeWidth="2"/>}
    </g>:<g key={i}>
     <foreignObject x="16" y={y} width="210" height={row-10}><div xmlns="http://www.w3.org/1999/xhtml" className="visual-label">{item.label}</div></foreignObject>
     <rect x={Math.min(zero,scale(item.value))} y={y+12} width={Math.max(1,Math.abs(scale(item.value)-zero))} height="30" rx="4" fill="#83b49e"/>
     <text x="626" y={y+34} textAnchor="end" fill="#283b33" fontSize="17">{Number(item.value.toPrecision(5))}</text>
    </g>;})}
    {!flow&&<line x1={zero} x2={zero} y1="28" y2={height-56} stroke="#64756d"/>}
    <text x="320" y={height-20} textAnchor="middle" fill="#384d43" fontSize="16">{visual.axisLabel}</text>
   </svg>
   <p>{visual.description}</p>
  </figure>;
 })}</section>;
}
