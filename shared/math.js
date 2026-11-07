// Repair double-escaped LaTeX commands from model JSON while preserving matrix row breaks.
export function normalizeFormula(value=''){
 return value.replace(/\\{2,}(?=(?:frac|dfrac|tfrac|sqrt|mu|sigma|bar|overline|sum|prod|quad|qquad|text|mathrm|mathbf|left|right|begin|end|alpha|beta|gamma|theta|pi|Delta|Phi|phi|leq|geq|le|ge|neq|approx|times|cdot|pm|infty|mathbb|operatorname)(?![A-Za-z]))/g,'\\');
}
