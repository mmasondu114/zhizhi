export function introduction(context){
 return {title:context.document||'本章导学',summary:'理解本章概念之间的联系。',detail:'先认识研究对象，再分析变化规律与使用条件。',lessonOverview:'本章研究 '+(context.document||context.current?.title)+'：'+context.candidates.map(n=>n.title).join('、')+'，并解释这些概念的联系和适用条件。',terms:[{name:'抽样分布',english:'Sampling distribution',definition:'同样的抽样过程反复进行时，统计量所形成的分布。'}],sources:[context.allowedSourceIds[0]],type:'knowledge',relation:'组成',formula:'',example:'',webSources:[]};
}
